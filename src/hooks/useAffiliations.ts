import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { offlineDb } from '../lib/offlineDb';
import { deleteLocalRow, upsertLocalRow } from '../lib/offlineStore';

export interface Affiliation {
  id: string;
  user_id: string;
  name: string;
  role: string;
  start_year: number | null;
  start_month: number | null;
  end_year: number | null;
  end_month: number | null;
  is_current: boolean;
  is_protected: boolean;
  description: string;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

const PROTECTED_AFFILIATIONS = ['GYact'];

const generateId = () => `aff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const useAffiliations = () => {
  const { user } = useAuth();
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAffiliations = useCallback(async () => {
    if (!user) {
      setAffiliations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const data = (await offlineDb.affiliations
        .where('user_id')
        .equals(user.id)
        .toArray()) as unknown as Affiliation[];
      const sorted = data.slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      setAffiliations(sorted);
    } catch (err) {
      console.error('Error loading affiliations:', err);
    }

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    loadAffiliations();
  }, [loadAffiliations]);

  const addAffiliation = async () => {
    if (!user) return null;

    const now = new Date().toISOString();
    const newAffiliation: Affiliation = {
      id: generateId(),
      user_id: user.id,
      name: '',
      role: '',
      start_year: null,
      start_month: null,
      end_year: null,
      end_month: null,
      is_current: false,
      is_protected: false,
      description: '',
      order_index: affiliations.length,
      created_at: now,
      updated_at: now,
    };

    try {
      await upsertLocalRow('affiliations', newAffiliation);
      setAffiliations(prev => [...prev, newAffiliation]);
      return newAffiliation;
    } catch (err) {
      console.error('Error adding affiliation:', err);
      return null;
    }
  };

  const updateAffiliation = async (id: string, updates: Partial<Affiliation>) => {
    if (!user) return;

    const affiliation = affiliations.find(a => a.id === id);
    if (affiliation?.is_protected || isProtectedAffiliation(affiliation?.name || '')) {
      // Don't update name of protected affiliations
      delete updates.name;
    }

    const updatedAffiliations = affiliations.map(a =>
      a.id === id ? { ...a, ...updates, updated_at: new Date().toISOString() } : a
    );
    const updatedAffiliation = updatedAffiliations.find(a => a.id === id);
    if (!updatedAffiliation) return;

    try {
      await upsertLocalRow('affiliations', updatedAffiliation);
      setAffiliations(updatedAffiliations);
    } catch (err) {
      console.error('Error updating affiliation:', err);
    }
  };

  const deleteAffiliation = async (id: string) => {
    if (!user) return;

    const affiliation = affiliations.find(a => a.id === id);
    if (affiliation?.is_protected || isProtectedAffiliation(affiliation?.name || '')) {
      console.warn('Cannot delete protected affiliation');
      return;
    }

    try {
      await deleteLocalRow('affiliations', id);
      setAffiliations(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error('Error deleting affiliation:', err);
    }
  };

  const isProtectedAffiliation = (name: string) => {
    return PROTECTED_AFFILIATIONS.includes(name);
  };

  return {
    affiliations,
    isLoading,
    addAffiliation,
    updateAffiliation,
    deleteAffiliation,
    isProtectedAffiliation,
    reloadAffiliations: loadAffiliations,
  };
};
