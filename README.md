# Acme Data Room MVP

Single-page React app with a Flask backend for organizing deal documents into data rooms. Supports nested folders, PDF uploads, renaming, deletion, and inline viewing.

## Stack
- Frontend: React + TypeScript (Vite)
- Backend: Flask + SQLAlchemy (SQLite by default)
- Storage: local disk under `backend/storage`

## Quickstart
1. **Backend**
   ```bash
   cd backend
   python -m venv .venv
   .venv/Scripts/activate      # Windows
   source .venv/bin/activate   # macOS/Linux
   pip install -r requirements.txt
   python app.py               # runs on http://localhost:5000
   ```
   Environment overrides (optional):
   - `DATABASE_URL` (default `sqlite:///./dataroom.db`)
   - `UPLOAD_DIR` (default `backend/storage`)
   - `MAX_CONTENT_LENGTH` (default 25 MB)

2. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev                 # serves on http://localhost:5173
   ```
   If your backend runs elsewhere, set `VITE_API_BASE` (e.g., `http://localhost:5000`).

## Features
- Nested folders: create, rename, delete (cascades to children/files).
- PDF upload, inline preview, rename, delete, and download.
- Breadcrumb navigation for moving up and across folders.
- Duplicate-name guard per folder (returns 409).
- Simple, clean UI aimed at data room workflows.

## API (condensed)
- `GET /api/folders?parent_id=` – list folders/files in a parent (root when omitted).
- `POST /api/folders` – `{ name, parent_id? }`
- `PATCH /api/folders/:id` – rename
- `DELETE /api/folders/:id` – cascade delete
- `POST /api/files` – multipart `file`, `folder_id?`, optional `name`
- `PATCH /api/files/:id` – rename
- `DELETE /api/files/:id` – delete
- `GET /api/files/:id/content` – download/preview

## Notes & Trade-offs
- SQLite keeps setup light; swap `DATABASE_URL` for Postgres without code changes.
- Files stay on disk; `stored_name` avoids collisions, `name` is user-facing.
- CORS is open for local dev; tighten for production.
- No auth/search to keep scope focused; both fit naturally on current models.

## Repo layout
```
backend/   Flask app, models, storage
frontend/  React single-page app
```

## Testing ideas
- Create nested folders, upload PDFs, rename and delete to confirm cascades.
- Attempt duplicate names in the same folder to see conflict handling.
- Open PDFs via the inline viewer and download link.

