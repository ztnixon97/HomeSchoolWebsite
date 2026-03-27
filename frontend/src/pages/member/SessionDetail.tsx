import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';

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
}

export default function SessionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
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
  const [error, setError] = useState('');

  const refresh = () => {
    if (!id) return;
    api.get<Session>(`/api/sessions/${id}`).then(setSession).catch(() => {});
    api.get<Rsvp[]>(`/api/sessions/${id}/rsvps`).then(setRsvps).catch(() => {});
  };

  useEffect(() => {
    refresh();
    api.get<Student[]>('/api/my-children').then(setChildren).catch(() => {});
    api.get<LessonPlan[]>('/api/lesson-plans').then(setLessonPlans).catch(() => {});
    api.get<SessionType[]>('/api/session-types').then(setSessionTypes).catch(() => {});
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
  const confirmedCount = rsvps.filter(r => r.status === 'confirmed').length;
  const isFull = session?.max_students ? confirmedCount >= session.max_students : false;
  const cutoffPassed = session?.rsvp_cutoff ? new Date(session.rsvp_cutoff) < new Date() : false;

  useEffect(() => {
    if (!id || !(isHost || isAdmin)) return;
    api.get<HealthSummary>(`/api/sessions/${id}/health`).then(setHealthSummary).catch(() => setHealthSummary(null));
  }, [id, isHost, isAdmin]);

  if (!session) return (
    <div className="text-center py-16">
      <p className="text-gray-400">Loading session...</p>
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
    setEditOpen(true);
  };

  const saveEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.put(`/api/sessions/${id}/host`, {
        title: editTitle || null,
        start_time: editStart || null,
        end_time: editEnd || null,
        host_address: editHostAddress || null,
        materials_needed: editMaterials || null,
        max_students: editMaxStudents ? parseInt(editMaxStudents) : null,
        notes: editNotes || null,
        rsvp_cutoff: editCutoff || null,
        lesson_plan_id: editLessonPlanId ? parseInt(editLessonPlanId) : null,
      });
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
            <h1 className="text-2xl font-bold text-gray-900">{session.title}</h1>
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
                : 'bg-gray-100 text-gray-700'
          }`}>
            {session.status === 'open' ? 'Unclaimed' : session.status === 'claimed' ? 'Hosted' : 'Full'}
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
          <div className="bg-gray-50 rounded-lg p-3">
            <span className="text-gray-400 text-xs uppercase tracking-wider block mb-1">RSVP Cutoff</span>
            <span className="font-medium text-gray-800 text-sm">
              {session.rsvp_cutoff ? new Date(session.rsvp_cutoff).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) + ' at ' + new Date(session.rsvp_cutoff).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Not set'}
            </span>
          </div>
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
              <span className="font-medium text-gray-800">{session.host_address}</span>
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
              <span className="font-medium text-gray-800">{session.location_address}</span>
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

        {session.lesson_plan_id && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm">
            <span className="font-semibold text-blue-800">Lesson Plan:</span>
            <Link to={`/lesson-plans/${session.lesson_plan_id}`} className="text-blue-700 ml-2 hover:text-blue-900">
              View plan
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
            onClick={() => setShowClaim(true)}
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
                placeholder="123 Main St, City"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">RSVP Cutoff (optional)</label>
              <input
                type="datetime-local"
                value={rsvpCutoff}
                onChange={e => setRsvpCutoff(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
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
          <button
            onClick={handleUnclaim}
            className="text-sm text-red-600 hover:text-red-800 mt-3 font-medium"
          >
            Withdraw as Host
          </button>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Students</label>
                  <input
                    type="number"
                    value={editMaxStudents}
                    onChange={e => setEditMaxStudents(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">RSVP Cutoff</label>
                  <input
                    type="datetime-local"
                    value={editCutoff}
                    onChange={e => setEditCutoff(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
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
                  </div>
                  <div className="flex items-center gap-2">
                    {(isHost || isAdmin) && r.status === 'pending' && (
                      <>
                        <button onClick={() => handleApproveRsvp(r.id)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Approve</button>
                        <button onClick={() => handleRemoveRsvp(r.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Decline</button>
                      </>
                    )}
                    {user && (r.parent_id === user.id || user.role === 'admin') && (
                      <button onClick={() => handleRemoveRsvp(r.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm mb-4">No RSVPs yet.</p>
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
              {(isFull || session.require_approval) && (
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
    </div>
  );
}
