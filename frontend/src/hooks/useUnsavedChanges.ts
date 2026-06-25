import { useEffect } from 'react';

/**
 * Warns the user before they close/refresh/navigate away from the tab while a form
 * has unsaved changes. Pass `true` when the form is dirty.
 *
 * Note: this guards tab close / reload / external navigation (the common data-loss
 * cases). In-app route changes are not blocked here (the app uses a component router
 * without a data-router blocker).
 */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
