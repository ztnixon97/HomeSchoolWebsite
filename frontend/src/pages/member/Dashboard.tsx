import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useFeatures } from '../../features';
import { api } from '../../api';

interface Post {
  id: number;
  title: string;
  author_name: string | null;
  created_at: string;
}

interface Session {
  id: number;
  title: string;
  theme: string | null;
  session_date: string;
  start_time: string | null;
  host_name: string | null;
  status: string;
  session_type_name: string | null;
}

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  allergies: string;
}

interface Announcement {
  id: number;
  title: string;
  body: string;
  announcement_type: string;
  active: boolean;
  created_by_name: string | null;
  created_at: string;
  expires_at: string | null;
}

function calculateAge(dob: string): number {
  const birth = new Date(dob + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export default function Dashboard() {
  const { user, isTeacher, isAdmin } = useAuth();
  const features = useFeatures();
  const [posts, setPosts] = useState<Post[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [children, setChildren] = useState<Student[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (features.blog) api.get<Post[]>('/api/posts').then(p => setPosts(p.slice(0, 5))).catch(() => {});
    api.get<Session[]>('/api/sessions').then(setSessions).catch(() => {});
    if (features.my_children) api.get<Student[]>('/api/my-children').then(setChildren).catch(() => {});
    api.get<Announcement[]>('/api/announcements').then(setAnnouncements).catch(() => {});
  }, [features.blog, features.my_children]);

  const visibleAnnouncements = announcements.filter(a => !dismissedAnnouncements.has(a.id));

  const dismissAnnouncement = (id: number) => {
    setDismissedAnnouncements(new Set([...dismissedAnnouncements, id]));
  };

  const getAnnouncementStyles = (type: string) => {
    switch (type) {
      case 'warning':
        return 'bg-amber-50 border-l-4 border-amber-400 text-amber-900';
      case 'urgent':
        return 'bg-red-50 border-l-4 border-red-400 text-red-900';
      default:
        return 'bg-blue-50 border-l-4 border-cobalt text-ink';
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const todayEvents = sessions.filter(s => s.session_date === today);
  const upcoming = sessions.filter(s => s.session_date > today).slice(0, 5);
  const upcomingSessions = sessions.filter(s => s.session_date >= today).slice(0, 5);
  const openSessions = upcomingSessions.filter(s => s.status === 'open');

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="-mx-4 -mt-6 px-4 py-8 md:px-8 md:py-10 border-b border-ink/10 bg-cream/80">
        <div className="max-w-4xl">
          <h1 className="text-3xl font-semibold text-ink">
            Welcome back, {user?.display_name}
          </h1>
          <p className="text-ink/60 text-sm mt-1 capitalize">{user?.role}</p>
        </div>
      </div>

      {/* Announcements */}
      {visibleAnnouncements.length > 0 && (
        <div className="space-y-2">
          {visibleAnnouncements.map(announcement => (
            <div key={announcement.id} className={`rounded-lg p-4 ${getAnnouncementStyles(announcement.announcement_type)} flex items-start gap-4`}>
              <div className="flex-1">
                <h3 className="font-semibold text-sm">{announcement.title}</h3>
                {announcement.body && (
                  <p className="text-sm mt-1 opacity-90">{announcement.body}</p>
                )}
              </div>
              <button
                onClick={() => dismissAnnouncement(announcement.id)}
                className="text-xs font-medium opacity-60 hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                aria-label="Dismiss announcement"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* First-time parent prompt to register children */}
      {features.my_children && user?.role === 'parent' && children.length === 0 && (
        <div className="border-2 border-cobalt/30 rounded-xl p-6 bg-white/80">
          <h2 className="text-lg font-semibold text-ink mb-2">Welcome to the co-op!</h2>
          <p className="text-sm text-ink/70 mb-4">
            To get started, please add your children to your profile. This helps us keep track of allergies, dietary needs, and attendance.
          </p>
          <Link
            to="/my-children"
            className="btn-primary text-sm inline-block no-underline"
          >
            Add Your Children &rarr;
          </Link>
        </div>
      )}

      {/* Alert for open sessions */}
      {openSessions.length > 0 && (
        <div className="border border-ink/10 rounded-xl p-4 flex items-center gap-3 bg-white/70">
          <div className="flex-1">
            <p className="text-sm font-medium text-ink">
              {openSessions.length} upcoming session{openSessions.length > 1 ? 's' : ''} still need a host!
            </p>
            <Link to="/schedule" className="text-xs text-ink/70 hover:text-ink font-medium">
              View schedule &rarr;
            </Link>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        {/* Today's Schedule */}
        <div className="border-t border-ink/20 pt-4">
          <h2 className="text-lg font-semibold text-ink mb-4">Today's Schedule</h2>
          {todayEvents.length === 0 ? (
            <p className="text-ink/50 text-sm">Nothing scheduled for today.</p>
          ) : (
            <ul className="space-y-2">
              {todayEvents.map(ev => (
                <li key={ev.id} className="flex items-center gap-2 text-sm">
                  <span className="w-1.5 h-1.5 bg-ink/60 rounded-full flex-shrink-0" />
                  <span className="font-medium text-ink">{ev.title}</span>
                  {ev.start_time && <span className="text-ink/50 text-xs">at {ev.start_time}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upcoming Schedule */}
        <div className="border-t border-ink/20 pt-4">
          <h2 className="text-lg font-semibold text-ink mb-4">Upcoming Schedule</h2>
          {upcoming.length === 0 ? (
            <p className="text-ink/50 text-sm">No upcoming sessions.</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map(ev => {
                const isHoliday = ev.session_type_name === 'holiday';
                return (
                  <li key={ev.id} className={`rounded-lg p-3 ${isHoliday ? 'bg-amber-50 border border-amber-100' : 'bg-ink/5'}`}>
                    <Link to={`/sessions/${ev.id}`} className="block no-underline group">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-ink group-hover:text-ink/70">
                          {ev.title}
                          {isHoliday && <span className="ml-2 text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">No School</span>}
                        </span>
                        <span className="text-ink/50 text-xs">{new Date(ev.session_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      </div>
                      {!isHoliday && (
                        <div className="flex items-center gap-3 mt-1 text-xs text-ink/50">
                          {ev.start_time && <span>{ev.start_time}</span>}
                          {ev.host_name ? (
                            <span>Hosted by {ev.host_name}</span>
                          ) : (
                            <span className="text-red-600 font-medium">Needs a host</span>
                          )}
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center gap-4 mt-4">
            <Link to="/sessions" className="text-ink hover:text-ink/70 text-sm font-medium">
              View full schedule &rarr;
            </Link>
            <Link to="/sessions" className="text-xs text-cobalt hover:text-ink font-medium">
              Subscribe to Calendar
            </Link>
          </div>
        </div>

        {/* My Children */}
        {features.my_children && children.length > 0 && (
          <div className="border-t border-ink/20 pt-4">
            <h2 className="text-lg font-semibold text-ink mb-4">My Children</h2>
            <ul className="space-y-3">
              {children.map(child => {
                const age = child.date_of_birth ? calculateAge(child.date_of_birth) : null;
                return (
                  <li key={child.id} className="bg-ink/5 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-ink">{child.first_name} {child.last_name}</span>
                      {age !== null && <span className="text-xs text-ink/50">Age {age}</span>}
                    </div>
                    {child.allergies && (
                      <div className="mt-1 text-xs text-red-600">Allergies: {child.allergies}</div>
                    )}
                  </li>
                );
              })}
            </ul>
            <Link to="/my-children" className="text-ink hover:text-ink/70 text-sm mt-3 inline-block font-medium">
              Manage children &rarr;
            </Link>
          </div>
        )}

        {/* Recent Blog Posts */}
        {features.blog && <div className="border-t border-ink/20 pt-4">
          <h2 className="text-lg font-semibold text-ink mb-4">Recent Posts</h2>
          {posts.length === 0 ? (
            <p className="text-ink/50 text-sm">No posts yet.</p>
          ) : (
            <ul className="space-y-2">
              {posts.map(p => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <Link to={`/blog/${p.id}`} className="text-ink hover:text-ink/70 font-medium truncate">{p.title}</Link>
                  <span className="text-ink/50 text-xs flex-shrink-0 ml-2">
                    {new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>}

        {/* Quick Links */}
        <div className="border-t border-ink/20 pt-4 md:col-span-2">
          <h2 className="text-lg font-semibold text-ink mb-4">Quick Links</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            <QuickLink to="/sessions" label="View Schedule" />
            {features.lesson_plans && <QuickLink to="/lesson-plans" label="Browse Lesson Plans" />}
            {features.resources && <QuickLink to="/resources" label="View Resources" />}
            {features.my_children && <QuickLink to="/my-children" label="My Children" />}
            {features.my_rsvps && <QuickLink to="/my-rsvps" label="My RSVPs" />}
            {features.member_directory && <QuickLink to="/members" label="Member Directory" />}
            {features.class_groups && <QuickLink to="/my-classes" label="My Classes" />}
            {(isTeacher || isAdmin) && (
              <>
                {features.blog && <QuickLink to="/posts/new" label="Write a Blog Post" />}
                {features.lesson_plans && <QuickLink to="/lesson-plans/new" label="Create Lesson Plan" />}
                {features.blog && <QuickLink to="/posts/drafts" label="My Drafts" />}
              </>
            )}
            {isAdmin && (
              <>
                <QuickLink to="/admin" label="Admin Dashboard" />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="px-4 py-3 rounded-lg border border-ink/10 hover:border-ink/30 hover:bg-ink/5 transition-colors no-underline group"
    >
      <span className="text-sm text-ink group-hover:text-ink/70 font-medium">{label}</span>
    </Link>
  );
}
