import { useCallback, useState } from 'react';
import type { RssFeed } from '../types';
import {
  fetchRssFeeds,
  upsertRssFeed,
  deleteRssFeed,
  toggleRssFeed,
  updateRssFeed,
} from '../lib/offlineData';

export const useRssFeeds = () => {
  const [feeds, setFeeds] = useState<RssFeed[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchRssFeeds();
      setFeeds(data);
    } catch (err) {
      console.error('Failed to load RSS feeds:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addFeed = useCallback(
    async (feed: { name: string; url: string; category?: string }) => {
      const result = await upsertRssFeed({
        name: feed.name,
        url: feed.url,
        category: feed.category,
        isActive: true,
      });
      if (result) {
        setFeeds((prev) => [result, ...prev]);
      }
      return result;
    },
    []
  );

  const removeFeed = useCallback(async (feedId: string) => {
    const success = await deleteRssFeed(feedId);
    if (success) {
      setFeeds((prev) => prev.filter((f) => f.id !== feedId));
    }
    return success;
  }, []);

  const toggle = useCallback(async (feedId: string, isActive: boolean) => {
    const success = await toggleRssFeed(feedId, isActive);
    if (success) {
      setFeeds((prev) =>
        prev.map((f) => (f.id === feedId ? { ...f, isActive } : f))
      );
    }
    return success;
  }, []);

  const update = useCallback(
    async (
      feedId: string,
      updates: { name?: string; url?: string; category?: string | null }
    ) => {
      const success = await updateRssFeed(feedId, updates);
      if (success) {
        setFeeds((prev) =>
          prev.map((f) =>
            f.id === feedId
              ? {
                  ...f,
                  ...(updates.name !== undefined && { name: updates.name }),
                  ...(updates.url !== undefined && { url: updates.url }),
                  ...(updates.category !== undefined && {
                    category: updates.category || undefined,
                  }),
                }
              : f
          )
        );
      }
      return success;
    },
    []
  );

  const activeFeeds = feeds.filter((f) => f.isActive);

  return {
    feeds,
    activeFeeds,
    isLoading,
    load,
    addFeed,
    removeFeed,
    toggle,
    update,
  };
};
