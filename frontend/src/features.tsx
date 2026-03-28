import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

interface FeatureFlags {
  blog: boolean;
  resources: boolean;
  lesson_plans: boolean;
  member_directory: boolean;
  student_progress: boolean;
  families: boolean;
}

const defaults: FeatureFlags = {
  blog: true,
  resources: true,
  lesson_plans: true,
  member_directory: true,
  student_progress: true,
  families: true,
};

const FeatureContext = createContext<FeatureFlags>(defaults);

export function FeatureProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(defaults);

  useEffect(() => {
    api.get<FeatureFlags>('/api/features').then(setFlags).catch(() => {});
  }, []);

  return <FeatureContext.Provider value={flags}>{children}</FeatureContext.Provider>;
}

export function useFeatures() {
  return useContext(FeatureContext);
}
