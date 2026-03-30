import React, { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../api';
import { useFeatures } from '../features';

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const features = useFeatures();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || !features.notifications) {
      setUnreadCount(0);
      return;
    }
    const fetchCount = () => {
      api.get<{ count: number }>('/api/notifications/unread-count')
        .then(data => setUnreadCount(data.count))
        .catch(() => {});
    };
    fetchCount();
    pollRef.current = setInterval(fetchCount, 60000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, features.notifications]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream text-ink">
      <header className="bg-cream/90 backdrop-blur border-b border-cobalt/20 relative z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 no-underline group">
            <div className="china-crest" />
            <span className="text-sm font-semibold tracking-[0.25em] uppercase text-ink/70">WLPC</span>
          </Link>

          {/* Mobile menu button */}
          <button
            className="lg:hidden p-2.5 text-ink/60 hover:text-ink rounded-lg hover:bg-ink/5"
            aria-label="Toggle menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1 text-sm">
            <NavLinks user={user} isAdmin={isAdmin} />
            <div className="w-px h-5 bg-ink/20 mx-2" />
            {user ? (
              <div className="flex items-center gap-3">
                {features.notifications && (
                  <Link
                    to="/notifications"
                    className="relative p-2 text-ink/60 hover:text-ink rounded-lg hover:bg-ink/5 transition-colors no-underline"
                    title="Notifications"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </Link>
                )}
                <Link
                  to="/account"
                  className="text-sm text-ink/70 bg-ink/5 px-3 py-1 rounded-full no-underline hover:bg-ink/10 transition-colors"
                  title="Account settings"
                >
                  {user.display_name}
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-ink/60 hover:text-ink text-sm px-2 py-1 rounded hover:bg-ink/5 transition-colors"
                >
                  Log out
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="no-underline btn-primary text-sm px-4 py-1.5"
              >
                Sign In
              </Link>
            )}
          </nav>
        </div>

        {/* Mobile nav */}
        {menuOpen && (
          <nav className="lg:hidden border-t border-ink/10 px-4 py-4 flex flex-col gap-1 text-sm bg-cream">
            <NavLinks user={user} isAdmin={isAdmin} onClick={() => setMenuOpen(false)} mobile />
            <div className="h-px bg-ink/10 my-2" />
            {user ? (
              <>
                {features.notifications && (
                  <Link
                    to="/notifications"
                    className="flex items-center gap-2 text-ink/70 hover:text-ink px-3 py-1.5 rounded-lg hover:bg-ink/5 no-underline"
                    onClick={() => setMenuOpen(false)}
                  >
                    Notifications
                    {unreadCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </Link>
                )}
                <Link
                  to="/account"
                  className="text-ink/70 hover:text-ink px-3 py-1.5 rounded-lg hover:bg-ink/5 no-underline"
                  onClick={() => setMenuOpen(false)}
                >
                  Account Settings
                </Link>
                <button
                  onClick={() => { handleLogout(); setMenuOpen(false); }}
                  className="text-left text-ink/60 hover:text-ink px-3 py-1.5 rounded-lg hover:bg-ink/5"
                >
                  Log out
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="no-underline btn-primary text-sm px-4 py-2 text-center"
                onClick={() => setMenuOpen(false)}
              >
                Sign In
              </Link>
            )}
          </nav>
        )}
      </header>

      {user && <AnnouncementBanner />}
      {user && features.documents && <PendingDocumentsBanner />}

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <Outlet />
      </main>

      <footer className="bg-cream border-t border-ink/10">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">Western Loudoun Preschool Co-op (WLPC)</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-ink/50">
              <Link to="/about" className="hover:text-ink no-underline text-ink/50">About</Link>
              <Link to="/contact" className="hover:text-ink no-underline text-ink/50">Contact</Link>
              <Link to="/schedule" className="hover:text-ink no-underline text-ink/50">Schedule</Link>
            </div>
          </div>
          <div className="mt-6 text-xs text-ink/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span>Learning together, growing together.</span>
            <span>Parent-run cooperative learning group. Not a licensed childcare program.</span>
            <span>Photo: Catoctin Creek, Route 7 bridge (Wikimedia Commons). Chicken silhouette: NIH BioArt (public domain).</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavDropdown({ label, children, mobile, onClick }: {
  label: string;
  children: React.ReactNode;
  mobile?: boolean;
  onClick?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  if (mobile) {
    return <>{children}</>;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-ink/70 hover:text-ink hover:bg-ink/5 transition-colors text-sm"
      >
        {label}
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-ink/10 py-1 min-w-[160px] z-50">
          {React.Children.map(children, child => {
            if (!React.isValidElement(child)) return null;
            return React.cloneElement(child as React.ReactElement<{ className?: string; onClick?: () => void }>, {
              className: "block px-4 py-2 text-sm text-ink/70 hover:text-ink hover:bg-ink/5 no-underline transition-colors whitespace-nowrap",
              onClick: () => { onClick?.(); setOpen(false); },
            });
          })}
        </div>
      )}
    </div>
  );
}

