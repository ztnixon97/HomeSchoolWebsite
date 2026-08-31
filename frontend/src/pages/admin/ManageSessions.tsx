import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import SessionEditor from '../../components/SessionEditor';
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
  max_students: number | null;
  status: string;
  session_type_id?: number | null;
  session_type_label: string | null;
  session_type_name: string | null;
  rsvp_cutoff: string | null;
  location_name?: string | null;
  location_address?: string | null;
  cost_amount?: number | null;
  cost_details?: string | null;
}

const PAGE_SIZE = 20;

interface SessionType {
  id: number;
  name: string;
  label: string;
  sort_order: number;
  active: boolean;
  multi_day: boolean;
  requires_location: boolean;
  supports_cost: boolean;
  cost_label: string | null;
}

export default function ManageSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const holidayType = sessionTypes.find(t => t.name === 'holiday');

  const [holidayTitle, setHolidayTitle] = useState('');
  const [holidayStart, setHolidayStart] = useState('');
  const [holidayEnd, setHolidayEnd] = useState('');
  const [holidayNotes, setHolidayNotes] = useState('');

  const refresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    api.get<SessionType[]>('/api/session-types').then(setSessionTypes).catch(() => {});
  }, []);

  useEffect(() => {
    let ignore = false; // guard against an out-of-order (stale) response overwriting newer data
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    params.set('sort', 'date_desc');
    if (!showPast) params.set('date_from', new Date().toISOString().split('T')[0]);
    if (search) params.set('q', search);
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('session_type_id', typeFilter);
    api.get<{ items: Session[]; total: number }>(`/api/sessions?${params}`).then(res => {
      if (ignore) return;
      setSessions(res.items);
      setTotal(res.total);
    }).catch(() => {});
    return () => { ignore = true; };
  }, [page, search, statusFilter, typeFilter, showPast, refreshKey]);

  // Reset to page 1 whenever a filter changes
  useEffect(() => { setPage(1); }, [search, statusFilter, typeFilter, showPast]);

  const startEdit = (s: Session) => {
    setEditingId(s.id);
    setShowForm(true);
    setShowHolidayForm(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!holidayType) {
      setError('Holiday session type is missing. Create a holiday session type first.');
      return;
    }
    try {
      await api.post('/api/admin/sessions', {
        title: holidayTitle,
        theme: null,
        session_date: holidayStart,
        end_date: holidayEnd || holidayStart,
        start_time: null,
        end_time: null,
        max_students: null,
        notes: holidayNotes || null,
        rsvp_cutoff: null,
        session_type_id: holidayType.id,
      });
      setHolidayTitle('');
      setHolidayStart('');
      setHolidayEnd('');
      setHolidayNotes('');
      setShowHolidayForm(false);
      refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to create holiday');
    }
  };

  const deleteSession = async (id: number) => {
    if (!confirm('Are you sure you want to delete this?')) return;
    await api.del(`/api/admin/sessions/${id}`);
    refresh();
  };

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors";

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium mb-4 inline-block">
        ← Admin Dashboard
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Manage Sessions</h1>
          <p className="text-ink/60 text-sm mt-1">Create class sessions for parents to host.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setShowHolidayForm(false);
              if (showForm) {
                setShowForm(false);
              } else {
                setEditingId(null);
                setShowForm(true);
              }
            }}
            className="bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors"
          >
            {showForm ? 'Cancel' : 'Create Session'}
          </button>
          <button
            onClick={() => {
              setShowForm(false);
              setShowHolidayForm(!showHolidayForm);
            }}
            className="bg-amber-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
          >
            {showHolidayForm ? 'Cancel Holiday' : 'Add Holiday'}
          </button>
        </div>
      </div>

      {showForm && (
        <SessionEditor
          key={editingId ?? 'new'}
          editSessionId={editingId ?? undefined}
          isAdmin
          onSaved={() => { setShowForm(false); setEditingId(null); refresh(); }}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      {showHolidayForm && (
        <form onSubmit={addHoliday} className="bg-white rounded-xl border border-amber-100 shadow-sm p-6 space-y-4">
          {error && <div className="text-red-700 text-sm bg-red-50 border border-red-100 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Holiday Title</label>
              <input type="text" value={holidayTitle} onChange={e => setHolidayTitle(e.target.value)} required placeholder="e.g. Spring Break" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Date</label>
              <input type="date" value={holidayStart} onChange={e => setHolidayStart(e.target.value)} required className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">End Date</label>
              <input type="date" value={holidayEnd} onChange={e => setHolidayEnd(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <input type="text" value={holidayNotes} onChange={e => setHolidayNotes(e.target.value)} placeholder="Optional notes" className={inputClass} />
            </div>
          </div>
          <button type="submit" className="bg-amber-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors">
            Create Holiday
          </button>
        </form>
      )}

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title, theme, or host..."
          className={`flex-1 min-w-[200px] ${inputClass}`}
        />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={inputClass}>
          <option value="">All Types</option>
          {sessionTypes.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputClass}>
          <option value="">All Status</option>
          <option value="open">Open (Needs Host)</option>
          <option value="claimed">Claimed</option>
          <option value="completed">Completed</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
          <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-emerald-600" />
          Show past sessions
        </label>
      </div>

      <div className="space-y-3">
        {sessions.map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-sm text-gray-900">{s.title}</h3>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  s.status === 'open' ? 'bg-amber-100 text-amber-800'
                    : s.status === 'completed' ? 'bg-blue-100 text-blue-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {s.status}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => startEdit(s)} className="text-xs text-blue-500 hover:text-blue-700 font-medium py-2 px-3 rounded-lg">Edit</button>
                <button onClick={() => deleteSession(s.id)} className="text-xs text-red-500 hover:text-red-700 font-medium py-2 px-3 rounded-lg">Delete</button>
              </div>
            </div>
            <div className="text-xs text-gray-500">
              {new Date(s.session_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              {s.end_date && s.end_date !== s.session_date && ` - ${new Date(s.end_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
              {s.start_time && ` at ${s.start_time}`}
              {s.theme && (
                <span className="ml-2 inline-block bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-xs">{s.theme}</span>
              )}
              {s.session_type_label && (
                <span className="ml-2 inline-block bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-xs">{s.session_type_label}</span>
              )}
              {s.host_name && (
                <span className="ml-2 text-gray-400">
                  Host: {s.host_name}
                  {!s.host_id && <span className="ml-1 text-amber-600">(unlinked)</span>}
                </span>
              )}
            </div>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-ink/40">
              {search || typeFilter || statusFilter ? 'No sessions match your filters.' : 'No sessions created yet.'}
            </p>
          </div>
        )}
      </div>
      <ServerPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
