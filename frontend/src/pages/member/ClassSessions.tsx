import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useFeatures } from '../../features';
import { ServerPagination } from '../../components/Pagination';

interface ClassGroup {
  id: number;
  name: string;
}

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
  const features = useFeatures();
  const [view, setView] = useState<'list' | 'calendar' | 'week'>('calendar');
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState('');
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
  const [showPast, setShowPast] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const PAGE_SIZE = 12;

  // Load all sessions for calendar view
  useEffect(() => {
    api.get<SessionType[]>('/api/session-types').then(setSessionTypes).catch(() => {});
    if (features.class_groups) {
      api.get<ClassGroup[]>('/api/class-groups').then(setClassGroups).catch(() => {});
    }
  }, [features.class_groups]);

  // Load paginated sessions for list view
  const [listSessions, setListSessions] = useState<Session[]>([]);
  useEffect(() => {
    if (view !== 'list') return;
    const params = new URLSearchParams();
    params.set('page', String(listPage));
    params.set('page_size', String(PAGE_SIZE));
    if (!showPast) params.set('date_from', new Date().toISOString().split('T')[0]);
    if (search) params.set('q', search);
    if (statusFilter) params.set('status', statusFilter);
    if (groupFilter) params.set('class_group_id', groupFilter);
    api.get<{ items: Session[]; total: number }>(`/api/sessions?${params}`).then(res => {
      setListSessions(res.items);
      setListTotal(res.total);
    }).catch(() => {});
  }, [view, listPage, search, statusFilter, groupFilter, showPast]);

  // Reset page when filters change
  useEffect(() => { setListPage(1); }, [search, statusFilter, groupFilter, showPast]);

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
          <h1 className="text-2xl font-bold text-ink">Class Sessions</h1>
          <p className="text-ink/60 text-sm mt-1">View and sign up for upcoming co-op sessions.</p>
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
          {(['calendar', 'week', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${view === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {v === 'calendar' ? 'Month' : v}
            </button>
          ))}
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
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Topic</label>
              <input type="text" value={theme} onChange={e => setTheme(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Session Type</label>
              <select value={sessionTypeId} onChange={e => setSessionTypeId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors">
                <option value="">Select...</option>
                {sessionTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors" />
            </div>
          </div>
          {sessionTypeId && sessionTypeMap.get(parseInt(sessionTypeId))?.multi_day && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors" />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors" />
            </div>
          </div>
          {sessionTypeId && sessionTypeMap.get(parseInt(sessionTypeId))?.requires_location && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Location Name</label>
                <input type="text" value={locationName} onChange={e => setLocationName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Location Address</label>
                <input type="text" value={locationAddress} onChange={e => setLocationAddress(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors" />
              </div>
            </div>
          )}
          {sessionTypeId && sessionTypeMap.get(parseInt(sessionTypeId))?.supports_cost && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{sessionTypeMap.get(parseInt(sessionTypeId))?.cost_label || 'Cost'}</label>
                <input type="number" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cost Notes</label>
                <input type="text" value={costDetails} onChange={e => setCostDetails(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max Students</label>
              <input type="number" value={maxStudents} onChange={e => setMaxStudents(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">RSVP Cutoff</label>
              <input type="datetime-local" value={rsvpCutoff} onChange={e => setRsvpCutoff(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors" />
          </div>
          <button type="submit" className="bg-emerald-700 text-white px-4 py-2 rounded text-sm hover:bg-emerald-800">Create</button>
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
              className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            >
              <option value="">All Status</option>
              <option value="open">Unclaimed</option>
              <option value="claimed">Hosted</option>
              <option value="completed">Completed</option>
            </select>
            {features.class_groups && classGroups.length > 0 && (
              <select
                value={groupFilter}
                onChange={e => setGroupFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              >
                <option value="">All Classes</option>
                {classGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
              <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-emerald-600" />
              Show past sessions
            </label>
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
                <p className="text-ink/40">{search || statusFilter ? 'No sessions match your filters.' : 'No class sessions scheduled yet.'}</p>
              </div>
            )}
          </div>
          <ServerPagination page={listPage} pageSize={PAGE_SIZE} total={listTotal} onPageChange={setListPage} />
        </div>
      ) : view === 'week' ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-6">
          <WeekView />
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

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <button onClick={prev} className="p-2 text-ink/50 hover:text-ink hover:bg-ink/5 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="text-sm font-semibold text-ink bg-transparent border-none cursor-pointer focus:outline-none">
            {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="text-sm font-semibold text-ink bg-transparent border-none cursor-pointer focus:outline-none">
            {Array.from({ length: 5 }, (_, i) => currentYear - 1 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {(month !== currentMonth || year !== currentYear) && (
            <button onClick={goToday} className="ml-2 text-xs text-emerald-700 hover:text-emerald-800 font-medium">Today</button>
          )}
        </div>
        <button onClick={next} className="p-2 text-ink/50 hover:text-ink hover:bg-ink/5 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="overflow-x-auto">
      <div className="min-w-[350px] grid grid-cols-7 gap-px text-center text-xs font-medium text-ink/50 uppercase tracking-wider mb-2">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="min-w-[350px] grid grid-cols-7 gap-px bg-ink/5 rounded-lg overflow-hidden">
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
    </div>
  );
}

function WeekView() {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay()); // Start on Sunday
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });
  const [sessions, setSessions] = useState<Session[]>([]);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const dateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const weekEnd = weekDays[6];

  useEffect(() => {
    const from = dateStr(weekStart);
    const to = dateStr(weekEnd);
    api.get<Session[] | { items: Session[] }>(`/api/sessions?date_from=${from}&date_to=${to}`).then(res => {
      setSessions(Array.isArray(res) ? res : res.items);
    }).catch(() => {});
  }, [weekStart]);

  const prevWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  const goThisWeek = () => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    setWeekStart(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
  };

  const today = new Date();
  const todayString = dateStr(today);

  const hours = Array.from({ length: 13 }, (_, i) => i + 7); // 7am to 7pm

  const sessionsOnDay = (d: Date) => {
    const ds = dateStr(d);
    return sessions.filter(s => {
      const start = s.session_date;
      const end = s.end_date || start;
      return ds >= start && ds <= end;
    });
  };

  const parseTime = (t: string | null): number | null => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h + (m || 0) / 60;
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <button onClick={prevWeek} className="p-2 text-ink/50 hover:text-ink hover:bg-ink/5 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">
            {weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — {weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={goThisWeek} className="ml-2 text-xs text-emerald-700 hover:text-emerald-800 font-medium">This Week</button>
        </div>
        <button onClick={nextWeek} className="p-2 text-ink/50 hover:text-ink hover:bg-ink/5 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Day headers */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-px mb-1">
            <div />
            {weekDays.map(d => {
              const isToday = dateStr(d) === todayString;
              return (
                <div key={d.toISOString()} className={`text-center py-2 text-xs font-medium ${isToday ? 'text-emerald-700' : 'text-ink/50'}`}>
                  <div className="uppercase tracking-wider">{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                  <div className={`text-lg font-semibold mt-0.5 ${isToday ? 'bg-emerald-600 text-white w-8 h-8 rounded-full flex items-center justify-center mx-auto' : 'text-ink/70'}`}>
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-px bg-ink/5 rounded-lg overflow-hidden">
            {hours.map(hour => (
              <div key={hour} className="contents">
                <div className="bg-white py-3 px-2 text-right text-xs text-ink/40 font-medium border-b border-ink/5">
                  {hour > 12 ? `${hour - 12}pm` : hour === 12 ? '12pm' : `${hour}am`}
                </div>
                {weekDays.map(d => {
                  const daySessions = sessionsOnDay(d).filter(s => {
                    const st = parseTime(s.start_time);
                    return st !== null && Math.floor(st) === hour;
                  });
                  return (
                    <div key={`${d.toISOString()}-${hour}`} className="bg-white min-h-[48px] p-1 border-b border-ink/5 relative">
                      {daySessions.map(s => (
                        <Link
                          key={s.id}
                          to={`/sessions/${s.id}`}
                          className={`block text-xs px-2 py-1.5 rounded font-medium truncate no-underline mb-1 ${
                            s.session_type_name === 'holiday'
                              ? 'bg-amber-100 text-amber-800'
                              : s.status === 'open'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : s.status === 'claimed'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                          title={`${s.title}${s.start_time ? ' at ' + s.start_time : ''}${s.end_time ? ' - ' + s.end_time : ''}`}
                        >
                          {s.start_time && <span className="font-bold">{s.start_time} </span>}
                          {s.title}
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
            {/* All-day events row */}
            <div className="contents">
              <div className="bg-ink/3 py-2 px-2 text-right text-xs text-ink/40 font-medium">All day</div>
              {weekDays.map(d => {
                const allDay = sessionsOnDay(d).filter(s => !s.start_time);
                return (
                  <div key={`allday-${d.toISOString()}`} className="bg-ink/3 min-h-[36px] p-1">
                    {allDay.map(s => (
                      <Link
                        key={s.id}
                        to={`/sessions/${s.id}`}
                        className="block text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 font-medium truncate no-underline mb-1"
                      >
                        {s.title}
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
