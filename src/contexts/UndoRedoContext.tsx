import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';

interface HistoryEntry {
  id: string;
  pageId: string;
  state: unknown;
  timestamp: number;
  description?: string;
}

interface UndoRedoContextType {
  registerPage: (pageId: string, getCurrentState: () => unknown, restoreState: (state: unknown) => Promise<void>) => void;
  unregisterPage: (pageId: string) => void;
  setCurrentPage: (pageId: string) => void;
  saveState: (pageId: string, description?: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  historyLength: number;
}

const UndoRedoContext = createContext<UndoRedoContextType | undefined>(undefined);

export const useUndoRedo = () => {
  const context = useContext(UndoRedoContext);
  if (!context) {
    throw new Error('useUndoRedo must be used within an UndoRedoProvider');
  }
  return context;
};

interface PageHandler {
  getCurrentState: () => unknown;
  restoreState: (state: unknown) => Promise<void>;
}

interface UndoRedoProviderProps {
  children: ReactNode;
  maxHistory?: number;
}

export const UndoRedoProvider = ({ children, maxHistory = 50 }: UndoRedoProviderProps) => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const pageHandlersRef = useRef<Map<string, PageHandler>>(new Map());
  const isUndoRedoRef = useRef(false);
  const lastSavedStatesRef = useRef<Map<string, string>>(new Map());

  // Set the current active page
  const setCurrentPage = useCallback((pageId: string) => {
    setCurrentPageId(pageId);
  }, []);

  // Register a page's state handlers
  const registerPage = useCallback((
    pageId: string,
    getCurrentState: () => unknown,
    restoreState: (state: unknown) => Promise<void>
  ) => {
    pageHandlersRef.current.set(pageId, { getCurrentState, restoreState });
  }, []);

  // Unregister a page
  const unregisterPage = useCallback((pageId: string) => {
    pageHandlersRef.current.delete(pageId);
    lastSavedStatesRef.current.delete(pageId);
  }, []);

  // Save current state to history
  const saveState = useCallback((pageId: string, description?: string) => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }

    const handler = pageHandlersRef.current.get(pageId);
    if (!handler) return;

    const currentState = handler.getCurrentState();
    const stateString = JSON.stringify(currentState);

    // Don't save if state hasn't changed
    if (lastSavedStatesRef.current.get(pageId) === stateString) return;

    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      pageId,
      state: JSON.parse(stateString),
      timestamp: Date.now(),
      description,
    };

    setHistory(prev => [...prev, entry].slice(-maxHistory));
    setFuture([]); // Clear future on new action
    lastSavedStatesRef.current.set(pageId, stateString);
  }, [maxHistory]);

  // Get history entries for current page only
  const currentPageHistory = history.filter(h => h.pageId === currentPageId);
  const currentPageFuture = future.filter(f => f.pageId === currentPageId);

  // Undo - restore previous state (only for current page)
  const undo = useCallback(async () => {
    if (!currentPageId) return;
    
    // Find the last entry for the current page
    const pageHistory = history.filter(h => h.pageId === currentPageId);
    if (pageHistory.length === 0) return;

    const lastEntry = pageHistory[pageHistory.length - 1];
    const handler = pageHandlersRef.current.get(lastEntry.pageId);
    
    if (!handler) {
      // Handler not available, just remove from history
      setHistory(prev => {
        const idx = prev.lastIndexOf(lastEntry);
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      return;
    }

    // Save current state to future
    const currentState = handler.getCurrentState();
    const futureEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      pageId: lastEntry.pageId,
      state: JSON.parse(JSON.stringify(currentState)),
      timestamp: Date.now(),
    };

    isUndoRedoRef.current = true;
    
    try {
      await handler.restoreState(lastEntry.state);
      // Remove only this entry from history
      setHistory(prev => {
        const idx = prev.lastIndexOf(lastEntry);
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      setFuture(prev => [futureEntry, ...prev]);
      lastSavedStatesRef.current.set(lastEntry.pageId, JSON.stringify(lastEntry.state));
    } catch (error) {
      console.error('Undo failed:', error);
      isUndoRedoRef.current = false;
    }
  }, [history, currentPageId]);

  // Redo - restore next state (only for current page)
  const redo = useCallback(async () => {
    if (!currentPageId) return;
    
    // Find the first entry for the current page
    const pageFuture = future.filter(f => f.pageId === currentPageId);
    if (pageFuture.length === 0) return;

    const nextEntry = pageFuture[0];
    const handler = pageHandlersRef.current.get(nextEntry.pageId);
    
    if (!handler) {
      // Handler not available, just remove from future
      setFuture(prev => {
        const idx = prev.indexOf(nextEntry);
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      return;
    }

    // Save current state to history
    const currentState = handler.getCurrentState();
    const historyEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      pageId: nextEntry.pageId,
      state: JSON.parse(JSON.stringify(currentState)),
      timestamp: Date.now(),
    };

    isUndoRedoRef.current = true;
    
    try {
      await handler.restoreState(nextEntry.state);
      // Remove only this entry from future
      setFuture(prev => {
        const idx = prev.indexOf(nextEntry);
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      setHistory(prev => [...prev, historyEntry]);
      lastSavedStatesRef.current.set(nextEntry.pageId, JSON.stringify(nextEntry.state));
    } catch (error) {
      console.error('Redo failed:', error);
      isUndoRedoRef.current = false;
    }
  }, [future, currentPageId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <UndoRedoContext.Provider
      value={{
        registerPage,
        unregisterPage,
        setCurrentPage,
        saveState,
        canUndo: currentPageHistory.length > 0,
        canRedo: currentPageFuture.length > 0,
        undo,
        redo,
        historyLength: currentPageHistory.length,
      }}
    >
      {children}
    </UndoRedoContext.Provider>
  );
};
