/**
 * Gmail MIME parser for Edge Functions (Deno compatible).
 * Ported from src/lib/gmailUtils.ts for server-side use.
 */

// --- Types ---

export type GmailHeader = { name: string; value: string };

export interface GmailPayloadPart {
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    data?: string;
    size?: number;
    attachmentId?: string;
  };
  parts?: GmailPayloadPart[];
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath?: string;
}

// --- Helpers ---

export const getHeader = (headers: GmailHeader[], name: string): string => {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    ""
  );
};

/**
 * Decode base64url string to UTF-8 text.
 */
export function base64UrlDecodeText(data: string): string {
  const bytes = base64UrlDecodeBytes(data);
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Decode base64url string to raw bytes (Uint8Array).
 * Used for attachment binary data.
 */
export function base64UrlDecodeBytes(data: string): Uint8Array {
  // Convert base64url to standard base64
  let base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// --- Body extraction ---

/**
 * Recursively extract text/plain and text/html body from MIME parts.
 */
export function extractBodyParts(part: GmailPayloadPart): {
  text: string;
  html: string;
} {
  let text = "";
  let html = "";

  if (part.mimeType === "text/plain" && part.body?.data) {
    text = base64UrlDecodeText(part.body.data);
  } else if (part.mimeType === "text/html" && part.body?.data) {
    html = base64UrlDecodeText(part.body.data);
  }

  if (part.parts) {
    for (const subPart of part.parts) {
      const sub = extractBodyParts(subPart);
      if (sub.text) text = text || sub.text;
      if (sub.html) html = html || sub.html;
    }
  }

  return { text, html };
}

// --- Attachment metadata extraction ---

/**
 * Recursively extract attachment metadata from MIME parts.
 * Does NOT download the attachment data — only collects IDs and metadata.
 */
export function extractAttachmentMeta(
  part: GmailPayloadPart,
  messageId: string,
): AttachmentMeta[] {
  const attachments: AttachmentMeta[] = [];

  if (part.filename && part.body?.attachmentId) {
    attachments.push({
      id: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType,
      size: part.body.size ?? 0,
    });
  }

  if (part.parts) {
    for (const subPart of part.parts) {
      attachments.push(...extractAttachmentMeta(subPart, messageId));
    }
  }

  return attachments;
}
