import { useCRUD, type BaseEntity } from './useCRUD';

/**
 * Education entity type
 */
export interface Education extends BaseEntity {
  school: string;
  degree: string;
  field_of_study: string;
  start_year: number | null;
  start_month: number | null;
  end_year: number | null;
  end_month: number | null;
  is_current: boolean;
  grade: string;
  activities: string;
  description: string;
  order_index: number;
}

const LOCAL_STORAGE_KEY = 'hub-workspace-educations';

/**
 * Hook for managing education entries.
 * Uses the generic useCRUD hook for Supabase/localStorage operations.
 */
export const useEducations = () => {
  const {
    items: educations,
    isLoading,
    isSaving,
    error,
    add,
    update,
    remove,
    reload,
  } = useCRUD<Education>({
    tableName: 'educations',
    localStorageKey: LOCAL_STORAGE_KEY,
    idPrefix: 'edu',
    orderColumn: 'order_index',
    orderDirection: 'ascending',
    createEmptyItem: (_userId, currentLength) => ({
      school: '',
      degree: '',
      field_of_study: '',
      start_year: null,
      start_month: null,
      end_year: null,
      end_month: null,
      is_current: false,
      grade: '',
      activities: '',
      description: '',
      order_index: currentLength,
    }),
  });

  return {
    educations,
    isLoading,
    isSaving,
    error,
    addEducation: add,
    updateEducation: update,
    deleteEducation: remove,
    reloadEducations: reload,
  };
};

// Degree options
export const degreeOptions = [
  { value: '', label: 'Select' },
  { value: 'high-school', label: 'High School' },
  { value: 'vocational', label: 'Vocational' },
  { value: 'associate', label: 'Associate' },
  { value: 'bachelor', label: 'Bachelor' },
  { value: 'master', label: 'Master' },
  { value: 'doctor', label: 'Doctorate' },
  { value: 'other', label: 'Other' },
];
