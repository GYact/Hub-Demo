import { useState, useEffect, useCallback, useRef } from "react";
import type { ProjectTab, Project, GroupColor, ProjectStatus } from "../types";
import {
  fetchProjectTabsByParent,
  fetchProjectsByTabIds,
  upsertProjectTab,
  upsertProject,
  deleteProjectTab as deleteTabFromDb,
  deleteProject as deleteProjectFromDb,
  deleteProjectsOfTab,
} from "../lib/offlineData";

const DEFAULT_TABS: ProjectTab[] = [];

export const projectStatusOptions: {
  value: ProjectStatus;
  label: string;
  color: string;
}[] = [
  { value: "planning", label: "Planning", color: "slate" },
  { value: "in_progress", label: "In Progress", color: "blue" },
  { value: "on_hold", label: "On Hold", color: "amber" },
  { value: "completed", label: "Completed", color: "emerald" },
  { value: "cancelled", label: "Cancelled", color: "red" },
];

export const useProjects = (scopeProjectId?: string | null) => {
  const [tabs, setTabs] = useState<ProjectTab[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const normalizedScopeId = scopeProjectId ?? null;

  // Initial load
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      const loadedTabs = await fetchProjectTabsByParent(normalizedScopeId);
      const tabIds = loadedTabs.map((tab) => tab.id);
      const loadedProjects =
        tabIds.length > 0 ? await fetchProjectsByTabIds(tabIds) : [];
      if (!isMounted) return;
      setTabs(loadedTabs.length > 0 ? loadedTabs : DEFAULT_TABS);
      setProjects(loadedProjects);
      setIsLoading(false);
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, [normalizedScopeId]);

  // Debounced sync
  const debouncedSync = useCallback((syncFn: () => Promise<void>) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(async () => {
      setIsSyncing(true);
      await syncFn();
      setIsSyncing(false);
    }, 500);
  }, []);

  // Tab operations
  const addTab = useCallback(
    async (name: string, color: GroupColor = "blue") => {
      const newTab: ProjectTab = {
        id: Math.random().toString(36).substr(2, 9),
        name,
        color,
        parentProjectId: normalizedScopeId,
        order: tabs.length,
      };

      setTabs((prev) => [...prev, newTab]);

      debouncedSync(async () => {
        await upsertProjectTab(newTab);
      });

      return newTab.id;
    },
    [tabs, debouncedSync, normalizedScopeId],
  );

  const updateTab = useCallback(
    (id: string, updates: Partial<ProjectTab>) => {
      setTabs((prev) => {
        const updated = prev.map((tab) =>
          tab.id === id ? { ...tab, ...updates } : tab,
        );

        const updatedTab = updated.find((t) => t.id === id);
        if (updatedTab) {
          debouncedSync(async () => {
            await upsertProjectTab(updatedTab);
          });
        }

        return updated;
      });
    },
    [debouncedSync],
  );

  const removeTab = useCallback(
    async (id: string) => {
      setTabs((prev) => prev.filter((tab) => tab.id !== id));
      setProjects((prev) => prev.filter((project) => project.tabId !== id));

      setIsSyncing(true);
      await deleteProjectsOfTab(id);
      await deleteTabFromDb(id);
      setIsSyncing(false);
    },
    [tabs, projects],
  );

  // Project operations
  const addProject = useCallback(
    async (tabId: string) => {
      const tabProjects = projects.filter((p) => p.tabId === tabId);
      const newProject: Project = {
        id: Math.random().toString(36).substr(2, 9),
        tabId,
        name: "",
        status: "planning",
        budgets: [],
        isPinned: false,
        progress: 0,
        isArchived: false,
        order: tabProjects.length,
      };

      setProjects((prev) => [...prev, newProject]);

      debouncedSync(async () => {
        await upsertProject(newProject);
      });

      return newProject.id;
    },
    [projects, debouncedSync],
  );

  const updateProject = useCallback(
    (id: string, updates: Partial<Project>) => {
      setProjects((prev) => {
        const updated = prev.map((project) =>
          project.id === id ? { ...project, ...updates } : project,
        );

        const updatedProject = updated.find((p) => p.id === id);
        if (updatedProject) {
          debouncedSync(async () => {
            await upsertProject(updatedProject);
          });
        }

        return updated;
      });
    },
    [debouncedSync],
  );

  const removeProject = useCallback(
    async (id: string) => {
      setProjects((prev) => prev.filter((project) => project.id !== id));

      setIsSyncing(true);
      await deleteProjectFromDb(id);
      setIsSyncing(false);
    },
    [projects],
  );

  const getProjectsByTab = useCallback(
    (tabId: string) => {
      return projects.filter((project) => project.tabId === tabId);
    },
    [projects],
  );

  const reorderTabs = useCallback(
    (reorderedTabs: ProjectTab[]) => {
      const tabsWithOrder = reorderedTabs.map((tab, index) => ({
        ...tab,
        order: index,
      }));

      setTabs(tabsWithOrder);

      debouncedSync(async () => {
        for (const tab of tabsWithOrder) {
          await upsertProjectTab(tab);
        }
      });
    },
    [debouncedSync],
  );

  const reorderProjects = useCallback(
    (reorderedProjects: Project[]) => {
      const projectsWithOrder = reorderedProjects.map((project, index) => ({
        ...project,
        order: index,
      }));

      setProjects((prev) => {
        const tabId = projectsWithOrder[0]?.tabId;
        if (!tabId) return prev;

        const otherProjects = prev.filter((p) => p.tabId !== tabId);
        return [...otherProjects, ...projectsWithOrder];
      });

      debouncedSync(async () => {
        for (const project of projectsWithOrder) {
          await upsertProject(project);
        }
      });
    },
    [debouncedSync],
  );

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    const loadedTabs = await fetchProjectTabsByParent(normalizedScopeId);
    const tabIds = loadedTabs.map((tab) => tab.id);
    const loadedProjects =
      tabIds.length > 0 ? await fetchProjectsByTabIds(tabIds) : [];
    setTabs(loadedTabs.length > 0 ? loadedTabs : DEFAULT_TABS);
    setProjects(loadedProjects);
    setIsSyncing(false);
  }, [normalizedScopeId]);

  const restoreState = useCallback(
    async (state: { tabs: ProjectTab[]; projects: Project[] }) => {
      setTabs(state.tabs);
      setProjects(state.projects);

      setIsSyncing(true);
      for (const tab of state.tabs) {
        await upsertProjectTab(tab);
      }
      for (const project of state.projects) {
        await upsertProject(project);
      }
      setIsSyncing(false);
    },
    [],
  );

  return {
    tabs,
    projects,
    isLoading,
    isSyncing,
    addTab,
    updateTab,
    removeTab,
    addProject,
    updateProject,
    removeProject,
    getProjectsByTab,
    reorderTabs,
    reorderProjects,
    refresh,
    restoreState,
  };
};
