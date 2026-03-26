import { useState, useEffect, useCallback } from "react";
import { offlineDb } from "../lib/offlineDb";
import { upsertLocalRow } from "../lib/offlineStore";
import { useAuth } from "../contexts/AuthContext";

export interface SocialLink {
  id: string;
  platform:
    | "x"
    | "instagram"
    | "facebook"
    | "linkedin"
    | "github"
    | "youtube"
    | "tiktok"
    | "website"
    | "other";
  url: string;
  username?: string;
}

export interface HealthInfo {
  date_of_birth?: string;
  height_cm?: number | null;
  weight_kg?: number | null;
  blood_type?: "" | "A" | "B" | "O" | "AB";
  allergies?: string;
  medical_notes?: string;
}

export interface Profile {
  id: string;
  user_id?: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  first_message?: string;
  head_message?: string;
  company: string;
  job_title: string;
  social_links?: SocialLink[];
  health_info?: HealthInfo;
  created_at: string;
  updated_at: string;
}

export const useProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizeProfile = useCallback(
    (row: Record<string, unknown>, userId: string): Profile => {
      const now = new Date().toISOString();
      const socialLinks = (row.social_links ??
        row.socialLinks ??
        []) as SocialLink[];
      return {
        id: String(row.id ?? userId),
        user_id: (row.user_id ?? userId) as string,
        display_name: String(row.display_name ?? row.displayName ?? ""),
        avatar_url: String(row.avatar_url ?? row.avatarUrl ?? ""),
        bio: String(row.bio ?? ""),
        first_message: String(row.first_message ?? row.firstMessage ?? ""),
        head_message: String(row.head_message ?? row.headMessage ?? ""),
        company: String(row.company ?? ""),
        job_title: String(row.job_title ?? row.jobTitle ?? ""),
        social_links: Array.isArray(socialLinks) ? socialLinks : [],
        health_info: (row.health_info ?? row.healthInfo ?? {}) as HealthInfo,
        created_at: String(row.created_at ?? now),
        updated_at: String(row.updated_at ?? now),
      };
    },
    [],
  );

  // Load profile
  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const existing = (await offlineDb.profiles.get(user.id)) as
        | Record<string, unknown>
        | undefined;
      if (existing) {
        setProfile(normalizeProfile(existing, user.id));
        setIsLoading(false);
        return;
      }

      const allRows = (await offlineDb.profiles.toArray()) as Record<
        string,
        unknown
      >[];
      const fallback =
        allRows.find((row) => row.user_id === user.id) ??
        (allRows.length === 1 ? allRows[0] : undefined);
      if (fallback) {
        const normalized = normalizeProfile(fallback, user.id);
        const fallbackId = String(fallback.id ?? "");
        if (fallbackId && fallbackId !== user.id) {
          await offlineDb.profiles.delete(fallbackId);
        }
        await upsertLocalRow(
          "profiles",
          normalized as unknown as Record<string, unknown>,
        );
        setProfile(normalized);
        setIsLoading(false);
        return;
      }

      // IMPORTANT: Do NOT persist empty profile to local DB or outbox
      // This prevents empty profile from overwriting existing Supabase data
      // Only set in state for UI display - will be persisted when user actually saves
      const newProfile: Profile = {
        id: user.id,
        user_id: user.id,
        display_name: "",
        avatar_url: "",
        bio: "",
        first_message: "",
        head_message: "",
        company: "",
        job_title: "",
        social_links: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      // Don't call upsertLocalRow here - only set in state
      setProfile(newProfile);
    } catch (err) {
      console.error("Error loading profile:", err);
      setError("Failed to load profile");
    }

    setIsLoading(false);
  }, [normalizeProfile, user]);

  // Save profile
  const saveProfile = useCallback(
    async (updates: Partial<Profile>) => {
      if (!user || !profile) return;

      setIsSaving(true);
      setError(null);

      const updatedProfile = {
        ...profile,
        ...updates,
        user_id: profile.user_id ?? user.id,
        updated_at: new Date().toISOString(),
      };

      try {
        await upsertLocalRow(
          "profiles",
          updatedProfile as unknown as Record<string, unknown>,
        );
        setProfile(updatedProfile);
      } catch (err) {
        console.error("Error saving profile:", err);
        setError("Failed to save profile");
      }

      setIsSaving(false);
    },
    [user, profile],
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Restore state for undo/redo
  const restoreState = useCallback(async (state: Profile) => {
    setProfile(state);
  }, []);

  return {
    profile,
    isLoading,
    isSaving,
    error,
    saveProfile,
    reloadProfile: loadProfile,
    restoreState,
  };
};
