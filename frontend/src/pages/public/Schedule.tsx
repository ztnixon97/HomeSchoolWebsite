import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import ClassSessions from '../member/ClassSessions';

interface Session {
  id: number;
  title: string;
  theme?: string | null;
  session_date: string;
  end_date?: string | null;
  start_time: string | null;
  end_time: string | null;
  host_name?: string | null;
  session_type_name: string | null;
  session_type_label: string | null;
  status: string;
}

export default function Schedule() {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<Session[]>([]);
  const isMobile = window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(display-mode: standalone)').matches;
  const [view, setView] = useState<'calendar' | 'list'>(isMobile ? 'list' : 'calendar');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());

  useEffect(() => {
    api.get<Session[]>('/api/sessions/public').then(setSessions).catch(() => {});
  }, []);

  if (user) {
    return <ClassSessions />;
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthName = new Date(year, month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const goToday = () => { setYear(currentYear); setMonth(currentMonth); };

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const dateStr = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const sessionsOnDay = (d: number) => {
    const current = new Date(dateStr(d) + 'T00:00:00');
    return sessions.filter(s => {
      const start = new Date(s.session_date + 'T00:00:00');
      const end = s.end_date ? new Date(s.end_date + 'T00:00:00') : start;
      return current >= start && current <= end;
    });
  };

  const todayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const isToday = (d: number) => dateStr(d) === todayStr;

  // For list view - sorted upcoming sessions
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const upcomingSessions = sessions
    .filter(s => {
      const start = new Date(s.session_date + 'T00:00:00');
      const end = s.end_date ? new Date(s.end_date + 'T00:00:00') : start;
      return end >= monthStart && start <= monthEnd;
    })
    .sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime());

  const statusBadge = (s: Session) => {
    if (s.session_type_name === 'holiday') {
      return <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">Holiday</span>;
    }
    if (s.status === 'open') return <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">Open</span>;
    if (s.status === 'claimed') return <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">Scheduled</span>;
    if (s.status === 'closed') return <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">Full</span>;
    return null;
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="-mx-4 -mt-6 px-4 py-12 section-slab">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex justify-center mb-3">
            <div className="china-crest" />
          </div>
          <h1 className="text-4xl font-bold text-ink mb-3">Schedule</h1>
          <div className="accent-rule mx-auto mb-4" />
          <p className="text-ink/70 text-lg">View upcoming classes, field trips, and important dates.</p>
        </div>
      </section>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
          <button
            onClick={prev}
            className="btn-ghost text-sm"
          >
            &larr; Prev
          </button>
          <h2 className="text-lg font-semibold text-ink">{monthName}</h2>
          <button
            onClick={next}
            className="btn-ghost text-sm"
          >
            Next &rarr;
          </button>
          <button
            onClick={goToday}
            className="btn-ghost text-sm"
          >
            Today
          </button>
        </div>
        <div className="flex gap-1 bg-ink/5 p-1 rounded-lg">
          <button
            onClick={() => setView('calendar')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'calendar' ? 'bg-white shadow-sm text-ink' : 'text-ink/60 hover:text-ink'
            }`}
          >
            Calendar
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'list' ? 'bg-white shadow-sm text-ink' : 'text-ink/60 hover:text-ink'
            }`}
          >
            List
          </button>
        </div>
      </div>

      {/* Content */}
      {view === 'calendar' ? (
        <div className="panel p-4 md:p-6 mx-4 sm:mx-6">
          <div className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-ink/50 uppercase tracking-wider mb-3 min-w-[500px]">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px bg-ink/5 rounded-lg overflow-hidden min-w-[500px]">
            {days.map((d, i) => {
              const daySessionCount = d ? sessionsOnDay(d).length : 0;
              const hasSessions = daySessionCount > 0;
              return (
                <div key={i} className={`md:min-h-[100px] min-h-[60px] p-2 md:p-3 ${d ? 'bg-white' : 'bg-ink/3'}`}>
                  {d && (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <div className={`text-xs font-semibold ${isToday(d) ? 'bg-cobalt text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-ink/60'}`}>
                          {d}
                        </div>
                        {hasSessions && <div className="w-1.5 h-1.5 rounded-full bg-cobalt" title={`${daySessionCount} session${daySessionCount !== 1 ? 's' : ''}`} />}
                      </div>
                      <div className="space-y-1">
                        {sessionsOnDay(d).slice(0, 3).map(s => (
                          <Link
                            key={s.id}
                            to="/login"
                            onClick={e => e.preventDefault()}
                            className={`block text-xs px-2 py-1 rounded truncate no-underline font-medium transition-all ${
                              s.session_type_name === 'holiday'
                                ? 'bg-amber-100 text-amber-800'
                                : s.status === 'open'
                                ? 'border border-red-300 bg-red-50 text-red-700'
                                : s.status === 'claimed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-ink/5 text-ink/70'
                            } cursor-default`}
                            title={`${s.title}${s.start_time ? ' at ' + s.start_time : ''}`}
                          >
                            {s.start_time && <span className="font-semibold">{s.start_time} </span>}
                            <span className="truncate">{s.title}</span>
                          </Link>
                        ))}
                        {daySessionCount > 3 && (
                          <div className="text-xs text-ink/50 px-2 py-1">
                            +{daySessionCount - 3} more
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          </div>
          <div className="mt-6 p-4 bg-cobalt-soft rounded-lg border border-cobalt/20">
            <p className="text-sm text-ink">
              <Link to="/login" className="font-semibold text-cobalt hover:underline">Sign in</Link>
              {' '}to RSVP for sessions and stay updated with the schedule.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 sm:px-6 space-y-3 max-w-4xl mx-auto w-full">
          {upcomingSessions.length > 0 ? (
            upcomingSessions.map(s => (
              <div
                key={s.id}
                className="panel-quiet p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-ink mb-1">{s.title}</h3>
                  <div className="text-sm text-ink/70 mb-2">
                    {new Date(s.session_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                    {s.end_date && s.end_date !== s.session_date && ` - ${new Date(s.end_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`}
                    {s.start_time && ` at ${s.start_time}`}
                    {s.end_time && ` - ${s.end_time}`}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {statusBadge(s)}
                    {s.theme && (
                      <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                        {s.theme}
                      </span>
                    )}
                    {s.session_type_label && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        {s.session_type_label}
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  to="/login"
                  className="inline-block px-4 py-2 rounded-lg bg-cobalt text-white text-sm font-medium hover:bg-cobalt-dark transition-colors"
                >
                  Sign in
                </Link>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-ink/60">No sessions scheduled for {monthName}.</p>
            </div>
          )}
          <div className="mt-6 p-4 bg-cobalt-soft rounded-lg border border-cobalt/20">
            <p className="text-sm text-ink">
              <Link to="/login" className="font-semibold text-cobalt hover:underline">Sign in to your account</Link>
              {' '}to RSVP for sessions and manage your schedule.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
