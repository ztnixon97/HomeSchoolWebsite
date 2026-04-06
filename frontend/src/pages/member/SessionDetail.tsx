import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useFeatures } from '../../features';
import PhotoGallery from '../../components/Lightbox';
import AddressLink from '../../components/AddressLink';

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
  host_address: string | null;
  location_name?: string | null;
  location_address?: string | null;
  cost_amount?: number | null;
  cost_details?: string | null;
  lesson_plan_id: number | null;
  materials_needed: string | null;
  max_students: number | null;
  notes: string | null;
  status: string;
  session_type_label: string | null;
  session_type_name: string | null;
  session_type_id?: number | null;
  rsvp_cutoff: string | null;
  require_approval?: boolean;
}

interface Rsvp {
  id: number;
  session_id: number;
  student_id: number;
  student_name: string | null;
  parent_id: number;
  parent_name: string | null;
  status: string;
  note: string | null;
}

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  allergies: string;
  dietary_restrictions: string;
}

interface LessonPlan {
  id: number;
  title: string;
}

interface HealthSummary {
  dietary_restrictions: string[];
  allergies: string[];
}

interface Supply {
  id: number;
  session_id: number;
  item_name: string;
  quantity: string | null;
  claimed_by: number | null;
  claimed_by_name: string | null;
}

interface AttendanceRecord {
  id: number;
  session_id: number;
  student_id: number;
  student_name: string | null;
  present: boolean;
  note: string | null;
}

interface SessionType {
  id: number;
  name: string;
  label: string;
  hostable: boolean;
  rsvpable: boolean;
  multi_day: boolean;
  requires_location: boolean;
  supports_cost: boolean;
  cost_label: string | null;
  allow_supplies: boolean;
  allow_attendance: boolean;
  allow_photos: boolean;
}

