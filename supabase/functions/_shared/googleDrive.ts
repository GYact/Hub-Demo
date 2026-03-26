/**
 * Google Drive API helpers for Deno/Supabase Edge Functions.
 * Resolves folder paths and uploads files.
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

/** Resolve a folder ID by name under a parent, creating if absent. */
async function resolveOrCreateFolder(
  accessToken: string,
  parentId: string,
  folderName: string,
): Promise<string> {
  const q = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;

  const res = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive search failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Create folder
  const createRes = await fetch(`${DRIVE_API}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(
      `Drive folder creation failed (${createRes.status}): ${err}`,
    );
  }
  const created = await createRes.json();
  return created.id;
}

/**
 * Resolve a slash-separated path (e.g. "97_Finance/Invoice") starting from root.
 * Creates intermediate folders if they don't exist.
 */
export async function resolveFolderPath(
  accessToken: string,
  folderPath: string,
): Promise<string> {
  const parts = folderPath.split("/").filter(Boolean);
  let parentId = "root";
  for (const part of parts) {
    parentId = await resolveOrCreateFolder(accessToken, parentId, part);
  }
  return parentId;
}

/**
 * Upload a file to Google Drive using multipart upload.
 * Returns the file ID.
 */
export async function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  fileData: Uint8Array,
): Promise<string> {
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
  });

  const boundary = "----GDriveBoundary" + Date.now();
  const CRLF = "\r\n";

  // Build multipart body
  const metadataPart =
    `--${boundary}${CRLF}` +
    `Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}` +
    metadata +
    CRLF;

  const filePart =
    `--${boundary}${CRLF}` +
    `Content-Type: ${mimeType}${CRLF}` +
    `Content-Transfer-Encoding: binary${CRLF}${CRLF}`;

  const closing = `${CRLF}--${boundary}--`;

  const encoder = new TextEncoder();
  const metaBytes = encoder.encode(metadataPart);
  const filePartBytes = encoder.encode(filePart);
  const closingBytes = encoder.encode(closing);

  const body = new Uint8Array(
    metaBytes.length +
      filePartBytes.length +
      fileData.length +
      closingBytes.length,
  );
  let offset = 0;
  body.set(metaBytes, offset);
  offset += metaBytes.length;
  body.set(filePartBytes, offset);
  offset += filePartBytes.length;
  body.set(fileData, offset);
  offset += fileData.length;
  body.set(closingBytes, offset);

  const res = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${err}`);
  }
  const result = await res.json();
  return result.id;
}
