import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  RefreshCw,
  Loader2,
  ExternalLink,
  Rss,
  MessageSquare,
  Hash,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Filter,
  Check,
  CheckCheck,
  Twitter,
  Heart,
  Repeat2,
  MessageCircle,
  Mail,
} from "lucide-react";
import { emojify } from "node-emoji";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDndSensors } from "../hooks/useDndSensors";
import { useAuth } from "../contexts/AuthContext";
import { useNotificationBadge } from "../contexts/NotificationContext";
import { Layout, AlertDialog } from "../components";
import {
  fetchMediaFeedItems,
  fetchRssFeeds,
  fetchXSources,
  fetchSlackIntegrations,
} from "../lib/offlineData";
import { supabase } from "../lib/offlineSync";
import { useUserSetting } from "../hooks/useUserSetting";
import type { MediaFeedItem, RssFeed, XSource } from "../types";
import { formatTimeAgo } from "../lib/formatters";
import { GmailTabContent } from "../components/gmail";
import { GoogleAccountSelector } from "../components/GoogleAccountSelector";

// Slack固有の絵文字名を標準的な絵文字名にマッピング
const SLACK_EMOJI_ALIASES: Record<string, string> = {
  robot_face: "robot",
  slightly_smiling_face: "slightly_smiling_face",
  thinking_face: "thinking",
  face_with_monocle: "monocle_face",
  nerd_face: "nerd_face",
  partying_face: "partying_face",
  star_struck: "star_struck",
  exploding_head: "exploding_head",
  face_with_rolling_eyes: "rolling_eyes",
  zipper_mouth_face: "zipper_mouth",
  money_mouth_face: "money_mouth_face",
  hugging_face: "hugs",
  face_with_hand_over_mouth: "hand_over_mouth",
  shushing_face: "shushing_face",
  face_with_raised_eyebrow: "raised_eyebrow",
  neutral_face: "neutral_face",
  expressionless_face: "expressionless",
  face_without_mouth: "no_mouth",
  smirking_face: "smirk",
  unamused_face: "unamused",
  face_with_rolling_eyes_face: "roll_eyes",
  grimacing_face: "grimacing",
  lying_face: "lying_face",
  relieved_face: "relieved",
  pensive_face: "pensive",
  sleepy_face: "sleepy",
  drooling_face: "drooling_face",
  sleeping_face: "sleeping",
  face_with_medical_mask: "mask",
  face_with_thermometer: "face_with_thermometer",
  face_with_head_bandage: "face_with_head_bandage",
  nauseated_face: "nauseated_face",
  sneezing_face: "sneezing_face",
  hot_face: "hot_face",
  cold_face: "cold_face",
  woozy_face: "woozy_face",
  dizzy_face: "dizzy_face",
  bar_chart: "bar_chart",
  chart_with_upwards_trend: "chart_with_upwards_trend",
  chart_with_downwards_trend: "chart_with_downwards_trend",
  memo: "memo",
  clipboard: "clipboard",
  pushpin: "pushpin",
  round_pushpin: "round_pushpin",
  triangular_flag_on_post: "triangular_flag_on_post",
  white_check_mark: "white_check_mark",
  ballot_box_with_check: "ballot_box_with_check",
};

// Slack絵文字を標準絵文字に変換してからemojifyする
const emojifySlack = (text: string): string => {
  let converted = text;
  for (const [slackName, standardName] of Object.entries(SLACK_EMOJI_ALIASES)) {
    converted = converted.replace(
      new RegExp(`:${slackName}:`, "g"),
      `:${standardName}:`,
    );
  }
  return emojify(converted);
};

