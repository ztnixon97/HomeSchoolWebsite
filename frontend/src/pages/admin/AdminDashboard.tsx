import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

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
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalStudents: 0,
    upcomingSessions: 0,
    activeInvites: 0,
  });
  const [openSessions, setOpenSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

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

  const AdminLink = ({ icon, title, description, href }: { icon: string; title: string; description: string; href: string }) => (
    <Link
      to={href}
      className="block bg-white rounded-xl border border-gray-100 shadow-sm p-6 hover:shadow-md hover:border-gray-200 transition-all no-underline group"
    >
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-[#1e3a5f] transition-colors">{title}</h3>
      <p className="text-gray-500 text-sm mt-2">{description}</p>
    </Link>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[#1e3a5f]">Admin Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Manage members, sessions, and co-op operations.</p>
      </div>

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
              <Link to="/admin/sessions" className="text-sm text-[#1e3a5f] hover:underline">
                View all {openSessions.length} sessions →
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Recent Activity Placeholder */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <p className="text-gray-400 text-sm italic">Coming soon</p>
      </section>

      {/* Admin Navigation Grid */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Admin Tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AdminLink
            icon="📅"
            title="Manage Sessions"
            description="Create, edit, and schedule class sessions"
            href="/admin/sessions"
          />
          <AdminLink
            icon="👥"
            title="Manage Users"
            description="Invite members, manage roles and access"
            href="/admin/users"
          />
          <AdminLink
            icon="👨‍👩‍👧"
            title="Manage Students"
            description="Add students, link parents, track info"
            href="/admin/students"
          />
          <AdminLink
            icon="📚"
            title="Manage Resources"
            description="Shared documents and learning materials"
            href="/admin/resources"
          />
          <AdminLink
            icon="🏷️"
            title="Session Types"
            description="Configure session categories and settings"
            href="/admin/session-types"
          />
          <AdminLink
            icon="⚙️"
            title="Bulk Create Sessions"
            description="Generate recurring weekly sessions"
            href="/admin/bulk-sessions"
          />
          <AdminLink
            icon="📝"
            title="Site Content"
            description="Edit public pages"
            href="/admin/site-content"
          />
          <AdminLink
            icon="📧"
            title="Email Parents"
            description="Send announcements"
            href="/admin/email-parents"
          />
          <AdminLink
            icon="📢"
            title="Announcements"
            description="Post quick alerts and notices"
            href="/admin/announcements"
          />
        </div>
      </section>
    </div>
  );
}
