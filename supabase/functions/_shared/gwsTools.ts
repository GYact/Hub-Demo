/**
 * Google Workspace tools for Anthropic Tool Use in ai_hub_chat.
 * Provides Gmail, Calendar, Drive, Docs, Sheets operations.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refreshAccessToken } from "./googleAuth.ts";
import {
  getHeader,
  extractBodyParts,
  extractAttachmentMeta,
  type GmailPayloadPart,
} from "./gmailParser.ts";

// ── API Base URLs ──

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DOCS_API = "https://docs.googleapis.com/v1/documents";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

// ── Helpers ──

async function gapi<T = Record<string, unknown>>(
  token: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Google API error (${res.status}): ${err}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }
  return (await res.json()) as T;
}

function truncate(str: string, max = 12000): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "\n...(truncated)";
}

function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (b) => String.fromCodePoint(b)).join(""));
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ── Tool Definitions (Anthropic format) ──

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export const GWS_TOOLS: ToolDefinition[] = [
  // --- Gmail ---
  {
    name: "gmail_search",
    description:
      "Search Gmail messages. Returns snippets and metadata. Use Gmail query syntax: from:, to:, subject:, after:YYYY/MM/DD, before:, is:unread, has:attachment, label:, in:sent, etc.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Gmail search query",
        },
        maxResults: {
          type: "number",
          description: "Max messages (1-20, default 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "gmail_get_message",
    description:
      "Get full content of a Gmail message by ID. Use gmail_search first to find IDs.",
    input_schema: {
      type: "object",
      properties: {
        messageId: { type: "string", description: "Gmail message ID" },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_send",
    description:
      "Send an email. IMPORTANT: Always confirm with the user before sending.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Subject" },
        body: { type: "string", description: "Body (plain text)" },
        cc: { type: "string", description: "CC (comma-separated)" },
        bcc: { type: "string", description: "BCC (comma-separated)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "gmail_create_draft",
    description: "Create an email draft without sending.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Subject" },
        body: { type: "string", description: "Body (plain text)" },
        cc: { type: "string", description: "CC (comma-separated)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "gmail_list_labels",
    description: "List all Gmail labels.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "gmail_modify_labels",
    description:
      "Add/remove labels on a message. Use to archive (remove INBOX), star (add STARRED), mark read (remove UNREAD), etc.",
    input_schema: {
      type: "object",
      properties: {
        messageId: { type: "string", description: "Message ID" },
        addLabelIds: {
          type: "array",
          items: { type: "string" },
          description: "Labels to add",
        },
        removeLabelIds: {
          type: "array",
          items: { type: "string" },
          description: "Labels to remove",
        },
      },
      required: ["messageId"],
    },
  },
  // --- Calendar ---
  {
    name: "calendar_list",
    description: "List all available Google calendars.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "calendar_events",
    description: "List calendar events within a time range.",
    input_schema: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description: "Calendar ID (default: 'primary')",
        },
        timeMin: {
          type: "string",
          description: "Start ISO 8601 (e.g. '2024-01-15T00:00:00+09:00')",
        },
        timeMax: { type: "string", description: "End ISO 8601" },
        maxResults: { type: "number", description: "Max events (default 20)" },
        query: { type: "string", description: "Free text search" },
      },
    },
  },
  {
    name: "calendar_get_event",
    description: "Get details of a specific calendar event.",
    input_schema: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description: "Calendar ID (default: 'primary')",
        },
        eventId: { type: "string", description: "Event ID" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "calendar_create_event",
    description: "Create a calendar event. IMPORTANT: Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description: "Calendar ID (default: 'primary')",
        },
        summary: { type: "string", description: "Event title" },
        description: { type: "string", description: "Description" },
        location: { type: "string", description: "Location" },
        start: {
          type: "string",
          description: "Start time ISO 8601, or YYYY-MM-DD for all-day",
        },
        end: {
          type: "string",
          description: "End time ISO 8601, or YYYY-MM-DD for all-day",
        },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "Attendee emails",
        },
        colorId: {
          type: "string",
          description:
            "Event color ID (1=Lavender,2=Sage,3=Grape,4=Flamingo,5=Banana,6=Tangerine,7=Peacock,8=Graphite,9=Blueberry,10=Basil,11=Tomato)",
        },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    name: "calendar_update_event",
    description: "Update a calendar event. IMPORTANT: Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description: "Calendar ID (default: 'primary')",
        },
        eventId: { type: "string", description: "Event ID" },
        summary: { type: "string", description: "New title" },
        description: { type: "string", description: "New description" },
        location: { type: "string", description: "New location" },
        start: { type: "string", description: "New start ISO 8601" },
        end: { type: "string", description: "New end ISO 8601" },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "New attendee list",
        },
        colorId: {
          type: "string",
          description:
            "Event color ID (1=Lavender,2=Sage,3=Grape,4=Flamingo,5=Banana,6=Tangerine,7=Peacock,8=Graphite,9=Blueberry,10=Basil,11=Tomato)",
        },
      },
      required: ["eventId"],
    },
  },
  {
    name: "calendar_delete_event",
    description: "Delete a calendar event. IMPORTANT: Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description: "Calendar ID (default: 'primary')",
        },
        eventId: { type: "string", description: "Event ID" },
      },
      required: ["eventId"],
    },
  },
  // --- Drive ---
  {
    name: "drive_search",
    description:
      "Search files in Google Drive. Use Drive query syntax: name contains 'x', mimeType='application/pdf', etc.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Drive search query (e.g. \"name contains 'report'\")",
        },
        maxResults: { type: "number", description: "Max results (default 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "drive_get_file",
    description:
      "Get file content. Google Docs/Sheets/Slides exported as text/CSV. Text files downloaded directly. Binary files return metadata only.",
    input_schema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "File ID" },
      },
      required: ["fileId"],
    },
  },
  {
    name: "drive_upload",
    description:
      "Upload a text file to Drive. IMPORTANT: Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "File name" },
        content: { type: "string", description: "File content (text)" },
        mimeType: {
          type: "string",
          description: "MIME type (default: text/plain)",
        },
        folderId: {
          type: "string",
          description: "Parent folder ID (default: root)",
        },
      },
      required: ["name", "content"],
    },
  },
  {
    name: "drive_create_folder",
    description: "Create a folder in Google Drive.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Folder name" },
        parentId: {
          type: "string",
          description: "Parent folder ID (default: root)",
        },
      },
      required: ["name"],
    },
  },
  // --- Docs ---
  {
    name: "docs_get",
    description: "Get Google Docs document content as plain text.",
    input_schema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Document ID" },
      },
      required: ["documentId"],
    },
  },
  {
    name: "docs_create",
    description:
      "Create a new Google Docs document. IMPORTANT: Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Document title" },
        content: {
          type: "string",
          description: "Initial text content (optional)",
        },
      },
      required: ["title"],
    },
  },
  // --- Sheets ---
  {
    name: "sheets_get_values",
    description: "Get values from a Google Sheets range.",
    input_schema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet ID" },
        range: {
          type: "string",
          description: "A1 notation (e.g. 'Sheet1!A1:D10')",
        },
      },
      required: ["spreadsheetId", "range"],
    },
  },
  {
    name: "sheets_update_values",
    description:
      "Update values in a Sheets range. IMPORTANT: Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet ID" },
        range: { type: "string", description: "A1 notation range" },
        values: {
          type: "array",
          items: { type: "array", items: {} },
          description: "2D array of values",
        },
      },
      required: ["spreadsheetId", "range", "values"],
    },
  },
  {
    name: "sheets_create",
    description:
      "Create a new Google Sheets spreadsheet. IMPORTANT: Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Spreadsheet title" },
      },
      required: ["title"],
    },
  },
  {
    name: "sheets_append_rows",
    description:
      "Append rows to a Sheets spreadsheet. IMPORTANT: Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet ID" },
        range: {
          type: "string",
          description: "Target sheet (e.g. 'Sheet1')",
        },
        values: {
          type: "array",
          items: { type: "array", items: {} },
          description: "Rows to append (2D array)",
        },
      },
      required: ["spreadsheetId", "range", "values"],
    },
  },
];

// Web search tool (always available, does not require GWS tokens)
export const WEB_SEARCH_TOOL: ToolDefinition = {
  name: "web_search",
  description:
    "Search the web for real-time information. Use for current events, people profiles (X/Twitter, LinkedIn, etc.), news, product info, and anything not in the user's organizational data. Returns relevant search results with snippets.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query in natural language",
      },
    },
    required: ["query"],
  },
};

// ── Gmail Handlers ──

async function gmailSearch(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const query = String(input.query ?? "");
  const maxResults = Math.min(Number(input.maxResults) || 10, 20);

  const listData = await gapi<{
    messages?: Array<{ id: string }>;
    resultSizeEstimate?: number;
  }>(
    token,
    `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
  );

  const messageIds = listData.messages ?? [];
  if (messageIds.length === 0) {
    return JSON.stringify({ messages: [], total: 0 });
  }

  const messages = await Promise.all(
    messageIds.map(async ({ id }) => {
      const msg = await gapi<{
        id: string;
        threadId: string;
        snippet: string;
        labelIds: string[];
        payload: { headers: Array<{ name: string; value: string }> };
      }>(
        token,
        `${GMAIL_API}/messages/${id}?format=METADATA&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
      );
      const h = msg.payload?.headers ?? [];
      return {
        id: msg.id,
        threadId: msg.threadId,
        from: getHeader(h, "From"),
        to: getHeader(h, "To"),
        subject: getHeader(h, "Subject"),
        date: getHeader(h, "Date"),
        snippet: msg.snippet,
        labels: msg.labelIds,
      };
    }),
  );

  return JSON.stringify({
    messages,
    total: listData.resultSizeEstimate ?? messages.length,
  });
}

async function gmailGetMessage(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const messageId = String(input.messageId ?? "");
  const msg = await gapi<{
    id: string;
    threadId: string;
    snippet: string;
    labelIds: string[];
    payload: GmailPayloadPart & {
      headers: Array<{ name: string; value: string }>;
    };
  }>(token, `${GMAIL_API}/messages/${messageId}?format=FULL`);

  const h = msg.payload?.headers ?? [];
  const { text, html } = extractBodyParts(msg.payload);
  const attachments = extractAttachmentMeta(msg.payload, msg.id);

  return truncate(
    JSON.stringify({
      id: msg.id,
      threadId: msg.threadId,
      from: getHeader(h, "From"),
      to: getHeader(h, "To"),
      subject: getHeader(h, "Subject"),
      date: getHeader(h, "Date"),
      body: text || html?.replace(/<[^>]*>/g, "") || msg.snippet,
      labels: msg.labelIds,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
      })),
    }),
  );
}

function buildRawEmail(params: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}): string {
  const subjectB64 = toBase64(new TextEncoder().encode(params.subject));
  const bodyB64 = toBase64(new TextEncoder().encode(params.body));

  const lines: string[] = [];
  lines.push(`To: ${params.to}`);
  if (params.cc) lines.push(`Cc: ${params.cc}`);
  if (params.bcc) lines.push(`Bcc: ${params.bcc}`);
  lines.push(`Subject: =?UTF-8?B?${subjectB64}?=`);
  lines.push("MIME-Version: 1.0");
  lines.push("Content-Type: text/plain; charset=utf-8");
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(bodyB64);

  return toBase64Url(new TextEncoder().encode(lines.join("\r\n")));
}

async function gmailSend(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const raw = buildRawEmail({
    to: String(input.to ?? ""),
    subject: String(input.subject ?? ""),
    body: String(input.body ?? ""),
    cc: input.cc ? String(input.cc) : undefined,
    bcc: input.bcc ? String(input.bcc) : undefined,
  });

  const result = await gapi<{ id: string; threadId: string }>(
    token,
    `${GMAIL_API}/messages/send`,
    { method: "POST", body: JSON.stringify({ raw }) },
  );

  return JSON.stringify({
    success: true,
    messageId: result.id,
    threadId: result.threadId,
  });
}

async function gmailCreateDraft(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const raw = buildRawEmail({
    to: String(input.to ?? ""),
    subject: String(input.subject ?? ""),
    body: String(input.body ?? ""),
    cc: input.cc ? String(input.cc) : undefined,
  });

  const result = await gapi<{ id: string; message: { id: string } }>(
    token,
    `${GMAIL_API}/drafts`,
    { method: "POST", body: JSON.stringify({ message: { raw } }) },
  );

  return JSON.stringify({
    success: true,
    draftId: result.id,
    messageId: result.message?.id,
  });
}

async function gmailListLabels(token: string): Promise<string> {
  const result = await gapi<{
    labels: Array<{ id: string; name: string; type: string }>;
  }>(token, `${GMAIL_API}/labels`);
  return JSON.stringify({ labels: result.labels ?? [] });
}

async function gmailModifyLabels(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const messageId = String(input.messageId ?? "");
  await gapi(token, `${GMAIL_API}/messages/${messageId}/modify`, {
    method: "POST",
    body: JSON.stringify({
      addLabelIds: (input.addLabelIds as string[]) ?? [],
      removeLabelIds: (input.removeLabelIds as string[]) ?? [],
    }),
  });
  return JSON.stringify({ success: true, messageId });
}

// ── Calendar Handlers ──

function toCalendarTime(val: string): {
  dateTime?: string;
  date?: string;
  timeZone?: string;
} {
  if (val.includes("T")) return { dateTime: val };
  return { date: val };
}

async function calendarList(token: string): Promise<string> {
  const result = await gapi<{
    items: Array<{ id: string; summary: string; primary?: boolean }>;
  }>(token, `${CALENDAR_API}/users/me/calendarList`);
  return JSON.stringify({
    calendars: (result.items ?? []).map((c) => ({
      id: c.id,
      name: c.summary,
      primary: !!c.primary,
    })),
  });
}

async function calendarEvents(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const calendarId = encodeURIComponent(String(input.calendarId ?? "primary"));
  const params = new URLSearchParams();
  if (input.timeMin) params.set("timeMin", String(input.timeMin));
  if (input.timeMax) params.set("timeMax", String(input.timeMax));
  params.set(
    "maxResults",
    String(Math.min(Number(input.maxResults) || 20, 50)),
  );
  params.set("singleEvents", "true");
  params.set("orderBy", "startTime");
  if (input.query) params.set("q", String(input.query));

  const result = await gapi<{
    items: Array<{
      id: string;
      summary: string;
      description?: string;
      location?: string;
      start: { dateTime?: string; date?: string };
      end: { dateTime?: string; date?: string };
      attendees?: Array<{ email: string; responseStatus: string }>;
      status: string;
    }>;
  }>(token, `${CALENDAR_API}/calendars/${calendarId}/events?${params}`);

  return truncate(
    JSON.stringify({
      events: (result.items ?? []).map((e) => ({
        id: e.id,
        summary: e.summary,
        description: e.description,
        location: e.location,
        start: e.start?.dateTime ?? e.start?.date,
        end: e.end?.dateTime ?? e.end?.date,
        attendees: e.attendees?.map((a) => `${a.email} (${a.responseStatus})`),
        status: e.status,
      })),
    }),
  );
}

async function calendarGetEvent(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const calendarId = encodeURIComponent(String(input.calendarId ?? "primary"));
  const eventId = String(input.eventId ?? "");
  const event = await gapi(
    token,
    `${CALENDAR_API}/calendars/${calendarId}/events/${eventId}`,
  );
  return truncate(JSON.stringify(event));
}

async function calendarCreateEvent(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const calendarId = encodeURIComponent(String(input.calendarId ?? "primary"));
  const body: Record<string, unknown> = {
    summary: String(input.summary ?? ""),
    start: toCalendarTime(String(input.start ?? "")),
    end: toCalendarTime(String(input.end ?? "")),
  };
  if (input.description) body.description = String(input.description);
  if (input.location) body.location = String(input.location);
  if (input.attendees) {
    body.attendees = (input.attendees as string[]).map((email) => ({ email }));
  }
  if (input.colorId) body.colorId = String(input.colorId);

  const result = await gapi<{ id: string; htmlLink: string }>(
    token,
    `${CALENDAR_API}/calendars/${calendarId}/events`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return JSON.stringify({
    success: true,
    eventId: result.id,
    link: result.htmlLink,
  });
}

async function calendarUpdateEvent(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const calendarId = encodeURIComponent(String(input.calendarId ?? "primary"));
  const eventId = String(input.eventId ?? "");

  const current = await gapi<Record<string, unknown>>(
    token,
    `${CALENDAR_API}/calendars/${calendarId}/events/${eventId}`,
  );

  const body: Record<string, unknown> = { ...current };
  if (input.summary !== undefined) body.summary = String(input.summary);
  if (input.description !== undefined)
    body.description = String(input.description);
  if (input.location !== undefined) body.location = String(input.location);
  if (input.start) body.start = toCalendarTime(String(input.start));
  if (input.end) body.end = toCalendarTime(String(input.end));
  if (input.attendees) {
    body.attendees = (input.attendees as string[]).map((email) => ({ email }));
  }
  if (input.colorId !== undefined) body.colorId = String(input.colorId);

  const result = await gapi<{ id: string; htmlLink: string }>(
    token,
    `${CALENDAR_API}/calendars/${calendarId}/events/${eventId}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
  return JSON.stringify({
    success: true,
    eventId: result.id,
    link: result.htmlLink,
  });
}

async function calendarDeleteEvent(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const calendarId = encodeURIComponent(String(input.calendarId ?? "primary"));
  const eventId = String(input.eventId ?? "");
  await gapi(
    token,
    `${CALENDAR_API}/calendars/${calendarId}/events/${eventId}`,
    { method: "DELETE" },
  );
  return JSON.stringify({ success: true, eventId });
}

// ── Drive Handlers ──

async function driveSearch(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const query = String(input.query ?? "");
  const maxResults = Math.min(Number(input.maxResults) || 20, 50);
  const params = new URLSearchParams({
    q: query + " and trashed=false",
    pageSize: String(maxResults),
    fields: "files(id,name,mimeType,modifiedTime,size,webViewLink,parents)",
  });

  const result = await gapi<{
    files: Array<Record<string, unknown>>;
  }>(token, `${DRIVE_API}/files?${params}`);
  return truncate(JSON.stringify({ files: result.files ?? [] }));
}

async function driveGetFile(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const fileId = String(input.fileId ?? "");
  const meta = await gapi<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    webViewLink?: string;
  }>(
    token,
    `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,size,webViewLink`,
  );

  const exportMap: Record<string, string> = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
  };

  const exportMime = exportMap[meta.mimeType];
  if (exportMime) {
    const res = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok)
      return JSON.stringify({
        ...meta,
        content: `(export failed: ${res.status})`,
      });
    const content = await res.text();
    return truncate(JSON.stringify({ ...meta, content }));
  }

  if (
    meta.mimeType?.startsWith("text/") ||
    meta.mimeType === "application/json"
  ) {
    const size = parseInt(String(meta.size ?? "0"));
    if (size < 1_000_000) {
      const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const content = await res.text();
        return truncate(JSON.stringify({ ...meta, content }));
      }
    }
  }

  return JSON.stringify({
    ...meta,
    note: "Binary file - content not displayed",
  });
}

async function driveUpload(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const name = String(input.name ?? "Untitled");
  const content = String(input.content ?? "");
  const mimeType = String(input.mimeType ?? "text/plain");
  const folderId = input.folderId ? String(input.folderId) : undefined;

  const metadata: Record<string, unknown> = { name };
  if (folderId) metadata.parents = [folderId];

  const boundary = "----UploadBoundary" + Date.now();
  const CRLF = "\r\n";
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    "",
    content,
    `--${boundary}--`,
  ].join(CRLF);

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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
  return JSON.stringify({
    success: true,
    fileId: result.id,
    name: result.name,
    link: result.webViewLink,
  });
}

async function driveCreateFolder(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const name = String(input.name ?? "New Folder");
  const parentId = input.parentId ? String(input.parentId) : undefined;
  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];

  const result = await gapi<{
    id: string;
    name: string;
    webViewLink: string;
  }>(token, `${DRIVE_API}/files`, {
    method: "POST",
    body: JSON.stringify(metadata),
  });
  return JSON.stringify({
    success: true,
    folderId: result.id,
    name: result.name,
    link: result.webViewLink,
  });
}

// ── Docs Handlers ──

function extractDocText(doc: Record<string, unknown>): string {
  const body = doc.body as
    | { content?: Array<Record<string, unknown>> }
    | undefined;
  const content = body?.content ?? [];
  let text = "";
  for (const element of content) {
    const paragraph = element.paragraph as
      | { elements?: Array<{ textRun?: { content: string } }> }
      | undefined;
    if (paragraph) {
      for (const elem of paragraph.elements ?? []) {
        text += elem.textRun?.content ?? "";
      }
    }
    const table = element.table as
      | { tableRows?: Array<Record<string, unknown>> }
      | undefined;
    if (table) {
      for (const row of table.tableRows ?? []) {
        const cells =
          (
            row as {
              tableCells?: Array<{
                content?: Array<Record<string, unknown>>;
              }>;
            }
          ).tableCells ?? [];
        for (const cell of cells) {
          for (const cellContent of cell.content ?? []) {
            const p = cellContent.paragraph as
              | { elements?: Array<{ textRun?: { content: string } }> }
              | undefined;
            if (p) {
              for (const elem of p.elements ?? []) {
                text += elem.textRun?.content ?? "";
              }
            }
          }
          text += "\t";
        }
        text += "\n";
      }
    }
  }
  return text;
}

async function docsGet(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const documentId = String(input.documentId ?? "");
  const doc = await gapi<Record<string, unknown>>(
    token,
    `${DOCS_API}/${documentId}`,
  );
  const title = (doc.title as string) ?? "";
  const text = extractDocText(doc);
  return truncate(JSON.stringify({ documentId, title, content: text }));
}

async function docsCreate(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const title = String(input.title ?? "Untitled");
  const content = input.content ? String(input.content) : undefined;

  const doc = await gapi<{ documentId: string; title: string }>(
    token,
    DOCS_API,
    { method: "POST", body: JSON.stringify({ title }) },
  );

  if (content) {
    await gapi(token, `${DOCS_API}/${doc.documentId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ insertText: { location: { index: 1 }, text: content } }],
      }),
    });
  }

  return JSON.stringify({
    success: true,
    documentId: doc.documentId,
    title: doc.title,
  });
}

// ── Sheets Handlers ──

async function sheetsGetValues(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const spreadsheetId = String(input.spreadsheetId ?? "");
  const range = String(input.range ?? "Sheet1");
  const result = await gapi<{ range: string; values: unknown[][] }>(
    token,
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
  );
  return truncate(
    JSON.stringify({ range: result.range, values: result.values ?? [] }),
  );
}

async function sheetsUpdateValues(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const spreadsheetId = String(input.spreadsheetId ?? "");
  const range = String(input.range ?? "Sheet1");
  const values = (input.values as unknown[][]) ?? [];

  const result = await gapi<{
    updatedCells: number;
    updatedRange: string;
  }>(
    token,
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ range, values }) },
  );
  return JSON.stringify({
    success: true,
    updatedCells: result.updatedCells,
    updatedRange: result.updatedRange,
  });
}

async function sheetsCreate(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const title = String(input.title ?? "Untitled");
  const result = await gapi<{
    spreadsheetId: string;
    spreadsheetUrl: string;
  }>(token, SHEETS_API, {
    method: "POST",
    body: JSON.stringify({ properties: { title } }),
  });
  return JSON.stringify({
    success: true,
    spreadsheetId: result.spreadsheetId,
    link: result.spreadsheetUrl,
  });
}

async function sheetsAppendRows(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const spreadsheetId = String(input.spreadsheetId ?? "");
  const range = String(input.range ?? "Sheet1");
  const values = (input.values as unknown[][]) ?? [];

  const result = await gapi<{
    updates: { updatedCells: number; updatedRange: string };
  }>(
    token,
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
    { method: "POST", body: JSON.stringify({ range, values }) },
  );
  return JSON.stringify({
    success: true,
    updatedCells: result.updates?.updatedCells,
    updatedRange: result.updates?.updatedRange,
  });
}

// ── Main Executor ──

export async function executeGwsTool(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const accessToken = await refreshAccessToken(supabaseAdmin, userId);
    if (!accessToken) {
      return JSON.stringify({
        error:
          "Googleアカウントが接続されていないか、トークンが期限切れです。設定からGoogleアカウントを再接続してください。",
      });
    }

    switch (toolName) {
      case "gmail_search":
        return await gmailSearch(accessToken, input);
      case "gmail_get_message":
        return await gmailGetMessage(accessToken, input);
      case "gmail_send":
        return await gmailSend(accessToken, input);
      case "gmail_create_draft":
        return await gmailCreateDraft(accessToken, input);
      case "gmail_list_labels":
        return await gmailListLabels(accessToken);
      case "gmail_modify_labels":
        return await gmailModifyLabels(accessToken, input);
      case "calendar_list":
        return await calendarList(accessToken);
      case "calendar_events":
        return await calendarEvents(accessToken, input);
      case "calendar_get_event":
        return await calendarGetEvent(accessToken, input);
      case "calendar_create_event":
        return await calendarCreateEvent(accessToken, input);
      case "calendar_update_event":
        return await calendarUpdateEvent(accessToken, input);
      case "calendar_delete_event":
        return await calendarDeleteEvent(accessToken, input);
      case "drive_search":
        return await driveSearch(accessToken, input);
      case "drive_get_file":
        return await driveGetFile(accessToken, input);
      case "drive_upload":
        return await driveUpload(accessToken, input);
      case "drive_create_folder":
        return await driveCreateFolder(accessToken, input);
      case "docs_get":
        return await docsGet(accessToken, input);
      case "docs_create":
        return await docsCreate(accessToken, input);
      case "sheets_get_values":
        return await sheetsGetValues(accessToken, input);
      case "sheets_update_values":
        return await sheetsUpdateValues(accessToken, input);
      case "sheets_create":
        return await sheetsCreate(accessToken, input);
      case "sheets_append_rows":
        return await sheetsAppendRows(accessToken, input);
      case "web_search":
        return await webSearch(input);
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`GWS tool error (${toolName}):`, msg);
    return JSON.stringify({ error: msg });
  }
}

// ── Web Search via Gemini Grounding ──

async function webSearch(input: Record<string, unknown>): Promise<string> {
  const query = String(input.query ?? "");
  if (!query) return JSON.stringify({ error: "query is required" });

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) return JSON.stringify({ error: "GEMINI_API_KEY not set" });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    return JSON.stringify({ error: `Gemini search failed: ${err}` });
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text =
    candidate?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "";

  // Extract grounding metadata (sources)
  const grounding = candidate?.groundingMetadata;
  const sources =
    grounding?.groundingChunks
      ?.slice(0, 5)
      ?.map(
        (c: { web?: { uri?: string; title?: string } }) =>
          `- [${c.web?.title ?? "Source"}](${c.web?.uri ?? ""})`,
      )
      .join("\n") ?? "";

  const result = sources ? `${text}\n\n**Sources:**\n${sources}` : text;
  return truncate(result, 8000);
}
