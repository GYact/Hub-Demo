export const formatCurrency = (amount: number, currency: string = "JPY") => {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDate = (
  dateStr?: string,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  },
) => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", options);
};

export const formatDateFull = (dateStr?: string) => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export const formatRelativeTime = (dateString?: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US");
};

// Fix AI-generated markdown: trim spaces inside bold/italic markers,
// and insert hair-space (U+200A) when CommonMark flanking rules would
// fail due to CJK punctuation (e.g. ）**に is not right-flanking).
export const sanitizeMarkdown = (text: string): string =>
  text
    .replace(
      /\*\*([^*]+)\*\*/g,
      (match, c: string, offset: number, str: string) => {
        const t = c.trim();
        if (!t) return match;
        const before = offset > 0 ? str[offset - 1] : "";
        const after = str[offset + match.length] ?? "";
        // Opening **: if preceded by letter/number and content starts with
        // punctuation, CommonMark won't recognise left-flanking → add hair space
        const pre =
          before && /[\p{L}\p{N}]/u.test(before) && /\p{P}/u.test(t[0])
            ? "\u200A"
            : "";
        // Closing **: if content ends with punctuation and followed by
        // letter/number, CommonMark won't recognise right-flanking → add hair space
        const post =
          after && /\p{P}/u.test(t[t.length - 1]) && /[\p{L}\p{N}]/u.test(after)
            ? "\u200A"
            : "";
        return `${pre}**${t}**${post}`;
      },
    )
    .replace(/(?<=\S)\*([^*]+)\*(?=\S)/g, (_, c: string) => `*${c.trim()}*`);

export const formatTimeAgo = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
};
