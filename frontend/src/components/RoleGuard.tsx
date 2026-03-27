import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

interface Props {
  children: React.ReactNode;
  requireRole?: 'admin' | 'teacher';
}

export default function RoleGuard({ children, requireRole }: Props) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireRole === 'admin' && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireRole === 'teacher' && user.role !== 'teacher' && user.role !== 'parent' && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
