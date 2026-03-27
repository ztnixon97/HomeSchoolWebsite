import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { ServerPagination } from '../../components/Pagination';

interface Session {
  id: number;
  title: string;
  theme: string | null;
  session_date: string;
  end_date?: string | null;
  start_time: string | null;
  end_time: string | null;
  host_id: number | null;
  host_name: string | null;
  status: string;
  session_type_name: string | null;
  session_type_label: string | null;
  rsvp_cutoff: string | null;
  session_type_id?: number | null;
  location_name?: string | null;
  location_address?: string | null;
  cost_amount?: number | null;
  cost_details?: string | null;
}

interface SessionType {
  id: number;
  name: string;
  label: string;
  multi_day: boolean;
  hostable: boolean;
  rsvpable: boolean;
  requires_location: boolean;
  supports_cost: boolean;
  cost_label: string | null;
  description?: string | null;
}

export default function ClassSessions() {
  const { user } = useAuth();
  const [view, setView] = useState<'list' | 'calendar'>('calendar');
  const [showCreate, setShowCreate] = useState(false);
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [sessionTypeId, setSessionTypeId] = useState('');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costDetails, setCostDetails] = useState('');
  const [maxStudents, setMaxStudents] = useState('');
  const [notes, setNotes] = useState('');
  const [rsvpCutoff, setRsvpCutoff] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const PAGE_SIZE = 12;

  // Load all sessions for calendar view
  useEffect(() => {
    api.get<SessionType[]>('/api/session-types').then(setSessionTypes).catch(() => {});
  }, []);

  // Load paginated sessions for list view
  const [listSessions, setListSessions] = useState<Session[]>([]);
  useEffect(() => {
    if (view !== 'list') return;
    const params = new URLSearchParams();
    params.set('page', String(listPage));
    params.set('page_size', String(PAGE_SIZE));
    if (search) params.set('q', search);
    if (statusFilter) params.set('status', statusFilter);
    api.get<{ items: Session[]; total: number }>(`/api/sessions?${params}`).then(res => {
      setListSessions(res.items);
      setListTotal(res.total);
    }).catch(() => {});
  }, [view, listPage, search, statusFilter]);

  // Reset page when filters change
  useEffect(() => { setListPage(1); }, [search, statusFilter]);

  const today = new Date().toISOString().slice(0, 10);

  const sessionTypeMap = new Map(sessionTypes.map(t => [t.id, t]));
  const statusBadge = (s: Session) => {
    if (s.session_type_name === 'holiday') {
      return <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">Holiday</span>;
    }
    if (s.status === 'open') return <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">Unclaimed</span>;
    if (s.status === 'claimed') return <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">Hosted by {s.host_name}</span>;
    if (s.status === 'completed') return <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">Completed</span>;
    if (s.status === 'closed') return <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">Full</span>;
    return <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">{s.status}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Class Sessions</h1>
          <p className="text-gray-500 text-sm mt-1">View and sign up for upcoming co-op sessions.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          {user && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800"
            >
              {showCreate ? 'Cancel' : 'Create Session'}
            </button>
          )}
          {user && <CalendarSubscribeButton />}
          <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            List
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'calendar' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Calendar
          </button>
          </div>
        </div>
      </div>

      {showCreate && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            try {
              await api.post('/api/sessions', {
                title,
                theme: theme || null,
                session_type_id: sessionTypeId ? parseInt(sessionTypeId) : null,
                session_date: date,
                end_date: endDate || null,
                start_time: startTime || null,
                end_time: endTime || null,
                location_name: locationName || null,
                location_address: locationAddress || null,
                cost_amount: costAmount ? parseFloat(costAmount) : null,
                cost_details: costDetails || null,
                max_students: maxStudents ? parseInt(maxStudents) : null,
                notes: notes || null,
                rsvp_cutoff: rsvpCutoff || null,
              });
              setTitle('');
              setTheme('');
              setSessionTypeId('');
              setDate('');
              setEndDate('');
              setStartTime('');
              setEndTime('');
              setLocationName('');
              setLocationAddress('');
              setCostAmount('');
              setCostDetails('');
              setMaxStudents('');
              setNotes('');
              setRsvpCutoff('');
              setShowCreate(false);
              const data = await api.get<Session[]>('/api/sessions');
              setSessions(data);
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Failed to create session';
              setError(message);
            }
          }}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3"
        >
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Topic</label>
              <input type="text" value={theme} onChange={e => setTheme(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Session Type</label>
              <select value={sessionTypeId} onChange={e => setSessionTypeId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                <option value="">Select...</option>
                {sessionTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
          </div>
          {sessionTypeId && sessionTypeMap.get(parseInt(sessionTypeId))?.multi_day && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
          </div>
          {sessionTypeId && sessionTypeMap.get(parseInt(sessionTypeId))?.requires_location && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Location Name</label>
                <input type="text" value={locationName} onChange={e => setLocationName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Location Address</label>
                <input type="text" value={locationAddress} onChange={e => setLocationAddress(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
            </div>
          )}
          {sessionTypeId && sessionTypeMap.get(parseInt(sessionTypeId))?.supports_cost && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{sessionTypeMap.get(parseInt(sessionTypeId))?.cost_label || 'Cost'}</label>
                <input type="number" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cost Notes</label>
                <input type="text" value={costDetails} onChange={e => setCostDetails(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max Students</label>
              <input type="number" value={maxStudents} onChange={e => setMaxStudents(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">RSVP Cutoff</label>
              <input type="datetime-local" value={rsvpCutoff} onChange={e => setRsvpCutoff(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
          <button type="submit" className="bg-gray-900 text-white px-4 py-2 rounded text-sm hover:bg-gray-800">Create</button>
        </form>
      )}

      {view === 'list' ? (
        <div className="space-y-6">
          {/* Search and filter */}
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search sessions..."
              className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">All Status</option>
              <option value="open">Unclaimed</option>
              <option value="claimed">Hosted</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="space-y-3">
            {listSessions.map(s => (
              <Link
                key={s.id}
                to={`/sessions/${s.id}`}
                className={`block bg-white rounded-xl border shadow-sm p-5 hover:shadow-md transition-all no-underline ${
                  s.status === 'open' ? 'border-amber-200 hover:border-amber-300' : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{s.title}</h3>
                  {statusBadge(s)}
                </div>
                <div className="text-sm text-gray-500">
                  {new Date(s.session_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                  {s.end_date && s.end_date !== s.session_date && ` - ${new Date(s.end_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`}
                  {s.start_time && ` at ${s.start_time}`}
                  {s.end_time && ` - ${s.end_time}`}
                </div>
                {s.theme && (
                  <div className="mt-2">
                    <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{s.theme}</span>
                  </div>
                )}
                {s.session_type_label && s.session_type_name !== 'holiday' && (
                  <div className="mt-2">
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{s.session_type_label}</span>
                  </div>
                )}
                {s.status === 'open' && user && s.session_type_name !== 'holiday' && (
                  <div className="text-xs text-emerald-700 mt-2 font-medium">Sign up to host this session &rarr;</div>
                )}
              </Link>
            ))}
            {listSessions.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">{search || statusFilter ? 'No sessions match your filters.' : 'No class sessions scheduled yet.'}</p>
              </div>
            )}
          </div>
          <ServerPagination page={listPage} pageSize={PAGE_SIZE} total={listTotal} onPageChange={setListPage} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-6">
          <CalendarView />
        </div>
      )}
    </div>
  );
}

function CalendarSubscribeButton() {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const getUrl = async () => {
    if (url) {
      // Copy to clipboard
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    const res = await api.get<{ token: string }>('/api/my-calendar-url');
    const fullUrl = `${window.location.origin}/api/calendar/${res.token}`;
    setUrl(fullUrl);
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <button
        onClick={getUrl}
        className="px-3 py-1.5 rounded-md text-sm font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-200 hover:bg-emerald-50 transition-colors"
        title="Get a URL to subscribe in Google Calendar, Apple Calendar, or Outlook"
      >
        {copied ? 'URL Copied!' : url ? 'Copy Calendar URL' : 'Subscribe to Calendar'}
      </button>
      {url && (
        <div className="absolute top-full mt-2 right-0 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-10 w-80">
          <p className="text-xs text-gray-500 mb-2">Paste this URL into Google Calendar ("Add by URL") or Apple Calendar ("Subscribe"):</p>
          <input
            readOnly
            value={url}
            onClick={e => (e.target as HTMLInputElement).select()}
            className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded bg-gray-50 font-mono"
          />
        </div>
      )}
    </div>
  );
}

function CalendarView() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [sessions, setSessions] = useState<Session[]>([]);

  // Load sessions for current month +/- 1 month buffer
  useEffect(() => {
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month + 2, 0);
    const dateFrom = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`;
    const dateTo = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`;
    api.get<Session[] | { items: Session[] }>(`/api/sessions?date_from=${dateFrom}&date_to=${dateTo}`).then(res => {
      setSessions(Array.isArray(res) ? res : res.items);
    }).catch(() => {});
  }, [year, month]);

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

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <button onClick={prev} className="px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-ink/5 rounded-lg transition-colors">&larr; Prev</button>
          <button onClick={next} className="px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-ink/5 rounded-lg transition-colors">Next &rarr;</button>
        </div>
        <h3 className="text-lg font-semibold text-ink">{monthName}</h3>
        <button onClick={goToday} className="px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-ink/5 rounded-lg transition-colors">Today</button>
      </div>
      <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-ink/50 uppercase tracking-wider mb-2">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px bg-ink/5 rounded-lg overflow-hidden">
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
                        to={`/sessions/${s.id}`}
                        className={`block text-xs px-2 py-1 rounded truncate no-underline font-medium transition-all hover:shadow-sm ${
                          s.session_type_name === 'holiday'
                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                            : s.status === 'open'
                            ? 'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                            : s.status === 'claimed'
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-ink/5 text-ink/70 hover:bg-ink/10'
                        }`}
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
  );
}
