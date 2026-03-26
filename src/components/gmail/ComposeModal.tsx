import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Send, ChevronDown, ChevronUp, Loader2, Save } from "lucide-react";
import type { ComposeState, ComposeEmailInput } from "../../types/gmail";

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (input: ComposeEmailInput) => Promise<boolean>;
  initialState?: ComposeState;
  isSending: boolean;
  signature?: string;
  onSaveDraft?: (
    input: ComposeEmailInput,
    draftId?: string,
  ) => Promise<string | null>;
}

const getModeTitle = (mode: ComposeState["mode"]): string => {
  switch (mode) {
    case "reply":
      return "Reply";
    case "replyAll":
      return "Reply All";
    case "forward":
      return "Forward";
    default:
      return "New Message";
  }
};

// Parse comma/space-separated string into array of trimmed emails
const parseEmails = (value: string): string[] =>
  value
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

// Chip-style email input
const EmailChipInput: React.FC<{
  emails: string[];
  onChange: (emails: string[]) => void;
  placeholder: string;
}> = ({ emails, onChange, placeholder }) => {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addEmails = useCallback(
    (raw: string) => {
      const newEmails = parseEmails(raw).filter((e) => !emails.includes(e));
      if (newEmails.length > 0) {
        onChange([...emails, ...newEmails]);
      }
      setInputValue("");
    },
    [emails, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
        e.preventDefault();
        if (inputValue.trim()) {
          addEmails(inputValue);
        }
      } else if (
        e.key === "Backspace" &&
        inputValue === "" &&
        emails.length > 0
      ) {
        onChange(emails.slice(0, -1));
      }
    },
    [inputValue, emails, onChange, addEmails],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text");
      addEmails(pasted);
    },
    [addEmails],
  );

  const handleBlur = useCallback(() => {
    if (inputValue.trim()) {
      addEmails(inputValue);
    }
  }, [inputValue, addEmails]);

  const removeEmail = useCallback(
    (index: number) => {
      onChange(emails.filter((_, i) => i !== index));
    },
    [emails, onChange],
  );

  return (
    <div
      className="flex-1 flex flex-wrap items-center gap-1 px-2 py-1.5 neu-input rounded-lg min-h-[36px] cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {emails.map((email, i) => (
        <span
          key={`${email}-${i}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-md text-xs font-medium max-w-[200px]"
        >
          <span className="truncate">{email}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeEmail(i);
            }}
            className="flex-shrink-0 hover:text-red-900"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
        placeholder={emails.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm py-0.5"
      />
    </div>
  );
};

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  onSend,
  initialState,
  isSending,
  signature,
  onSaveDraft,
}) => {
  const [toEmails, setToEmails] = useState<string[]>([]);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [bccEmails, setBccEmails] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | undefined>();
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialState) {
      setToEmails(parseEmails(initialState.to));
      setCcEmails(parseEmails(initialState.cc));
      setBccEmails(parseEmails(initialState.bcc));
      setSubject(initialState.subject);
      setBody(initialState.body);
      setShowCc(!!initialState.cc);
      setShowBcc(!!initialState.bcc);
      setDraftId(initialState.draftId);
    } else {
      setToEmails([]);
      setCcEmails([]);
      setBccEmails([]);
      setSubject("");
      setBody(signature ? `\n\n-- \n${signature}` : "");
      setShowCc(false);
      setShowBcc(false);
      setDraftId(undefined);
    }
    setValidationError(null);
    setDraftSaved(false);
  }, [initialState, isOpen, signature]);

  // Auto-save draft (3s debounce)
  useEffect(() => {
    if (!isOpen || !onSaveDraft) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      if (!subject && !body && toEmails.length === 0) return;
      const input: ComposeEmailInput = {
        to: toEmails,
        cc: ccEmails.length > 0 ? ccEmails : undefined,
        bcc: bccEmails.length > 0 ? bccEmails : undefined,
        subject,
        body,
        threadId: initialState?.threadId,
        inReplyTo: initialState?.inReplyTo,
        references: initialState?.references,
      };
      const newDraftId = await onSaveDraft(input, draftId);
      if (newDraftId) {
        setDraftId(newDraftId);
        setDraftSaved(true);
        setDraftError(false);
        setTimeout(() => setDraftSaved(false), 2000);
      } else {
        setDraftError(true);
        setTimeout(() => setDraftError(false), 3000);
      }
    }, 3000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toEmails, ccEmails, bccEmails, subject, body]);

  const handleSaveDraft = useCallback(async () => {
    if (!onSaveDraft) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const input: ComposeEmailInput = {
      to: toEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      bcc: bccEmails.length > 0 ? bccEmails : undefined,
      subject,
      body,
      threadId: initialState?.threadId,
      inReplyTo: initialState?.inReplyTo,
      references: initialState?.references,
    };
    const newDraftId = await onSaveDraft(input, draftId);
    if (newDraftId) {
      setDraftId(newDraftId);
      setDraftSaved(true);
      setDraftError(false);
      setTimeout(() => setDraftSaved(false), 2000);
    } else {
      setDraftError(true);
      setTimeout(() => setDraftError(false), 3000);
    }
  }, [
    onSaveDraft,
    toEmails,
    ccEmails,
    bccEmails,
    subject,
    body,
    draftId,
    initialState,
  ]);

  const handleSend = async () => {
    if (toEmails.length === 0) {
      setValidationError("Please enter at least one recipient.");
      return;
    }

    setValidationError(null);

    const input: ComposeEmailInput = {
      to: toEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      bcc: bccEmails.length > 0 ? bccEmails : undefined,
      subject,
      body,
      threadId: initialState?.threadId,
      inReplyTo: initialState?.inReplyTo,
      references: initialState?.references,
    };

    const success = await onSend(input);
    if (success) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const mode = initialState?.mode || "new";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[calc(100vw-2rem)] md:max-w-2xl neu-card rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold neu-text-primary">
            {getModeTitle(mode)}
          </h3>
          <button
            onClick={onClose}
            className="p-2 neu-btn rounded-lg"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {/* To */}
          <div className="flex items-start gap-2">
            <label className="text-sm font-medium neu-text-muted w-12 flex-shrink-0 pt-2">
              To:
            </label>
            <EmailChipInput
              emails={toEmails}
              onChange={(emails) => {
                setToEmails(emails);
                setValidationError(null);
              }}
              placeholder="recipient@example.com"
            />
            <button
              onClick={() => {
                setShowCc(!showCc);
                setShowBcc(!showBcc);
              }}
              className="p-1.5 neu-btn rounded-lg mt-1"
              title="Toggle Cc/Bcc"
            >
              {showCc ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {/* Cc */}
          {showCc && (
            <div className="flex items-start gap-2">
              <label className="text-sm font-medium neu-text-muted w-12 flex-shrink-0 pt-2">
                Cc:
              </label>
              <EmailChipInput
                emails={ccEmails}
                onChange={setCcEmails}
                placeholder="cc@example.com"
              />
            </div>
          )}

          {/* Bcc */}
          {showBcc && (
            <div className="flex items-start gap-2">
              <label className="text-sm font-medium neu-text-muted w-12 flex-shrink-0 pt-2">
                Bcc:
              </label>
              <EmailChipInput
                emails={bccEmails}
                onChange={setBccEmails}
                placeholder="bcc@example.com"
              />
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium neu-text-muted w-12 flex-shrink-0">
              Subj:
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 px-3 py-2 text-sm neu-input rounded-lg"
            />
          </div>

          {/* Body */}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            className="w-full px-4 py-3 text-sm neu-input rounded-lg min-h-[200px] resize-y"
          />

          {/* Validation error */}
          {validationError && (
            <p className="text-sm text-red-500">{validationError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium neu-btn rounded-lg"
            >
              Cancel
            </button>
            {draftSaved && (
              <span className="text-xs text-green-600">Draft saved</span>
            )}
            {draftError && (
              <span className="text-xs text-red-500">Draft save failed</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onSaveDraft && (
              <button
                onClick={handleSaveDraft}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium neu-btn rounded-lg"
              >
                <Save size={14} />
                Save Draft
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={isSending}
              className="flex items-center gap-2 px-5 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {isSending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
              {isSending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
