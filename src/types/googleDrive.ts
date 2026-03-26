export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  parents?: string[];
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  starred?: boolean;
  trashed?: boolean;
  shared?: boolean;
  ownedByMe?: boolean;
  capabilities?: {
    canEdit?: boolean;
    canDelete?: boolean;
    canRename?: boolean;
    canShare?: boolean;
    canDownload?: boolean;
  };
}

export interface GoogleDriveBreadcrumb {
  id: string;
  name: string;
}

export const GOOGLE_DRIVE_FOLDER_MIME_TYPE =
  "application/vnd.google-apps.folder";

export const isFolder = (file: GoogleDriveFile): boolean => {
  return file.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE;
};

// Google Docs types
export const GOOGLE_DOCS_MIME_TYPES = {
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  presentation: "application/vnd.google-apps.presentation",
  form: "application/vnd.google-apps.form",
  drawing: "application/vnd.google-apps.drawing",
} as const;

export const isGoogleDocsType = (mimeType: string): boolean => {
  return Object.values(GOOGLE_DOCS_MIME_TYPES).includes(
    mimeType as (typeof GOOGLE_DOCS_MIME_TYPES)[keyof typeof GOOGLE_DOCS_MIME_TYPES],
  );
};
