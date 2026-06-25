import { useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from './Toast';
import { useFeatures } from '../features';

export interface EditableSession {
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
  session_type_label: string | null;
  session_type_name: string | null;
  rsvp_cutoff: string | null;
  max_students?: number | null;
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
  requires_location: boolean;
  supports_cost: boolean;
  cost_label: string | null;
}

interface ClassGroupOpt { id: number; name: string }

interface Props {
  /** Pass an existing session id to edit; omit to create. The full session is fetched. */
  editSessionId?: number;
  /** Pre-select and lock to a single class (used from a class page). */
  lockedClassGroupId?: number;
  /** Admin gets host assignment + status controls. */
  isAdmin?: boolean;
  onSaved: () => void;
  onCancel: () => void;
}

const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors";

const fmtDate = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

export default function SessionEditor({ editSessionId, lockedClassGroupId, isAdmin, onSaved, onCancel }: Props) {
  const { showToast } = useToast();
  const features = useFeatures();
  const editing = editSessionId != null;

  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroupOpt[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: number; display_name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(editSessionId != null);

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
  const [status, setStatus] = useState('open');
  const [assignHostId, setAssignHostId] = useState('');
  const [reserveHostName, setReserveHostName] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>(lockedClassGroupId ? [lockedClassGroupId] : []);
  const [repeat, setRepeat] = useState<'none' | 'weekly' | 'biweekly'>('none');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const types = await api.get<SessionType[]>('/api/session-types').catch(() => [] as SessionType[]);
      setSessionTypes(types);
      if (editSessionId != null) {
        // Fetch the full session so editing never clears fields the caller didn't have.
        const full = await api.get<EditableSession>(`/api/sessions/${editSessionId}`).catch(() => null);
        if (full) {
          setTitle(full.title || '');
          setTheme(full.theme || '');
          setDate(full.session_date || '');
          setEndDate(full.end_date || '');
          setStartTime(full.start_time || '');
          setEndTime(full.end_time || '');
          setLocationName(full.location_name || '');
          setLocationAddress(full.location_address || '');
          setCostAmount(full.cost_amount != null ? String(full.cost_amount) : '');
          setCostDetails(full.cost_details || '');
          setMaxStudents(full.max_students != null ? String(full.max_students) : '');
          setRsvpCutoff(full.rsvp_cutoff || '');
          setStatus(full.status || 'open');
          setAssignHostId(full.host_id != null ? String(full.host_id) : '');
          setReserveHostName(full.host_id == null && full.host_name ? full.host_name : '');
          const m = types.find(x => x.label === full.session_type_label || x.name === full.session_type_name);
          setSessionTypeId(m ? String(m.id) : '');
        }
        // Pre-load the session's current class assignment so the editor reflects it
        if (!lockedClassGroupId) {
          const cgs = await api.get<{ id: number }[]>(`/api/sessions/${editSessionId}/class-groups`).catch(() => [] as { id: number }[]);
          setSelectedGroupIds(cgs.map(c => c.id));
        }
        setLoading(false);
      } else {
        const cls = types.find(x => x.name === 'class');
        if (cls) setSessionTypeId(String(cls.id));
      }
    };
    load();
    if (features.class_groups && !lockedClassGroupId) {
      const url = isAdmin ? '/api/admin/class-groups' : '/api/class-groups';
      api.get<ClassGroupOpt[]>(url).then(setClassGroups).catch(() => {});
    }
    if (isAdmin && editSessionId != null) {
      api.get<{ items: { id: number; display_name: string; email: string }[] }>('/api/admin/users?page_size=200')
        .then(r => setAllUsers(r.items)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedType = sessionTypeId ? sessionTypes.find(t => t.id === parseInt(sessionTypeId)) : undefined;

  const basePayload = () => {
    // Class assignment is only editable where the selector is shown (admin / not class-locked).
    // When locked to a class page, leave an existing session's assignment untouched on edit.
    let class_group_ids: number[] | undefined;
    if (lockedClassGroupId) {
      class_group_ids = editing ? undefined : [lockedClassGroupId];
    } else if (features.class_groups) {
      class_group_ids = selectedGroupIds; // empty array on edit clears the assignment
    }
    return {
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
      class_group_ids,
    };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editing) {
        const payload: Record<string, unknown> = { ...basePayload() };
        if (isAdmin) {
          payload.status = status;
          if (assignHostId) payload.host_id = parseInt(assignHostId);
          else if (reserveHostName) payload.host_name = reserveHostName;
        }
        await api.put(`/api/sessions/${editSessionId}`, payload);
        showToast('Session updated', 'success');
      } else if (repeat === 'none') {
        await api.post('/api/sessions', basePayload());
        showToast('Session created', 'success');
      } else {
        const step = repeat === 'weekly' ? 7 : 14;
        const dates: string[] = [];
        const start = new Date(date + 'T00:00:00');
        const until = repeatUntil ? new Date(repeatUntil + 'T00:00:00') : start;
        for (let d = new Date(start); d <= until && dates.length < 60; d.setDate(d.getDate() + step)) {
          dates.push(fmtDate(d));
        }
        if (dates.length === 0) { setError('Check the repeat-until date.'); setSaving(false); return; }
        for (const sd of dates) {
          await api.post('/api/sessions', { ...basePayload(), session_date: sd });
        }
        showToast(`Created ${dates.length} sessions`, 'success');
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save session');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-sm text-ink/40">Loading session…</div>;
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
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
          {sessionTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
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

      {selectedType?.multi_day && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">End Date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputClass} />
        </div>
      )}

      {selectedType?.requires_location && (
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

      {selectedType?.supports_cost && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{selectedType.cost_label || 'Cost'}</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1.5">RSVP Cutoff</label>
          <input type="datetime-local" value={rsvpCutoff} onChange={e => setRsvpCutoff(e.target.value)} className={inputClass} />
        </div>
      </div>

      {!editing && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" className={inputClass} />
        </div>
      )}

      {isAdmin && editing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={inputClass}>
              <option value="open">Open</option>
              <option value="claimed">Claimed</option>
              <option value="completed">Completed</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign Host</label>
            <select value={assignHostId} onChange={e => { setAssignHostId(e.target.value); if (e.target.value) setReserveHostName(''); }} className={inputClass}>
              <option value="">— None —</option>
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.display_name} ({u.email})</option>)}
            </select>
            {!assignHostId && (
              <input type="text" value={reserveHostName} onChange={e => setReserveHostName(e.target.value)} placeholder="Or host name (not a user)" className={`${inputClass} mt-2`} />
            )}
          </div>
        </div>
      )}

      {features.class_groups && !lockedClassGroupId && classGroups.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Class Groups</label>
          <div className="flex flex-wrap gap-2">
            {classGroups.map(g => (
              <label key={g.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={selectedGroupIds.includes(g.id)}
                  onChange={e => setSelectedGroupIds(prev => e.target.checked ? [...prev, g.id] : prev.filter(x => x !== g.id))}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                {g.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">Sessions with no groups are open to all students.</p>
        </div>
      )}

      {!editing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Repeat</label>
            <select value={repeat} onChange={e => setRepeat(e.target.value as 'none' | 'weekly' | 'biweekly')} className={inputClass}>
              <option value="none">Does not repeat</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
            </select>
          </div>
          {repeat !== 'none' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Repeat until</label>
              <input type="date" value={repeatUntil} onChange={e => setRepeatUntil(e.target.value)} className={inputClass} />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : editing ? 'Update Session' : repeat === 'none' ? 'Create Session' : 'Create Series'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2.5 text-gray-500 text-sm">Cancel</button>
      </div>
    </form>
  );
}
