import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useToast } from '../../components/Toast';

interface ClassGroup {
  id: number;
  name: string;
  description: string | null;
  grading_enabled?: boolean;
  home_content?: string | null;
  is_class_teacher?: boolean;
}

interface GroupSession {
  id: number;
  title: string;
  theme: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  host_id: number | null;
  host_name: string | null;
  session_type_label: string | null;
  max_students: number | null;
  rsvp_count: number;
}

interface RosterStudent {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  allergies?: string;
  dietary_restrictions?: string;
}

interface AttendanceRecord {
  session_id: number;
  student_id: number;
  first_name: string;
  last_name: string;
  present: boolean;
}

interface AttendanceSession {
  id: number;
  title: string;
  session_date: string;
}

interface Announcement {
  id: number;
  group_id: number;
  title: string;
  body: string;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
}

interface ClassAssignment {
  id: number;
  group_id: number;
  title: string;
  description: string | null;
  category: string | null;
  max_points: number;
  due_date: string | null;
  created_by: number;
  created_by_name: string | null;
  created_at: string;
}

interface StudentGrade {
  id: number;
  assignment_id: number;
  student_id: number;
  student_name: string | null;
  score: number | null;
  notes: string | null;
  graded_by: number;
  graded_by_name: string | null;
  updated_at: string;
}

type Tab = 'home' | 'sessions' | 'roster' | 'attendance' | 'announcements' | 'grades';