function NavLinks({ user, isAdmin, onClick, mobile }: {
  user: ReturnType<typeof useAuth>['user'];
  isAdmin: boolean;
  onClick?: () => void;
  mobile?: boolean;
}) {
  const features = useFeatures();
  const base = mobile
    ? "block px-3 py-1.5 rounded-lg text-ink/70 hover:text-ink hover:bg-ink/5 no-underline transition-colors"
    : "px-3 py-1.5 rounded-lg text-ink/70 hover:text-ink hover:bg-ink/5 no-underline transition-colors";

  // Collect dropdown items, filtering by feature gates
  const myItems: React.ReactNode[] = [];
  if (features.my_children) myItems.push(<Link key="children" to="/my-children" onClick={onClick}>My Children</Link>);
  if (features.my_rsvps) myItems.push(<Link key="rsvps" to="/my-rsvps" onClick={onClick}>My RSVPs</Link>);
  if (features.class_groups) myItems.push(<Link key="classes" to="/my-classes" onClick={onClick}>My Classes</Link>);
  if (features.documents) myItems.push(<Link key="docs" to="/my-documents" onClick={onClick}>Documents</Link>);
  if (features.payments) myItems.push(<Link key="pay" to="/my-payments" onClick={onClick}>Payments</Link>);

  const communityItems: React.ReactNode[] = [];
  if (features.member_directory) communityItems.push(<Link key="members" to="/members" onClick={onClick}>Members</Link>);
  if (features.lesson_plans) communityItems.push(<Link key="lessons" to="/lesson-plans" onClick={onClick}>Lessons</Link>);
  if (features.blog) communityItems.push(<Link key="blog" to="/blog" onClick={onClick}>Blog</Link>);
  if (features.resources) communityItems.push(<Link key="resources" to="/resources" onClick={onClick}>Resources</Link>);
  if (features.messaging) communityItems.push(<Link key="inbox" to="/inbox" onClick={onClick}>Inbox</Link>);

  return (
    <>
      <Link to="/schedule" className={base} onClick={onClick}>Schedule</Link>
      <Link to="/about" className={base} onClick={onClick}>About</Link>
      <Link to="/contact" className={base} onClick={onClick}>Contact</Link>
      {user && (
        <>
          {mobile && <div className="h-px bg-gray-100 my-1" />}
          {!mobile && <div className="w-px h-5 bg-ink/20 mx-1" />}
          <Link to="/dashboard" className={base} onClick={onClick}>Dashboard</Link>
          {myItems.length > 0 && (
            mobile ? (
              <>
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink/40">My Stuff</div>
                {myItems.map(item => React.isValidElement(item) ? React.cloneElement(item as React.ReactElement<{ className?: string }>, { className: base }) : null)}
              </>
            ) : (
              <NavDropdown label="My Stuff" mobile={false} onClick={onClick}>
                {myItems}
              </NavDropdown>
            )
          )}
          {communityItems.length > 0 && (
            mobile ? (
              <>
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink/40">Community</div>
                {communityItems.map(item => React.isValidElement(item) ? React.cloneElement(item as React.ReactElement<{ className?: string }>, { className: base }) : null)}
              </>
            ) : (
              <NavDropdown label="Community" mobile={false} onClick={onClick}>
                {communityItems}
              </NavDropdown>
            )
          )}
        </>
      )}
      {isAdmin && (
        <Link to="/admin" className={`${base} ${!mobile ? 'text-ink hover:text-ink/80 hover:bg-ink/5' : ''}`} onClick={onClick}>Admin</Link>
      )}
    </>
  );
}

interface Announcement {
  id: number;
  title: string;
  body: string;
  announcement_type: string;
}

function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(() => {
    try {
      const stored = sessionStorage.getItem('dismissed_announcements');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    api.get<Announcement[]>('/api/announcements').then(setAnnouncements).catch(() => {});
  }, []);

  const dismiss = (id: number) => {
    const next = new Set([...dismissed, id]);
    setDismissed(next);
    sessionStorage.setItem('dismissed_announcements', JSON.stringify([...next]));
  };

  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const styles: Record<string, string> = {
    warning: 'bg-amber-50 border-amber-300 text-amber-900',
    urgent: 'bg-red-50 border-red-300 text-red-900',
    info: 'bg-blue-50 border-cobalt/30 text-ink',
  };

  return (
    <div className="max-w-7xl mx-auto w-full px-4 pt-4 space-y-2">
      {visible.map(a => (
        <div key={a.id} className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${styles[a.announcement_type] || styles.info}`}>
          <div className="flex-1 text-sm">
            <span className="font-semibold">{a.title}</span>
            {a.body && <span className="ml-1 opacity-80">{a.body}</span>}
          </div>
          <button onClick={() => dismiss(a.id)} className="text-xs opacity-50 hover:opacity-100 flex-shrink-0 mt-0.5">✕</button>
        </div>
      ))}
    </div>
  );
}

function PendingDocumentsBanner() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    api.get<{ count: number }>('/api/my-pending-documents')
      .then(data => setPending(data.count))
      .catch(() => {});
  }, []);

  if (pending <= 0) return null;

  return (
    <div className="max-w-7xl mx-auto w-full px-4 pt-3">
      <Link
        to="/my-documents"
        className="block rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 no-underline hover:bg-red-100 transition-colors"
      >
        <span className="font-semibold">Action Required:</span> You have {pending} required document{pending !== 1 ? 's' : ''} waiting to be signed.{' '}
        <span className="underline">Review and sign now &rarr;</span>
      </Link>
    </div>
  );
}
