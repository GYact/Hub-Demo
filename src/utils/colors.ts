import type { GroupColor } from '../types';

/**
 * Tab color configuration for UI components.
 * Used across ClientsPage, MemosPage, and other tab-based pages.
 */
export const TAB_COLORS: { value: GroupColor; label: string; bg: string; border: string }[] = [
  { value: 'blue', label: 'Blue', bg: 'bg-blue-500', border: 'border-blue-500' },
  { value: 'green', label: 'Green', bg: 'bg-emerald-500', border: 'border-emerald-500' },
  { value: 'purple', label: 'Purple', bg: 'bg-purple-500', border: 'border-purple-500' },
  { value: 'orange', label: 'Orange', bg: 'bg-orange-500', border: 'border-orange-500' },
  { value: 'red', label: 'Red', bg: 'bg-red-500', border: 'border-red-500' },
  { value: 'pink', label: 'Pink', bg: 'bg-pink-500', border: 'border-pink-500' },
  { value: 'yellow', label: 'Yellow', bg: 'bg-yellow-500', border: 'border-yellow-500' },
  { value: 'cyan', label: 'Cyan', bg: 'bg-cyan-500', border: 'border-cyan-500' },
];

/**
 * Get Tailwind CSS classes for a given GroupColor.
 * Returns background, light background, border, and text color classes.
 */
export const getTabColorClasses = (color: GroupColor) => {
  const colorMap: Record<GroupColor, { bg: string; bgLight: string; border: string; text: string }> = {
    blue: { bg: 'bg-blue-500', bgLight: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-600' },
    green: { bg: 'bg-emerald-500', bgLight: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-600' },
    purple: { bg: 'bg-purple-500', bgLight: 'bg-purple-50', border: 'border-purple-500', text: 'text-purple-600' },
    orange: { bg: 'bg-orange-500', bgLight: 'bg-orange-50', border: 'border-orange-500', text: 'text-orange-600' },
    red: { bg: 'bg-red-500', bgLight: 'bg-red-50', border: 'border-red-500', text: 'text-red-600' },
    pink: { bg: 'bg-pink-500', bgLight: 'bg-pink-50', border: 'border-pink-500', text: 'text-pink-600' },
    yellow: { bg: 'bg-yellow-500', bgLight: 'bg-yellow-50', border: 'border-yellow-500', text: 'text-yellow-600' },
    cyan: { bg: 'bg-cyan-500', bgLight: 'bg-cyan-50', border: 'border-cyan-500', text: 'text-cyan-600' },
  };
  return colorMap[color];
};
