import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';

interface Student {
  id: number;
  first_name: string;
  last_name: string;
}

interface Milestone {
  id: number;
  category: string;
  title: string;
  notes: string | null;
  achieved_date: string | null;
  created_at: string;
}

export default function StudentProgress() {
  const { id } = useParams();
  const [students, setStudents] = useState<Student[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selected, setSelected] = useState<number | null>(id ? parseInt(id) : null);

  // New milestone form
  const [newCategory, setNewCategory] = useState('social');
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Student[]>('/api/students').then(s => {
      setStudents(s);
      if (!selected && s.length > 0) setSelected(s[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selected) {
      api.get<Milestone[]>(`/api/students/${selected}/milestones`).then(setMilestones).catch(() => {});
    }
  }, [selected]);

  const addMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await api.post('/api/milestones', {
        student_id: selected,
        category: newCategory,
        title: newTitle,
        notes: newNotes || null,
      });
      setNewTitle('');
      setNewNotes('');
      // Refresh
      const ms = await api.get<Milestone[]>(`/api/students/${selected}/milestones`);
      setMilestones(ms);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const selectedStudent = students.find(s => s.id === selected);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Student Progress</h1>
        <Link to="/admin/students" className="text-sm text-blue-600">Manage Students</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {students.map(s => (
          <button
            key={s.id}
            onClick={() => setSelected(s.id)}
            className={`px-3 py-1.5 rounded text-sm ${
              selected === s.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {s.first_name} {s.last_name}
          </button>
        ))}
      </div>

      {selectedStudent && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Milestones list */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">{selectedStudent.first_name}'s Milestones</h2>
            {milestones.length === 0 ? (
              <p className="text-gray-500 text-sm">No milestones yet.</p>
            ) : (
              <div className="space-y-2">
                {milestones.map(m => (
                  <div key={m.id} className="p-3 border border-gray-100 rounded text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{m.title}</span>
                      <span className="text-xs text-gray-400 capitalize">{m.category}</span>
                    </div>
                    {m.notes && <p className="text-xs text-gray-500 mt-1">{m.notes}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      {m.achieved_date ? `Achieved: ${new Date(m.achieved_date).toLocaleDateString()}` : 'In progress'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add milestone form */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Add Milestone</h2>
            <form onSubmit={addMilestone} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                >
                  <option value="social">Social</option>
                  <option value="motor">Motor</option>
                  <option value="language">Language</option>
                  <option value="cognitive">Cognitive</option>
                  <option value="creative">Creative</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Milestone</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  required
                  placeholder="e.g., Counts to 10"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="bg-gray-900 text-white px-4 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Milestone'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
