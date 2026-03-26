import { useState, useCallback, useEffect, useRef } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface UseHistoryOptions {
  maxHistory?: number;
}

export const useHistory = <T>(
  initialState: T,
  options: UseHistoryOptions = {}
) => {
  const { maxHistory = 50 } = options;
  
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  // Track if we should skip the next state update (for external sync)
  const skipNextUpdate = useRef(false);

  // Update present state and add to history
  const setState = useCallback((newState: T | ((prev: T) => T), skipHistory = false) => {
    setHistory(prev => {
      const nextState = typeof newState === 'function' 
        ? (newState as (prev: T) => T)(prev.present)
        : newState;

      // If state hasn't changed, don't update history
      if (JSON.stringify(nextState) === JSON.stringify(prev.present)) {
        return prev;
      }

      if (skipHistory) {
        return {
          ...prev,
          present: nextState,
        };
      }

      return {
        past: [...prev.past, prev.present].slice(-maxHistory),
        present: nextState,
        future: [],
      };
    });
  }, [maxHistory]);

  // Undo - go back one step
  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.past.length === 0) return prev;

      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);

      skipNextUpdate.current = true;

      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  // Redo - go forward one step
  const redo = useCallback(() => {
    setHistory(prev => {
      if (prev.future.length === 0) return prev;

      const next = prev.future[0];
      const newFuture = prev.future.slice(1);

      skipNextUpdate.current = true;

      return {
        past: [...prev.past, prev.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory(prev => ({
      past: [],
      present: prev.present,
      future: [],
    }));
  }, []);

  // Reset to initial state
  const reset = useCallback((newInitialState?: T) => {
    setHistory({
      past: [],
      present: newInitialState ?? initialState,
      future: [],
    });
  }, [initialState]);

  // Sync present state from external source (without adding to history)
  const syncState = useCallback((newState: T) => {
    if (skipNextUpdate.current) {
      skipNextUpdate.current = false;
      return;
    }
    setState(newState, true);
  }, [setState]);

  return {
    state: history.present,
    setState,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    clearHistory,
    reset,
    syncState,
    historyLength: history.past.length,
  };
};

// Hook for keyboard shortcuts
export const useUndoRedoShortcuts = (
  undo: () => void,
  redo: () => void,
  canUndo: boolean,
  canRedo: boolean
) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        
        if (e.shiftKey) {
          // Cmd+Shift+Z = Redo
          if (canRedo) {
            redo();
          }
        } else {
          // Cmd+Z = Undo
          if (canUndo) {
            undo();
          }
        }
      }
      
      // Also support Cmd+Y for Redo (Windows style)
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        if (canRedo) {
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);
};
