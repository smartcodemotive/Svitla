import os
import uuid
from pathlib import Path
from typing import Optional

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

from database import get_session, init_db
from models import Base, File, Folder

ALLOWED_EXTENSIONS = {"pdf"}
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", Path(__file__).parent / "storage")).resolve()
MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 25 * 1024 * 1024))  # 25 MB default


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def folder_payload(folder: Optional[Folder]):
    if not folder:
        return None
    return {
        "id": folder.id,
        "name": folder.name,
        "parent_id": folder.parent_id,
        "created_at": folder.created_at.isoformat(),
        "updated_at": folder.updated_at.isoformat(),
    }


def file_payload(file: File):
    return {
        "id": file.id,
        "name": file.name,
        "folder_id": file.folder_id,
        "mime_type": file.mime_type,
        "size": file.size,
        "created_at": file.created_at.isoformat(),
        "updated_at": file.updated_at.isoformat(),
        "download_url": f"/api/files/{file.id}/content",
    }


def ensure_storage_folder(folder_id: Optional[int]) -> Path:
    target_dir = UPLOAD_DIR / (str(folder_id) if folder_id is not None else "root")
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir


def build_breadcrumbs(folder: Optional[Folder]):
    crumbs = [{"id": None, "name": "Data Room"}]
    if not folder:
        return crumbs

    stack = []
    current = folder
    while current:
        stack.append({"id": current.id, "name": current.name})
        current = current.parent
    crumbs.extend(reversed(stack))
    return crumbs


