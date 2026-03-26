import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Layout, ConfirmDialog } from "../components";
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
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Upload,
  FolderPlus,
  Trash2,
  Pencil,
  ExternalLink,
  RefreshCw,
  Loader2,
  Cloud,
} from "lucide-react";
import { useGoogleDrive } from "../hooks/useGoogleDrive";
import { useAuth } from "../contexts/AuthContext";
import { ErrorBanner } from "../components/ErrorBanner";
import type { GoogleDriveFile } from "../types/googleDrive";
import { isFolder, GOOGLE_DOCS_MIME_TYPES } from "../types/googleDrive";
import { GoogleAccountSelector } from "../components/GoogleAccountSelector";

const getFileIcon = (mimeType: string) => {
  if (mimeType === "application/vnd.google-apps.folder") {
    return <Folder className="text-yellow-500" size={20} />;
  }
  if (mimeType === GOOGLE_DOCS_MIME_TYPES.document) {
    return <FileText className="text-blue-500" size={20} />;
  }
  if (mimeType === GOOGLE_DOCS_MIME_TYPES.spreadsheet) {
    return <FileSpreadsheet className="text-green-500" size={20} />;
  }
  if (mimeType === GOOGLE_DOCS_MIME_TYPES.presentation) {
    return <Presentation className="text-orange-500" size={20} />;
  }
  if (mimeType.startsWith("image/")) {
    return <Image className="text-purple-500" size={20} />;
  }
  if (mimeType.startsWith("video/")) {
    return <Video className="text-red-500" size={20} />;
  }
  if (mimeType.startsWith("audio/")) {
    return <Music className="text-pink-500" size={20} />;
  }
  if (
    mimeType.includes("zip") ||
    mimeType.includes("archive") ||
    mimeType.includes("compressed")
  ) {
    return <Archive className="text-gray-500" size={20} />;
  }
  return <File className="text-gray-400" size={20} />;
};

