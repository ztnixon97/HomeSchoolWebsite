import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/Toast';
import { useFeatures } from '../../features';

interface User {
  id: number;
  display_name: string;
  email: string;
  role: string;
  active: boolean;
}

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  parent_id: number | null;
}

interface Session {
  id: number;
  title: string;
  session_date: string;
  status: string;
  host_id: number | null;
  host_name: string | null;
  session_type_name: string;
}

interface Invite {
  id: number;
  code: string;
  role: string;
  used_by: number | null;
}

export default function AdminDashboard() {
  const { showToast } = useToast();
  const features = useFeatures();
  const [sendingReminders, setSendingReminders] = useState(false);

  const sendReminders = async () => {
    if (!confirm('Send reminder emails to parents for tomorrow’s sessions now?')) return;
    setSendingReminders(true);
    try {
      const res = await api.post<{ reminders_sent: number }>('/api/admin/send-reminders', {});
      showToast(`${res.reminders_sent} reminder(s) sent`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to send reminders', 'error');
    } finally {
      setSendingReminders(false);
    }
  };

  const [stats, setStats] = useState({
    totalMembers: 0,
    totalStudents: 0,
    upcomingSessions: 0,
    activeInvites: 0,
  });
  const [openSessions, setOpenSessions] = useState<Session[]>([]);
  const [pendingEnrollments, setPendingEnrollments] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!features.class_groups) return;
    api.get<unknown[]>('/api/admin/enrollment-requests')
      .then(r => setPendingEnrollments(r.length))
      .catch(() => {});
  }, [features.class_groups]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, studentsRes, sessionsRes, invitesRes] = await Promise.all([
          api.get<User[]>('/api/admin/users'),
          api.get<Student[]>('/api/students'),
          api.get<Session[]>('/api/sessions'),
          api.get<Invite[]>('/api/admin/invites'),
        ]);

        const activeUsers = usersRes.filter((u: User) => u.active).length;
        const today = new Date().toISOString().split('T')[0];
        const futureOpenSessions = sessionsRes.filter(
          (s: Session) =>
            s.session_date >= today &&
            s.status === 'open' &&
            s.session_type_name !== 'holiday'
        );
        const unusedInvites = invitesRes.filter((i: Invite) => !i.used_by).length;

        setStats({
          totalMembers: activeUsers,
          totalStudents: studentsRes.length,
          upcomingSessions: futureOpenSessions.length,
          activeInvites: unusedInvites,
        });
        setOpenSessions(futureOpenSessions);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <p className="text-gray-500 text-sm font-medium">{label}</p>
      <p className={`text-3xl font-bold ${color} mt-2`}>{loading ? '—' : value}</p>
    </div>
  );

  const AdminLink = ({ icon, title, description, href, badge }: { icon: string; title: string; description: string; href: string; badge?: number }) => (
    <Link
      to={href}
      className="relative block bg-white rounded-xl border border-gray-100 shadow-sm p-6 hover:shadow-md hover:border-gray-200 transition-all no-underline group"
    >
      {badge ? (
        <span className="absolute top-4 right-4 bg-emerald-600 text-white text-xs font-semibold rounded-full min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center">{badge}</span>
      ) : null}
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-[#1e3a5f] transition-colors">{title}</h3>
      <p className="text-gray-500 text-sm mt-2">{description}</p>
    </Link>
  );

  const SubSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Admin Dashboard</h1>
        <p className="text-ink/60 text-sm mt-1">Manage members, sessions, and co-op operations.</p>
      </div>

      {/* Action needed: pending enrollment requests */}
      {pendingEnrollments > 0 && (
        <Link
          to="/admin/class-groups"
          className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 no-underline hover:bg-emerald-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📥</span>
            <div>
              <p className="font-medium text-emerald-900">
                {pendingEnrollments} enrollment request{pendingEnrollments !== 1 ? 's' : ''} waiting for review
              </p>
              <p className="text-sm text-emerald-700">Approve or deny in Class Groups →</p>
            </div>
          </div>
          <span className="text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-full font-medium shrink-0">Review</span>
        </Link>
      )}

      {/* Overview Stats */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Members" value={stats.totalMembers} color="text-emerald-600" />
          <StatCard label="Total Students" value={stats.totalStudents} color="text-blue-600" />
          <StatCard label="Sessions Needing Hosts" value={stats.upcomingSessions} color="text-amber-600" />
          <StatCard label="Active Invites" value={stats.activeInvites} color="text-indigo-600" />
        </div>
      </section>

      {/* Quick Actions - Sessions Needing Hosts */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Sessions Needing Hosts</h2>
        {openSessions.length === 0 ? (
          <p className="text-gray-500 text-sm">All upcoming sessions have hosts assigned.</p>
        ) : (
          <div className="space-y-3">
            {openSessions.slice(0, 5).map((session) => (
              <Link
                key={session.id}
                to={`/admin/sessions`}
                className="flex items-center justify-between p-4 bg-amber-50 border border-amber-100 rounded-lg hover:bg-amber-100 transition-colors no-underline group"
              >
                <div>
                  <h3 className="font-medium text-gray-900 group-hover:text-[#1e3a5f]">{session.title}</h3>
                  <p className="text-sm text-gray-500">
                    {new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <span className="text-xs bg-amber-200 text-amber-900 px-3 py-1 rounded-full font-medium">Open</span>
              </Link>
            ))}
            {openSessions.length > 5 && (
              <Link to="/admin/sessions" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium">
                View all {openSessions.length} sessions →
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <RecentActivity />

      {/* Admin Navigation Grid */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">Admin Tools</h2>

        <SubSection title="People & Access">
          <AdminLink icon="👥" title="Manage Users" description="Invite members, manage roles and access" href="/admin/users" />
          <AdminLink icon="👨‍👩‍👧" title="Manage Students" description="Add students, link parents, track info" href="/admin/students" />
        </SubSection>

        <SubSection title="Scheduling">
          <AdminLink icon="📅" title="Manage Sessions" description="Create, edit, and schedule class sessions" href="/admin/sessions" />
          <AdminLink icon="⚙️" title="Bulk Create Sessions" description="Generate recurring weekly sessions" href="/admin/bulk-sessions" />
          <AdminLink icon="🏷️" title="Session Types" description="Configure session categories and settings" href="/admin/session-types" />
          <button
            onClick={sendReminders}
            disabled={sendingReminders}
            className="block bg-white rounded-xl border border-gray-100 shadow-sm p-6 hover:shadow-md hover:border-gray-200 transition-all text-left disabled:opacity-50"
          >
            <div className="text-3xl mb-3">🔔</div>
            <h3 className="text-lg font-semibold text-gray-900">{sendingReminders ? 'Sending...' : 'Send Reminders'}</h3>
            <p className="text-gray-500 text-sm mt-2">Send session reminder emails to parents</p>
          </button>
        </SubSection>

        <SubSection title="Classes & Academics">
          {features.class_groups && <AdminLink icon="🏫" title="Class Groups" description="Classes, rosters, and enrollment requests" href="/admin/class-groups" badge={pendingEnrollments || undefined} />}
          {features.standards && <AdminLink icon="📊" title="Manage Standards" description="Curriculum standards and assignment mapping" href="/admin/standards" />}
          <AdminLink icon="📈" title="Reports" description="Attendance and enrollment reports" href="/admin/reports" />
        </SubSection>

        <SubSection title="Content & Communication">
          <AdminLink icon="📝" title="Site Content" description="Edit public pages" href="/admin/site-content" />
          <AdminLink icon="📢" title="Announcements" description="Post quick alerts and notices" href="/admin/announcements" />
          <AdminLink icon="📧" title="Email Parents" description="Send announcements" href="/admin/email-parents" />
          <AdminLink icon="📚" title="Manage Resources" description="Shared documents and learning materials" href="/admin/resources" />
          <AdminLink icon="📁" title="File Management" description="Monitor storage and manage uploaded files" href="/admin/files" />
        </SubSection>

        <SubSection title="Settings & Money">
          {features.payments && <AdminLink icon="💰" title="Manage Payments" description="Charges, payments, invoices, and balances" href="/admin/payments" />}
          {features.documents && <AdminLink icon="📄" title="Manage Documents" description="Document templates and submission tracking" href="/admin/documents" />}
          <AdminLink icon="⚙️" title="Feature Settings" description="Enable or disable site features" href="/admin/features" />
        </SubSection>
      </section>
    </div>
  );
}

interface ActivityItem {
  type: string;
  message: string;
  timestamp: string;
}

function RecentActivity() {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  useEffect(() => {
    api.get<ActivityItem[]>('/api/admin/recent-activity').then(setActivity).catch(() => {});
  }, []);

  const typeIcons: Record<string, string> = {
    registration: '👤',
    rsvp: '✋',
    session_claim: '🏠',
  };

  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
      {activity.length === 0 ? (
        <p className="text-ink/40 text-sm">No recent activity.</p>
      ) : (
        <div className="space-y-2">
          {activity.map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-sm py-1.5">
              <span className="text-base">{typeIcons[item.type] || '📌'}</span>
              <span className="text-gray-700 flex-1">{item.message}</span>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
