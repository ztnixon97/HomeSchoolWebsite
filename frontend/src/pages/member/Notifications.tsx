import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/Toast';

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

const typeIcons: Record<string, string> = {
  message: '\u2709',
  grade: '\uD83D\uDCDD',
  announcement: '\uD83D\uDCE2',
  document: '\uD83D\uDCC4',
  payment: '\uD83D\uDCB3',
  session: '\uD83D\uDCC5',
  default: '\uD83D\uDD14',
};

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    api.get<Notification[]>('/api/notifications')
      .then(setNotifications)
      .catch(() => showToast('Failed to load notifications', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const markAsRead = async (notif: Notification) => {
    if (!notif.read) {
      try {
        await api.put(`/api/notifications/${notif.id}/read`, {});
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      } catch {
        // silent
      }
    }
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const markAllRead = async () => {
    try {
      await api.put('/api/notifications/read-all', {});
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      showToast('All notifications marked as read', 'success');
    } catch {
      showToast('Failed to mark all as read', 'error');
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) return <div className="text-center py-16 text-ink/40">Loading notifications...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to="/dashboard" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium mb-4 inline-block">&larr; Dashboard</Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Notifications</h1>
          <p className="text-ink/60 text-sm mt-1">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-ink/40 text-sm">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <button
              key={n.id}
              onClick={() => markAsRead(n)}
              className={`w-full text-left bg-white rounded-xl border shadow-sm p-4 flex items-start gap-3 transition-colors hover:border-emerald-300 ${
                n.read ? 'border-gray-100 opacity-70' : 'border-emerald-200 bg-emerald-50/30'
              }`}
            >
              <span className="text-xl flex-shrink-0 mt-0.5">
                {typeIcons[n.type] || typeIcons.default}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={`text-sm ${n.read ? 'text-gray-700' : 'font-semibold text-ink'}`}>{n.title}</h3>
                  {!n.read && (
                    <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
                  )}
                </div>
                {n.body && <p className="text-xs text-gray-500 mt-0.5 truncate">{n.body}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
              {n.link && (
                <span className="text-gray-300 text-sm flex-shrink-0 mt-1">&rsaquo;</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