def create_app():
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

    CORS(app, resources={r"/api/*": {"origins": "*"}})
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    init_db(Base)

    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"}), 200

    @app.route("/api/folders", methods=["GET"])
    def list_folder_contents():
        parent_id_raw = request.args.get("parent_id")
        parent_id = None
        if parent_id_raw not in (None, "", "null"):
            try:
                parent_id = int(parent_id_raw)
            except ValueError:
                return jsonify({"message": "Invalid parent_id"}), 400

        with get_session() as session:
            parent = session.get(Folder, parent_id) if parent_id is not None else None
            if parent_id is not None and not parent:
                return jsonify({"message": "Folder not found"}), 404

            folders = (
                session.query(Folder)
                .filter(Folder.parent_id.is_(parent_id) if parent_id is None else Folder.parent_id == parent_id)
                .order_by(Folder.name)
                .all()
            )
            files = (
                session.query(File)
                .filter(File.folder_id.is_(parent_id) if parent_id is None else File.folder_id == parent_id)
                .order_by(File.name)
                .all()
            )

            response = {
                "parent": folder_payload(parent),
                "breadcrumbs": build_breadcrumbs(parent),
                "folders": [folder_payload(f) for f in folders],
                "files": [file_payload(f) for f in files],
            }
            return jsonify(response), 200

    @app.route("/api/folders", methods=["POST"])
    def create_folder():
        data = request.get_json() or {}
        name = (data.get("name") or "").strip()
        parent_id = data.get("parent_id")

        if not name:
            return jsonify({"message": "Folder name is required"}), 400

        with get_session() as session:
            parent = session.get(Folder, parent_id) if parent_id is not None else None
            if parent_id is not None and not parent:
                return jsonify({"message": "Parent folder not found"}), 404

            duplicate = (
                session.query(Folder)
                .filter(Folder.parent_id == parent_id, Folder.name.ilike(name))
                .first()
            )
            if duplicate:
                return jsonify({"message": "A folder with that name already exists"}), 409

            folder = Folder(name=name, parent_id=parent_id)
            session.add(folder)
            session.flush()
            return jsonify(folder_payload(folder)), 201

    @app.route("/api/folders/<int:folder_id>", methods=["PATCH"])
    def rename_folder(folder_id: int):
        data = request.get_json() or {}
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"message": "Folder name is required"}), 400

        with get_session() as session:
            folder = session.get(Folder, folder_id)
            if not folder:
                return jsonify({"message": "Folder not found"}), 404

            duplicate = (
                session.query(Folder)
                .filter(Folder.parent_id == folder.parent_id, Folder.name.ilike(name), Folder.id != folder.id)
                .first()
            )
            if duplicate:
                return jsonify({"message": "A folder with that name already exists"}), 409

            folder.name = name
            session.add(folder)
            session.flush()
            return jsonify(folder_payload(folder)), 200

    def delete_folder_recursive(session, folder: Folder):
        # Delete nested content depth-first
        for child in list(folder.children):
            delete_folder_recursive(session, child)

        for file in list(folder.files):
            delete_file_from_disk(file)
            session.delete(file)

        session.delete(folder)

    def delete_file_from_disk(file: File):
        file_path = UPLOAD_DIR / (str(file.folder_id) if file.folder_id is not None else "root") / file.stored_name
        if file_path.exists():
            file_path.unlink(missing_ok=True)

    @app.route("/api/folders/<int:folder_id>", methods=["DELETE"])
    def delete_folder(folder_id: int):
        with get_session() as session:
            folder = session.get(Folder, folder_id)
            if not folder:
                return jsonify({"message": "Folder not found"}), 404

            delete_folder_recursive(session, folder)
            return "", 204

    @app.route("/api/files", methods=["POST"])
    def upload_file():
        if "file" not in request.files:
            return jsonify({"message": "No file provided"}), 400

        file = request.files["file"]
        folder_id_raw = request.form.get("folder_id")
        desired_name = (request.form.get("name") or "").strip()

        if not file or file.filename == "":
            return jsonify({"message": "Empty filename"}), 400

        if not allowed_file(file.filename):
            return jsonify({"message": "Only PDF files are supported"}), 400

        folder_id = None
        if folder_id_raw not in (None, "", "null"):
            try:
                folder_id = int(folder_id_raw)
            except ValueError:
                return jsonify({"message": "Invalid folder_id"}), 400

        with get_session() as session:
            parent_folder = session.get(Folder, folder_id) if folder_id is not None else None
            if folder_id is not None and not parent_folder:
                return jsonify({"message": "Target folder not found"}), 404

            filename = secure_filename(file.filename)
            display_name = desired_name or filename

            duplicate = (
                session.query(File)
                .filter(File.folder_id == folder_id, File.name.ilike(display_name))
                .first()
            )
            if duplicate:
                return jsonify({"message": "A file with that name already exists"}), 409

            stored_name = f"{uuid.uuid4()}_{filename}"
            target_dir = ensure_storage_folder(folder_id)
            target_path = target_dir / stored_name
            file.save(target_path)
            file_size = target_path.stat().st_size

            db_file = File(
                name=display_name,
                stored_name=stored_name,
                folder_id=folder_id,
                mime_type=file.mimetype or "application/pdf",
                size=file_size,
            )
            session.add(db_file)
            session.flush()
            return jsonify(file_payload(db_file)), 201

    @app.route("/api/files/<int:file_id>/content", methods=["GET"])
    def get_file_content(file_id: int):
        with get_session() as session:
            db_file = session.get(File, file_id)
            if not db_file:
                return jsonify({"message": "File not found"}), 404

            file_path = UPLOAD_DIR / (str(db_file.folder_id) if db_file.folder_id is not None else "root") / db_file.stored_name
            if not file_path.exists():
                return jsonify({"message": "File missing from storage"}), 404

            return send_file(file_path, mimetype=db_file.mime_type, download_name=db_file.name)

    @app.route("/api/files/<int:file_id>", methods=["PATCH"])
    def rename_file(file_id: int):
        data = request.get_json() or {}
        new_name = (data.get("name") or "").strip()
        if not new_name:
            return jsonify({"message": "File name is required"}), 400

        with get_session() as session:
            db_file = session.get(File, file_id)
            if not db_file:
                return jsonify({"message": "File not found"}), 404

            duplicate = (
                session.query(File)
                .filter(File.folder_id == db_file.folder_id, File.name.ilike(new_name), File.id != db_file.id)
                .first()
            )
            if duplicate:
                return jsonify({"message": "A file with that name already exists"}), 409

            db_file.name = new_name
            session.add(db_file)
            session.flush()
            return jsonify(file_payload(db_file)), 200

    @app.route("/api/files/<int:file_id>", methods=["DELETE"])
    def delete_file(file_id: int):
        with get_session() as session:
            db_file = session.get(File, file_id)
            if not db_file:
                return jsonify({"message": "File not found"}), 404

            delete_file_from_disk(db_file)
            session.delete(db_file)
            return "", 204

    return app


app = create_app()

if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", "5000"))
    # Windows + reloader can trigger socket.fromfd issues; disable reloader on nt.
    use_reloader = debug and os.name != "nt"
    app.run(debug=debug, host=host, port=port, use_reloader=use_reloader)

