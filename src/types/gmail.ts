// Gmail API response types

export interface GmailMessagePartBody {
  attachmentId?: string;
  size: number;
  data?: string; // base64url encoded
}

export interface GmailMessagePartHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename: string;
  headers: GmailMessagePartHeader[];
  body: GmailMessagePartBody;
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string; // epoch milliseconds as string
  payload: GmailMessagePart;
  sizeEstimate: number;
}

// Parsed types for UI consumption

export interface EmailAddress {
  name: string;
  email: string;
}

export interface EmailAttachment {
  id: string;
  messageId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ParsedEmail {
  id: string;
  threadId: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  date: string; // ISO string
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  labelIds: string[];
  isUnread: boolean;
  isStarred: boolean;
  attachments: EmailAttachment[];
  messageIdHeader: string; // Message-ID header for threading
  references: string; // References header for threading
}

// Label types

export interface GmailLabel {
  id: string;
  name: string;
  type: "system" | "user";
  messageListVisibility?: "show" | "hide";
  labelListVisibility?: "labelShow" | "labelShowIfUnread" | "labelHide";
  messagesTotal?: number;
  messagesUnread?: number;
  color?: {
    textColor: string;
    backgroundColor: string;
  };
}

// API response types

export interface GmailMessagesListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate: number;
}

// Compose types

export interface ComposeEmailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export interface ComposeState {
  mode: ComposeMode;
  originalMessage?: ParsedEmail;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  draftId?: string;
}

// Thread types

export interface GmailThread {
  id: string;
  messages: ParsedEmail[];
  subject: string;
  snippet: string;
  lastDate: string;
  participants: EmailAddress[];
  messageCount: number;
  isUnread: boolean;
  isStarred: boolean;
  labelIds: string[];
}

// Draft types

export interface GmailDraft {
  id: string;
  message: ParsedEmail;
}

// Search filter types

export interface GmailSearchFilters {
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  dateAfter?: string;
  dateBefore?: string;
  labelId?: string;
  isUnread?: boolean;
  isStarred?: boolean;
  freeText?: string;
}

// Settings types

export interface GmailSendAs {
  sendAsEmail: string;
  displayName: string;
  signature: string;
  isPrimary: boolean;
}

export interface GmailVacationSettings {
  enableAutoReply: boolean;
  responseSubject: string;
  responseBodyPlainText: string;
  restrictToContacts: boolean;
  restrictToDomain: boolean;
  startTime?: string;
  endTime?: string;
}
