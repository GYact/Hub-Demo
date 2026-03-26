import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import type { GoogleDriveFile } from "../types/googleDrive";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

interface Breadcrumb {
  id: string;
  name: string;
}

/**
 * Resolve a folder by path (e.g. "97_Finance/Invoice").
 * Single name (e.g. "96_Contracts") does a global search.
 * Nested path walks each segment using `in parents`.
 */
export const useDriveFolder = (folderPath: string) => {
  const { googleAccessToken, hasGoogleCalendarAccess } = useAuth();
  const [rootId, setRootId] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedRef = useRef(false);

  const isConnected = hasGoogleCalendarAccess && !!googleAccessToken;
  const segments = folderPath.split("/").filter(Boolean);
  const displayName = segments[segments.length - 1] || folderPath;

  const handleAuthError = useCallback((status: number) => {
    if (status === 401 || status === 403) {
      localStorage.removeItem("hub_google_access_token");
      window.dispatchEvent(new CustomEvent("google-token-expired"));
      throw new Error("Google Drive permission expired. Please reconnect.");
    }
  }, []);

  const findFolderByName = useCallback(
    async (name: string, parentId?: string): Promise<string | null> => {
      if (!googleAccessToken) return null;

      const qParts = [
        `name = '${name}'`,
        `mimeType = 'application/vnd.google-apps.folder'`,
        `trashed = false`,
      ];
      if (parentId) qParts.push(`'${parentId}' in parents`);

      const params = new URLSearchParams({
        q: qParts.join(" and "),
        fields: "files(id,name)",
        pageSize: "1",
      });

      const res = await fetch(`${DRIVE_API_BASE}/files?${params}`, {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
      });

      if (!res.ok) {
        handleAuthError(res.status);
        throw new Error(`Failed to search folder "${name}": ${res.status}`);
      }

      const data = await res.json();
      return data.files?.[0]?.id ?? null;
    },
    [googleAccessToken, handleAuthError],
  );

  const resolvePath = useCallback(async (): Promise<string | null> => {
    let parentId: string | undefined;
    for (const seg of segments) {
      const id = await findFolderByName(seg, parentId);
      if (!id) return null;
      parentId = id;
    }
    return parentId ?? null;
  }, [segments, findFolderByName]);

  const fetchFiles = useCallback(
    async (id: string, silent = false) => {
      if (!googleAccessToken) return;
      if (!silent) setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          q: `'${id}' in parents and trashed = false`,
          fields:
            "files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,iconLink,thumbnailLink)",
          orderBy: "folder,name",
          pageSize: "100",
        });

        const res = await fetch(`${DRIVE_API_BASE}/files?${params}`, {
          headers: { Authorization: `Bearer ${googleAccessToken}` },
        });

        if (!res.ok) {
          handleAuthError(res.status);
          throw new Error(`Failed to fetch files: ${res.status}`);
        }

        const data = await res.json();
        setFiles(data.files || []);
        setCurrentFolderId(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch files");
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [googleAccessToken, handleAuthError],
  );

  // Resolve folder path + fetch files on mount
  useEffect(() => {
    if (!isConnected) {
      resolvedRef.current = false;
      return;
    }
    if (resolvedRef.current) return;

    let cancelled = false;
    const init = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const id = await resolvePath();
        if (cancelled) return;
        if (!id) {
          setError(`Folder "${folderPath}" not found in Google Drive.`);
          return;
        }
        setRootId(id);
        setBreadcrumbs([{ id, name: displayName }]);
        await fetchFiles(id);
        resolvedRef.current = true;
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load folder",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [isConnected, resolvePath, fetchFiles, folderPath, displayName]);

  const navigateToFolder = useCallback(
    async (folderId: string, name: string) => {
      setBreadcrumbs((prev) => [...prev, { id: folderId, name }]);
      await fetchFiles(folderId);
    },
    [fetchFiles],
  );

  const navigateToBreadcrumb = useCallback(
    async (index: number) => {
      const target = breadcrumbs[index];
      if (!target) return;
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
      await fetchFiles(target.id);
    },
    [breadcrumbs, fetchFiles],
  );

  const refresh = useCallback(async () => {
    if (!currentFolderId) return;
    await fetchFiles(currentFolderId, true);
  }, [currentFolderId, fetchFiles]);

  return {
    files,
    rootId,
    currentFolderId,
    breadcrumbs,
    isLoading,
    error,
    isConnected,
    navigateToFolder,
    navigateToBreadcrumb,
    refresh,
  };
};
