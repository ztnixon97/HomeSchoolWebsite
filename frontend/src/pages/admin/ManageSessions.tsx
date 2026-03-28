import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/Toast';
import { useFeatures } from '../../features';

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
  session_type_label: string | null;
  session_type_name: string | null;
  rsvp_cutoff: string | null;
  location_name?: string | null;
  location_address?: string | null;
  cost_amount?: number | null;
  cost_details?: string | null;
}

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

interface ClassGroup {
  id: number;
  name: string;
}

export default function ManageSessions() {
  const { showToast } = useToast();
  const features = useFeatures();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState('');
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
  const [sessionTypeId, setSessionTypeId] = useState('');
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const sessionTypeMap = new Map(sessionTypes.map(t => [t.id, t]));
  const holidayType = sessionTypes.find(t => t.name === 'holiday');

  const [holidayTitle, setHolidayTitle] = useState('');
  const [holidayStart, setHolidayStart] = useState('');
  const [holidayEnd, setHolidayEnd] = useState('');
  const [holidayNotes, setHolidayNotes] = useState('');

  const refresh = () => {
    api.get<Session[]>('/api/sessions').then(setSessions).catch(() => {});
    api.get<SessionType[]>('/api/session-types').then(setSessionTypes).catch(() => {});
    if (features.class_groups) {
      api.get<ClassGroup[]>('/api/admin/class-groups').then(setClassGroups).catch(() => {});
    }
  };

  useEffect(refresh, []);

  const clearForm = () => {
    setTitle('');
    setTheme('');
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
    setSessionTypeId('');
    setSelectedGroupIds([]);
  };

  const startEdit = (s: Session) => {
    setEditingId(s.id);
    setTitle(s.title);
    setTheme(s.theme || '');
    setDate(s.session_date);
    setEndDate(s.end_date || '');
    setStartTime(s.start_time || '');
    setEndTime(s.end_time || '');
    setLocationName(s.location_name || '');
    setLocationAddress(s.location_address || '');
    setCostAmount(s.cost_amount != null ? String(s.cost_amount) : '');
    setCostDetails(s.cost_details || '');
    setMaxStudents(s.max_students != null ? String(s.max_students) : '');
    setNotes('');
    setRsvpCutoff(s.rsvp_cutoff || '');
    const matchedType = sessionTypes.find(t => t.label === s.session_type_label || t.name === s.session_type_name);
    setSessionTypeId(matchedType ? String(matchedType.id) : '');
    setShowForm(true);
    setShowHolidayForm(false);
  };

  const addSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      title,
      theme: theme || null,
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
      session_type_id: sessionTypeId ? parseInt(sessionTypeId) : null,
      class_group_ids: features.class_groups && selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    };
    try {
      if (editingId) {
        await api.put(`/api/admin/sessions/${editingId}`, payload);
        showToast('Session updated', 'success');
      } else {
        await api.post('/api/admin/sessions', payload);
        showToast('Session created', 'success');
      }
      clearForm();
      setEditingId(null);
      setShowForm(false);
      refresh();
    } catch (err: any) {
      setError(err.message || (editingId ? 'Failed to update session' : 'Failed to create session'));
    }
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowHolidayForm(false);
              if (showForm) { clearForm(); setEditingId(null); }
              setShowForm(!showForm);
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
        <form onSubmit={addSession} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          {error && <div className="text-red-700 text-sm bg-red-50 border border-red-100 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. Tuesday Class" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Weekly Theme</label>
              <input type="text" value={theme} onChange={e => setTheme(e.target.value)} placeholder="e.g. Ocean Animals" className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Session Type</label>
            <select value={sessionTypeId} onChange={e => setSessionTypeId(e.target.value)} className={inputClass}>
              <option value="">Select...</option>
              {sessionTypes.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          {sessionTypeId && sessionTypeMap.get(parseInt(sessionTypeId))?.multi_day && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputClass} />
            </div>
          )}
          {sessionTypeId && sessionTypeMap.get(parseInt(sessionTypeId))?.requires_location && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Location Name</label>
                <input type="text" value={locationName} onChange={e => setLocationName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Location Address</label>
                <input type="text" value={locationAddress} onChange={e => setLocationAddress(e.target.value)} className={inputClass} />
              </div>
            </div>
          )}
          {sessionTypeId && sessionTypeMap.get(parseInt(sessionTypeId))?.supports_cost && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{sessionTypeMap.get(parseInt(sessionTypeId))?.cost_label || 'Cost'}</label>
                <input type="number" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Cost Notes</label>
                <input type="text" value={costDetails} onChange={e => setCostDetails(e.target.value)} className={inputClass} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Students</label>
              <input type="number" value={maxStudents} onChange={e => setMaxStudents(e.target.value)} placeholder="Optional" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">RSVP Cutoff</label>
            <input type="datetime-local" value={rsvpCutoff} onChange={e => setRsvpCutoff(e.target.value)} className={inputClass} />
          </div>
          {features.class_groups && classGroups.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Class Groups</label>
              <div className="flex flex-wrap gap-2">
                {classGroups.map(g => (
                  <label key={g.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.includes(g.id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedGroupIds(prev => [...prev, g.id]);
                        else setSelectedGroupIds(prev => prev.filter(id => id !== g.id));
                      }}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    {g.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Sessions with no groups are open to all students.</p>
            </div>
          )}
          <button type="submit" className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors">
            {editingId ? 'Update Session' : 'Create Session'}
          </button>
        </form>
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
            <option key={t.id} value={t.name}>{t.label}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputClass}>
          <option value="">All Status</option>
          <option value="open">Open (Needs Host)</option>
          <option value="claimed">Claimed</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="space-y-3">
        {sessions.filter(s => {
          const matchesSearch = !search ||
            s.title.toLowerCase().includes(search.toLowerCase()) ||
            (s.theme && s.theme.toLowerCase().includes(search.toLowerCase())) ||
            (s.host_name && s.host_name.toLowerCase().includes(search.toLowerCase()));
          const matchesType = !typeFilter || s.session_type_name === typeFilter;
          const matchesStatus = !statusFilter || s.status === statusFilter;
          return matchesSearch && matchesType && matchesStatus;
        }).map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-sm text-gray-900">{s.title}</h3>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  s.status === 'open'
                    ? 'bg-amber-100 text-amber-800'
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
              {s.host_name && <span className="ml-2 text-gray-400">Host: {s.host_name}</span>}
            </div>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-ink/40">No sessions created yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
