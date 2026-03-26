import { useCallback, useEffect, useState } from "react";
import { useAiCompanyUrl } from "./useAiCompany";

export interface RelaySchedulerStatus {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  schedule: string;
  scheduledTime?: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  nextRunAt: string | null;
  nextRunMs: number | null;
  triggerEndpoint: string;
  extra?: Record<string, unknown>;
}

interface DiaryStatus {
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  nextRunAt: string | null;
  nextRunMs: number;
  gwsAuthValid: boolean;
}

interface PostSchedulerStatus {
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  nextRunAt: string | null;
  nextRunMs: number;
  schedule: string;
}

interface AutonomousStatus {
  queue: {
    pending: number;
    running: number;
    completed: number;
    tasks: unknown[];
    config: { maxDepth: number; maxPerHour: number; maxPerDay: number };
  };
  reviewScheduler: {
    enabled: boolean;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    nextRunAt: string | null;
    nextRunMs: number;
  };
}

export function useRelaySchedulers() {
  const { authFetch } = useAiCompanyUrl();
  const [schedulers, setSchedulers] = useState<RelaySchedulerStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [diaryRes, postRes, autoRes] = await Promise.allSettled([
        authFetch("/diary/status"),
        authFetch("/posts/schedule/status"),
        authFetch("/autonomous/status"),
      ]);

      const items: RelaySchedulerStatus[] = [];

      // Diary scheduler
      if (diaryRes.status === "fulfilled" && diaryRes.value.ok) {
        const d: DiaryStatus = await diaryRes.value.json();
        items.push({
          id: "relay-diary",
          name: "AI日記生成",
          description:
            "Google Calendar/Gmailから今日の活動を取得し、AI日記をGoogle Docsに保存",
          enabled: d.enabled,
          schedule: "Daily",
          scheduledTime: "22:00",
          lastRunAt: d.lastRunAt,
          lastRunStatus: d.lastRunStatus,
          nextRunAt: d.nextRunAt,
          nextRunMs: d.nextRunMs,
          triggerEndpoint: "/diary/trigger",
          extra: { gwsAuthValid: d.gwsAuthValid },
        });
      }

      // Post scheduler
      if (postRes.status === "fulfilled" && postRes.value.ok) {
        const p: PostSchedulerStatus = await postRes.value.json();
        items.push({
          id: "relay-posts",
          name: "SNS投稿生成",
          description:
            "トレンド分析からトピックを自動選択し、各プラットフォーム向けSNS投稿を一括生成",
          enabled: p.enabled,
          schedule: p.schedule || "Mon/Thu",
          scheduledTime: "12:00",
          lastRunAt: p.lastRunAt,
          lastRunStatus: p.lastRunStatus,
          nextRunAt: p.nextRunAt,
          nextRunMs: p.nextRunMs,
          triggerEndpoint: "/posts/schedule/trigger",
        });
      }

      // Review scheduler + Autonomous queue
      if (autoRes.status === "fulfilled" && autoRes.value.ok) {
        const a: AutonomousStatus = await autoRes.value.json();
        items.push({
          id: "relay-review",
          name: "自律レビュー",
          description:
            "未対応事項をチェックし、必要なフォローアップタスクを自動生成",
          enabled: a.reviewScheduler.enabled,
          schedule: "Daily",
          scheduledTime: "09:00",
          lastRunAt: a.reviewScheduler.lastRunAt,
          lastRunStatus: a.reviewScheduler.lastRunStatus,
          nextRunAt: a.reviewScheduler.nextRunAt,
          nextRunMs: a.reviewScheduler.nextRunMs,
          triggerEndpoint: "/review/trigger",
        });

        items.push({
          id: "relay-autonomous",
          name: "自律タスクキュー",
          description: `エージェント生成タスクの自動実行 (${a.queue.config.maxPerHour}/h, ${a.queue.config.maxPerDay}/day, depth=${a.queue.config.maxDepth})`,
          enabled: true,
          schedule: "Always",
          lastRunAt: null,
          lastRunStatus: null,
          nextRunAt: null,
          nextRunMs: null,
          triggerEndpoint: "",
          extra: {
            pending: a.queue.pending,
            running: a.queue.running,
            completed: a.queue.completed,
          },
        });
      }

      setSchedulers(items);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Relay connection failed";
      setError(msg);
      setSchedulers([]);
    } finally {
      setIsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const triggerNow = useCallback(
    async (endpoint: string): Promise<{ success: boolean; error?: string }> => {
      if (!endpoint) return { success: false, error: "No trigger endpoint" };
      try {
        const res = await authFetch(endpoint, { method: "POST" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return {
            success: false,
            error: (body as { error?: string }).error || `HTTP ${res.status}`,
          };
        }
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
    [authFetch],
  );

  return { schedulers, isLoading, error, refresh: load, triggerNow };
}
