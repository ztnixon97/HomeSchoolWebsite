import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { api, setOnUnauthorized } from './api';

export interface User {
  id: number;
  email: string;
  display_name: string;
  role: 'admin' | 'teacher' | 'parent';
  active: boolean;
  phone: string | null;
  address: string | null;
  preferred_contact: string | null;
  family_id: number | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (inviteCode: string, email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isTeacher: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const handleUnauthorized = useCallback(() => {
    setUser(null);
    if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
      window.location.href = '/login';
    }
  }, []);

  useEffect(() => {
    setOnUnauthorized(handleUnauthorized);
  }, [handleUnauthorized]);

  useEffect(() => {
    api.get<User>('/api/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const u = await api.post<User>('/api/auth/login', { email, password });
    setUser(u);
  };

  const register = async (inviteCode: string, email: string, password: string, displayName: string) => {
    const u = await api.post<User>('/api/auth/register', {
      invite_code: inviteCode,
      email,
      password,
      display_name: displayName,
    });
    setUser(u);
  };

  const logout = async () => {
    await api.post('/api/auth/logout');
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const u = await api.get<User>('/api/auth/me');
      setUser(u);
    } catch {
      // silently ignore - user may have been logged out
    }
  };

  const isTeacher = user?.role === 'teacher' || user?.role === 'parent' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, isTeacher, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * Place inside <BrowserRouter> to re-validate the session on every
 * client-side navigation. If /me returns 401, the global onUnauthorized
 * handler clears user state and redirects to /login.
 */
export function SessionGuard() {
  const { user } = useAuth();
  const location = useLocation();
  const lastCheck = useRef<number>(Date.now());

  useEffect(() => {
    if (!user) return;
    // Only re-validate if more than 5 minutes since last check
    const now = Date.now();
    if (now - lastCheck.current < 5 * 60 * 1000) return;
    lastCheck.current = now;
    api.get('/api/auth/me').catch(() => {});
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
