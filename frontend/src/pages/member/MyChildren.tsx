import { useEffect, useState } from 'react';
import { api } from '../../api';

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  notes: string | null;
  allergies: string;
  dietary_restrictions: string;
  enrolled: boolean;
}

function formatDOB(dob: string): string {
  const d = new Date(dob + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function calculateAge(dob: string): number {
  const birth = new Date(dob + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export default function MyChildren() {
  const [children, setChildren] = useState<Student[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Student>>({});
  const [createForm, setCreateForm] = useState<Partial<Student>>({});
  const [creating, setCreating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const refresh = () => {
    api.get<Student[]>('/api/my-children').then(setChildren).catch(() => {});
  };

  useEffect(refresh, []);

  const startEdit = (c: Student) => {
    setEditingId(c.id);
    setForm({ ...c });
  };

  const save = async () => {
    if (!editingId) return;
    await api.put(`/api/my-children/${editingId}`, {
      first_name: form.first_name,
      last_name: form.last_name,
      date_of_birth: form.date_of_birth || null,
      notes: form.notes || null,
      allergies: form.allergies || null,
      dietary_restrictions: form.dietary_restrictions || null,
    });
    setEditingId(null);
    refresh();
  };

  const deleteChild = async (id: number, name: string) => {
    const ok = window.confirm(`Remove ${name} from your profile?`);
    if (!ok) return;
    await api.del(`/api/my-children/${id}`);
    refresh();
  };

  const createChild = async () => {
    if (!createForm.first_name || !createForm.last_name) return;
    setCreating(true);
    try {
      await api.post('/api/my-children', {
        first_name: createForm.first_name,
        last_name: createForm.last_name,
        date_of_birth: createForm.date_of_birth || null,
        notes: createForm.notes || null,
        allergies: createForm.allergies || null,
        dietary_restrictions: createForm.dietary_restrictions || null,
      });
      setCreateForm({});
      refresh();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink">My Children</h1>
        <p className="text-sm text-ink/60 mt-1">Add and manage the child profiles tied to your family.</p>
      </div>

      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="btn-primary text-sm"
        >
          + Add a Child
        </button>
      ) : (
        <div className="panel-quiet p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Add a child</h2>
            <button onClick={() => { setShowAddForm(false); setCreateForm({}); }} className="text-sm text-ink/50 hover:text-ink">Cancel</button>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <input
              className="px-3 py-2 border border-ink/20 rounded"
              value={createForm.first_name || ''}
              onChange={e => setCreateForm(f => ({ ...f, first_name: e.target.value }))}
              placeholder="First name"
            />
            <input
              className="px-3 py-2 border border-ink/20 rounded"
              value={createForm.last_name || ''}
              onChange={e => setCreateForm(f => ({ ...f, last_name: e.target.value }))}
              placeholder="Last name"
            />
            <div>
              <label className="block text-xs text-ink/50 mb-1">Date of Birth</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-ink/20 rounded"
                value={createForm.date_of_birth || ''}
                onChange={e => setCreateForm(f => ({ ...f, date_of_birth: e.target.value }))}
              />
            </div>
            <input
              className="px-3 py-2 border border-ink/20 rounded"
              value={createForm.allergies || ''}
              onChange={e => setCreateForm(f => ({ ...f, allergies: e.target.value }))}
              placeholder="Allergies"
            />
            <input
              className="px-3 py-2 border border-ink/20 rounded"
              value={createForm.dietary_restrictions || ''}
              onChange={e => setCreateForm(f => ({ ...f, dietary_restrictions: e.target.value }))}
              placeholder="Dietary restrictions"
            />
          </div>
          <textarea
            className="w-full px-3 py-2 border border-ink/20 rounded"
            value={createForm.notes || ''}
            onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Notes"
            rows={2}
          />
          <div>
            <button
              onClick={() => { createChild(); setShowAddForm(false); }}
              className="btn-primary text-sm"
              disabled={creating}
            >
              {creating ? 'Adding...' : 'Add child'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {children.length === 0 ? (
          <div className="panel-quiet p-6 text-sm text-ink/60">
            No children on your profile yet.
          </div>
        ) : (
          children.map(c => (
            <div key={c.id} className="panel p-5">
              {editingId === c.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input className="px-3 py-2 border border-ink/20 rounded" value={form.first_name || ''} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} placeholder="First name" />
                    <input className="px-3 py-2 border border-ink/20 rounded" value={form.last_name || ''} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Last name" />
                  </div>
                  <input type="date" className="px-3 py-2 border border-ink/20 rounded" value={form.date_of_birth || ''} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
                  <input className="px-3 py-2 border border-ink/20 rounded" value={form.allergies || ''} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} placeholder="Allergies" />
                  <input className="px-3 py-2 border border-ink/20 rounded" value={form.dietary_restrictions || ''} onChange={e => setForm(f => ({ ...f, dietary_restrictions: e.target.value }))} placeholder="Dietary restrictions" />
                  <textarea className="px-3 py-2 border border-ink/20 rounded" value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" rows={2} />
                  <div className="flex gap-2">
                    <button onClick={save} className="btn-primary text-sm">Save</button>
                    <button onClick={() => setEditingId(null)} className="btn-ghost text-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-ink">{c.first_name} {c.last_name}</h2>
                  <div className="flex items-center gap-3 text-sm">
                    <button onClick={() => startEdit(c)} className="text-cobalt hover:text-ink">Edit</button>
                    <button onClick={() => deleteChild(c.id, `${c.first_name} ${c.last_name}`)} className="text-ink/50 hover:text-ink">
                      Delete
                    </button>
                  </div>
                </div>
                  {c.date_of_birth && <div className="text-sm text-ink/60">Born {formatDOB(c.date_of_birth)} (age {calculateAge(c.date_of_birth)})</div>}
                  {c.allergies && <div className="text-sm text-ink/70">Allergies: {c.allergies}</div>}
                  {c.dietary_restrictions && <div className="text-sm text-ink/70">Dietary: {c.dietary_restrictions}</div>}
                  {c.notes && <div className="text-sm text-ink/60">Notes: {c.notes}</div>}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
