export const POST_CATEGORIES = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'lesson_recap', label: 'Lesson Recap' },
  { value: 'field_trip', label: 'Field Trip' },
  { value: 'community', label: 'Community' },
  { value: 'resources', label: 'Resources' },
  { value: 'other', label: 'Other' },
];

export const getCategoryLabel = (value?: string | null) => {
  if (!value) return '';
  const hit = POST_CATEGORIES.find(c => c.value === value);
  return hit ? hit.label : value;
};
