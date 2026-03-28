import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import type { User } from '../../auth';
import { useFeatures } from '../../features';
import { useToast } from '../../components/Toast';

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  notes: string | null;
  allergies: string;
  dietary_restrictions: string;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  enrolled: boolean;
}

interface StudentParentLink {
  student_id: number;
  user_id: number;
  display_name: string;
  email: string;
}

interface ClassGroup {
  id: number;
  name: string;
}

interface GroupMember {
  group_id: number;
  student_id: number;
}

export default function ManageStudents() {
  const features = useFeatures();
  const { showToast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [parentLinks, setParentLinks] = useState<StudentParentLink[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [allergies, setAllergies] = useState('');
  const [dietary, setDietary] = useState('');
  const [notes, setNotes] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  const refresh = () => {
    api.get<Student[]>('/api/students').then(setStudents).catch(() => {});
    api.get<User[]>('/api/admin/users').then(setUsers).catch(() => {});
    api.get<StudentParentLink[]>('/api/admin/student-parents').then(setParentLinks).catch(() => {});
    if (features.class_groups) {
      api.get<ClassGroup[]>('/api/admin/class-groups').then(setClassGroups).catch(() => {});
      api.get<GroupMember[]>('/api/admin/class-group-members').then(setGroupMembers).catch(() => {});
    }
  };

  useEffect(refresh, []);

  const clearForm = () => {
    setFirstName('');
    setLastName('');
    setDob('');
    setAllergies('');
    setDietary('');
    setNotes('');
    setEmergencyName('');
    setEmergencyPhone('');
  };

  const startEdit = (s: Student) => {
    setEditingId(s.id);
    setFirstName(s.first_name);
    setLastName(s.last_name);
    setDob(s.date_of_birth || '');
    setAllergies(s.allergies || '');
    setDietary(s.dietary_restrictions || '');
    setNotes(s.notes || '');
    setEmergencyName(s.emergency_contact_name || '');
    setEmergencyPhone(s.emergency_contact_phone || '');
    setShowForm(true);
  };

  const addStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dob || null,
      allergies: allergies || null,
      dietary_restrictions: dietary || null,
      notes: notes || null,
      emergency_contact_name: emergencyName || null,
      emergency_contact_phone: emergencyPhone || null,
    };
    try {
      if (editingId) {
        await api.put(`/api/admin/students/${editingId}`, payload);
        showToast('Student updated', 'success');
      } else {
        await api.post('/api/admin/students', payload);
        showToast('Student added', 'success');
      }
      clearForm();
      setEditingId(null);
      setShowForm(false);
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to save student', 'error');
    }
  };

  const deleteStudent = async (id: number) => {
    if (!confirm('Are you sure you want to delete this?')) return;
    await api.del(`/api/admin/students/${id}`);
    refresh();
  };

  const linkParent = async (studentId: number, userId: number) => {
    await api.post('/api/admin/student-parents', { student_id: studentId, user_id: userId });
    refresh();
  };

  const unlinkParent = async (studentId: number, userId: number, name: string) => {
    if (!confirm(`Unlink ${name} from this student?`)) return;
    await api.del(`/api/admin/student-parents/${studentId}/${userId}`);
    refresh();
  };

  const [search, setSearch] = useState('');
  const parents = users.filter(u => u.role === 'parent' || u.role === 'teacher');
  const inputClass = "px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors";

  const filteredStudents = students.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.first_name.toLowerCase().includes(q) ||
      s.last_name.toLowerCase().includes(q) ||
      (s.allergies && s.allergies.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium mb-4 inline-block">
        ← Admin Dashboard
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Manage Students</h1>
          <p className="text-ink/60 text-sm mt-1">Add students and link them to their parents.</p>
        </div>
        <button
          onClick={() => { if (showForm) { clearForm(); setEditingId(null); } setShowForm(!showForm); }}
          className="bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors"
        >
          {showForm ? 'Cancel' : 'Add Student'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addStudent} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">First Name</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required className={`w-full ${inputClass}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Last Name</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} required className={`w-full ${inputClass}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date of Birth</label>
              <input type="date" value={dob} onChange={e => setDob(e.target.value)} className={`w-full ${inputClass}`} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Allergies</label>
              <input type="text" value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="e.g. peanuts, dairy" className={`w-full ${inputClass}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Dietary Restrictions</label>
              <input type="text" value={dietary} onChange={e => setDietary(e.target.value)} placeholder="e.g. vegetarian, gluten-free" className={`w-full ${inputClass}`} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Emergency Contact Name</label>
              <input type="text" value={emergencyName} onChange={e => setEmergencyName(e.target.value)} placeholder="Parent/guardian name" className={`w-full ${inputClass}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Emergency Contact Phone</label>
              <input type="tel" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} placeholder="Phone number" className={`w-full ${inputClass}`} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any additional notes" className={`w-full ${inputClass}`} />
          </div>
          <button type="submit" className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors">
            {editingId ? 'Update Student' : 'Save Student'}
          </button>
        </form>
      )}

      {/* Search */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or allergies..."
          className={`flex-1 min-w-[200px] ${inputClass}`}
        />
      </div>

      <div className="space-y-4">
        {filteredStudents.map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">{s.first_name} {s.last_name}</h3>
                {s.date_of_birth && <p className="text-xs text-gray-400 mt-0.5">Born: {s.date_of_birth}</p>}
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {s.allergies && (
                    <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-100">
                      Allergies: {s.allergies}
                    </span>
                  )}
                  {s.dietary_restrictions && (
                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100">
                      Dietary: {s.dietary_restrictions}
                    </span>
                  )}
                  {features.class_groups && groupMembers.filter(gm => gm.student_id === s.id).map(gm => {
                    const group = classGroups.find(g => g.id === gm.group_id);
                    return group ? (
                      <span key={gm.group_id} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100">
                        {group.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {features.student_progress && <Link
                  to={`/student-progress/${s.id}`}
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-medium"
                >
                  View Progress
                </Link>}
                <button onClick={() => startEdit(s)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">
                  Edit
                </button>
                <button onClick={() => deleteStudent(s.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">
                  Remove
                </button>
              </div>
            </div>

            {parentLinks.filter(pl => pl.student_id === s.id).length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-50 mb-1">
                <span className="text-gray-400 text-xs">Linked parents:</span>
                {parentLinks.filter(pl => pl.student_id === s.id).map(pl => (
                  <span key={pl.user_id} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">
                    {pl.display_name}
                    <button onClick={() => unlinkParent(s.id, pl.user_id, pl.display_name)} className="text-blue-400 hover:text-red-500 font-bold ml-0.5">&times;</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
              <span className="text-gray-400 text-xs">Link parent:</span>
              <select
                onChange={e => { if (e.target.value) linkParent(s.id, parseInt(e.target.value)); e.target.value = ''; }}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                defaultValue=""
              >
                <option value="" disabled>Select parent...</option>
                {parents.map(p => (
                  <option key={p.id} value={p.id}>{p.display_name} ({p.email})</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {filteredStudents.length === 0 && (
          <div className="text-center py-12">
            <p className="text-ink/40">{search ? 'No students match your search.' : 'No students enrolled yet.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