export default function SessionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const features = useFeatures();
  const [session, setSession] = useState<Session | null>(null);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [children, setChildren] = useState<Student[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [healthSummary, setHealthSummary] = useState<HealthSummary | null>(null);
  const [showClaim, setShowClaim] = useState(false);
  const [hostAddress, setHostAddress] = useState('');
  const [materials, setMaterials] = useState('');
  const [rsvpCutoff, setRsvpCutoff] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editHostAddress, setEditHostAddress] = useState('');
  const [editMaterials, setEditMaterials] = useState('');
  const [editMaxStudents, setEditMaxStudents] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editCutoff, setEditCutoff] = useState('');
  const [editLessonPlanId, setEditLessonPlanId] = useState('');
  // Admin-only edit fields
  const [editTheme, setEditTheme] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editSessionTypeId, setEditSessionTypeId] = useState('');
  const [editLocationName, setEditLocationName] = useState('');
  const [editLocationAddress, setEditLocationAddress] = useState('');
  const [editCostAmount, setEditCostAmount] = useState('');
  const [editCostDetails, setEditCostDetails] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editAssignHostId, setEditAssignHostId] = useState('');
  const [editReserveHostName, setEditReserveHostName] = useState('');
  const [allUsers, setAllUsers] = useState<{ id: number; display_name: string; email: string }[]>([]);
  const [error, setError] = useState('');
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [newSupplyName, setNewSupplyName] = useState('');
  const [newSupplyQty, setNewSupplyQty] = useState('');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceEdits, setAttendanceEdits] = useState<Record<number, boolean>>({});
  const [sessionPhotos, setSessionPhotos] = useState<{ id: number; filename: string }[]>([]);

  const refresh = () => {
    if (!id) return;
    api.get<Session>(`/api/sessions/${id}`).then(setSession).catch(() => {});
    api.get<Rsvp[]>(`/api/sessions/${id}/rsvps`).then(setRsvps).catch(() => {});
    api.get<Supply[]>(`/api/sessions/${id}/supplies`).then(setSupplies).catch(() => {});
    api.get<AttendanceRecord[]>(`/api/sessions/${id}/attendance`).then(setAttendance).catch(() => {});
    api.get<{ id: number; filename: string }[]>(`/api/files/session/${id}`).then(setSessionPhotos).catch(() => setSessionPhotos([]));
  };

  useEffect(() => {
    refresh();
    api.get<Student[]>('/api/my-children').then(setChildren).catch(() => {});
    api.get<LessonPlan[]>('/api/lesson-plans').then(setLessonPlans).catch(() => {});
    api.get<SessionType[]>('/api/session-types').then(setSessionTypes).catch(() => {});
    if (user?.role === 'admin') {
      api.get<{ items: { id: number; display_name: string; email: string }[] }>('/api/admin/users?page_size=200').then(r => setAllUsers(r.items)).catch(() => {});
    }
  }, [id]);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/api/sessions/${id}/claim`, {
        host_address: hostAddress,
        materials_needed: materials || null,
        rsvp_cutoff: rsvpCutoff || null,
      });
      setShowClaim(false);
      refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to claim session');
    }
  };

  const handleUnclaim = async () => {
    await api.post(`/api/sessions/${id}/unclaim`, {});
    refresh();
  };

  const handleRsvp = async (studentId: number) => {
    try {
      await api.post('/api/rsvps', { session_id: Number(id), student_id: studentId });
      refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to RSVP');
    }
  };

  const handleRemoveRsvp = async (rsvpId: number) => {
    await api.del(`/api/rsvps/${rsvpId}`);
    refresh();
  };

  const handleApproveRsvp = async (rsvpId: number) => {
    await api.put(`/api/rsvps/${rsvpId}`, { status: 'confirmed' });
    refresh();
  };

  const rsvpedStudentIds = new Set(rsvps.map(r => r.student_id));
  const canRsvpChildren = children.filter(c => !rsvpedStudentIds.has(c.id));
  const isHost = user && session?.host_id === user.id;
  const isAdmin = user && user.role === 'admin';
  const canEdit = isHost || isAdmin;
  const typeMeta = session ? sessionTypes.find(t => t.id === session.session_type_id) : undefined;
  const hostable = typeMeta ? typeMeta.hostable : true;
  const rsvpable = typeMeta ? typeMeta.rsvpable : true;
  const allowSupplies = typeMeta ? typeMeta.allow_supplies : true;
  const allowAttendance = typeMeta ? typeMeta.allow_attendance : true;
  const allowPhotos = typeMeta ? typeMeta.allow_photos : true;
  const confirmedCount = rsvps.filter(r => r.status === 'confirmed').length;
  const isFull = session?.max_students ? confirmedCount >= session.max_students : false;
  const cutoffPassed = session?.rsvp_cutoff ? new Date(session.rsvp_cutoff) < new Date() : false;

  useEffect(() => {
    if (!id || !(isHost || isAdmin)) return;
    api.get<HealthSummary>(`/api/sessions/${id}/health`).then(setHealthSummary).catch(() => setHealthSummary(null));
  }, [id, isHost, isAdmin]);

  if (!session) return (
    <div className="text-center py-16">
      <p className="text-ink/40">Loading session...</p>
    </div>
  );

  const openEdit = () => {
    setEditTitle(session.title);
    setEditStart(session.start_time || '');
    setEditEnd(session.end_time || '');
    setEditHostAddress(session.host_address || '');
    setEditMaterials(session.materials_needed || '');
    setEditMaxStudents(session.max_students?.toString() || '');
    setEditNotes(session.notes || '');
    setEditCutoff(session.rsvp_cutoff || '');
    setEditLessonPlanId(session.lesson_plan_id?.toString() || '');
    // Admin fields
    setEditTheme(session.theme || '');
    setEditDate(session.session_date);
    setEditEndDate(session.end_date || '');
    setEditSessionTypeId(session.session_type_id?.toString() || '');
    setEditLocationName(session.location_name || '');
    setEditLocationAddress(session.location_address || '');
    setEditCostAmount(session.cost_amount != null ? String(session.cost_amount) : '');
    setEditCostDetails(session.cost_details || '');
    setEditStatus(session.status);
    setEditAssignHostId(session.host_id != null ? String(session.host_id) : '');
    setEditReserveHostName(session.host_id == null && session.host_name ? session.host_name : '');
    setEditOpen(true);
  };

  const saveEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isAdmin) {
        // Admin uses the admin endpoint with full field access
        await api.put(`/api/admin/sessions/${id}`, {
          title: editTitle || null,
          theme: editTheme || null,
          session_date: editDate,
          end_date: editEndDate || null,
          start_time: editStart || null,
          end_time: editEnd || null,
          location_name: editLocationName || null,
          location_address: editLocationAddress || null,
          cost_amount: editCostAmount ? parseFloat(editCostAmount) : null,
          cost_details: editCostDetails || null,
          max_students: editMaxStudents ? parseInt(editMaxStudents) : null,
          notes: editNotes,
          rsvp_cutoff: editCutoff || null,
          status: editStatus,
          session_type_id: editSessionTypeId ? parseInt(editSessionTypeId) : null,
          ...(editAssignHostId ? { host_id: parseInt(editAssignHostId) } : {}),
          ...(!editAssignHostId && editReserveHostName ? { host_name: editReserveHostName } : {}),
        });
        // Also update host-specific fields via host endpoint if there's a host
        if (session.host_id || editAssignHostId) {
          await api.put(`/api/sessions/${id}/host`, {
            host_address: editHostAddress || null,
            materials_needed: editMaterials,
            lesson_plan_id: editLessonPlanId ? parseInt(editLessonPlanId) : null,
          }).catch(() => {}); // non-critical
        }
      } else {
        await api.put(`/api/sessions/${id}/host`, {
          title: editTitle || null,
          start_time: editStart || null,
          end_time: editEnd || null,
          host_address: editHostAddress || null,
          materials_needed: editMaterials,
          max_students: editMaxStudents ? parseInt(editMaxStudents) : null,
          notes: editNotes,
          rsvp_cutoff: editCutoff || null,
          lesson_plan_id: editLessonPlanId ? parseInt(editLessonPlanId) : null,
        });
      }
      setEditOpen(false);
      refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to update session');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link to="/sessions" className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:text-emerald-800 font-medium">
        &larr; Back to Sessions
      </Link>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">{session.title}</h1>
            {session.theme && (
              <span className="inline-block mt-2 text-xs bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full font-medium">
                {session.theme}
              </span>
            )}
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap ${
            session.status === 'open'
              ? 'bg-red-100 text-red-800'
              : session.status === 'claimed'
                ? 'bg-green-100 text-green-800'
                : session.status === 'completed'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-700'
          }`}>
            {session.status === 'open' ? 'Unclaimed' : session.status === 'claimed' ? 'Hosted' : session.status === 'completed' ? 'Completed' : 'Full'}
          </span>
        </div>

        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">Availability</span>
            <span className={`font-medium ${
              session.status === 'open'
                ? 'text-red-700'
                : session.status === 'claimed'
                  ? 'text-green-700'
                  : 'text-gray-700'
            }`}>
              {session.status === 'open' ? 'Unclaimed' : session.status === 'claimed' ? 'Hosted' : 'Full'}
            </span>
          </div>
          {rsvpable && (
          <div className="bg-gray-50 rounded-lg p-3">
            <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">RSVP Cutoff</span>
            <span className="font-medium text-gray-800 text-sm">
              {session.rsvp_cutoff ? new Date(session.rsvp_cutoff).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) + ' at ' + new Date(session.rsvp_cutoff).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Not set'}
            </span>
          </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-6">
          <div className="bg-gray-50 rounded-lg p-3">
            <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">Date</span>
            <span className="font-medium text-gray-800">
              {new Date(session.session_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              {session.end_date && session.end_date !== session.session_date && ` – ${new Date(session.end_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`}
            </span>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">Time</span>
            <span className="font-medium text-gray-800">
              {session.start_time || 'TBD'}{session.end_time ? ` - ${session.end_time}` : ''}
            </span>
          </div>
          {session.session_type_label && (
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">Type</span>
              <span className="font-medium text-gray-800">{session.session_type_label}</span>
            </div>
          )}
          {session.host_name && (
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">Host</span>
              <span className="font-medium text-gray-800">{session.host_name}</span>
            </div>
          )}
          {session.host_address && (
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">Location</span>
              <AddressLink address={session.host_address} className="font-medium" />
            </div>
          )}
          {session.location_name && (
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">Location Name</span>
              <span className="font-medium text-gray-800">{session.location_name}</span>
            </div>
          )}
          {session.location_address && (
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">Location Address</span>
              <AddressLink address={session.location_address} className="font-medium" />
            </div>
          )}
          {session.cost_amount !== null && session.cost_amount !== undefined && (
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">Cost</span>
              <span className="font-medium text-gray-800">${session.cost_amount.toFixed(2)}</span>
              {session.cost_details && <div className="text-xs text-gray-500 mt-1">{session.cost_details}</div>}
            </div>
          )}
          {session.max_students && (
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">Max Students</span>
              <span className="font-medium text-gray-800">{session.max_students}</span>
            </div>
          )}
        </div>

        {session.materials_needed && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
            <span className="font-semibold text-amber-800">Materials Needed:</span>
            <span className="text-amber-700 ml-1">{session.materials_needed}</span>
          </div>
        )}

        {features.lesson_plans && session.lesson_plan_id && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm">
            <span className="font-semibold text-blue-800">Lesson Plan:</span>
            <Link to={`/lesson-plans/${session.lesson_plan_id}`} className="text-blue-700 ml-2 hover:text-blue-900 underline underline-offset-2">
              {lessonPlans.find(lp => lp.id === session.lesson_plan_id)?.title || 'View plan'}
            </Link>
          </div>
        )}

        {session.notes && (
          <div className="text-sm text-gray-600 mb-4 bg-gray-50 rounded-lg p-4">{session.notes}</div>
        )}


        {error && (
          <div className="text-red-700 text-sm bg-red-50 border border-red-100 p-3 rounded-xl mb-4">{error}</div>
        )}
      </div>

      {/* Host actions */}
      <div className="space-y-3">
        {hostable && session.status === 'open' && user && !showClaim && (
          <button
            onClick={() => { setShowClaim(true); if (user?.address && !hostAddress) setHostAddress(user.address); }}
            className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors"
          >
            Sign Up to Host This Session
          </button>
        )}

        {showClaim && (
          <form onSubmit={handleClaim} className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-emerald-900">Host This Session</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Address</label>
              <input
                type="text"
                value={hostAddress}
                onChange={e => setHostAddress(e.target.value)}
                required
                autoComplete="street-address"
                placeholder="123 Main St, City"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              {user?.address && hostAddress === user.address && (
                <p className="text-xs text-emerald-600 mt-1">Pre-filled from your profile</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Materials Needed (optional)</label>
              <input
                type="text"
                value={materials}
                onChange={e => setMaterials(e.target.value)}
                placeholder="Craft supplies, snacks, etc."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            {rsvpable && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">RSVP Cutoff (optional)</label>
              <input
                type="datetime-local"
                value={rsvpCutoff}
                onChange={e => setRsvpCutoff(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            )}
            <div className="flex gap-3">
              <button type="submit" className="bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors">
                Confirm
              </button>
              <button type="button" onClick={() => setShowClaim(false)} className="px-5 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}

        {isHost && hostable && (
          <div className="flex gap-4 mt-3">
            <button
              onClick={handleUnclaim}
              className="text-sm text-red-600 hover:text-red-800 font-medium py-2 px-3 rounded-lg"
            >
              Withdraw as Host
            </button>
            {session.status === 'claimed' && (
              <button
                onClick={async () => {
                  await api.post(`/api/sessions/${id}/complete`);
                  refresh();
                }}
                className="text-sm text-emerald-600 hover:text-emerald-800 font-medium py-2 px-3 rounded-lg"
              >
                Mark as Completed
              </button>
            )}
          </div>
        )}
      </div>

      {/* Edit session details */}
      {canEdit && (
        <div className="space-y-3">
          {!editOpen && (
            <button
              onClick={openEdit}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Edit Session Details
            </button>
          )}

          {editOpen && (
            <form onSubmit={saveEdits} className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
              <h3 className="font-semibold text-blue-900">Update Session</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              {isAdmin && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Theme</label>
                      <input type="text" value={editTheme} onChange={e => setEditTheme(e.target.value)} placeholder="Optional" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Session Type</label>
                      <select value={editSessionTypeId} onChange={e => setEditSessionTypeId(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm">
                        <option value="">None</option>
                        {sessionTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
                      <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">End Date</label>
                      <input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                    </div>
                  </div>
                </>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Time</label>
                  <input
                    type="time"
                    value={editStart}
                    onChange={e => setEditStart(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">End Time</label>
                  <input
                    type="time"
                    value={editEnd}
                    onChange={e => setEditEnd(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              {isAdmin && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Location Name</label>
                      <input type="text" value={editLocationName} onChange={e => setEditLocationName(e.target.value)} placeholder="Optional" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Location Address</label>
                      <input type="text" value={editLocationAddress} onChange={e => setEditLocationAddress(e.target.value)} placeholder="Optional" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Cost</label>
                      <input type="number" step="0.01" value={editCostAmount} onChange={e => setEditCostAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Cost Details</label>
                      <input type="text" value={editCostDetails} onChange={e => setEditCostDetails(e.target.value)} placeholder="Optional" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                      <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm">
                        <option value="open">Open</option>
                        <option value="claimed">Claimed</option>
                        <option value="completed">Completed</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign Host</label>
                      {!editAssignHostId && editReserveHostName && (
                        <p className="text-xs text-amber-600 mb-1">"{editReserveHostName}" is not linked to an account.</p>
                      )}
                      <select value={editAssignHostId} onChange={e => { setEditAssignHostId(e.target.value); if (e.target.value) setEditReserveHostName(''); }} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm">
                        <option value="">— None —</option>
                        {allUsers.map(u => <option key={u.id} value={u.id}>{u.display_name} ({u.email})</option>)}
                      </select>
                    </div>
                  </div>
                  {!editAssignHostId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Or enter host name</label>
                      <input type="text" value={editReserveHostName} onChange={e => setEditReserveHostName(e.target.value)} placeholder="Name (if not a registered user)" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
                    </div>
                  )}
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Host Address</label>
                <input
                  type="text"
                  value={editHostAddress}
                  onChange={e => setEditHostAddress(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Materials Needed</label>
                <input
                  type="text"
                  value={editMaterials}
                  onChange={e => setEditMaterials(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div className={`grid grid-cols-1 ${rsvpable ? 'sm:grid-cols-2' : ''} gap-3`}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Students</label>
                  <input
                    type="number"
                    value={editMaxStudents}
                    onChange={e => setEditMaxStudents(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                {rsvpable && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">RSVP Cutoff</label>
                  <input
                    type="datetime-local"
                    value={editCutoff}
                    onChange={e => setEditCutoff(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes to Parents</label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              {features.lesson_plans && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Lesson Plan</label>
                  <select
                    value={editLessonPlanId}
                    onChange={e => setEditLessonPlanId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="">None</option>
                    {lessonPlans.map(lp => (
                      <option key={lp.id} value={lp.id}>{lp.title}</option>
                    ))}
                  </select>
                  <Link to="/lesson-plans/new" className="text-xs text-blue-600 hover:text-blue-800 mt-2 inline-block">
                    Create a new lesson plan
                  </Link>
                </div>
              )}
              <div className="flex gap-3">
                <button type="submit" className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors">
                  Save
                </button>
                <button type="button" onClick={() => setEditOpen(false)} className="px-5 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* RSVPs */}
      {rsvpable && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            RSVPs ({confirmedCount}{session.max_students ? ` / ${session.max_students}` : ''})
          </h2>

          {rsvps.length > 0 ? (
            <div className="space-y-2 mb-4">
              {rsvps.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                  <div>
                    <span className="font-medium text-gray-800">{r.student_name}</span>
                    <span className="text-gray-400 text-xs ml-2">({r.parent_name})</span>
                    {r.status === 'pending' && (
                      <span className="ml-2 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Pending</span>
                    )}
                    {r.status === 'waitlisted' && (
                      <span className="ml-2 text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Waitlisted</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {(isHost || isAdmin) && r.status === 'pending' && (
                      <>
                        <button onClick={() => handleApproveRsvp(r.id)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium py-2 px-3 rounded-lg">Approve</button>
                        <button onClick={() => handleRemoveRsvp(r.id)} className="text-xs text-red-500 hover:text-red-700 font-medium py-2 px-3 rounded-lg">Decline</button>
                      </>
                    )}
                    {user && (r.parent_id === user.id || children.some(c => c.id === r.student_id) || user.role === 'admin') && (
                      <button onClick={() => handleRemoveRsvp(r.id)} className="text-xs text-red-500 hover:text-red-700 font-medium py-2 px-3 rounded-lg">Remove</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-ink/40 text-sm mb-4">No RSVPs yet.</p>
          )}

          {canRsvpChildren.length > 0 && !cutoffPassed && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                {isFull || session.require_approval ? 'Request RSVP for your children:' : 'RSVP your children:'}
              </h3>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                {canRsvpChildren.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleRsvp(c.id)}
                    className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 hover:bg-emerald-100 font-medium transition-colors"
                  >
                    + {c.first_name} {c.last_name}
                  </button>
                ))}
              </div>
              {isFull && (
                <p className="text-xs text-amber-700 mt-2">This session is full. Your child will be added to the waitlist and automatically confirmed if a spot opens up.</p>
              )}
              {!isFull && session.require_approval && (
                <p className="text-xs text-amber-700 mt-2">Your RSVP will be sent to the host for approval.</p>
              )}
            </div>
          )}
          {cutoffPassed && (
            <p className="text-sm text-gray-500">RSVP cutoff has passed.</p>
          )}
        </div>
      )}

      {/* Allergy/Dietary alerts for host */}
      {(isHost || isAdmin) && healthSummary && (healthSummary.allergies.length > 0 || healthSummary.dietary_restrictions.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-3 text-amber-800">Health & Dietary Notes</h2>
          {healthSummary.allergies.length > 0 && (
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-red-700 mb-1">Allergies</h3>
              <ul className="text-sm space-y-1">
                {healthSummary.allergies.map((a, i) => (
                  <li key={i} className="text-red-600 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-red-400 rounded-full flex-shrink-0" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {healthSummary.dietary_restrictions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-amber-700 mb-1">Dietary Restrictions</h3>
              <ul className="text-sm space-y-1">
                {healthSummary.dietary_restrictions.map((d, i) => (
                  <li key={i} className="text-amber-600 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Supply Sign-up List */}
      {allowSupplies && (supplies.length > 0 || canEdit) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Supply Sign-up</h2>

          {supplies.length > 0 && (
            <div className="space-y-2 mb-4">
              {supplies.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                  <div>
                    <span className="font-medium text-gray-800">{s.item_name}</span>
                    {s.quantity && <span className="text-gray-400 text-xs ml-2">({s.quantity})</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    {s.claimed_by ? (
                      <>
                        <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{s.claimed_by_name}</span>
                        {(s.claimed_by === user?.id || user?.role === 'admin') && (
                          <button onClick={async () => { await api.post(`/api/supplies/${s.id}/unclaim`); refresh(); }} className="text-xs text-gray-500 hover:text-gray-700 py-2 px-3 rounded-lg">Unclaim</button>
                        )}
                      </>
                    ) : (
                      <button onClick={async () => { await api.post(`/api/supplies/${s.id}/claim`); refresh(); }} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium py-2 px-3 rounded-lg">I'll bring this</button>
                    )}
                    {canEdit && (
                      <button onClick={async () => { await api.del(`/api/supplies/${s.id}`); refresh(); }} className="text-xs text-red-500 hover:text-red-700 py-2 px-3 rounded-lg">Remove</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {canEdit && (
            <div className="flex gap-2">
              <input type="text" value={newSupplyName} onChange={e => setNewSupplyName(e.target.value)} placeholder="Item needed" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              <input type="text" value={newSupplyQty} onChange={e => setNewSupplyQty(e.target.value)} placeholder="Qty" className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              <button onClick={async () => {
                if (!newSupplyName.trim()) return;
                await api.post(`/api/sessions/${id}/supplies`, { item_name: newSupplyName.trim(), quantity: newSupplyQty || null });
                setNewSupplyName(''); setNewSupplyQty(''); refresh();
              }} className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800">Add</button>
            </div>
          )}
        </div>
      )}

      {/* Attendance (host/admin, for completed or claimed sessions) */}
      {allowAttendance && canEdit && session.status !== 'open' && rsvps.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Attendance</h2>
          <div className="space-y-2 mb-4">
            {rsvps.filter(r => r.status === 'confirmed').map(r => {
              const existing = attendance.find(a => a.student_id === r.student_id);
              const checked = attendanceEdits[r.student_id] ?? existing?.present ?? false;
              return (
                <label key={r.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg text-sm cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => setAttendanceEdits(prev => ({ ...prev, [r.student_id]: e.target.checked }))}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span className={`font-medium ${checked ? 'text-gray-900' : 'text-gray-400'}`}>{r.student_name}</span>
                  {existing && <span className="text-xs text-gray-400 ml-auto">{existing.present ? 'Attended' : 'Absent'}</span>}
                </label>
              );
            })}
          </div>
          <button
            onClick={async () => {
              const records = rsvps.filter(r => r.status === 'confirmed').map(r => ({
                student_id: r.student_id,
                present: attendanceEdits[r.student_id] ?? attendance.find(a => a.student_id === r.student_id)?.present ?? false,
                note: null,
              }));
              await api.post('/api/session-attendance', { session_id: Number(id), records });
              refresh();
            }}
            className="bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-800"
          >
            Save Attendance
          </button>
        </div>
      )}

      {/* Session Photos */}
      {allowPhotos && (sessionPhotos.length > 0 || user) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          {/* Expiry warning for sessions with photos approaching 30-day cleanup */}
          {sessionPhotos.length > 0 && session.session_date && (() => {
            const sessionDate = new Date(session.session_date + 'T00:00:00');
            const expiryDate = new Date(sessionDate.getTime() + 30 * 24 * 60 * 60 * 1000);
            const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
            if (daysLeft <= 7 && daysLeft > 0) {
              return (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  Photos will be automatically removed in <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</strong>. Download any photos you want to keep.
                </div>
              );
            }
            if (daysLeft <= 0) {
              return (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  These photos are scheduled for cleanup. Download any you want to keep.
                </div>
              );
            }
            return null;
          })()}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Session Photos ({sessionPhotos.length})</h2>
            {user && (
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 cursor-pointer transition-colors">
                Upload Photos
                <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                  const files = e.target.files;
                  if (!files) return;
                  for (const file of Array.from(files)) {
                    await api.upload(file, 'session', Number(id));
                  }
                  refresh();
                  e.target.value = '';
                }} />
              </label>
            )}
          </div>
          <PhotoGallery
            photos={sessionPhotos.map(p => ({ id: p.id, filename: p.filename, url: `/api/files/${p.id}/download` }))}
            canDelete={!!canEdit}
            onDelete={async (photoId) => {
              await api.del(`/api/files/${photoId}`);
              refresh();
            }}
          />
          {sessionPhotos.length === 0 && (
            <p className="text-ink/40 text-sm">No photos yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
