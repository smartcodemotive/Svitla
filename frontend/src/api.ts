import { FileItem, Folder, FolderResponse } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

async function handleJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await safeMessage(response);
    throw new Error(message || response.statusText);
  }
  return response.json() as Promise<T>;
}

async function safeMessage(response: Response) {
  try {
    const body = await response.json();
    return body?.message;
  } catch (_err) {
    return null;
  }
}

export async function fetchFolderContents(parentId: number | null): Promise<FolderResponse> {
  const search = new URLSearchParams();
  if (parentId !== null && parentId !== undefined) {
    search.set("parent_id", String(parentId));
  }
  const res = await fetch(`${API_BASE}/api/folders?${search.toString()}`);
  return handleJson<FolderResponse>(res);
}

export async function createFolder(name: string, parentId: number | null): Promise<Folder> {
  const res = await fetch(`${API_BASE}/api/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parent_id: parentId }),
  });
  return handleJson<Folder>(res);
}

export async function renameFolder(folderId: number, name: string): Promise<Folder> {
  const res = await fetch(`${API_BASE}/api/folders/${folderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return handleJson<Folder>(res);
}

export async function deleteFolder(folderId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/folders/${folderId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const message = await safeMessage(res);
    throw new Error(message || res.statusText);
  }
}

export async function uploadFile(file: File, folderId: number | null, displayName?: string): Promise<FileItem> {
  const formData = new FormData();
  formData.append("file", file);
  if (folderId !== null && folderId !== undefined) {
    formData.append("folder_id", String(folderId));
  }
  if (displayName) {
    formData.append("name", displayName);
  }

  const res = await fetch(`${API_BASE}/api/files`, {
    method: "POST",
    body: formData,
  });
  return handleJson<FileItem>(res);
}

export async function renameFile(fileId: number, name: string): Promise<FileItem> {
  const res = await fetch(`${API_BASE}/api/files/${fileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return handleJson<FileItem>(res);
}

export async function deleteFile(fileId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/files/${fileId}`, { method: "DELETE" });
  if (!res.ok) {
    const message = await safeMessage(res);
    throw new Error(message || res.statusText);
  }
}

export function getPreviewUrl(file: FileItem): string {
  if (file.download_url.starts_with("http")) {
    return file.download_url;
  }
  return `${API_BASE}${file.download_url}`;
}

