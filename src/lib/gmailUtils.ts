import type {
  GmailMessage,
  GmailMessagePart,
  ParsedEmail,
  EmailAddress,
  EmailAttachment,
  ComposeEmailInput,
  ComposeMode,
  ComposeState,
  GmailSearchFilters,
} from "../types/gmail";

// base64url decode (Gmail API returns base64url, not standard base64)
export const base64UrlDecode = (data: string): string => {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
  } catch {
    // Fallback for non-UTF8 content
    return atob(base64);
  }
};

// base64url encode for sending
export const base64UrlEncode = (data: string): string => {
  const base64 = btoa(
    encodeURIComponent(data).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Extract email address from "Name <email>" format
export const extractEmailAddress = (headerValue: string): EmailAddress => {
  const match = headerValue.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].replace(/^"|"$/g, "").trim(), email: match[2] };
  }
  // Plain email address
  return { name: headerValue.trim(), email: headerValue.trim() };
};

// Extract multiple email addresses from comma-separated header
const extractEmailAddresses = (headerValue: string): EmailAddress[] => {
  if (!headerValue) return [];
  return headerValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(extractEmailAddress);
};

// Get header value from MIME part
const getHeader = (
  part: GmailMessagePart,
  name: string,
): string | undefined => {
  return part.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value;
};

// Recursively extract body text and html from MIME parts
const extractBody = (
  part: GmailMessagePart,
): { text: string; html: string } => {
  let text = "";
  let html = "";

  if (part.mimeType === "text/plain" && part.body?.data) {
    text = base64UrlDecode(part.body.data);
  } else if (part.mimeType === "text/html" && part.body?.data) {
    html = base64UrlDecode(part.body.data);
  }

  if (part.parts) {
    for (const subPart of part.parts) {
      const sub = extractBody(subPart);
      if (sub.text) text = text || sub.text;
      if (sub.html) html = html || sub.html;
    }
  }

  return { text, html };
};

// Extract attachments from MIME parts
const extractAttachments = (
  part: GmailMessagePart,
  messageId: string,
): EmailAttachment[] => {
  const attachments: EmailAttachment[] = [];

  if (part.filename && part.body?.attachmentId) {
    attachments.push({
      id: part.body.attachmentId,
      messageId,
      filename: part.filename,
      mimeType: part.mimeType,
      size: part.body.size,
    });
  }

  if (part.parts) {
    for (const subPart of part.parts) {
      attachments.push(...extractAttachments(subPart, messageId));
    }
  }

  return attachments;
};

// Parse a full Gmail API message into a UI-friendly format
export const parseGmailMessage = (raw: GmailMessage): ParsedEmail => {
  const payload = raw.payload;
  const subject = getHeader(payload, "Subject") || "(No Subject)";
  const fromHeader = getHeader(payload, "From") || "";
  const toHeader = getHeader(payload, "To") || "";
  const ccHeader = getHeader(payload, "Cc") || "";
  const bccHeader = getHeader(payload, "Bcc") || "";
  const dateHeader = getHeader(payload, "Date") || "";
  const messageIdHeader = getHeader(payload, "Message-ID") || "";
  const references = getHeader(payload, "References") || "";

  const { text, html } = extractBody(payload);
  const attachments = extractAttachments(payload, raw.id);

  return {
    id: raw.id,
    threadId: raw.threadId,
    subject,
    from: extractEmailAddress(fromHeader),
    to: extractEmailAddresses(toHeader),
    cc: extractEmailAddresses(ccHeader),
    bcc: extractEmailAddresses(bccHeader),
    date: dateHeader
      ? new Date(dateHeader).toISOString()
      : new Date(parseInt(raw.internalDate)).toISOString(),
    snippet: raw.snippet,
    bodyText: text,
    bodyHtml: html,
    labelIds: raw.labelIds || [],
    isUnread: (raw.labelIds || []).includes("UNREAD"),
    isStarred: (raw.labelIds || []).includes("STARRED"),
    attachments,
    messageIdHeader,
    references,
  };
};

