import { useCRUD, type BaseEntity } from './useCRUD';

/**
 * Work experience entity type
 */
export interface WorkExperience extends BaseEntity {
  title: string;
  employment_type: string;
  company: string;
  location: string;
  start_year: number | null;
  start_month: number | null;
  end_year: number | null;
  end_month: number | null;
  is_current: boolean;
  description: string;
  skills: string[];
  media_url: string;
  media_title: string;
  order_index: number;
}

const LOCAL_STORAGE_KEY = 'hub-workspace-work-experiences';

/**
 * Hook for managing work experience entries.
 * Uses the generic useCRUD hook for Supabase/localStorage operations.
 */
export const useWorkExperiences = () => {
  const {
    items: experiences,
    isLoading,
    isSaving,
    error,
    add,
    update,
    remove,
    reload,
  } = useCRUD<WorkExperience>({
    tableName: 'work_experiences',
    localStorageKey: LOCAL_STORAGE_KEY,
    idPrefix: 'exp',
    orderColumn: 'order_index',
    orderDirection: 'ascending',
    createEmptyItem: (_userId, currentLength) => ({
      title: '',
      employment_type: '',
      company: '',
      location: '',
      start_year: null,
      start_month: null,
      end_year: null,
      end_month: null,
      is_current: false,
      description: '',
      skills: [],
      media_url: '',
      media_title: '',
      order_index: currentLength,
    }),
  });

  return {
    experiences,
    isLoading,
    isSaving,
    error,
    addExperience: add,
    updateExperience: update,
    deleteExperience: remove,
    reloadExperiences: reload,
  };
};

// Employment type options
export const employmentTypeOptions = [
  { value: '', label: 'Select' },
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'self-employed', label: 'Self-employed' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'other', label: 'Other' },
];

// Month options
export const monthOptions = [
  { value: '', label: 'Month' },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1).padStart(2, '0'),
  })),
];

// Year options (past 50 years to 5 years in future)
export const getYearOptions = () => {
  const currentYear = new Date().getFullYear();
  const years = [{ value: '', label: 'Year' }];
  for (let year = currentYear + 5; year >= currentYear - 50; year--) {
    years.push({ value: String(year), label: String(year) });
  }
  return years;
};
