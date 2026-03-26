import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { offlineDb } from '../lib/offlineDb';
import { upsertLocalRow } from '../lib/offlineStore';
import { supabase } from '../lib/supabase';

interface UserPreferences {
  sidebar_order: string[] | null;
  mobile_nav_ids: string[] | null;
  mobile_more_ids: string[] | null;
}

export const useUserPreferences = () => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>({
    sidebar_order: null,
    mobile_nav_ids: null,
    mobile_more_ids: null,
  });
  const preferencesRef = useRef(preferences);
  const [isLoading, setIsLoading] = useState(true);
  const [isSynced, setIsSynced] = useState(false);

  // Load preferences from offline store
  useEffect(() => {
    if (!user) {
      setPreferences({
        sidebar_order: null,
        mobile_nav_ids: null,
        mobile_more_ids: null,
      });
      setIsLoading(false);
      setIsSynced(false);
      return;
    }

    const loadPreferences = async () => {
      try {
        const stored = await offlineDb.user_preferences
          .where('user_id')
          .equals(user.id)
          .first();
        
        if (stored) {
          setPreferences({
            sidebar_order: (stored.sidebar_order as string[] | null) ?? null,
            mobile_nav_ids: (stored.mobile_nav_ids as string[] | null) ?? null,
            mobile_more_ids: (stored.mobile_more_ids as string[] | null) ?? null,
          });
        } else {
          setPreferences({
            sidebar_order: null,
            mobile_nav_ids: null,
            mobile_more_ids: null,
          });
        }
        setIsSynced(true);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load preferences:', err);
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, [user]);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  const buildPreferences = (
    stored: Record<string, unknown> | undefined | null,
    updates: Partial<UserPreferences>,
  ): UserPreferences => {
    const base: UserPreferences = {
      sidebar_order: (stored?.sidebar_order as string[] | null) ?? preferencesRef.current.sidebar_order ?? null,
      mobile_nav_ids: (stored?.mobile_nav_ids as string[] | null) ?? preferencesRef.current.mobile_nav_ids ?? null,
      mobile_more_ids: (stored?.mobile_more_ids as string[] | null) ?? preferencesRef.current.mobile_more_ids ?? null,
    };

    return {
      sidebar_order: updates.sidebar_order ?? base.sidebar_order ?? null,
      mobile_nav_ids: updates.mobile_nav_ids ?? base.mobile_nav_ids ?? null,
      mobile_more_ids: updates.mobile_more_ids ?? base.mobile_more_ids ?? null,
    };
  };

  const persistPreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    if (!user) {
      setPreferences(prev => ({ ...prev, ...updates }));
      return;
    }

    const stored = await offlineDb.user_preferences
      .where('user_id')
      .equals(user.id)
      .first();
    const nextPreferences = buildPreferences(stored as Record<string, unknown> | undefined, updates);
    setPreferences(nextPreferences);

    await upsertLocalRow('user_preferences', {
      id: user.id,
      user_id: user.id,
      sidebar_order: nextPreferences.sidebar_order,
      mobile_nav_ids: nextPreferences.mobile_nav_ids,
      mobile_more_ids: nextPreferences.mobile_more_ids,
    });

    if (supabase && (typeof navigator === 'undefined' || navigator.onLine)) {
      const { error } = await supabase.from('user_preferences').upsert({
        user_id: user.id,
        sidebar_order: nextPreferences.sidebar_order,
        mobile_nav_ids: nextPreferences.mobile_nav_ids,
        mobile_more_ids: nextPreferences.mobile_more_ids,
      }, { onConflict: 'user_id' });
      if (error) {
        console.error('Failed to sync preferences to Supabase:', error);
      }
    }
  }, [user]);

  // Save sidebar order
  const saveSidebarOrder = useCallback(async (order: string[]) => {
    await persistPreferences({ sidebar_order: order });
  }, [persistPreferences]);

  // Save mobile navigation config
  const saveMobileNavConfig = useCallback(async (navIds: string[], moreIds: string[]) => {
    await persistPreferences({
      mobile_nav_ids: navIds,
      mobile_more_ids: moreIds,
    });
  }, [persistPreferences]);

  // Get sidebar order - returns null if not loaded yet, never returns defaults
  const getSidebarOrder = useCallback(() => {
    return preferences.sidebar_order;
  }, [preferences.sidebar_order]);

  // Get mobile nav IDs - returns null if not loaded yet, never returns defaults
  const getMobileNavIds = useCallback(() => {
    return preferences.mobile_nav_ids;
  }, [preferences.mobile_nav_ids]);

  // Get mobile more IDs - returns null if not loaded yet, never returns defaults
  const getMobileMoreIds = useCallback(() => {
    return preferences.mobile_more_ids;
  }, [preferences.mobile_more_ids]);

  return {
    preferences,
    isLoading,
    isSynced,
    saveSidebarOrder,
    saveMobileNavConfig,
    getSidebarOrder,
    getMobileNavIds,
    getMobileMoreIds,
  };
};

// Note: localStorage fallback removed in favor of offline store.
