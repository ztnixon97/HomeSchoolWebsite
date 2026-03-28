import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/Toast';

interface ClassGroup {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  grading_enabled: boolean;
  created_at: string;
}

interface GroupMember {
  group_id: number;
  student_id: number;
  first_name: string;
  last_name: string;
}

interface Student {
  id: number;
  first_name: string;
  last_name: string;
}

interface GroupTeacher {
  group_id: number;
  user_id: number;
  display_name: string;
  email: string;
}

interface UserInfo {
  id: number;
  display_name: string;
  email: string;
  role: string;
}

export default function ManageClassGroups() {
  const { showToast } = useToast();
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [teachers, setTeachers] = useState<GroupTeacher[]>([]);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);

  // Create form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSortOrder, setEditSortOrder] = useState('');
  const [editGradingEnabled, setEditGradingEnabled] = useState(false);

  const refresh = () => {
    api.get<ClassGroup[]>('/api/admin/class-groups').then(setGroups).catch(() => {});
    api.get<GroupMember[]>('/api/admin/class-group-members').then(setMembers).catch(() => {});
    api.get<Student[]>('/api/students').then(setStudents).catch(() => {});
    api.get<GroupTeacher[]>('/api/admin/class-group-teachers').then(setTeachers).catch(() => {});
    api.get<UserInfo[]>('/api/admin/users').then(setAllUsers).catch(() => {});
  };

  useEffect(refresh, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/class-groups', {
        name,
        description: description || null,
        sort_order: sortOrder ? parseInt(sortOrder) : 0,
      });
      setName('');
      setDescription('');
      setSortOrder('');
      showToast('Group created', 'success');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to create group', 'error');
    }
  };

  const startEdit = (g: ClassGroup) => {
    setEditingId(g.id);
    setEditName(g.name);
    setEditDescription(g.description || '');
    setEditSortOrder(String(g.sort_order));
    setEditGradingEnabled(g.grading_enabled);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await api.put(`/api/admin/class-groups/${editingId}`, {
        name: editName,
        description: editDescription || null,
        sort_order: editSortOrder ? parseInt(editSortOrder) : 0,
        grading_enabled: editGradingEnabled,
      });
      setEditingId(null);
      showToast('Group updated', 'success');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to update group', 'error');
    }
  };

  const toggleActive = async (g: ClassGroup) => {
    await api.put(`/api/admin/class-groups/${g.id}`, { active: !g.active });
    refresh();
  };

  const deleteGroup = async (g: ClassGroup) => {
    if (!confirm(`Delete "${g.name}"? Students won't be deleted, only removed from this group.`)) return;
    try {
      await api.del(`/api/admin/class-groups/${g.id}`);
      showToast('Group deleted', 'success');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete group', 'error');
    }
  };

  const addMember = async (groupId: number, studentId: number) => {
    await api.post('/api/admin/class-group-members', { group_id: groupId, student_id: studentId });
    refresh();
  };

  const removeMember = async (groupId: number, studentId: number) => {
    await api.del(`/api/admin/class-group-members/${groupId}/${studentId}`);
    refresh();
  };

  const addTeacher = async (groupId: number, userId: number) => {
    await api.post('/api/admin/class-group-teachers', { group_id: groupId, user_id: userId });
    refresh();
  };

  const removeTeacher = async (groupId: number, userId: number) => {
    await api.del(`/api/admin/class-group-teachers/${groupId}/${userId}`);
    refresh();
  };

  const inputClass = "px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors";

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium mb-4 inline-block">
        &larr; Admin Dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-ink">Class Groups</h1>
        <p className="text-ink/60 text-sm mt-1">Organize students into named groups for scheduling and management.</p>
      </div>

      {/* Create Form */}
      <form onSubmit={create} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Create Group</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required className={`w-full ${inputClass}`} placeholder="e.g. Pre-K" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className={`w-full ${inputClass}`} placeholder="Optional" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sort Order</label>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} className={`w-full ${inputClass}`} placeholder="0" />
          </div>
        </div>
        <button type="submit" className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors">
          Create Group
        </button>
      </form>

      {/* Groups List */}
      <div className="space-y-3">
        {groups.map(g => {
          const groupMembers = members.filter(m => m.group_id === g.id);
          const assignedIds = new Set(groupMembers.map(m => m.student_id));
          const availableStudents = students.filter(s => !assignedIds.has(s.id));
          const groupTeachers = teachers.filter(t => t.group_id === g.id);
          const assignedTeacherIds = new Set(groupTeachers.map(t => t.user_id));
          const availableTeachers = allUsers.filter(u => (u.role === 'teacher' || u.role === 'admin') && !assignedTeacherIds.has(u.id));
          const isExpanded = expandedId === g.id;

          return (
            <div key={g.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              {editingId === g.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input value={editName} onChange={e => setEditName(e.target.value)} className={`w-full ${inputClass}`} placeholder="Name" />
                    <input value={editDescription} onChange={e => setEditDescription(e.target.value)} className={`w-full ${inputClass}`} placeholder="Description" />
                    <input type="number" value={editSortOrder} onChange={e => setEditSortOrder(e.target.value)} className={`w-full ${inputClass}`} placeholder="Sort Order" />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editGradingEnabled}
                      onChange={e => setEditGradingEnabled(e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Enable grading for this class
                  </label>
                  <div className="flex gap-3">
                    <button onClick={saveEdit} className="text-sm text-emerald-600 hover:text-emerald-800 font-medium py-2 px-3 rounded-lg">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-sm text-gray-500 py-2 px-3 rounded-lg">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{g.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${g.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                          {g.active ? 'Active' : 'Inactive'}
                        </span>
                        <span className="text-xs text-gray-400">{groupMembers.length} student{groupMembers.length !== 1 ? 's' : ''}</span>
                        {g.grading_enabled && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">Grading</span>}
                      </div>
                      {g.description && <p className="text-sm text-gray-500 mt-0.5">{g.description}</p>}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={() => setExpandedId(isExpanded ? null : g.id)} className="text-xs text-blue-500 hover:text-blue-700 font-medium py-2 px-3 rounded-lg">
                        {isExpanded ? 'Collapse' : 'Members'}
                      </button>
                      <button onClick={() => startEdit(g)} className="text-xs text-blue-500 hover:text-blue-700 font-medium py-2 px-3 rounded-lg">Edit</button>
                      <button onClick={() => toggleActive(g)} className="text-xs text-gray-500 hover:text-gray-700 font-medium py-2 px-3 rounded-lg">
                        {g.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => deleteGroup(g)} className="text-xs text-red-500 hover:text-red-700 font-medium py-2 px-3 rounded-lg">Delete</button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      {groupMembers.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {groupMembers.map(m => (
                            <span key={m.student_id} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-100">
                              {m.first_name} {m.last_name}
                              <button onClick={() => removeMember(g.id, m.student_id)} className="text-emerald-400 hover:text-red-500 font-bold ml-0.5">&times;</button>
                            </span>
                          ))}
                        </div>
                      )}
                      {availableStudents.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-xs">Add student:</span>
                          <select
                            onChange={e => { if (e.target.value) addMember(g.id, parseInt(e.target.value)); e.target.value = ''; }}
                            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            defaultValue=""
                          >
                            <option value="" disabled>Select student...</option>
                            {availableStudents.map(s => (
                              <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">All students are assigned to this group.</p>
                      )}

                      {/* Teachers Section */}
                      <div className="mt-4 pt-3 border-t border-gray-100">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Assigned Teachers</span>
                        {groupTeachers.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2 mb-3">
                            {groupTeachers.map(t => (
                              <span key={t.user_id} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-100">
                                {t.display_name}
                                <button onClick={() => removeTeacher(g.id, t.user_id)} className="text-blue-400 hover:text-red-500 font-bold ml-0.5">&times;</button>
                              </span>
                            ))}
                          </div>
                        )}
                        {groupTeachers.length === 0 && (
                          <p className="text-xs text-gray-400 mt-1 mb-2">No teachers assigned.</p>
                        )}
                        {availableTeachers.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs">Add teacher:</span>
                            <select
                              onChange={e => { if (e.target.value) addTeacher(g.id, parseInt(e.target.value)); e.target.value = ''; }}
                              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              defaultValue=""
                            >
                              <option value="" disabled>Select teacher...</option>
                              {availableTeachers.map(u => (
                                <option key={u.id} value={u.id}>{u.display_name} ({u.email})</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        {groups.length === 0 && (
          <div className="text-center py-12">
            <p className="text-ink/40">No class groups created yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
