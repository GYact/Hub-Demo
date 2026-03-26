import { useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import type {
  GoogleDriveFile,
  GoogleDriveBreadcrumb,
} from "../types/googleDrive";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

export const useGoogleDrive = () => {
  const { googleAccessToken, hasGoogleCalendarAccess } = useAuth();
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>("root");
  const [breadcrumbs, setBreadcrumbs] = useState<GoogleDriveBreadcrumb[]>([
    { id: "root", name: "My Drive" },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApiError = useCallback((response: Response) => {
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("hub_google_access_token");
      window.dispatchEvent(new CustomEvent("google-token-expired"));
      return "Google Drive permission not granted. Please reconnect from Settings.";
    }
    return `Failed to access Google Drive: ${response.status} ${response.statusText}`;
  }, []);

  // Fetch files in a folder
  const fetchFiles = useCallback(
    async (folderId: string = "root", silent = false) => {
      if (!googleAccessToken) {
        setError(
          "Google access token not available. Please connect Google Services.",
        );
        return;
      }

      if (!silent) setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          q: `'${folderId}' in parents and trashed = false`,
          fields:
            "files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,iconLink,thumbnailLink,starred,capabilities)",
          orderBy: "folder,name",
          pageSize: "100",
        });

        const response = await fetch(`${DRIVE_API_BASE}/files?${params}`, {
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
          },
        });

        if (!response.ok) {
          setError(handleApiError(response));
          return;
        }

        const data = await response.json();
        setFiles(data.files || []);
        setCurrentFolderId(folderId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch files");
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [googleAccessToken, handleApiError],
  );

  // Get folder metadata for breadcrumb
  const getFolderName = useCallback(
    async (folderId: string): Promise<string> => {
      if (!googleAccessToken || folderId === "root") return "My Drive";

      try {
        const response = await fetch(
          `${DRIVE_API_BASE}/files/${folderId}?fields=name`,
          {
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
            },
          },
        );

        if (!response.ok) return "Unknown";

        const data = await response.json();
        return data.name || "Unknown";
      } catch {
        return "Unknown";
      }
    },
    [googleAccessToken],
  );

  // Navigate to a folder
  const navigateToFolder = useCallback(
    async (folderId: string, folderName?: string) => {
      const name = folderName || (await getFolderName(folderId));

      if (folderId === "root") {
        setBreadcrumbs([{ id: "root", name: "My Drive" }]);
      } else {
        setBreadcrumbs((prev) => [...prev, { id: folderId, name }]);
      }

      await fetchFiles(folderId);
    },
    [fetchFiles, getFolderName],
  );

  // Navigate to a specific breadcrumb
  const navigateToBreadcrumb = useCallback(
    async (index: number) => {
      const targetBreadcrumb = breadcrumbs[index];
      if (!targetBreadcrumb) return;

      setBreadcrumbs((prev) => prev.slice(0, index + 1));
      await fetchFiles(targetBreadcrumb.id);
    },
    [breadcrumbs, fetchFiles],
  );

  // Navigate back to parent folder
  const navigateBack = useCallback(async () => {
    if (breadcrumbs.length <= 1) return;
    await navigateToBreadcrumb(breadcrumbs.length - 2);
  }, [breadcrumbs.length, navigateToBreadcrumb]);

  // Upload a file
  const uploadFile = useCallback(
    async (file: File, folderId: string = currentFolderId) => {
      if (!googleAccessToken) {
        setError("Google access token not available");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Create file metadata
        const metadata = {
          name: file.name,
          parents: [folderId],
        };

        // Create multipart form data
        const form = new FormData();
        form.append(
          "metadata",
          new Blob([JSON.stringify(metadata)], { type: "application/json" }),
        );
        form.append("file", file);

        const response = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
            },
            body: form,
          },
        );

        if (!response.ok) {
          setError(handleApiError(response));
          return null;
        }

        const newFile = await response.json();
        setFiles((prev) => [...prev, newFile]);
        return newFile;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to upload file");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [googleAccessToken, currentFolderId, handleApiError],
  );

  // Delete a file
  const deleteFile = useCallback(
    async (fileId: string) => {
      if (!googleAccessToken) {
        setError("Google access token not available");
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
          },
        });

        if (!response.ok) {
          setError(handleApiError(response));
          return false;
        }

        setFiles((prev) => prev.filter((f) => f.id !== fileId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete file");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [googleAccessToken, handleApiError],
  );

  // Rename a file
  const renameFile = useCallback(
    async (fileId: string, newName: string) => {
      if (!googleAccessToken) {
        setError("Google access token not available");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${DRIVE_API_BASE}/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,webViewLink`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: newName }),
          },
        );

        if (!response.ok) {
          setError(handleApiError(response));
          return null;
        }

        const updatedFile = await response.json();
        setFiles((prev) =>
          prev.map((f) => (f.id === fileId ? updatedFile : f)),
        );
        return updatedFile;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rename file");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [googleAccessToken, handleApiError],
  );

  // Create a new folder
  const createFolder = useCallback(
    async (name: string, parentId: string = currentFolderId) => {
      if (!googleAccessToken) {
        setError("Google access token not available");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${DRIVE_API_BASE}/files?fields=id,name,mimeType,modifiedTime,webViewLink`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name,
              mimeType: "application/vnd.google-apps.folder",
              parents: [parentId],
            }),
          },
        );

        if (!response.ok) {
          setError(handleApiError(response));
          return null;
        }

        const newFolder = await response.json();
        setFiles((prev) => [newFolder, ...prev]);
        return newFolder;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create folder",
        );
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [googleAccessToken, currentFolderId, handleApiError],
  );

  return {
    files,
    currentFolderId,
    breadcrumbs,
    isLoading,
    isSyncing,
    error,
    isConnected: hasGoogleCalendarAccess && !!googleAccessToken,
    fetchFiles,
    navigateToFolder,
    navigateToBreadcrumb,
    navigateBack,
    uploadFile,
    deleteFile,
    renameFile,
    createFolder,
    refresh: async () => {
      setIsSyncing(true);
      try {
        await fetchFiles(currentFolderId, true);
      } finally {
        setIsSyncing(false);
      }
    },
  };
};