export default function ClassDetail() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin, isTeacher } = useAuth();
  const { addToast } = useToast();
  // canManage is computed dynamically to include assigned class teachers

  const [group, setGroup] = useState<ClassGroup | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [loading, setLoading] = useState(true);

  // Sessions
  const [sessions, setSessions] = useState<GroupSession[]>([]);
  // Roster
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  // Attendance
  const [attSessions, setAttSessions] = useState<AttendanceSession[]>([]);
  const [attRecords, setAttRecords] = useState<AttendanceRecord[]>([]);
  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  // Grades / Assignments
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [newAssignmentTitle, setNewAssignmentTitle] = useState('');
  const [newAssignmentDesc, setNewAssignmentDesc] = useState('');
  const [newAssignmentCategory, setNewAssignmentCategory] = useState('');
  const [newAssignmentMax, setNewAssignmentMax] = useState('100');
  const [newAssignmentDue, setNewAssignmentDue] = useState('');
  const [gradingAssignmentId, setGradingAssignmentId] = useState<number | null>(null);
  const [gradeInputs, setGradeInputs] = useState<Record<number, { score: string; notes: string }>>({});
  // Home content editing
  const [editingHome, setEditingHome] = useState(false);
  const [homeContent, setHomeContent] = useState('');
  // Session creation (for class teachers)
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [sessionStartTime, setSessionStartTime] = useState('');
  const [sessionEndTime, setSessionEndTime] = useState('');
  const [sessionMax, setSessionMax] = useState('');

  const isClassTeacher = group?.is_class_teacher || false;
  const canManageClass = isAdmin || isClassTeacher;
  const canManage = isAdmin || isTeacher || isClassTeacher;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get<ClassGroup>(`/api/class-groups/${id}`)
      .then(setGroup)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (tab === 'sessions') {
      api.get<GroupSession[]>(`/api/class-groups/${id}/sessions`).then(setSessions).catch(() => {});
    } else if (tab === 'roster') {
      api.get<RosterStudent[]>(`/api/class-groups/${id}/roster`).then(setRoster).catch(() => {});
    } else if (tab === 'attendance') {
      api.get<{ sessions: AttendanceSession[]; records: AttendanceRecord[] }>(`/api/class-groups/${id}/attendance`).then(data => {
        setAttSessions(data.sessions);
        setAttRecords(data.records);
      }).catch(() => {});
    } else if (tab === 'announcements') {
      api.get<Announcement[]>(`/api/class-groups/${id}/announcements`).then(setAnnouncements).catch(() => {});
    } else if (tab === 'grades') {
      api.get<{ grading_enabled: boolean; assignments: ClassAssignment[]; grades: StudentGrade[] }>(`/api/class-groups/${id}/grades`).then(data => {
        setAssignments(data.assignments);
        setGrades(data.grades);
      }).catch(() => {});
      // Also fetch roster for the gradebook (teacher needs student list)
      if (canManage && roster.length === 0) {
        api.get<RosterStudent[]>(`/api/class-groups/${id}/roster`).then(setRoster).catch(() => {});
      }
    }
  }, [id, tab]);

  const createAnnouncement = async () => {
    if (!newTitle.trim()) return;
    try {
      await api.post('/api/admin/class-group-announcements', {
        group_id: Number(id),
        title: newTitle,
        body: newBody || undefined,
      });
      setNewTitle('');
      setNewBody('');
      addToast('Announcement created', 'success');
      api.get<Announcement[]>(`/api/class-groups/${id}/announcements`).then(setAnnouncements).catch(() => {});
    } catch {
      addToast('Failed to create announcement', 'error');
    }
  };

  const deleteAnnouncement = async (annId: number) => {
    try {
      await api.del(`/api/admin/class-group-announcements/${annId}`);
      setAnnouncements(prev => prev.filter(a => a.id !== annId));
      addToast('Announcement deleted', 'success');
    } catch {
      addToast('Failed to delete announcement', 'error');
    }
  };

  const createAssignment = async () => {
    if (!newAssignmentTitle.trim()) return;
    try {
      const assignment = await api.post<ClassAssignment>('/api/admin/class-assignments', {
        group_id: Number(id),
        title: newAssignmentTitle,
        description: newAssignmentDesc || null,
        category: newAssignmentCategory || null,
        max_points: newAssignmentMax ? parseFloat(newAssignmentMax) : 100,
        due_date: newAssignmentDue || null,
      });
      setAssignments(prev => [...prev, assignment]);
      setNewAssignmentTitle('');
      setNewAssignmentDesc('');
      setNewAssignmentCategory('');
      setNewAssignmentMax('100');
      setNewAssignmentDue('');
      addToast('Assignment created', 'success');
    } catch {
      addToast('Failed to create assignment', 'error');
    }
  };

  const deleteAssignment = async (assignmentId: number) => {
    try {
      await api.del(`/api/admin/class-assignments/${assignmentId}`);
      setAssignments(prev => prev.filter(a => a.id !== assignmentId));
      setGrades(prev => prev.filter(g => g.assignment_id !== assignmentId));
      if (gradingAssignmentId === assignmentId) setGradingAssignmentId(null);
      addToast('Assignment deleted', 'success');
    } catch {
      addToast('Failed to delete assignment', 'error');
    }
  };

  const openGrading = (assignmentId: number) => {
    setGradingAssignmentId(assignmentId);
    // Pre-fill inputs from existing grades
    const existing: Record<number, { score: string; notes: string }> = {};
    for (const s of roster) {
      const g = grades.find(g => g.assignment_id === assignmentId && g.student_id === s.id);
      existing[s.id] = {
        score: g?.score != null ? String(g.score) : '',
        notes: g?.notes || '',
      };
    }
    setGradeInputs(existing);
  };

  const saveGrades = async () => {
    if (!gradingAssignmentId) return;
    try {
      const gradesList = roster.map(s => ({
        student_id: s.id,
        score: gradeInputs[s.id]?.score ? parseFloat(gradeInputs[s.id].score) : null,
        notes: gradeInputs[s.id]?.notes || null,
      }));
      await api.put(`/api/admin/class-assignments/${gradingAssignmentId}/grades`, { grades: gradesList });
      // Refresh grades
      const data = await api.get<{ grading_enabled: boolean; assignments: ClassAssignment[]; grades: StudentGrade[] }>(`/api/class-groups/${id}/grades`);
      setGrades(data.grades);
      setGradingAssignmentId(null);
      addToast('Grades saved', 'success');
    } catch {
      addToast('Failed to save grades', 'error');
    }
  };

  const saveHomeContent = async () => {
    try {
      await api.put(`/api/class-groups/${id}/home`, { home_content: homeContent || null });
      setGroup(prev => prev ? { ...prev, home_content: homeContent || null } : prev);
      setEditingHome(false);
      addToast('Home page updated', 'success');
    } catch {
      addToast('Failed to update home page', 'error');
    }
  };

  const createClassSession = async () => {
    if (!sessionTitle.trim() || !sessionDate) return;
    try {
      await api.post(`/api/class-groups/${id}/sessions`, {
        title: sessionTitle,
        session_date: sessionDate,
        start_time: sessionStartTime || null,
        end_time: sessionEndTime || null,
        max_students: sessionMax ? parseInt(sessionMax) : null,
      });
      setSessionTitle('');
      setSessionDate('');
      setSessionStartTime('');
      setSessionEndTime('');
      setSessionMax('');
      setShowSessionForm(false);
      addToast('Session created', 'success');
      api.get<GroupSession[]>(`/api/class-groups/${id}/sessions`).then(setSessions).catch(() => {});
    } catch {
      addToast('Failed to create session', 'error');
    }
  };

  const deleteClassSession = async (sessionId: number) => {
    if (!confirm('Delete this session?')) return;
    try {
      await api.del(`/api/class-groups/${id}/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      addToast('Session deleted', 'success');
    } catch {
      addToast('Failed to delete session', 'error');
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <p className="text-gray-500">Loading class...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <p className="text-red-600">Class not found or access denied.</p>
        <Link to="/my-classes" className="text-emerald-700 text-sm mt-2 inline-block">Back to My Classes</Link>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'home', label: 'Home' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'roster', label: 'Roster' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'announcements', label: 'Announcements' },
    ...(group?.grading_enabled ? [{ key: 'grades' as Tab, label: 'Grades' }] : []),
  ];

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link to="/my-classes" className="text-emerald-700 text-sm mb-4 inline-block hover:underline">&larr; Back to My Classes</Link>

      <h1 className="text-2xl font-bold text-ink mb-1">{group.name}</h1>
      {group.description && <p className="text-gray-500 text-sm mb-6">{group.description}</p>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Home Tab */}
      {tab === 'home' && (
        <div className="space-y-4">
          {canManageClass && !editingHome && (
            <button
              onClick={() => { setHomeContent(group?.home_content || ''); setEditingHome(true); }}
              className="text-sm text-emerald-700 hover:text-emerald-800 font-medium"
            >
              Edit Home Page
            </button>
          )}
          {editingHome ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
              <textarea
                value={homeContent}
                onChange={e => setHomeContent(e.target.value)}
                rows={10}
                className={inputClass}
                placeholder="Write your class home page content here... You can describe the class, schedule, expectations, etc."
              />
              <div className="flex gap-2">
                <button onClick={saveHomeContent} className="px-4 py-2 bg-emerald-700 text-white text-sm rounded-lg hover:bg-emerald-800 transition-colors">Save</button>
                <button onClick={() => setEditingHome(false)} className="px-4 py-2 text-gray-500 text-sm">Cancel</button>
              </div>
            </div>
          ) : group?.home_content ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-ink">{group.home_content}</div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
              <p className="text-gray-400 text-sm">
                {canManageClass ? 'No home page content yet. Click "Edit Home Page" to add information about this class.' : 'Welcome to this class! Check the tabs above for sessions, roster, and more.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sessions Tab */}
      {tab === 'sessions' && (
        <div className="space-y-3">
          {canManageClass && (
            <div className="mb-2">
              {showSessionForm ? (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
                  <h3 className="text-sm font-medium text-ink">Create Session</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Title" value={sessionTitle} onChange={e => setSessionTitle(e.target.value)} className={inputClass} />
                    <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} className={inputClass} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="time" value={sessionStartTime} onChange={e => setSessionStartTime(e.target.value)} className={inputClass} placeholder="Start time" />
                    <input type="time" value={sessionEndTime} onChange={e => setSessionEndTime(e.target.value)} className={inputClass} placeholder="End time" />
                    <input type="number" value={sessionMax} onChange={e => setSessionMax(e.target.value)} className={inputClass} placeholder="Max students" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={createClassSession} disabled={!sessionTitle.trim() || !sessionDate} className="px-4 py-2 bg-emerald-700 text-white text-sm rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors">Create</button>
                    <button onClick={() => setShowSessionForm(false)} className="px-4 py-2 text-gray-500 text-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowSessionForm(true)} className="text-sm text-emerald-700 hover:text-emerald-800 font-medium">+ Add Session</button>
              )}
            </div>
          )}
          {sessions.length === 0 ? (
            <p className="text-gray-500 text-sm">No sessions assigned to this class yet.</p>
          ) : (
            sessions.map(s => (
              <Link
                key={s.id}
                to={`/sessions/${s.id}`}
                className="block bg-white rounded-lg border border-gray-100 shadow-sm p-4 hover:border-emerald-300 transition-colors no-underline"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-ink">{s.title}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {s.start_time && ` at ${s.start_time}`}
                      {s.end_time && ` - ${s.end_time}`}
                    </p>
                    {s.host_name && <p className="text-xs text-gray-400 mt-0.5">Host: {s.host_name}</p>}
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      s.status === 'open' ? 'bg-emerald-100 text-emerald-800' :
                      s.status === 'closed' ? 'bg-gray-100 text-gray-600' :
                      'bg-amber-100 text-amber-800'
                    }`}>{s.status}</span>
                    <p className="text-xs text-gray-400 mt-1">
                      {s.rsvp_count}{s.max_students ? `/${s.max_students}` : ''} RSVP{s.rsvp_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                {canManageClass && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteClassSession(s.id); }}
                    className="text-xs text-red-500 hover:text-red-700 mt-2"
                  >
                    Delete
                  </button>
                )}
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {/* Roster Tab */}
      {tab === 'roster' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {roster.length === 0 ? (
            <p className="text-gray-500 text-sm p-6">No students in this class.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date of Birth</th>
                  {canManage && <th className="text-left px-4 py-3 font-medium text-gray-600">Allergies</th>}
                  {canManage && <th className="text-left px-4 py-3 font-medium text-gray-600">Dietary</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {roster.map(s => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-ink">{s.first_name} {s.last_name}</td>
                    <td className="px-4 py-3 text-gray-500">{s.date_of_birth || '—'}</td>
                    {canManage && <td className="px-4 py-3 text-gray-500">{s.allergies || '—'}</td>}
                    {canManage && <td className="px-4 py-3 text-gray-500">{s.dietary_restrictions || '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Attendance Tab */}
      {tab === 'attendance' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          {attSessions.length === 0 ? (
            <p className="text-gray-500 text-sm p-6">No attendance records yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 sticky left-0 bg-gray-50">Student</th>
                  {attSessions.map(s => (
                    <th key={s.id} className="text-center px-3 py-3 font-medium text-gray-600 whitespace-nowrap">
                      {new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(() => {
                  const students = new Map<number, { name: string; records: Map<number, boolean> }>();
                  attRecords.forEach(r => {
                    if (!students.has(r.student_id)) {
                      students.set(r.student_id, { name: `${r.first_name} ${r.last_name}`, records: new Map() });
                    }
                    students.get(r.student_id)!.records.set(r.session_id, r.present);
                  });
                  return Array.from(students.entries()).map(([sid, data]) => (
                    <tr key={sid}>
                      <td className="px-4 py-3 text-ink sticky left-0 bg-white whitespace-nowrap">{data.name}</td>
                      {attSessions.map(s => {
                        const present = data.records.get(s.id);
                        return (
                          <td key={s.id} className="text-center px-3 py-3">
                            {present === undefined ? (
                              <span className="text-gray-300">—</span>
                            ) : present ? (
                              <span className="text-emerald-600 font-medium">P</span>
                            ) : (
                              <span className="text-red-500 font-medium">A</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Announcements Tab */}
      {tab === 'announcements' && (
        <div className="space-y-4">
          {canManage && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-sm font-medium text-ink mb-3">New Announcement</h3>
              <input
                type="text"
                placeholder="Title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className={`${inputClass} mb-2`}
              />
              <textarea
                placeholder="Body (optional)"
                value={newBody}
                onChange={e => setNewBody(e.target.value)}
                rows={3}
                className={inputClass}
              />
              <button
                onClick={createAnnouncement}
                disabled={!newTitle.trim()}
                className="mt-2 px-4 py-2 bg-emerald-700 text-white text-sm rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors"
              >
                Post Announcement
              </button>
            </div>
          )}
          {announcements.length === 0 ? (
            <p className="text-gray-500 text-sm">No announcements for this class.</p>
          ) : (
            announcements.map(a => (
              <div key={a.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-ink">{a.title}</h3>
                    {a.body && <p className="text-sm text-gray-600 mt-1">{a.body}</p>}
                    <p className="text-xs text-gray-400 mt-2">
                      {a.created_by_name && `${a.created_by_name} — `}
                      {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => deleteAnnouncement(a.id)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Grades Tab */}
      {tab === 'grades' && (
        <div className="space-y-4">
          {/* Create Assignment Form (teachers) */}
          {canManage && !gradingAssignmentId && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-sm font-medium text-ink mb-3">Create Assignment</h3>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Assignment title *"
                  value={newAssignmentTitle}
                  onChange={e => setNewAssignmentTitle(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Category (e.g. Homework, Quiz, Test)"
                  value={newAssignmentCategory}
                  onChange={e => setNewAssignmentCategory(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input
                  type="number"
                  step="1"
                  placeholder="Max points"
                  value={newAssignmentMax}
                  onChange={e => setNewAssignmentMax(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="date"
                  placeholder="Due date"
                  value={newAssignmentDue}
                  onChange={e => setNewAssignmentDue(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newAssignmentDesc}
                  onChange={e => setNewAssignmentDesc(e.target.value)}
                  className={inputClass}
                />
              </div>
              <button
                onClick={createAssignment}
                disabled={!newAssignmentTitle.trim()}
                className="px-4 py-2 bg-emerald-700 text-white text-sm rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors"
              >
                Create Assignment
              </button>
            </div>
          )}

          {/* Grade Entry View (when grading a specific assignment) */}
          {gradingAssignmentId && (() => {
            const assignment = assignments.find(a => a.id === gradingAssignmentId);
            if (!assignment) return null;
            return (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-medium text-ink">Grading: {assignment.title}</h3>
                    <p className="text-xs text-gray-500">Max points: {assignment.max_points}{assignment.due_date ? ` · Due: ${new Date(assignment.due_date).toLocaleDateString()}` : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveGrades} className="px-4 py-2 bg-emerald-700 text-white text-sm rounded-lg hover:bg-emerald-800 transition-colors">
                      Save Grades
                    </button>
                    <button onClick={() => setGradingAssignmentId(null)} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Student</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600 w-32">Score / {assignment.max_points}</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {roster.map(s => (
                      <tr key={s.id}>
                        <td className="px-4 py-2 text-ink">{s.first_name} {s.last_name}</td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            step="0.1"
                            placeholder="—"
                            value={gradeInputs[s.id]?.score ?? ''}
                            onChange={e => setGradeInputs(prev => ({ ...prev, [s.id]: { ...prev[s.id], score: e.target.value } }))}
                            className="w-24 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            placeholder="Optional"
                            value={gradeInputs[s.id]?.notes ?? ''}
                            onChange={e => setGradeInputs(prev => ({ ...prev, [s.id]: { ...prev[s.id], notes: e.target.value } }))}
                            className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Assignments List */}
          {!gradingAssignmentId && (
            <>
              {assignments.length === 0 ? (
                <p className="text-gray-500 text-sm">No assignments yet.</p>
              ) : (
                <div className="space-y-3">
                  {assignments.map(a => {
                    const assignmentGrades = grades.filter(g => g.assignment_id === a.id);
                    const scored = assignmentGrades.filter(g => g.score != null);
                    const avg = scored.length > 0 ? scored.reduce((sum, g) => sum + (g.score || 0), 0) / scored.length : null;
                    return (
                      <div key={a.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-ink text-sm">{a.title}</h4>
                              {a.category && (
                                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{a.category}</span>
                              )}
                              <span className="text-xs text-gray-400">{a.max_points} pts</span>
                            </div>
                            {a.description && <p className="text-xs text-gray-500 mt-1">{a.description}</p>}
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                              {a.due_date && <span>Due: {new Date(a.due_date).toLocaleDateString()}</span>}
                              {canManage && avg != null && (
                                <span>Avg: {avg.toFixed(1)}/{a.max_points} ({Math.round((avg / a.max_points) * 100)}%)</span>
                              )}
                              {canManage && <span>{scored.length} graded</span>}
                            </div>
                            {/* Parent view: show their child's grades inline */}
                            {!canManage && assignmentGrades.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {assignmentGrades.map(g => (
                                  <div key={g.id} className="text-sm">
                                    <span className="text-ink font-medium">{g.student_name}:</span>{' '}
                                    {g.score != null ? (
                                      <span>
                                        {g.score}/{a.max_points}
                                        <span className="text-gray-400 ml-1 text-xs">({Math.round((g.score / a.max_points) * 100)}%)</span>
                                      </span>
                                    ) : <span className="text-gray-400">Not graded</span>}
                                    {g.notes && <span className="text-gray-400 ml-2 text-xs">— {g.notes}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {canManage && (
                            <div className="flex gap-2 ml-3">
                              <button
                                onClick={() => openGrading(a.id)}
                                className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs rounded-lg hover:bg-emerald-100 transition-colors"
                              >
                                Grade
                              </button>
                              <button
                                onClick={() => deleteAssignment(a.id)}
                                className="text-red-500 hover:text-red-700 text-xs"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