const formatFileSize = (bytes?: string) => {
  if (!bytes) return "-";
  const size = parseInt(bytes, 10);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024)
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export const GoogleDrivePage = () => {
  const navigate = useNavigate();
  const { connectGoogleCalendar } = useAuth();
  const {
    files,
    breadcrumbs,
    isLoading,
    isSyncing,
    error,
    isConnected,
    fetchFiles,
    navigateToFolder,
    navigateToBreadcrumb,
    navigateBack,
    uploadFile,
    deleteFile,
    renameFile,
    createFolder,
    refresh,
  } = useGoogleDrive();

  const [deleteTarget, setDeleteTarget] = useState<GoogleDriveFile | null>(
    null,
  );
  const [renameTarget, setRenameTarget] = useState<GoogleDriveFile | null>(
    null,
  );
  const [newName, setNewName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isConnected) {
      fetchFiles("root");
    }
  }, [isConnected, fetchFiles]);

  const handleFileClick = useCallback(
    (file: GoogleDriveFile) => {
      if (isFolder(file)) {
        navigateToFolder(file.id, file.name);
      } else if (file.webViewLink) {
        window.open(file.webViewLink, "_blank");
      }
    },
    [navigateToFolder],
  );

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await uploadFile(file);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [uploadFile],
  );

  const handleDelete = useCallback(async () => {
    if (deleteTarget) {
      await deleteFile(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteFile]);

  const handleRename = useCallback(async () => {
    if (renameTarget && newName.trim()) {
      await renameFile(renameTarget.id, newName.trim());
      setRenameTarget(null);
      setNewName("");
    }
  }, [renameTarget, newName, renameFile]);

  const handleCreateFolder = useCallback(async () => {
    if (newFolderName.trim()) {
      await createFolder(newFolderName.trim());
      setIsCreatingFolder(false);
      setNewFolderName("");
    }
  }, [newFolderName, createFolder]);

  const startRename = useCallback((file: GoogleDriveFile) => {
    setRenameTarget(file);
    setNewName(file.name);
  }, []);

  const headerLeft = (
    <div className="flex items-center gap-0.5 md:gap-1">
      <button
        onClick={() => navigate("/drive")}
        className="p-1.5 md:p-2 neu-btn neu-text-secondary hover:neu-text-primary rounded-lg transition-colors"
        title="Back to Drive"
      >
        <ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />
      </button>
      <button
        onClick={refresh}
        disabled={isSyncing}
        className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors disabled:opacity-50"
        title="Refresh"
      >
        <RefreshCw
          size={16}
          className={`${isSyncing ? "animate-spin" : ""} md:w-[18px] md:h-[18px]`}
        />
      </button>
    </div>
  );

  const headerCenter = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setIsCreatingFolder(true)}
        className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs md:text-sm font-medium transition-all active:scale-95 shadow"
      >
        <FolderPlus size={16} />
        <span className="hidden sm:inline">Add Folder</span>
      </button>
      <label className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs md:text-sm font-medium transition-all active:scale-95 shadow cursor-pointer">
        <Upload size={16} />
        <span className="hidden sm:inline">Upload</span>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleUpload}
        />
      </label>
    </div>
  );

  if (!isConnected) {
    return (
      <Layout pageTitle="Google Drive">
        <main className="flex-1 overflow-y-auto p-4 md:p-6 mobile-scroll-pad">
          <div className="max-w-2xl mx-auto text-center py-12">
            <Cloud
              size={64}
              className="mx-auto mb-6 text-blue-500 opacity-50"
            />
            <h2 className="text-xl font-semibold neu-text-primary mb-4">
              Connect to Google Drive
            </h2>
            <p className="neu-text-secondary mb-6">
              Connect your Google Account to view and manage your Google Drive
              files within the app.
            </p>
            <button
              onClick={connectGoogleCalendar}
              className="neu-btn bg-sky-600 text-white hover:bg-sky-500 px-6 py-3 rounded-lg font-medium"
            >
              Connect Google Account
            </button>
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout
      pageTitle="Google Drive"
      headerLeft={headerLeft}
      headerCenter={headerCenter}
      headerRight={<GoogleAccountSelector />}
    >
      <main className="flex-1 overflow-y-auto p-4 md:p-6 mobile-scroll-pad">
        <div className="max-w-5xl mx-auto">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 mb-4 overflow-x-auto text-sm">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id} className="flex items-center shrink-0">
                {index > 0 && (
                  <ChevronRight size={14} className="neu-text-muted mx-1" />
                )}
                <button
                  onClick={() => navigateToBreadcrumb(index)}
                  className={`px-2 py-1 rounded hover:bg-white/10 ${
                    index === breadcrumbs.length - 1
                      ? "neu-text-primary font-medium"
                      : "neu-text-secondary"
                  }`}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <ErrorBanner
              message={error}
              className="mb-4 rounded-lg border-b-0"
            />
          )}

          {/* New folder input */}
          {isCreatingFolder && (
            <div className="mb-4 neu-card p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <Folder className="text-yellow-500" size={20} />
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder name"
                  className="flex-1 neu-input px-3 py-2 rounded-lg text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing)
                      handleCreateFolder();
                    if (e.key === "Escape") {
                      setIsCreatingFolder(false);
                      setNewFolderName("");
                    }
                  }}
                />
                <button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim()}
                  className="neu-btn bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setIsCreatingFolder(false);
                    setNewFolderName("");
                  }}
                  className="neu-btn px-4 py-2 rounded-lg text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* File list */}
          <div className="neu-card rounded-lg overflow-hidden">
            {isLoading && files.length === 0 ? (
              <div className="p-8 text-center">
                <Loader2
                  size={32}
                  className="animate-spin mx-auto neu-text-secondary"
                />
              </div>
            ) : files.length === 0 ? (
              <div className="p-8 text-center">
                <Folder
                  size={48}
                  className="mx-auto mb-4 neu-text-muted opacity-50"
                />
                <p className="neu-text-secondary">This folder is empty</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {/* Back button */}
                {breadcrumbs.length > 1 && (
                  <button
                    onClick={navigateBack}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors"
                  >
                    <ChevronLeft size={20} className="neu-text-muted" />
                    <span className="neu-text-secondary text-sm">Back</span>
                  </button>
                )}

                {/* Files */}
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors group"
                  >
                    {/* Icon */}
                    <button
                      onClick={() => handleFileClick(file)}
                      className="flex-1 flex items-center gap-3 min-w-0 text-left"
                    >
                      {getFileIcon(file.mimeType)}
                      <div className="flex-1 min-w-0">
                        <p className="neu-text-primary text-sm truncate">
                          {file.name}
                        </p>
                        <p className="neu-text-muted text-xs">
                          {formatDate(file.modifiedTime)}
                          {!isFolder(file) && ` · ${formatFileSize(file.size)}`}
                        </p>
                      </div>
                    </button>

                    {/* Actions */}
                    <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      {file.webViewLink && !isFolder(file) && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg hover:bg-white/10"
                          title="Open in Google Drive"
                        >
                          <ExternalLink size={16} className="neu-text-muted" />
                        </a>
                      )}
                      <button
                        onClick={() => startRename(file)}
                        className="p-2 rounded-lg hover:bg-white/10"
                        title="Rename"
                      >
                        <Pencil size={16} className="neu-text-muted" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(file)}
                        className="p-2 rounded-lg hover:bg-white/10"
                        title="Delete"
                      >
                        <Trash2 size={16} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete file"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmLabel="Delete"
      />

      {/* Rename dialog */}
      {renameTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
            style={{
              paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
              paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="neu-card p-6 rounded-lg w-full max-w-[calc(100vw-2rem)] md:max-w-md my-auto">
              <h3 className="text-lg font-semibold neu-text-primary mb-4">
                Rename
              </h3>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full neu-input px-3 py-2 rounded-lg mb-4"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing)
                    handleRename();
                  if (e.key === "Escape") {
                    setRenameTarget(null);
                    setNewName("");
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setRenameTarget(null);
                    setNewName("");
                  }}
                  className="neu-btn px-4 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRename}
                  disabled={!newName.trim() || newName === renameTarget.name}
                  className="neu-btn bg-emerald-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  Rename
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </Layout>
  );
};
