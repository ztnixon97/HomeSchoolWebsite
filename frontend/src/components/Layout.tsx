import { useState, useEffect } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../api';
import { useFeatures } from '../features';

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream text-ink">
      <header className="bg-cream/90 backdrop-blur border-b border-cobalt/20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 no-underline group">
            <div className="china-crest" />
            <span className="text-sm font-semibold tracking-[0.25em] uppercase text-ink/70">WLPC</span>
          </Link>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-ink/60 hover:text-ink rounded-lg hover:bg-ink/5"
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
          <nav className="hidden md:flex items-center gap-1 text-sm">
            <NavLinks user={user} isAdmin={isAdmin} />
            <div className="w-px h-5 bg-ink/20 mx-2" />
            {user ? (
              <div className="flex items-center gap-3">
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
          <nav className="md:hidden border-t border-ink/10 px-4 py-4 flex flex-col gap-1 text-sm bg-cream">
            <NavLinks user={user} isAdmin={isAdmin} onClick={() => setMenuOpen(false)} mobile />
            <div className="h-px bg-ink/10 my-2" />
            {user ? (
              <>
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
  return (
    <>
      <Link to="/schedule" className={base} onClick={onClick}>Schedule</Link>
      {features.blog && <Link to="/blog" className={base} onClick={onClick}>Blog</Link>}
      {features.resources && <Link to="/resources" className={base} onClick={onClick}>Resources</Link>}
      <Link to="/about" className={base} onClick={onClick}>About</Link>
      <Link to="/contact" className={base} onClick={onClick}>Contact</Link>
      {user && (
        <>
          {mobile && <div className="h-px bg-gray-100 my-1" />}
          {!mobile && <div className="w-px h-5 bg-ink/20 mx-1" />}
          <Link to="/dashboard" className={base} onClick={onClick}>Dashboard</Link>
          <Link to="/my-children" className={base} onClick={onClick}>My Children</Link>
          <Link to="/my-rsvps" className={base} onClick={onClick}>My RSVPs</Link>
          {features.member_directory && <Link to="/members" className={base} onClick={onClick}>Members</Link>}
          {features.lesson_plans && <Link to="/lesson-plans" className={base} onClick={onClick}>Lessons</Link>}
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
