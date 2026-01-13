export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface FileItem {
  id: number;
  name: string;
  folder_id: number | null;
  mime_type: string;
  size: number;
  created_at: string;
  updated_at: string;
  download_url: string;
}

export interface Breadcrumb {
  id: number | null;
  name: string;
}

export interface FolderResponse {
  parent: Folder | null;
  breadcrumbs: Breadcrumb[];
  folders: Folder[];
  files: FileItem[];
}

