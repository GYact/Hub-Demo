import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Save, Loader2, Check } from "lucide-react";
import type { GmailSendAs, GmailVacationSettings } from "../../types/gmail";
import { DatePicker } from "../DatePicker";

interface GmailSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onFetchSendAs: () => Promise<GmailSendAs[]>;
  onUpdateSignature: (email: string, signature: string) => Promise<boolean>;
  onFetchVacation: () => Promise<GmailVacationSettings | null>;
  onUpdateVacation: (settings: GmailVacationSettings) => Promise<boolean>;
}

type TabId = "signature" | "vacation";

export const GmailSettingsPanel: React.FC<GmailSettingsPanelProps> = ({
  isOpen,
  onClose,
  onFetchSendAs,
  onUpdateSignature,
  onFetchVacation,
  onUpdateVacation,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>("signature");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Signature state
  const [sendAsAccounts, setSendAsAccounts] = useState<GmailSendAs[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [signature, setSignature] = useState("");

  // Vacation state
  const [vacation, setVacation] = useState<GmailVacationSettings>({
    enableAutoReply: false,
    responseSubject: "",
    responseBodyPlainText: "",
    restrictToContacts: false,
    restrictToDomain: false,
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sendAs, vac] = await Promise.all([
        onFetchSendAs(),
        onFetchVacation(),
      ]);
      setSendAsAccounts(sendAs);
      if (sendAs.length > 0) {
        const primary = sendAs.find((s) => s.isPrimary) || sendAs[0];
        setSelectedAccount(primary.sendAsEmail);
        setSignature(primary.signature);
      }
      if (vac) {
        setVacation(vac);
      }
    } finally {
      setIsLoading(false);
    }
  }, [onFetchSendAs, onFetchVacation]);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen, loadSettings]);

  const handleAccountChange = (email: string) => {
    setSelectedAccount(email);
    const account = sendAsAccounts.find((s) => s.sendAsEmail === email);
    if (account) {
      setSignature(account.signature);
    }
  };

  const handleSaveSignature = async () => {
    setIsSaving(true);
    const success = await onUpdateSignature(selectedAccount, signature);
    if (success) {
      setSendAsAccounts((prev) =>
        prev.map((s) =>
          s.sendAsEmail === selectedAccount ? { ...s, signature } : s,
        ),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setIsSaving(false);
  };

  const handleSaveVacation = async () => {
    setIsSaving(true);
    const success = await onUpdateVacation(vacation);
    if (success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setIsSaving(false);
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
      style={{
        paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[calc(100vw-2rem)] md:max-w-lg neu-card rounded-2xl overflow-hidden flex flex-col max-h-[70svh] md:max-h-[calc(100dvh-8rem)] my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold neu-text-primary">
            Gmail Settings
          </h3>
          <button onClick={onClose} className="p-2 neu-btn rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {(
            [
              { id: "signature" as TabId, label: "Signature" },
              { id: "vacation" as TabId, label: "Vacation Responder" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-xs md:text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-red-600 border-b-2 border-red-600"
                  : "neu-text-secondary hover:neu-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin neu-text-muted" />
            </div>
          ) : activeTab === "signature" ? (
            <div className="space-y-4">
              {/* Account selector */}
              {sendAsAccounts.length > 1 && (
                <div>
                  <label className="text-xs font-medium neu-text-muted">
                    Send mail as
                  </label>
                  <select
                    value={selectedAccount}
                    onChange={(e) => handleAccountChange(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm neu-input rounded-lg"
                  >
                    {sendAsAccounts.map((s) => (
                      <option key={s.sendAsEmail} value={s.sendAsEmail}>
                        {s.displayName
                          ? `${s.displayName} <${s.sendAsEmail}>`
                          : s.sendAsEmail}
                        {s.isPrimary ? " (Primary)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Signature editor */}
              <div>
                <label className="text-xs font-medium neu-text-muted">
                  Signature
                </label>
                <textarea
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Your email signature..."
                  className="w-full mt-1 px-3 py-2 text-sm neu-input rounded-lg min-h-[150px] resize-y font-mono"
                />
              </div>

              {/* Preview */}
              {signature && (
                <div>
                  <label className="text-xs font-medium neu-text-muted">
                    Preview
                  </label>
                  <div className="mt-1 p-3 rounded-lg bg-gray-50 text-sm whitespace-pre-wrap">
                    --{"\n"}
                    {signature}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Enable toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={vacation.enableAutoReply}
                  onChange={(e) =>
                    setVacation((v) => ({
                      ...v,
                      enableAutoReply: e.target.checked,
                    }))
                  }
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm font-medium neu-text-primary">
                  Enable vacation responder
                </span>
              </label>

              {vacation.enableAutoReply && (
                <>
                  {/* Date range */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <DatePicker
                        label="Start Date"
                        value={
                          vacation.startTime
                            ? new Date(Number(vacation.startTime))
                                .toISOString()
                                .split("T")[0]
                            : ""
                        }
                        onChange={(value) =>
                          setVacation((v) => ({
                            ...v,
                            startTime: value
                              ? String(new Date(value).getTime())
                              : undefined,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <DatePicker
                        label="End Date"
                        value={
                          vacation.endTime
                            ? new Date(Number(vacation.endTime))
                                .toISOString()
                                .split("T")[0]
                            : ""
                        }
                        onChange={(value) =>
                          setVacation((v) => ({
                            ...v,
                            endTime: value
                              ? String(new Date(value).getTime())
                              : undefined,
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="text-xs font-medium neu-text-muted">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={vacation.responseSubject}
                      onChange={(e) =>
                        setVacation((v) => ({
                          ...v,
                          responseSubject: e.target.value,
                        }))
                      }
                      placeholder="Out of office"
                      className="w-full mt-1 px-3 py-2 text-sm neu-input rounded-lg"
                    />
                  </div>

                  {/* Message */}
                  <div>
                    <label className="text-xs font-medium neu-text-muted">
                      Message
                    </label>
                    <textarea
                      value={vacation.responseBodyPlainText}
                      onChange={(e) =>
                        setVacation((v) => ({
                          ...v,
                          responseBodyPlainText: e.target.value,
                        }))
                      }
                      placeholder="I'm currently out of office..."
                      className="w-full mt-1 px-3 py-2 text-sm neu-input rounded-lg min-h-[120px] resize-y"
                    />
                  </div>

                  {/* Restrictions */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={vacation.restrictToContacts}
                        onChange={(e) =>
                          setVacation((v) => ({
                            ...v,
                            restrictToContacts: e.target.checked,
                          }))
                        }
                        className="rounded border-gray-300"
                      />
                      Only send to my contacts
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={vacation.restrictToDomain}
                        onChange={(e) =>
                          setVacation((v) => ({
                            ...v,
                            restrictToDomain: e.target.checked,
                          }))
                        }
                        className="rounded border-gray-300"
                      />
                      Only send to people in my organization
                    </label>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 md:px-6 py-4 border-t border-gray-200 gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-600 mr-2">
              <Check size={14} /> Saved
            </span>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium neu-btn rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={
              activeTab === "signature"
                ? handleSaveSignature
                : handleSaveVacation
            }
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
