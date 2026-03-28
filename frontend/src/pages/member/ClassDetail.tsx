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

interface ClassGrade {
  id: number;
  group_id: number;
  student_id: number;
  student_name: string | null;
  assignment_title: string;
  grade: number | null;
  max_grade: number | null;
  notes: string | null;
  graded_by: number;
  graded_by_name: string | null;
  created_at: string;
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
  // Grades
  const [grades, setGrades] = useState<ClassGrade[]>([]);
  const [gradeStudentId, setGradeStudentId] = useState('');
  const [gradeAssignment, setGradeAssignment] = useState('');
  const [gradeValue, setGradeValue] = useState('');
  const [gradeMax, setGradeMax] = useState('');
  const [gradeNotes, setGradeNotes] = useState('');
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
      api.get<{ grading_enabled: boolean; grades: ClassGrade[] }>(`/api/class-groups/${id}/grades`).then(data => {
        setGrades(data.grades);
      }).catch(() => {});
      // Also fetch roster for the grade form (teacher needs student list)
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

  const createGrade = async () => {
    if (!gradeStudentId || !gradeAssignment.trim()) return;
    try {
      const newGrade = await api.post<ClassGrade>('/api/admin/class-grades', {
        group_id: Number(id),
        student_id: Number(gradeStudentId),
        assignment_title: gradeAssignment,
        grade: gradeValue ? parseFloat(gradeValue) : null,
        max_grade: gradeMax ? parseFloat(gradeMax) : null,
        notes: gradeNotes || null,
      });
      setGrades(prev => [...prev, newGrade]);
      setGradeStudentId('');
      setGradeAssignment('');
      setGradeValue('');
      setGradeMax('');
      setGradeNotes('');
      addToast('Grade added', 'success');
    } catch {
      addToast('Failed to add grade', 'error');
    }
  };

  const deleteGrade = async (gradeId: number) => {
    try {
      await api.del(`/api/admin/class-grades/${gradeId}`);
      setGrades(prev => prev.filter(g => g.id !== gradeId));
      addToast('Grade deleted', 'success');
    } catch {
      addToast('Failed to delete grade', 'error');
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
          {canManage && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-sm font-medium text-ink mb-3">Add Grade</h3>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <select
                  value={gradeStudentId}
                  onChange={e => setGradeStudentId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select student...</option>
                  {roster.map(s => (
                    <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Assignment title"
                  value={gradeAssignment}
                  onChange={e => setGradeAssignment(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input
                  type="number"
                  step="0.1"
                  placeholder="Grade"
                  value={gradeValue}
                  onChange={e => setGradeValue(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="number"
                  step="0.1"
                  placeholder="Max grade"
                  value={gradeMax}
                  onChange={e => setGradeMax(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={gradeNotes}
                  onChange={e => setGradeNotes(e.target.value)}
                  className={inputClass}
                />
              </div>
              <button
                onClick={createGrade}
                disabled={!gradeStudentId || !gradeAssignment.trim()}
                className="px-4 py-2 bg-emerald-700 text-white text-sm rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors"
              >
                Add Grade
              </button>
            </div>
          )}
          {grades.length === 0 ? (
            <p className="text-gray-500 text-sm">No grades recorded yet.</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Student</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Assignment</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Grade</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Notes</th>
                    {canManage && <th className="text-right px-4 py-3 font-medium text-gray-600"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {grades.map(g => (
                    <tr key={g.id}>
                      <td className="px-4 py-3 text-ink">{g.student_name}</td>
                      <td className="px-4 py-3 text-ink">{g.assignment_title}</td>
                      <td className="px-4 py-3 text-ink">
                        {g.grade != null ? (
                          <span>
                            {g.grade}{g.max_grade != null ? `/${g.max_grade}` : ''}
                            {g.max_grade != null && g.max_grade > 0 && (
                              <span className="text-gray-400 ml-1 text-xs">
                                ({Math.round((g.grade / g.max_grade) * 100)}%)
                              </span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{g.notes || '—'}</td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => deleteGrade(g.id)}
                            className="text-red-500 hover:text-red-700 text-xs"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
