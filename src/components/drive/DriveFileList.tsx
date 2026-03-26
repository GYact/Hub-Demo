import { useState } from "react";
import {
  Folder,
  File,
  FileText,
  FileSpreadsheet,
  Presentation,
  Image,
  Video,
  Music,
  Archive,
  ExternalLink,
  Loader2,
  Cloud,
  RefreshCw,
  FolderOpen,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useDriveFolder } from "../../hooks/useDriveFolder";
import { isFolder, GOOGLE_DOCS_MIME_TYPES } from "../../types/googleDrive";
import type { GoogleDriveFile } from "../../types/googleDrive";

const getFileIcon = (mimeType: string, size = 18) => {
  if (mimeType === "application/vnd.google-apps.folder")
    return <Folder className="text-yellow-500" size={size} />;
  if (mimeType === GOOGLE_DOCS_MIME_TYPES.document)
    return <FileText className="text-blue-500" size={size} />;
  if (mimeType === GOOGLE_DOCS_MIME_TYPES.spreadsheet)
    return <FileSpreadsheet className="text-green-500" size={size} />;
  if (mimeType === GOOGLE_DOCS_MIME_TYPES.presentation)
    return <Presentation className="text-orange-500" size={size} />;
  if (mimeType.startsWith("image/"))
    return <Image className="text-purple-500" size={size} />;
  if (mimeType.startsWith("video/"))
    return <Video className="text-red-500" size={size} />;
  if (mimeType.startsWith("audio/"))
    return <Music className="text-pink-500" size={size} />;
  if (
    mimeType.includes("zip") ||
    mimeType.includes("archive") ||
    mimeType.includes("compressed")
  )
    return <Archive className="text-gray-500" size={size} />;
  return <File className="text-gray-400" size={size} />;
};

const formatFileSize = (bytes?: string) => {
  if (!bytes) return "";
  const n = parseInt(bytes, 10);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (d?: string) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const FileRow = ({
  file,
  onFolderClick,
}: {
  file: GoogleDriveFile;
  onFolderClick: (id: string, name: string) => void;
}) => {
  if (isFolder(file)) {
    return (
      <button
        onClick={() => onFolderClick(file.id, file.name)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
      >
        {getFileIcon(file.mimeType)}
        <div className="flex-1 min-w-0">
          <p className="text-sm neu-text-primary truncate">{file.name}</p>
          <p className="text-[11px] neu-text-muted">
            {formatDate(file.modifiedTime)}
          </p>
        </div>
        <ChevronRight size={14} className="neu-text-muted shrink-0" />
      </button>
    );
  }

  return (
    <a
      href={file.webViewLink ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors group"
    >
      {getFileIcon(file.mimeType)}
      <div className="flex-1 min-w-0">
        <p className="text-sm neu-text-primary truncate">{file.name}</p>
        <p className="text-[11px] neu-text-muted">
          {formatDate(file.modifiedTime)}
          {file.size ? ` · ${formatFileSize(file.size)}` : ""}
        </p>
      </div>
      {file.webViewLink && (
        <ExternalLink
          size={14}
          className="neu-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        />
      )}
    </a>
  );
};

export const DriveFileList = ({
  folderName,
  defaultCollapsed = false,
}: {
  folderName: string;
  defaultCollapsed?: boolean;
}) => {
  const { connectGoogleCalendar } = useAuth();
  const {
    files,
    breadcrumbs,
    isLoading,
    error,
    isConnected,
    navigateToFolder,
    navigateToBreadcrumb,
    refresh,
  } = useDriveFolder(folderName);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (!isConnected) {
    return (
      <div className="neu-card rounded-lg p-6 text-center">
        <Cloud size={40} className="mx-auto mb-3 text-blue-400 opacity-50" />
        <p className="neu-text-secondary text-sm mb-3">
          Connect Google to view Drive files
        </p>
        <button
          onClick={connectGoogleCalendar}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
        >
          <Cloud size={14} />
          Connect
        </button>
      </div>
    );
  }

  if (isLoading && files.length === 0) {
    return (
      <div className="neu-card rounded-lg p-6 flex items-center justify-center gap-2 neu-text-secondary">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading Drive files...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="neu-card rounded-lg p-4 text-center">
        <p className="text-sm text-red-500 mb-2">{error}</p>
        <button
          onClick={refresh}
          className="text-xs neu-text-secondary hover:neu-text-primary"
        >
          Retry
        </button>
      </div>
    );
  }

  const displayName = folderName.split("/").pop() ?? folderName;

  return (
    <div className="neu-card rounded-lg overflow-hidden">
      {/* Header with breadcrumbs + collapse toggle */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <button
          onClick={() => setCollapsed((p) => !p)}
          className="flex items-center gap-1.5 min-w-0 text-sm neu-text-secondary hover:neu-text-primary transition-colors"
        >
          {collapsed ? (
            <ChevronRight size={14} className="shrink-0" />
          ) : (
            <ChevronDown size={14} className="shrink-0" />
          )}
          <Folder size={14} className="text-yellow-500 shrink-0" />
          <span className="font-medium truncate">{displayName}</span>
          <span className="text-xs neu-text-muted shrink-0">
            ({files.length})
          </span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {!collapsed && breadcrumbs.length > 1 && (
            <div className="flex items-center gap-0.5 text-xs neu-text-muted mr-1">
              {breadcrumbs.slice(1).map((crumb, i) => (
                <div key={crumb.id} className="flex items-center shrink-0">
                  <ChevronRight size={10} className="mx-0.5" />
                  <button
                    onClick={() => navigateToBreadcrumb(i + 1)}
                    className="px-1 py-0.5 rounded hover:bg-white/10 transition-colors neu-text-secondary"
                  >
                    {crumb.name}
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={refresh}
            className="p-1.5 rounded-lg neu-text-muted hover:neu-text-secondary transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* File rows (collapsible) */}
      {!collapsed &&
        (files.length === 0 ? (
          <div className="p-6 text-center">
            <FolderOpen size={32} className="mx-auto mb-2 neu-text-muted" />
            <p className="text-sm neu-text-secondary">Empty folder</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {files.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                onFolderClick={navigateToFolder}
              />
            ))}
          </div>
        ))}
    </div>
  );
};
