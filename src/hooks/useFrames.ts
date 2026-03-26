import { useState, useEffect, useCallback, useRef } from 'react';
import type { Frame, Position, GroupColor } from '../types';
import {
  fetchFrames,
  upsertFrame,
  deleteFrame as deleteFrameFromDb,
} from '../lib/offlineData';

export const useFrames = () => {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load frames on mount
  useEffect(() => {
    const loadFrames = async () => {
      setIsLoading(true);
      
      const dbFrames = await fetchFrames();
      setFrames(dbFrames);
      
      setIsLoading(false);
    };
    
    loadFrames();
  }, []);

  // Debounced sync to Supabase
  const debouncedSync = useCallback(async (frame: Frame) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    syncTimeoutRef.current = setTimeout(async () => {
      setIsSyncing(true);
      await upsertFrame(frame);
      setIsSyncing(false);
    }, 500);
  }, []);

  // Update a frame
  const updateFrame = useCallback((id: string, updates: Partial<Frame>) => {
    setFrames(prev => {
      const updated = prev.map(f => {
        if (f.id === id) {
          const newFrame = { ...f, ...updates };
          debouncedSync(newFrame);
          return newFrame;
        }
        return f;
      });
      return updated;
    });
  }, [debouncedSync]);

  // Update frame position
  const updateFramePosition = useCallback((id: string, position: Position) => {
    updateFrame(id, { position });
  }, [updateFrame]);

  // Update frame size
  const updateFrameSize = useCallback((id: string, width: number, height: number) => {
    updateFrame(id, { width, height });
  }, [updateFrame]);

  // Add a new frame
  const addFrame = useCallback(async (color: GroupColor = 'blue') => {
    const newId = Math.random().toString(36).substr(2, 9);
    const newFrame: Frame = {
      id: newId,
      label: '',
      color,
      position: { x: 400, y: 300 },
      width: 300,
      height: 200,
      linkedTo: [],
    };
    
    setFrames(prev => [...prev, newFrame]);
    
    setIsSyncing(true);
    await upsertFrame(newFrame);
    setIsSyncing(false);
    
    return newId;
  }, []);

  // Delete a frame
  const removeFrame = useCallback(async (id: string) => {
    setFrames(prev => prev.filter(f => f.id !== id));
    
    setIsSyncing(true);
    await deleteFrameFromDb(id);
    setIsSyncing(false);
  }, []);

  // Refresh frames from Supabase
  const refreshFrames = useCallback(async () => {
    setIsSyncing(true);
    const dbFrames = await fetchFrames();
    setFrames(dbFrames);
    setIsSyncing(false);
  }, []);

  return {
    frames,
    isLoading,
    isSyncing,
    updateFrame,
    updateFramePosition,
    updateFrameSize,
    addFrame,
    removeFrame,
    refreshFrames,
  };
};

