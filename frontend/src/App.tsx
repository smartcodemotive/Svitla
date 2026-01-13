import { useEffect, useRef, useState } from "react";
import {
  createFolder,
  deleteFile,
  deleteFolder,
  fetchFolderContents,
  getPreviewUrl,
  renameFile,
  renameFolder,
  uploadFile,
} from "./api";
import { Breadcrumb, FileItem, Folder, FolderResponse } from "./types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

export default function App() {
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: "Data Room" }]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadFolder(currentFolderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId]);

  async function loadFolder(folderId: number | null) {
    setLoading(true);
    setError(null);
    try {
      const data: FolderResponse = await fetchFolderContents(folderId);
      setBreadcrumbs(data.breadcrumbs);
      setFolders(data.folders);
      setFiles(data.files);
    } catch (err: any) {
      setError(err.message || "Unable to load folder");
    } finally {
      setLoading(false);
    }
  }

  async function onCreateFolder() {
    const name = prompt("Folder name");
    if (!name) return;
    try {
      await createFolder(name.trim(), currentFolderId);
      await loadFolder(currentFolderId);
    } catch (err: any) {
      alert(err.message || "Failed to create folder");
    }
  }

  async function onRenameFolder(folder: Folder) {
    const name = prompt("Rename folder", folder.name);
    if (!name || name.trim() === folder.name) return;
    try {
      await renameFolder(folder.id, name.trim());
      await loadFolder(currentFolderId);
    } catch (err: any) {
      alert(err.message || "Failed to rename folder");
    }
  }

  async function onDeleteFolder(folder: Folder) {
    const confirmed = confirm(`Delete folder "${folder.name}" and everything inside?`);
    if (!confirmed) return;
    try {
      await deleteFolder(folder.id);
      // If we deleted the folder we are inside, go up to parent.
      if (currentFolderId === folder.id) {
        const parent = breadcrumbs.at(-2);
        setCurrentFolderId(parent ? parent.id : null);
      } else {
        await loadFolder(currentFolderId);
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete folder");
    }
  }

  async function onUploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        await uploadFile(file, currentFolderId);
      }
      await loadFolder(currentFolderId);
    } catch (err: any) {
      alert(err.message || "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function onRenameFile(file: FileItem) {
    const name = prompt("Rename file", file.name);
    if (!name || name.trim() === file.name) return;
    try {
      await renameFile(file.id, name.trim());
      await loadFolder(currentFolderId);
    } catch (err: any) {
      alert(err.message || "Failed to rename file");
    }
  }

  async function onDeleteFile(file: FileItem) {
    const confirmed = confirm(`Delete file "${file.name}"?`);
    if (!confirmed) return;
    try {
      await deleteFile(file.id);
      await loadFolder(currentFolderId);
    } catch (err: any) {
      alert(err.message || "Failed to delete file");
    }
  }

  function onBreadcrumbClick(crumb: Breadcrumb) {
    setCurrentFolderId(crumb.id);
  }

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>Acme Data Room</h1>
          <p className="muted">Upload, organize, and review deal documents.</p>
        </div>
        <div className="actions">
          <button onClick={onCreateFolder} className="btn primary">
            + New Folder
          </button>
          <button
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Upload PDF"
          >
            {uploading ? "Uploading..." : "Upload PDF"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => onUploadFiles(e.target.files)}
          />
        </div>
      </header>

      <div className="breadcrumbs">
        {breadcrumbs.map((crumb, idx) => (
          <span key={crumb.id ?? "root"}>
            <button className="link" onClick={() => onBreadcrumbClick(crumb)} disabled={idx === breadcrumbs.length - 1}>
              {crumb.name}
            </button>
            {idx < breadcrumbs.length - 1 && <span className="breadcrumb-sep">/</span>}
          </span>
        ))}
      </div>

      {error && <div className="alert">{error}</div>}
      {loading ? (
        <div className="muted">Loading...</div>
      ) : (
        <div className="grid">
          <section>
            <h2 className="section-title">Folders</h2>
            {folders.length === 0 ? (
              <p className="muted">No folders yet.</p>
            ) : (
              <ul className="card-list">
                {folders.map((folder) => (
                  <li key={folder.id} className="card">
                    <div className="card__body" onClick={() => setCurrentFolderId(folder.id)}>
                      <div className="card__title">📁 {folder.name}</div>
                      <div className="muted small">Updated {new Date(folder.updated_at).toLocaleString()}</div>
                    </div>
                    <div className="card__actions">
                      <button className="link" onClick={() => onRenameFolder(folder)}>
                        Rename
                      </button>
                      <button className="link danger" onClick={() => onDeleteFolder(folder)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="section-title">Files</h2>
            {files.length === 0 ? (
              <p className="muted">No files uploaded.</p>
            ) : (
              <ul className="card-list">
                {files.map((file) => (
                  <li key={file.id} className="card">
                    <div className="card__body">
                      <div className="card__title">📄 {file.name}</div>
                      <div className="muted small">
                        {formatBytes(file.size)} • Uploaded {new Date(file.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="card__actions">
                      <button className="link" onClick={() => setPreviewFile(file)}>
                        View
                      </button>
                      <a className="link" href={getPreviewUrl(file)} target="_blank" rel="noreferrer">
                        Download
                      </a>
                      <button className="link" onClick={() => onRenameFile(file)}>
                        Rename
                      </button>
                      <button className="link danger" onClick={() => onDeleteFile(file)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {previewFile && (
        <div className="modal" onClick={() => setPreviewFile(null)}>
          <div className="modal__content" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h3>{previewFile.name}</h3>
              <button className="btn" onClick={() => setPreviewFile(null)}>
                Close
              </button>
            </div>
            <iframe title="preview" src={getPreviewUrl(previewFile)} className="modal__preview" />
          </div>
        </div>
      )}
    </div>
  );
}