// SlackメッセージをリッチなHTMLにフォーマット
const decodeHtmlEntities = (text: string): string =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const formatSlackMessage = (text: string): React.ReactNode[] => {
  // HTMLエンティティをデコード（Slack APIはエンコード済みテキストを返す）
  const decoded = decodeHtmlEntities(text);
  // Slack <url> 形式を裸URLに変換（<url|text> は維持）
  const urlNormalized = decoded.replace(/<(https?:\/\/[^|>]+)>/g, "$1");
  // 絵文字を変換
  let processed = emojifySlack(urlNormalized);

  // 行ごとに処理
  const lines = processed.split("\n");
  const result: React.ReactNode[] = [];
  let listItems: { type: "ul" | "ol"; items: React.ReactNode[] } | null = null;

  const processInlineFormatting = (line: string): React.ReactNode => {
    // インライン要素のパターン
    const patterns: {
      regex: RegExp;
      render: (match: RegExpMatchArray, key: number) => React.ReactNode;
    }[] = [
      // コードブロック（バッククォート）
      {
        regex: /`([^`]+)`/g,
        render: (m, k) => (
          <code
            key={k}
            className="px-1.5 py-0.5 bg-slate-100 text-pink-600 rounded text-sm font-mono"
          >
            {m[1]}
          </code>
        ),
      },
      // 太字（アスタリスク）
      {
        regex: /\*([^*]+)\*/g,
        render: (m, k) => (
          <strong key={k} className="font-semibold">
            {m[1]}
          </strong>
        ),
      },
      // イタリック（アンダースコア）
      { regex: /_([^_]+)_/g, render: (m, k) => <em key={k}>{m[1]}</em> },
      // 取り消し線（チルダ）
      {
        regex: /~([^~]+)~/g,
        render: (m, k) => (
          <del key={k} className="neu-text-muted">
            {m[1]}
          </del>
        ),
      },
      // リンク <url|text> 形式
      {
        regex: /<(https?:\/\/[^|>]+)\|([^>]+)>/g,
        render: (m, k) => (
          <a
            key={k}
            href={m[1]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {m[2]}
          </a>
        ),
      },
      // 裸のURL（前処理で<url>は展開済み）
      {
        regex: /(https?:\/\/[^\s<>)\]]+)/g,
        render: (m, k) => (
          <a
            key={k}
            href={m[1]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline break-all"
          >
            {m[1]}
          </a>
        ),
      },
      // チャンネルメンション <#C123|channel-name>
      {
        regex: /<#[A-Z0-9]+\|([^>]+)>/g,
        render: (m, k) => (
          <span
            key={k}
            className="inline-flex items-center px-1 py-0.5 bg-blue-50 text-blue-700 rounded text-sm font-medium"
          >
            #{m[1]}
          </span>
        ),
      },
      // ユーザーメンション <@U123>（Edge Functionで変換済みのため残存分は非表示）
      {
        regex: /<@[A-Z0-9]+>/g,
        render: (_m, k) => <span key={k} />,
      },
      // @channel, @here, @everyone
      {
        regex: /<!([a-z]+)>/g,
        render: (m, k) => (
          <span
            key={k}
            className="inline-flex items-center px-1 py-0.5 bg-red-50 text-red-700 rounded text-sm font-medium"
          >
            @{m[1]}
          </span>
        ),
      },
    ];

    // すべてのパターンをマッチさせてパーツに分割
    const parts: { start: number; end: number; node: React.ReactNode }[] = [];

    patterns.forEach(({ regex, render }) => {
      let match;
      const re = new RegExp(regex.source, regex.flags);
      while ((match = re.exec(line)) !== null) {
        parts.push({
          start: match.index,
          end: match.index + match[0].length,
          node: render(match, parts.length),
        });
      }
    });

    // 重なりを除去して、開始位置でソート
    parts.sort((a, b) => a.start - b.start);
    const filtered: typeof parts = [];
    let lastEnd = 0;
    for (const part of parts) {
      if (part.start >= lastEnd) {
        filtered.push(part);
        lastEnd = part.end;
      }
    }

    // パーツがなければそのまま返す
    if (filtered.length === 0) {
      return line;
    }

    // テキストとノードを組み合わせる
    const result: React.ReactNode[] = [];
    let currentIndex = 0;

    filtered.forEach((part, i) => {
      if (part.start > currentIndex) {
        result.push(line.slice(currentIndex, part.start));
      }
      result.push(
        React.cloneElement(part.node as React.ReactElement, {
          key: `inline-${i}`,
        }),
      );
      currentIndex = part.end;
    });

    if (currentIndex < line.length) {
      result.push(line.slice(currentIndex));
    }

    return <>{result}</>;
  };

  const flushList = () => {
    if (listItems) {
      const ListTag = listItems.type === "ul" ? "ul" : "ol";
      const listClass =
        listItems.type === "ul"
          ? "list-disc list-inside space-y-1 ml-2 my-2"
          : "list-decimal list-inside space-y-1 ml-2 my-2";
      result.push(
        <ListTag key={`list-${result.length}`} className={listClass}>
          {listItems.items.map((item, i) => (
            <li key={i} className="neu-text-primary">
              {item}
            </li>
          ))}
        </ListTag>,
      );
      listItems = null;
    }
  };

  lines.forEach((line, lineIndex) => {
    const trimmedLine = line.trim();

    // 空行
    if (trimmedLine === "") {
      flushList();
      result.push(<div key={`br-${lineIndex}`} className="h-2" />);
      return;
    }

    // 水平線
    if (/^-{3,}$/.test(trimmedLine) || /^_{3,}$/.test(trimmedLine)) {
      flushList();
      result.push(
        <hr key={`hr-${lineIndex}`} className="my-3 border-slate-200" />,
      );
      return;
    }

    // 絵文字ヘッダー（📦_タイトル_ や 📊_サマリー_ のような形式）
    const emojiHeaderMatch = trimmedLine.match(/^(.+?)_([^_]+)_\s*(-.*)?$/);
    if (
      emojiHeaderMatch &&
      /[\u{1F300}-\u{1F9FF}]/u.test(emojiHeaderMatch[1])
    ) {
      flushList();
      const emoji = emojiHeaderMatch[1];
      const title = emojiHeaderMatch[2];
      const subtitle = emojiHeaderMatch[3]?.replace(/^-\s*/, "") || "";
      result.push(
        <div
          key={`emoji-header-${lineIndex}`}
          className="flex items-center gap-2 py-2 my-1"
        >
          <span className="text-xl">{emoji}</span>
          <span className="font-bold text-lg neu-text-primary">{title}</span>
          {subtitle && <span className="neu-text-muted">— {subtitle}</span>}
        </div>,
      );
      return;
    }

    // セクションヘッダー（*テキスト* だけの行）
    const sectionHeaderMatch = trimmedLine.match(/^\*([^*]+)\*$/);
    if (sectionHeaderMatch) {
      flushList();
      result.push(
        <h3
          key={`section-${lineIndex}`}
          className="font-bold text-base neu-text-primary mt-4 mb-2 pb-1 border-b border-slate-100"
        >
          {sectionHeaderMatch[1]}
        </h3>,
      );
      return;
    }

    // 引用（>で始まる行）
    if (trimmedLine.startsWith(">")) {
      flushList();
      const quoteContent = trimmedLine.slice(1).trim();
      result.push(
        <blockquote
          key={`quote-${lineIndex}`}
          className="border-l-4 border-slate-300 pl-3 py-1 my-2 neu-text-secondary italic"
        >
          {processInlineFormatting(quoteContent)}
        </blockquote>,
      );
      return;
    }

    // 番号付き見出し項目（1. *タイトル*（説明）形式）
    const numberedHeadingMatch = trimmedLine.match(
      /^(\d+)[.)\]]\s*\*([^*]+)\*(.*)$/,
    );
    if (numberedHeadingMatch) {
      flushList();
      const num = numberedHeadingMatch[1];
      const title = numberedHeadingMatch[2];
      const description = numberedHeadingMatch[3]?.trim() || "";
      result.push(
        <div key={`num-heading-${lineIndex}`} className="mt-4 mb-2">
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-sm font-bold flex items-center justify-center">
              {num}
            </span>
            <div>
              <span className="font-bold neu-text-primary">{title}</span>
              {description && (
                <span className="neu-text-secondary ml-1">{description}</span>
              )}
            </div>
          </div>
        </div>,
      );
      return;
    }

    // 番号付きリスト（1. 2. など）
    const orderedMatch = trimmedLine.match(/^(\d+)[.)\]]\s+(.+)$/);
    if (orderedMatch) {
      if (!listItems || listItems.type !== "ol") {
        flushList();
        listItems = { type: "ol", items: [] };
      }
      listItems.items.push(processInlineFormatting(orderedMatch[2]));
      return;
    }

    // 箇条書きリスト（- • * で始まる行）
    const bulletMatch = trimmedLine.match(/^[-•*]\s+(.+)$/);
    if (bulletMatch) {
      if (!listItems || listItems.type !== "ul") {
        flushList();
        listItems = { type: "ul", items: [] };
      }
      listItems.items.push(processInlineFormatting(bulletMatch[1]));
      return;
    }

    // 通常の行
    flushList();
    result.push(
      <p key={`p-${lineIndex}`} className="leading-relaxed">
        {processInlineFormatting(line)}
      </p>,
    );
  });

  flushList();
  return result;
};

// Media Source types
type MediaSourceType = "slack" | "rss" | "x" | "gmail";

interface MediaSource {
  id: MediaSourceType;
  label: string;
  icon: typeof MessageSquare;
  color: string;
}

const MEDIA_SOURCES: MediaSource[] = [
  {
    id: "slack",
    label: "Slack",
    icon: MessageSquare,
    color: "text-purple-600",
  },
  { id: "rss", label: "RSS Feeds", icon: Rss, color: "text-orange-600" },
  { id: "x", label: "X", icon: Twitter, color: "text-sky-600" },
  { id: "gmail", label: "Gmail", icon: Mail, color: "text-red-600" },
];

// RSS Article Card (from notifications)
const RSSArticleCard = ({
  notification,
  onMarkAsRead,
}: {
  notification: MediaFeedItem;
  onMarkAsRead: (id: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const metadata = notification.metadata as {
    link?: string;
    feedName?: string;
    feedCategory?: string;
    pubDate?: string;
  } | null;

  const feedName = metadata?.feedName || "RSS";
  const link = metadata?.link || "#";

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't toggle when clicking links or buttons
    if ((e.target as HTMLElement).closest("a, button")) return;
    setExpanded((prev) => !prev);
    if (!notification.isRead) {
      onMarkAsRead(notification.id);
    }
  };

  return (
    <div
      className={`neu-card p-2 md:p-4 neu-card-hover transition-colors cursor-pointer ${!notification.isRead ? "ring-2 ring-orange-200" : ""}`}
      onClick={handleCardClick}
    >
      <div className="flex items-start gap-2 md:gap-3">
        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white shrink-0">
          <Rss size={16} className="md:w-5 md:h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
              {feedName}
            </span>
            {metadata?.feedCategory && (
              <span className="text-xs font-medium neu-text-secondary neu-flat px-2 py-0.5 rounded">
                {metadata.feedCategory}
              </span>
            )}
            <span className="text-xs neu-text-muted">
              {formatTimeAgo(notification.createdAt || "")}
            </span>
            {!notification.isRead && (
              <span
                className="w-1.5 h-1.5 md:w-2 md:h-2 bg-orange-500 rounded-full"
                title="Unread"
              />
            )}
          </div>
          <h3
            className={`font-semibold neu-text-primary mb-1 text-sm md:text-base ${expanded ? "" : "line-clamp-2"}`}
          >
            {notification.title}
          </h3>
          <p
            className={`text-xs md:text-sm neu-text-secondary ${expanded ? "whitespace-pre-wrap" : "line-clamp-2"}`}
          >
            {notification.body}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            >
              <span>Read article</span>
              <ExternalLink size={14} />
            </a>
            {!notification.isRead && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkAsRead(notification.id);
                }}
                className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700"
              >
                <Check size={14} />
                <span>Read</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// X Post Card (from notifications)
const XPostCard = ({
  notification,
  onMarkAsRead,
}: {
  notification: MediaFeedItem;
  onMarkAsRead: (id: string) => void;
}) => {
  const metadata = notification.metadata as {
    author_username?: string;
    author_display_name?: string;
    url?: string;
    posted_at?: string;
    metrics?: { likes?: number; retweets?: number; replies?: number };
    sourceName?: string;
    sourceType?: string;
  } | null;

  const username = metadata?.author_username || "unknown";
  const url = metadata?.url || "#";

  return (
    <div
      className={`neu-card p-2 md:p-4 neu-card-hover transition-colors ${!notification.isRead ? "ring-2 ring-sky-200" : ""}`}
    >
      <div className="flex items-start gap-2 md:gap-3">
        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white shrink-0">
          <Twitter size={16} className="md:w-5 md:h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-medium neu-text-primary text-xs md:text-sm">
              {notification.title}
            </span>
            <span className="text-[10px] md:text-xs neu-text-muted">
              @{username}
            </span>
            {metadata?.sourceName && (
              <span className="text-[10px] md:text-xs font-medium text-sky-600 bg-sky-50 px-1.5 md:px-2 py-0.5 rounded">
                {metadata.sourceName}
              </span>
            )}
            <span className="text-[10px] md:text-xs neu-text-muted">
              {formatTimeAgo(
                metadata?.posted_at || notification.createdAt || "",
              )}
            </span>
            {!notification.isRead && (
              <span
                className="w-1.5 h-1.5 md:w-2 md:h-2 bg-sky-500 rounded-full"
                title="Unread"
              />
            )}
          </div>
          <p className="text-xs md:text-sm neu-text-secondary whitespace-pre-wrap">
            {notification.body}
          </p>
          {metadata?.metrics && (
            <div className="flex items-center gap-4 mt-2 text-xs neu-text-muted">
              {metadata.metrics.replies !== undefined && (
                <span className="flex items-center gap-1">
                  <MessageCircle size={12} />
                  {metadata.metrics.replies}
                </span>
              )}
              {metadata.metrics.retweets !== undefined && (
                <span className="flex items-center gap-1">
                  <Repeat2 size={12} />
                  {metadata.metrics.retweets}
                </span>
              )}
              {metadata.metrics.likes !== undefined && (
                <span className="flex items-center gap-1">
                  <Heart size={12} />
                  {metadata.metrics.likes}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 mt-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700"
            >
              <span>View original post</span>
              <ExternalLink size={14} />
            </a>
            {!notification.isRead && (
              <button
                type="button"
                onClick={() => onMarkAsRead(notification.id)}
                className="flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700"
              >
                <Check size={14} />
                <span>Read</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Check if a string looks like a Slack user ID (starts with U and is alphanumeric)
const isSlackUserId = (str: string | undefined): boolean => {
  if (!str) return false;
  return /^U[A-Z0-9]+$/i.test(str);
};

// Slack Message Card
const SlackMessageCard = ({
  message,
  onMarkAsRead,
}: {
  message: MediaFeedItem;
  onMarkAsRead: (id: string) => void;
}) => {
  const metadata = message.metadata as {
    channel_id?: string;
    channel_name?: string;
    user_id?: string;
    user_name?: string;
    user_real_name?: string;
    user_display_name?: string;
    team_id?: string;
  } | null;

  const channelName =
    metadata?.channel_name || metadata?.channel_id?.slice(0, 8) || "unknown";

  // Get display name, avoiding raw Slack user IDs
  const getDisplayName = () => {
    const displayName = metadata?.user_display_name;
    const realName = metadata?.user_real_name;
    const userName = metadata?.user_name;

    // Return the first non-ID value
    if (displayName && !isSlackUserId(displayName)) return displayName;
    if (realName && !isSlackUserId(realName)) return realName;
    if (userName && !isSlackUserId(userName)) return userName;

    // Fallback: show a generic name with partial ID
    const userId = metadata?.user_id;
    if (userId) return `User ${userId.slice(-4)}`;
    return "Unknown";
  };

  const userName = getDisplayName();

  return (
    <div
      className={`neu-card p-2 md:p-4 neu-card-hover transition-colors ${!message.isRead ? "ring-2 ring-purple-200" : ""}`}
    >
      {/* Header row - avatar, name, channel, time, read button */}
      <div className="flex items-center gap-2 md:gap-3">
        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-xs md:text-sm font-semibold shrink-0">
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-1 md:gap-2 flex-wrap">
          <span className="font-medium neu-text-primary text-sm md:text-base">
            {userName}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[10px] md:text-xs font-medium text-purple-600 bg-purple-50 px-1.5 md:px-2 py-0.5 rounded">
            <Hash size={10} className="md:w-3 md:h-3" />
            {channelName}
          </span>
          <span className="neu-text-muted text-[10px] md:text-xs">
            {formatTimeAgo(message.createdAt || "")}
          </span>
          {!message.isRead && (
            <span
              className="w-1.5 h-1.5 md:w-2 md:h-2 bg-red-500 rounded-full"
              title="Unread"
            />
          )}
        </div>
        {!message.isRead && (
          <button
            type="button"
            onClick={() => onMarkAsRead(message.id)}
            className="shrink-0 p-1.5 md:p-2 rounded-lg neu-btn text-purple-600 hover:bg-purple-50 transition-colors"
            title="Mark as read"
          >
            <Check size={14} className="md:w-4 md:h-4" />
          </button>
        )}
      </div>
      {/* Message body - full width below header */}
      <div className="neu-text-primary break-words space-y-1 mt-2 text-xs md:text-sm leading-relaxed">
        {formatSlackMessage(message.body)}
      </div>
    </div>
  );
};

// Sortable Channel Tab Component
type ChannelInfo = { id: string; name: string };

const SortableChannelTab = ({
  channel,
  isSelected,
  count,
  onSelect,
}: {
  channel: ChannelInfo;
  isSelected: boolean;
  count: number;
  onSelect: () => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: channel.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
        isSelected
          ? "neu-chip-active text-sky-600"
          : "neu-chip neu-text-secondary"
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none p-0.5 -ml-1 hover:bg-slate-200 rounded"
        title="Drag to reorder"
      >
        <GripVertical size={12} className="text-slate-400" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-1.5"
      >
        <Hash size={12} />
        {channel.name} ({count})
      </button>
    </div>
  );
};

export const MediaPage = () => {
  const { user } = useAuth();
  const {
    markMediaFeedAsRead: badgeMarkAsRead,
    markMediaFeedAsReadBulk: badgeMarkAsReadBulk,
  } = useNotificationBadge();
  const [gmailRefreshKey, setGmailRefreshKey] = useState(0);

  const { value: activeSource, setValue: setActiveSource } =
    useUserSetting<MediaSourceType>("media_active_source", "slack");
  const [rssFeeds, setRssFeeds] = useState<RssFeed[]>([]);
  const [rssArticles, setRssArticles] = useState<MediaFeedItem[]>([]);
  const [slackMessages, setSlackMessages] = useState<MediaFeedItem[]>([]);
  const { value: selectedChannel, setValue: setSelectedChannel } =
    useUserSetting<string>("media_filter_slack_channel", "all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetchingRss, setIsFetchingRss] = useState(false);
  const [isFetchingX, setIsFetchingX] = useState(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [xPosts, setXPosts] = useState<MediaFeedItem[]>([]);
  const [xSources, setXSources] = useState<XSource[]>([]);

  // フィルター（Supabase永続化）
  const { value: showUnreadOnly, setValue: setShowUnreadOnly } =
    useUserSetting<boolean>("media_filter_slack_unread", false);
  const { value: selectedRssFeed, setValue: setSelectedRssFeed } =
    useUserSetting<string>("media_filter_rss_feed", "all");
  const { value: rssUnreadOnly, setValue: setRssUnreadOnly } =
    useUserSetting<boolean>("media_filter_rss_unread", false);
  const { value: selectedXSource, setValue: setSelectedXSource } =
    useUserSetting<string>("media_filter_x_source", "all");
  const { value: xUnreadOnly, setValue: setXUnreadOnly } =
    useUserSetting<boolean>("media_filter_x_unread", false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: "", message: "" });

  // ページネーション
  const ITEMS_PER_PAGE = 20;
  const [slackPage, setSlackPage] = useState(1);
  const [rssPage, setRssPage] = useState(1);
  const [xPage, setXPage] = useState(1);

  // チャンネル並び順の保存
  const { value: channelOrder, setValue: setChannelOrder } = useUserSetting<
    string[]
  >("slack_channel_order", []);

  // DnD sensors
  const sensors = useDndSensors();

  // Extract unique channels from Slack messages
  const slackChannelsRaw = useMemo(() => {
    const channelMap = new Map<string, string>();
    slackMessages.forEach((msg) => {
      const metadata = msg.metadata as {
        channel_id?: string;
        channel_name?: string;
      } | null;
      const channelId = metadata?.channel_id;
      const channelName = metadata?.channel_name || channelId;
      if (channelId) {
        // Prefer the actual name, fallback to ID
        const existingName = channelMap.get(channelId);
        // If we already have a name (not just ID), keep it; otherwise update
        if (!existingName || existingName === channelId) {
          channelMap.set(channelId, channelName || channelId);
        }
      }
    });
    return Array.from(channelMap.entries()).map(([id, name]) => ({ id, name }));
  }, [slackMessages]);

  // Apply saved order to channels
  const slackChannels = useMemo(() => {
    if (channelOrder.length === 0) {
      // No saved order, sort alphabetically
      return [...slackChannelsRaw].sort((a, b) => a.name.localeCompare(b.name));
    }
    // Sort by saved order, new channels at the end
    const orderMap = new Map(channelOrder.map((id, index) => [id, index]));
    return [...slackChannelsRaw].sort((a, b) => {
      const aIndex = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (aIndex === bIndex) {
        return a.name.localeCompare(b.name);
      }
      return aIndex - bIndex;
    });
  }, [slackChannelsRaw, channelOrder]);

  // Handle channel drag end
  const handleChannelDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = slackChannels.findIndex((c) => c.id === active.id);
      const newIndex = slackChannels.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(
        slackChannels.map((c) => c.id),
        oldIndex,
        newIndex,
      );
      setChannelOrder(newOrder);
    },
    [slackChannels, setChannelOrder],
  );

  // Filter Slack messages by selected channel and unread status
  const filteredSlackMessages = useMemo(() => {
    let filtered = slackMessages;
    if (selectedChannel !== "all") {
      filtered = filtered.filter((msg) => {
        const metadata = msg.metadata as { channel_id?: string } | null;
        return metadata?.channel_id === selectedChannel;
      });
    }
    if (showUnreadOnly) {
      filtered = filtered.filter((msg) => !msg.isRead);
    }
    return filtered;
  }, [slackMessages, selectedChannel, showUnreadOnly]);

  // 未読数カウント
  const unreadSlackCount = useMemo(() => {
    return slackMessages.filter((msg) => !msg.isRead).length;
  }, [slackMessages]);

  // RSSフィルター
  const rssFeedNames = useMemo(() => {
    const names = new Set<string>();
    rssArticles.forEach((article) => {
      const metadata = article.metadata as { feedName?: string } | null;
      if (metadata?.feedName) names.add(metadata.feedName);
    });
    return Array.from(names).sort();
  }, [rssArticles]);

  const filteredRssArticles = useMemo(() => {
    let filtered = rssArticles;
    if (selectedRssFeed !== "all") {
      filtered = filtered.filter((article) => {
        const metadata = article.metadata as { feedName?: string } | null;
        return metadata?.feedName === selectedRssFeed;
      });
    }
    if (rssUnreadOnly) {
      filtered = filtered.filter((article) => !article.isRead);
    }
    return filtered;
  }, [rssArticles, selectedRssFeed, rssUnreadOnly]);

  const unreadRssCount = useMemo(() => {
    return rssArticles.filter((a) => !a.isRead).length;
  }, [rssArticles]);

  // Xフィルター
  const xSourceNames = useMemo(() => {
    const names = new Set<string>();
    xPosts.forEach((post) => {
      const metadata = post.metadata as { sourceName?: string } | null;
      if (metadata?.sourceName) names.add(metadata.sourceName);
    });
    return Array.from(names).sort();
  }, [xPosts]);

  const filteredXPosts = useMemo(() => {
    let filtered = xPosts;
    if (selectedXSource !== "all") {
      filtered = filtered.filter((post) => {
        const metadata = post.metadata as { sourceName?: string } | null;
        return metadata?.sourceName === selectedXSource;
      });
    }
    if (xUnreadOnly) {
      filtered = filtered.filter((post) => !post.isRead);
    }
    return filtered;
  }, [xPosts, selectedXSource, xUnreadOnly]);

  const unreadXCount = useMemo(() => {
    return xPosts.filter((p) => !p.isRead).length;
  }, [xPosts]);

  // Mark as read functions (sync with NotificationContext badge)
  const markAsRead = useCallback(
    async (notificationId: string) => {
      setSlackMessages((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
      );
      await badgeMarkAsRead(notificationId);
    },
    [badgeMarkAsRead],
  );

  const markSlackAllAsRead = useCallback(async () => {
    const unreadIds = slackMessages.filter((m) => !m.isRead).map((m) => m.id);
    setSlackMessages((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await badgeMarkAsReadBulk(unreadIds);
  }, [slackMessages, badgeMarkAsReadBulk]);

  // Slackページネーション
  const slackTotalPages = Math.ceil(
    filteredSlackMessages.length / ITEMS_PER_PAGE,
  );
  const paginatedSlackMessages = useMemo(() => {
    const startIndex = (slackPage - 1) * ITEMS_PER_PAGE;
    return filteredSlackMessages.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredSlackMessages, slackPage]);

  // RSSページネーション
  const rssTotalPages = Math.ceil(filteredRssArticles.length / ITEMS_PER_PAGE);
  const paginatedRssArticles = useMemo(() => {
    const startIndex = (rssPage - 1) * ITEMS_PER_PAGE;
    return filteredRssArticles.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredRssArticles, rssPage]);

  // RSS mark as read
  const markRssAsRead = useCallback(
    async (notificationId: string) => {
      setRssArticles((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
      );
      await badgeMarkAsRead(notificationId);
    },
    [badgeMarkAsRead],
  );

  const markRssAllAsRead = useCallback(async () => {
    const unreadIds = rssArticles.filter((a) => !a.isRead).map((a) => a.id);
    setRssArticles((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await badgeMarkAsReadBulk(unreadIds);
  }, [rssArticles, badgeMarkAsReadBulk]);

  // Xページネーション
  const xTotalPages = Math.ceil(filteredXPosts.length / ITEMS_PER_PAGE);
  const paginatedXPosts = useMemo(() => {
    const startIndex = (xPage - 1) * ITEMS_PER_PAGE;
    return filteredXPosts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredXPosts, xPage]);

  const markXAsRead = useCallback(
    async (notificationId: string) => {
      setXPosts((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
      );
      await badgeMarkAsRead(notificationId);
    },
    [badgeMarkAsRead],
  );

  const markXAllAsRead = useCallback(async () => {
    const unreadIds = xPosts.filter((p) => !p.isRead).map((p) => p.id);
    setXPosts((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await badgeMarkAsReadBulk(unreadIds);
  }, [xPosts, badgeMarkAsReadBulk]);

  // フィルター変更時にページをリセット
  useEffect(() => {
    setSlackPage(1);
  }, [selectedChannel, showUnreadOnly]);

  useEffect(() => {
    setRssPage(1);
  }, [selectedRssFeed, rssUnreadOnly]);

  useEffect(() => {
    setXPage(1);
  }, [selectedXSource, xUnreadOnly]);

  // タブ切り替え時にフィルターメニューを閉じる
  useEffect(() => {
    setShowFilterMenu(false);
  }, [activeSource]);

  const loadNotifications = useCallback(async () => {
    try {
      const items = await fetchMediaFeedItems(["slack", "rss", "x"]);
      const slackItems = items.filter((n) => n.source === "slack");
      const rssItems = items.filter((n) => n.source === "rss");
      const xItems = items.filter((n) => n.source === "x");
      setSlackMessages(slackItems);
      setRssArticles(rssItems);
      setXPosts(xItems);
    } catch (error) {
      console.error("Failed to load media feed items:", error);
    }
  }, []);

  const fetchXPostsFromServer = useCallback(async () => {
    if (!user?.id) return;

    setIsFetchingX(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        console.error("Supabase URL not configured");
        return;
      }

      if (!supabase) {
        console.error("Supabase client not initialized");
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error("No active session");
        return;
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/fetch_x_posts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ user_id: user.id }),
        },
      );

      const result = await response.json();
      if (response.ok) {
        await loadNotifications();
        if (result.results) {
          const errors = result.results.filter(
            (r: { error?: string }) => r.error,
          );
          if (errors.length > 0) {
            console.error("X fetch errors:", errors);
            setAlertState({
              isOpen: true,
              title: "X Posts Fetch Errors",
              message: `X posts fetch completed with errors:\n${errors.map((e: { source: string; error: string }) => `${e.source}: ${e.error}`).join("\n")}`,
            });
          }
        }
      } else {
        const errMsg = result.error || response.statusText;
        console.error("Failed to fetch X posts:", errMsg);
        setAlertState({
          isOpen: true,
          title: "Error",
          message: `Failed to fetch X posts: ${errMsg}`,
        });
      }
    } catch (error) {
      console.error("Failed to fetch X posts:", error);
      setAlertState({
        isOpen: true,
        title: "Error",
        message: `Failed to fetch X posts: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setIsFetchingX(false);
    }
  }, [user?.id, loadNotifications]);

  const fetchRssFeedsFromServer = useCallback(async () => {
    if (!user?.id) return;

    setIsFetchingRss(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        console.error("Supabase URL not configured");
        return;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/fetch_rss`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: user.id }),
      });

      if (response.ok) {
        // Reload notifications to get new RSS articles
        await loadNotifications();
      } else {
        console.error("Failed to fetch RSS:", await response.text());
      }
    } catch (error) {
      console.error("Failed to fetch RSS feeds:", error);
    } finally {
      setIsFetchingRss(false);
    }
  }, [user?.id, loadNotifications]);

  // Auto-backfill: fetch Slack history once if never synced
  useEffect(() => {
    if (activeSource !== "slack" || !user?.id || !supabase) return;

    let cancelled = false;
    const autoSync = async () => {
      try {
        const integrations = await fetchSlackIntegrations();
        const active = integrations.find((i) => i.isActive);
        if (!active || active.syncState?.history_synced_at) return;

        if (cancelled || !supabase) return;
        setIsAutoSyncing(true);

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token || cancelled) return;

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseUrl) return;

        const response = await fetch(
          `${supabaseUrl}/functions/v1/slack_fetch_history`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({}),
          },
        );

        if (response.ok && !cancelled) {
          await loadNotifications();
        }
      } catch (err) {
        console.error("Slack auto-backfill failed:", err);
      } finally {
        if (!cancelled) setIsAutoSyncing(false);
      }
    };

    autoSync();
    return () => {
      cancelled = true;
    };
  }, [activeSource, user?.id, loadNotifications]);

  const loadRssFeedsList = useCallback(async () => {
    try {
      const feeds = await fetchRssFeeds();
      setRssFeeds(feeds);
    } catch (error) {
      console.error("Failed to load RSS feeds:", error);
    }
  }, []);

  const loadXSourcesList = useCallback(async () => {
    try {
      const sources = await fetchXSources();
      setXSources(sources);
    } catch (error) {
      console.error("Failed to load X sources:", error);
    }
  }, []);

  const loadContent = useCallback(async () => {
    try {
      await Promise.all([
        loadNotifications(),
        loadRssFeedsList(),
        loadXSourcesList(),
      ]);
    } catch (error) {
      console.error("Failed to load content:", error);
    }
  }, [loadNotifications, loadRssFeedsList, loadXSourcesList]);

  useEffect(() => {
    loadContent().finally(() => setIsLoading(false));
  }, [loadContent]);

  const handleRefresh = async () => {
    if (activeSource === "gmail") {
      setGmailRefreshKey((k) => k + 1);
      return;
    }
    setIsSyncing(true);
    try {
      await loadContent();
    } finally {
      setIsSyncing(false);
    }
  };

  const headerLeft = (
    <button
      onClick={handleRefresh}
      disabled={isSyncing}
      className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors disabled:opacity-50"
      title="Refresh posts"
    >
      <RefreshCw
        size={16}
        className={`md:w-[18px] md:h-[18px]${isSyncing ? " animate-spin" : ""}`}
      />
    </button>
  );

  const activeSourceData = MEDIA_SOURCES.find((s) => s.id === activeSource);

  const headerCenter = (
    <div className="flex items-center gap-2 text-sm neu-text-secondary">
      {activeSourceData && (
        <activeSourceData.icon size={16} className={activeSourceData.color} />
      )}
      <span className="hidden sm:inline">{activeSourceData?.label}</span>
    </div>
  );

  return (
    <Layout
      pageTitle="Media"
      headerLeft={headerLeft}
      headerCenter={headerCenter}
    >
      {isLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 size={32} className="animate-spin neu-text-secondary" />
        </div>
      ) : (
        <div className="h-full overflow-auto mobile-scroll-pad">
          <div className="max-w-4xl mx-auto px-2 py-3 md:p-6">
            {/* Source Selection Tabs */}
            <div className="neu-card p-2 mb-6">
              <div className="flex items-center gap-2">
                {MEDIA_SOURCES.map((source) => {
                  const Icon = source.icon;
                  const isActive = activeSource === source.id;
                  return (
                    <button
                      key={source.id}
                      onClick={() => setActiveSource(source.id)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                        isActive
                          ? "neu-pressed neu-text-primary"
                          : "neu-btn neu-text-secondary"
                      }`}
                    >
                      <Icon size={20} />
                      <span className="hidden sm:inline">{source.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content Display */}
            {activeSource === "slack" && (
              <div className="space-y-4">
                {slackMessages.length === 0 ? (
                  <div className="text-center py-16 neu-card">
                    {isAutoSyncing ? (
                      <>
                        <Loader2
                          size={48}
                          className="mx-auto neu-text-muted mb-4 animate-spin"
                        />
                        <p className="neu-text-secondary mb-2">
                          Loading past messages...
                        </p>
                        <p className="text-sm neu-text-muted">
                          Fetching Slack history for the first time
                        </p>
                      </>
                    ) : (
                      <>
                        <MessageSquare
                          size={48}
                          className="mx-auto neu-text-muted mb-4"
                        />
                        <p className="neu-text-secondary mb-2">
                          No Slack messages
                        </p>
                        <p className="text-sm neu-text-muted">
                          Set up Slack integration in Settings
                        </p>
                        <a
                          href="/settings"
                          className="inline-block mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          Add Slack Integration
                        </a>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Filter Bar */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
                        {/* Filter Dropdown */}
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowFilterMenu(!showFilterMenu)}
                            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm neu-chip rounded-lg transition-colors"
                          >
                            <Filter size={14} className="md:w-4 md:h-4" />
                            <span className="hidden sm:inline">Filter</span>
                            <ChevronDown
                              size={12}
                              className="md:w-3.5 md:h-3.5"
                            />
                          </button>
                          {showFilterMenu && (
                            <div className="absolute top-full left-0 mt-1 w-[calc(100vw-2rem)] sm:w-64 max-w-64 neu-card z-10 p-3">
                              <div className="mb-3">
                                <label
                                  className="text-xs font-medium neu-text-secondary mb-1 block"
                                  id="filter-channel-label"
                                >
                                  Channel
                                </label>
                                <select
                                  value={selectedChannel}
                                  onChange={(e) =>
                                    setSelectedChannel(e.target.value)
                                  }
                                  className="w-full px-2 py-1.5 text-base md:text-sm neu-input rounded-lg"
                                  aria-labelledby="filter-channel-label"
                                  title="Select channel"
                                >
                                  <option value="all">All channels</option>
                                  {slackChannels.map((channel) => (
                                    <option key={channel.id} value={channel.id}>
                                      # {channel.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={showUnreadOnly}
                                  onChange={(e) =>
                                    setShowUnreadOnly(e.target.checked)
                                  }
                                  className="rounded border-slate-300"
                                />
                                Show unread only
                              </label>
                            </div>
                          )}
                        </div>
                        <p className="text-xs md:text-sm neu-text-secondary whitespace-nowrap">
                          {filteredSlackMessages.length} items
                          {unreadSlackCount > 0 && (
                            <span className="ml-1 text-purple-600">
                              ({unreadSlackCount} unread)
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {unreadSlackCount > 0 && (
                          <button
                            type="button"
                            onClick={markSlackAllAsRead}
                            className="flex items-center justify-center p-1.5 md:px-3 md:py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Mark all as read"
                          >
                            <CheckCheck size={16} />
                            <span className="hidden md:inline md:ml-1">
                              Mark all read
                            </span>
                          </button>
                        )}
                        <a
                          href="/settings"
                          className="flex items-center gap-1 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        >
                          Settings
                          <ExternalLink
                            size={12}
                            className="md:w-3.5 md:h-3.5"
                          />
                        </a>
                      </div>
                    </div>

                    {/* Channel Tabs (if multiple channels exist) */}
                    {slackChannels.length > 1 && (
                      <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                        <button
                          type="button"
                          onClick={() => setSelectedChannel("all")}
                          className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            selectedChannel === "all"
                              ? "neu-chip-active text-sky-600"
                              : "neu-chip neu-text-secondary"
                          }`}
                        >
                          All ({slackMessages.length})
                        </button>
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleChannelDragEnd}
                        >
                          <SortableContext
                            items={slackChannels.map((c) => c.id)}
                            strategy={horizontalListSortingStrategy}
                          >
                            {slackChannels.map((channel) => {
                              const count = slackMessages.filter((msg) => {
                                const metadata = msg.metadata as {
                                  channel_id?: string;
                                } | null;
                                return metadata?.channel_id === channel.id;
                              }).length;
                              return (
                                <SortableChannelTab
                                  key={channel.id}
                                  channel={channel}
                                  isSelected={selectedChannel === channel.id}
                                  count={count}
                                  onSelect={() =>
                                    setSelectedChannel(channel.id)
                                  }
                                />
                              );
                            })}
                          </SortableContext>
                        </DndContext>
                      </div>
                    )}

                    {/* Messages */}
                    {filteredSlackMessages.length === 0 ? (
                      <div className="text-center py-12 neu-card">
                        <Hash
                          size={32}
                          className="mx-auto neu-text-muted mb-2"
                        />
                        <p className="neu-text-secondary">
                          No messages in this channel
                        </p>
                      </div>
                    ) : (
                      <>
                        {paginatedSlackMessages.map((message) => (
                          <SlackMessageCard
                            key={message.id}
                            message={message}
                            onMarkAsRead={markAsRead}
                          />
                        ))}

                        {/* Slack Pagination */}
                        {slackTotalPages > 1 && (
                          <div className="flex items-center justify-center gap-2 mt-6 pb-4">
                            <button
                              onClick={() =>
                                setSlackPage((prev) => Math.max(1, prev - 1))
                              }
                              disabled={slackPage === 1}
                              className="p-2 neu-btn disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Previous page"
                            >
                              <ChevronLeft size={18} />
                            </button>
                            <div className="flex items-center gap-1">
                              {Array.from(
                                { length: slackTotalPages },
                                (_, i) => i + 1,
                              )
                                .filter(
                                  (page) =>
                                    page === 1 ||
                                    page === slackTotalPages ||
                                    Math.abs(page - slackPage) <= 2,
                                )
                                .map((page, index, array) => (
                                  <span
                                    key={page}
                                    className="flex items-center"
                                  >
                                    {index > 0 &&
                                      array[index - 1] !== page - 1 && (
                                        <span className="px-2 neu-text-muted">
                                          ...
                                        </span>
                                      )}
                                    <button
                                      onClick={() => setSlackPage(page)}
                                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                        slackPage === page
                                          ? "bg-purple-500 text-white"
                                          : "neu-chip neu-text-secondary"
                                      }`}
                                    >
                                      {page}
                                    </button>
                                  </span>
                                ))}
                            </div>
                            <button
                              onClick={() =>
                                setSlackPage((prev) =>
                                  Math.min(slackTotalPages, prev + 1),
                                )
                              }
                              disabled={slackPage === slackTotalPages}
                              className="p-2 neu-btn disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Next page"
                            >
                              <ChevronRight size={18} />
                            </button>
                            <span className="ml-4 text-sm neu-text-secondary">
                              {(slackPage - 1) * ITEMS_PER_PAGE + 1}-
                              {Math.min(
                                slackPage * ITEMS_PER_PAGE,
                                filteredSlackMessages.length,
                              )}{" "}
                              of {filteredSlackMessages.length}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {activeSource === "rss" && (
              <div className="space-y-4">
                {rssFeeds.length === 0 ? (
                  <div className="text-center py-16 neu-card">
                    <Rss size={48} className="mx-auto neu-text-muted mb-4" />
                    <p className="neu-text-secondary mb-2">No RSS feeds</p>
                    <p className="text-sm neu-text-muted">
                      Add RSS feeds in Settings
                    </p>
                    <a
                      href="/settings"
                      className="inline-block mt-4 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Add RSS Feed
                    </a>
                  </div>
                ) : (
                  <>
                    {/* Header with actions */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <button
                        onClick={fetchRssFeedsFromServer}
                        disabled={isFetchingRss}
                        className="flex items-center gap-2 px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {isFetchingRss ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <RefreshCw size={16} />
                        )}
                        {isFetchingRss ? "Fetching..." : "Fetch feeds"}
                      </button>
                      <a
                        href="/settings"
                        className="text-sm text-orange-600 hover:text-orange-700 flex items-center gap-1"
                      >
                        Manage feeds
                        <ExternalLink size={14} />
                      </a>
                    </div>

                    {/* Filter Bar */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowFilterMenu(!showFilterMenu)}
                            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm neu-chip rounded-lg transition-colors"
                          >
                            <Filter size={14} className="md:w-4 md:h-4" />
                            <span className="hidden sm:inline">Filter</span>
                            <ChevronDown
                              size={12}
                              className="md:w-3.5 md:h-3.5"
                            />
                          </button>
                          {showFilterMenu && (
                            <div className="absolute top-full left-0 mt-1 w-[calc(100vw-2rem)] sm:w-64 max-w-64 neu-card z-10 p-3">
                              <div className="mb-3">
                                <label className="text-xs font-medium neu-text-secondary mb-1 block">
                                  Feed
                                </label>
                                <select
                                  value={selectedRssFeed}
                                  onChange={(e) =>
                                    setSelectedRssFeed(e.target.value)
                                  }
                                  className="w-full px-2 py-1.5 text-base md:text-sm neu-input rounded-lg"
                                  title="Select feed"
                                >
                                  <option value="all">All feeds</option>
                                  {rssFeedNames.map((name) => (
                                    <option key={name} value={name}>
                                      {name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={rssUnreadOnly}
                                  onChange={(e) =>
                                    setRssUnreadOnly(e.target.checked)
                                  }
                                  className="rounded border-slate-300"
                                />
                                Show unread only
                              </label>
                            </div>
                          )}
                        </div>
                        <p className="text-xs md:text-sm neu-text-secondary whitespace-nowrap">
                          {filteredRssArticles.length} articles
                          {unreadRssCount > 0 && (
                            <span className="ml-1 text-orange-600">
                              ({unreadRssCount} unread)
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {unreadRssCount > 0 && (
                          <button
                            type="button"
                            onClick={markRssAllAsRead}
                            className="flex items-center justify-center p-1.5 md:px-3 md:py-2 text-sm text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Mark all as read"
                          >
                            <CheckCheck size={16} />
                            <span className="hidden md:inline md:ml-1">
                              Mark all read
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Articles */}
                    {filteredRssArticles.length === 0 ? (
                      <div className="text-center py-12 neu-card">
                        <Rss
                          size={32}
                          className="mx-auto neu-text-muted mb-2"
                        />
                        <p className="neu-text-secondary mb-2">
                          {rssArticles.length === 0
                            ? "No articles"
                            : "No matching articles"}
                        </p>
                        <p className="text-sm neu-text-muted">
                          {rssArticles.length === 0
                            ? 'Click "Fetch feeds" to get the latest articles'
                            : "Try changing your filter settings"}
                        </p>
                      </div>
                    ) : (
                      <>
                        {paginatedRssArticles.map((article) => (
                          <RSSArticleCard
                            key={article.id}
                            notification={article}
                            onMarkAsRead={markRssAsRead}
                          />
                        ))}

                        {/* RSS Pagination */}
                        {rssTotalPages > 1 && (
                          <div className="flex items-center justify-center gap-2 mt-6 pb-4">
                            <button
                              onClick={() =>
                                setRssPage((prev) => Math.max(1, prev - 1))
                              }
                              disabled={rssPage === 1}
                              className="p-2 neu-btn disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Previous page"
                            >
                              <ChevronLeft size={18} />
                            </button>
                            <div className="flex items-center gap-1">
                              {Array.from(
                                { length: rssTotalPages },
                                (_, i) => i + 1,
                              )
                                .filter(
                                  (page) =>
                                    page === 1 ||
                                    page === rssTotalPages ||
                                    Math.abs(page - rssPage) <= 2,
                                )
                                .map((page, index, array) => (
                                  <span
                                    key={page}
                                    className="flex items-center"
                                  >
                                    {index > 0 &&
                                      array[index - 1] !== page - 1 && (
                                        <span className="px-2 neu-text-muted">
                                          ...
                                        </span>
                                      )}
                                    <button
                                      onClick={() => setRssPage(page)}
                                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                        rssPage === page
                                          ? "bg-orange-500 text-white"
                                          : "neu-chip neu-text-secondary"
                                      }`}
                                    >
                                      {page}
                                    </button>
                                  </span>
                                ))}
                            </div>
                            <button
                              onClick={() =>
                                setRssPage((prev) =>
                                  Math.min(rssTotalPages, prev + 1),
                                )
                              }
                              disabled={rssPage === rssTotalPages}
                              className="p-2 neu-btn disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Next page"
                            >
                              <ChevronRight size={18} />
                            </button>
                            <span className="ml-4 text-sm neu-text-secondary">
                              {(rssPage - 1) * ITEMS_PER_PAGE + 1}-
                              {Math.min(
                                rssPage * ITEMS_PER_PAGE,
                                filteredRssArticles.length,
                              )}{" "}
                              of {filteredRssArticles.length}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {activeSource === "x" && (
              <div className="space-y-4">
                {xSources.length === 0 ? (
                  <div className="text-center py-16 neu-card">
                    <Twitter
                      size={48}
                      className="mx-auto neu-text-muted mb-4"
                    />
                    <p className="neu-text-secondary mb-2">No X sources</p>
                    <p className="text-sm neu-text-muted">
                      Add X accounts or keywords in Settings
                    </p>
                    <a
                      href="/settings"
                      className="inline-block mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Add X Source
                    </a>
                  </div>
                ) : (
                  <>
                    {/* Header with actions */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <button
                        onClick={fetchXPostsFromServer}
                        disabled={isFetchingX}
                        className="flex items-center gap-2 px-3 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {isFetchingX ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <RefreshCw size={16} />
                        )}
                        {isFetchingX ? "Fetching..." : "Fetch posts"}
                      </button>
                      <a
                        href="/settings"
                        className="text-sm text-sky-600 hover:text-sky-700 flex items-center gap-1"
                      >
                        Manage sources
                        <ExternalLink size={14} />
                      </a>
                    </div>

                    {/* Filter Bar */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowFilterMenu(!showFilterMenu)}
                            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm neu-chip rounded-lg transition-colors"
                          >
                            <Filter size={14} className="md:w-4 md:h-4" />
                            <span className="hidden sm:inline">Filter</span>
                            <ChevronDown
                              size={12}
                              className="md:w-3.5 md:h-3.5"
                            />
                          </button>
                          {showFilterMenu && (
                            <div className="absolute top-full left-0 mt-1 w-[calc(100vw-2rem)] sm:w-64 max-w-64 neu-card z-10 p-3">
                              <div className="mb-3">
                                <label className="text-xs font-medium neu-text-secondary mb-1 block">
                                  Source
                                </label>
                                <select
                                  value={selectedXSource}
                                  onChange={(e) =>
                                    setSelectedXSource(e.target.value)
                                  }
                                  className="w-full px-2 py-1.5 text-base md:text-sm neu-input rounded-lg"
                                  title="Select source"
                                >
                                  <option value="all">All sources</option>
                                  {xSourceNames.map((name) => (
                                    <option key={name} value={name}>
                                      {name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={xUnreadOnly}
                                  onChange={(e) =>
                                    setXUnreadOnly(e.target.checked)
                                  }
                                  className="rounded border-slate-300"
                                />
                                Show unread only
                              </label>
                            </div>
                          )}
                        </div>
                        <p className="text-xs md:text-sm neu-text-secondary whitespace-nowrap">
                          {filteredXPosts.length} posts
                          {unreadXCount > 0 && (
                            <span className="ml-1 text-sky-600">
                              ({unreadXCount} unread)
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {unreadXCount > 0 && (
                          <button
                            type="button"
                            onClick={markXAllAsRead}
                            className="flex items-center justify-center p-1.5 md:px-3 md:py-2 text-sm text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                            title="Mark all as read"
                          >
                            <CheckCheck size={16} />
                            <span className="hidden md:inline md:ml-1">
                              Mark all read
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Posts */}
                    {filteredXPosts.length === 0 ? (
                      <div className="text-center py-12 neu-card">
                        <Twitter
                          size={32}
                          className="mx-auto neu-text-muted mb-2"
                        />
                        <p className="neu-text-secondary mb-2">
                          {xPosts.length === 0
                            ? "No posts"
                            : "No matching posts"}
                        </p>
                        <p className="text-sm neu-text-muted">
                          {xPosts.length === 0
                            ? 'Click "Fetch posts" to get the latest posts'
                            : "Try changing your filter settings"}
                        </p>
                      </div>
                    ) : (
                      <>
                        {paginatedXPosts.map((post) => (
                          <XPostCard
                            key={post.id}
                            notification={post}
                            onMarkAsRead={markXAsRead}
                          />
                        ))}

                        {/* X Pagination */}
                        {xTotalPages > 1 && (
                          <div className="flex items-center justify-center gap-2 mt-6 pb-4">
                            <button
                              onClick={() =>
                                setXPage((prev) => Math.max(1, prev - 1))
                              }
                              disabled={xPage === 1}
                              className="p-2 neu-btn disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Previous page"
                            >
                              <ChevronLeft size={18} />
                            </button>
                            <div className="flex items-center gap-1">
                              {Array.from(
                                { length: xTotalPages },
                                (_, i) => i + 1,
                              )
                                .filter(
                                  (page) =>
                                    page === 1 ||
                                    page === xTotalPages ||
                                    Math.abs(page - xPage) <= 2,
                                )
                                .map((page, index, array) => (
                                  <span
                                    key={page}
                                    className="flex items-center"
                                  >
                                    {index > 0 &&
                                      array[index - 1] !== page - 1 && (
                                        <span className="px-2 neu-text-muted">
                                          ...
                                        </span>
                                      )}
                                    <button
                                      onClick={() => setXPage(page)}
                                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                        xPage === page
                                          ? "bg-sky-500 text-white"
                                          : "neu-chip neu-text-secondary"
                                      }`}
                                    >
                                      {page}
                                    </button>
                                  </span>
                                ))}
                            </div>
                            <button
                              onClick={() =>
                                setXPage((prev) =>
                                  Math.min(xTotalPages, prev + 1),
                                )
                              }
                              disabled={xPage === xTotalPages}
                              className="p-2 neu-btn disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Next page"
                            >
                              <ChevronRight size={18} />
                            </button>
                            <span className="ml-4 text-sm neu-text-secondary">
                              {(xPage - 1) * ITEMS_PER_PAGE + 1}-
                              {Math.min(
                                xPage * ITEMS_PER_PAGE,
                                filteredXPosts.length,
                              )}{" "}
                              of {filteredXPosts.length}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {activeSource === "gmail" && (
              <>
                <div className="flex justify-end mb-3">
                  <GoogleAccountSelector />
                </div>
                <GmailTabContent
                  refreshKey={gmailRefreshKey}
                  onLoadingChange={setIsSyncing}
                />
              </>
            )}
          </div>
        </div>
      )}

      <AlertDialog
        isOpen={alertState.isOpen}
        type="error"
        title={alertState.title}
        message={alertState.message}
        onClose={() => setAlertState({ isOpen: false, title: "", message: "" })}
      />
    </Layout>
  );
};