// Build RFC 2822 message for sending
export const buildRfc2822Message = (input: ComposeEmailInput): string => {
  const lines: string[] = [];

  lines.push(`To: ${input.to.join(", ")}`);
  if (input.cc && input.cc.length > 0) {
    lines.push(`Cc: ${input.cc.join(", ")}`);
  }
  if (input.bcc && input.bcc.length > 0) {
    lines.push(`Bcc: ${input.bcc.join(", ")}`);
  }
  lines.push(`Subject: ${input.subject}`);
  lines.push("MIME-Version: 1.0");
  lines.push("Content-Type: text/plain; charset=UTF-8");

  if (input.inReplyTo) {
    lines.push(`In-Reply-To: ${input.inReplyTo}`);
  }
  if (input.references) {
    lines.push(`References: ${input.references}`);
  }

  lines.push(""); // Empty line separates headers from body
  lines.push(input.body);

  return base64UrlEncode(lines.join("\r\n"));
};

// Build reply/forward compose state from original message
export const buildReplyBody = (
  original: ParsedEmail,
  mode: ComposeMode,
): ComposeState => {
  const quotedBody = original.bodyText
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  const dateStr = new Date(original.date).toLocaleString();
  const quoteHeader = `\n\nOn ${dateStr}, ${original.from.name} <${original.from.email}> wrote:\n`;

  switch (mode) {
    case "reply":
      return {
        mode,
        originalMessage: original,
        to: original.from.email,
        cc: "",
        bcc: "",
        subject: original.subject.startsWith("Re:")
          ? original.subject
          : `Re: ${original.subject}`,
        body: quoteHeader + quotedBody,
        threadId: original.threadId,
        inReplyTo: original.messageIdHeader,
        references: [original.references, original.messageIdHeader]
          .filter(Boolean)
          .join(" "),
      };
    case "replyAll": {
      const ccAddresses = [
        ...original.to.map((a) => a.email),
        ...original.cc.map((a) => a.email),
      ].filter((email) => email !== original.from.email);
      return {
        mode,
        originalMessage: original,
        to: original.from.email,
        cc: ccAddresses.join(", "),
        bcc: "",
        subject: original.subject.startsWith("Re:")
          ? original.subject
          : `Re: ${original.subject}`,
        body: quoteHeader + quotedBody,
        threadId: original.threadId,
        inReplyTo: original.messageIdHeader,
        references: [original.references, original.messageIdHeader]
          .filter(Boolean)
          .join(" "),
      };
    }
    case "forward": {
      const fwdHeader = `\n\n---------- Forwarded message ----------\nFrom: ${original.from.name} <${original.from.email}>\nDate: ${dateStr}\nSubject: ${original.subject}\nTo: ${original.to.map((a) => a.email).join(", ")}\n\n`;
      return {
        mode,
        originalMessage: original,
        to: "",
        cc: "",
        bcc: "",
        subject: original.subject.startsWith("Fwd:")
          ? original.subject
          : `Fwd: ${original.subject}`,
        body: fwdHeader + original.bodyText,
      };
    }
    default:
      return {
        mode: "new",
        to: "",
        cc: "",
        bcc: "",
        subject: "",
        body: "",
      };
  }
};

// Format email date for display
export const formatEmailDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d`;

  // Beyond 7 days, show date
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Format file size for display
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Build Gmail search query string from structured filters
export const buildSearchQuery = (filters: GmailSearchFilters): string => {
  const parts: string[] = [];

  if (filters.from) parts.push(`from:${filters.from}`);
  if (filters.to) parts.push(`to:${filters.to}`);
  if (filters.subject) parts.push(`subject:${filters.subject}`);
  if (filters.hasAttachment) parts.push("has:attachment");
  if (filters.dateAfter) parts.push(`after:${filters.dateAfter}`);
  if (filters.dateBefore) parts.push(`before:${filters.dateBefore}`);
  if (filters.isUnread) parts.push("is:unread");
  if (filters.isStarred) parts.push("is:starred");
  if (filters.freeText) parts.push(filters.freeText);

  return parts.join(" ");
};

// Check if a MIME type is previewable
export const isPreviewableMimeType = (mimeType: string): boolean => {
  return isImageMimeType(mimeType) || isPdfMimeType(mimeType);
};

export const isImageMimeType = (mimeType: string): boolean => {
  return mimeType.startsWith("image/");
};

export const isPdfMimeType = (mimeType: string): boolean => {
  return mimeType === "application/pdf";
};
