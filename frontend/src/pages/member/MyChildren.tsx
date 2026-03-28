import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useFeatures } from '../../features';

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  notes: string | null;
  allergies: string;
  dietary_restrictions: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  enrolled: boolean;
}

interface Milestone {
  id: number;
  student_id: number;
  recorded_by: number;
  category: string;
  title: string;
  notes: string | null;
  achieved_date: string | null;
  created_at: string;
}

interface FamilyMember {
  id: number;
  display_name: string;
  email: string;
  role: string;
}

interface FamilyDetail {
  id: number;
  name: string;
  members: FamilyMember[];
  children: Student[];
}

interface FamilyInvite {
  id: number;
  family_id: number;
  family_name: string;
  invited_by_name: string;
  status: string;
  created_at: string;
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
  const { user } = useAuth();
  const features = useFeatures();
  const [children, setChildren] = useState<Student[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Student>>({});
  const [createForm, setCreateForm] = useState<Partial<Student>>({});
  const [creating, setCreating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Family state
  const [family, setFamily] = useState<FamilyDetail | null>(null);
  const [pendingInvites, setPendingInvites] = useState<FamilyInvite[]>([]);
  const [showCreateFamily, setShowCreateFamily] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [familyError, setFamilyError] = useState('');
  const [editingFamilyName, setEditingFamilyName] = useState(false);
  const [editFamilyName, setEditFamilyName] = useState('');

  // Milestones (parent progress view)
  const [expandedChild, setExpandedChild] = useState<number | null>(null);
  const [milestones, setMilestones] = useState<Record<number, Milestone[]>>({});

  const refresh = () => {
    api.get<Student[]>('/api/my-children').then(setChildren).catch(() => {});
    if (features.families) {
      api.get<FamilyDetail>('/api/my-family').then(setFamily).catch(() => setFamily(null));
      api.get<FamilyInvite[]>('/api/my-invites').then(setPendingInvites).catch(() => setPendingInvites([]));
    }
  };

  useEffect(refresh, []);

  const toggleMilestones = (childId: number) => {
    if (expandedChild === childId) {
      setExpandedChild(null);
      return;
    }
    setExpandedChild(childId);
    if (!milestones[childId]) {
      api.get<Milestone[]>(`/api/my-children/${childId}/milestones`)
        .then(ms => setMilestones(prev => ({ ...prev, [childId]: ms })))
        .catch(() => setMilestones(prev => ({ ...prev, [childId]: [] })));
    }
  };

  const categoryColors: Record<string, string> = {
    social: 'bg-blue-100 text-blue-700',
    motor: 'bg-green-100 text-green-700',
    language: 'bg-purple-100 text-purple-700',
    cognitive: 'bg-amber-100 text-amber-700',
    creative: 'bg-pink-100 text-pink-700',
  };

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
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
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
        emergency_contact_name: createForm.emergency_contact_name || null,
        emergency_contact_phone: createForm.emergency_contact_phone || null,
      });
      setCreateForm({});
      refresh();
    } finally {
      setCreating(false);
    }
  };

  const handleCreateFamily = async () => {
    if (!familyName.trim()) return;
    setFamilyError('');
    try {
      await api.post('/api/my-family', { name: familyName.trim() });
      setFamilyName('');
      setShowCreateFamily(false);
      refresh();
    } catch (err: any) {
      setFamilyError(err.message || 'Failed to create family');
    }
  };

  const handleInviteMember = async () => {
    if (!inviteEmail.trim()) return;
    setFamilyError('');
    try {
      await api.post('/api/my-family/invite', { email: inviteEmail.trim() });
      setInviteEmail('');
      refresh();
    } catch (err: any) {
      setFamilyError(err.message || 'Failed to send invite');
    }
  };

  const handleAcceptInvite = async (id: number) => {
    try {
      await api.post(`/api/my-invites/${id}/accept`);
      refresh();
      // Force page reload to update auth context with new family_id
      window.location.reload();
    } catch (err: any) {
      setFamilyError(err.message || 'Failed to accept invite');
    }
  };

  const handleDeclineInvite = async (id: number) => {
    await api.post(`/api/my-invites/${id}/decline`);
    refresh();
  };

  const handleLeaveFamily = async () => {
    if (!window.confirm('Are you sure you want to leave this family?')) return;
    await api.del('/api/my-family');
    refresh();
    window.location.reload();
  };

  const handleSaveFamilyName = async () => {
    if (!editFamilyName.trim()) return;
    await api.put('/api/my-family', { name: editFamilyName.trim() });
    setEditingFamilyName(false);
    refresh();
  };

  return (
    <div className="space-y-6">
      <Link to="/dashboard" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium mb-4 inline-block">&larr; Dashboard</Link>
      <div>
        <h1 className="text-2xl font-bold text-ink">My Children</h1>
        <p className="text-sm text-ink/60 mt-1">Add and manage the child profiles tied to your family.</p>
      </div>

      {/* Pending family invites */}
      {features.families && pendingInvites.length > 0 && (
        <div className="space-y-2">
          {pendingInvites.map(inv => (
            <div key={inv.id} className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
              <div className="text-sm text-blue-800">
                <span className="font-semibold">{inv.invited_by_name}</span> invited you to join <span className="font-semibold">{inv.family_name}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleAcceptInvite(inv.id)} className="btn-primary text-xs px-3 py-1.5">Accept</button>
                <button onClick={() => handleDeclineInvite(inv.id)} className="btn-ghost text-xs px-3 py-1.5">Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Family section */}
      {features.families && (family ? (
        <div className="panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            {editingFamilyName ? (
              <div className="flex items-center gap-2">
                <input
                  className="px-3 py-1.5 border border-ink/20 rounded text-sm"
                  value={editFamilyName}
                  onChange={e => setEditFamilyName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveFamilyName()}
                />
                <button onClick={handleSaveFamilyName} className="text-xs text-cobalt font-medium">Save</button>
                <button onClick={() => setEditingFamilyName(false)} className="text-xs text-ink/50">Cancel</button>
              </div>
            ) : (
              <h2 className="text-lg font-semibold text-ink">
                {family.name}
                <button
                  onClick={() => { setEditFamilyName(family.name); setEditingFamilyName(true); }}
                  className="ml-2 text-xs text-ink/40 hover:text-ink/60"
                  title="Rename family"
                >
                  (edit)
                </button>
              </h2>
            )}
            <button onClick={handleLeaveFamily} className="text-xs text-ink/40 hover:text-red-600">Leave family</button>
          </div>

          <div className="text-sm text-ink/70">
            <span className="font-medium text-ink/50 text-xs uppercase tracking-wider">Members:</span>{' '}
            {family.members.map(m => m.display_name).join(', ')}
          </div>

          {/* Invite form */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-ink/50 mb-1">Invite a family member</label>
              <input
                type="email"
                className="w-full px-3 py-2 border border-ink/20 rounded text-sm"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="Enter their email address"
                onKeyDown={e => e.key === 'Enter' && handleInviteMember()}
              />
            </div>
            <button onClick={handleInviteMember} className="btn-primary text-sm px-4 py-2">Invite</button>
          </div>

          {familyError && <p className="text-red-600 text-sm">{familyError}</p>}
        </div>
      ) : !user?.family_id && (
        <div className="panel-quiet p-5">
          {showCreateFamily ? (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-ink">Create a Family</h2>
              <p className="text-sm text-ink/60">Create a family group to share children and RSVPs with your partner.</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 border border-ink/20 rounded text-sm"
                  value={familyName}
                  onChange={e => setFamilyName(e.target.value)}
                  placeholder="Family name (e.g. The Smith Family)"
                  onKeyDown={e => e.key === 'Enter' && handleCreateFamily()}
                />
                <button onClick={handleCreateFamily} className="btn-primary text-sm">Create</button>
                <button onClick={() => setShowCreateFamily(false)} className="btn-ghost text-sm">Cancel</button>
              </div>
              {familyError && <p className="text-red-600 text-sm">{familyError}</p>}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink/60">Create a family to share children & RSVPs with your partner.</p>
              <button onClick={() => setShowCreateFamily(true)} className="btn-primary text-sm">Create a Family</button>
            </div>
          )}
        </div>
      ))}

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
            <input
              className="px-3 py-2 border border-ink/20 rounded"
              value={createForm.emergency_contact_name || ''}
              onChange={e => setCreateForm(f => ({ ...f, emergency_contact_name: e.target.value }))}
              placeholder="Emergency contact name"
            />
            <input
              type="tel"
              className="px-3 py-2 border border-ink/20 rounded"
              value={createForm.emergency_contact_phone || ''}
              onChange={e => setCreateForm(f => ({ ...f, emergency_contact_phone: e.target.value }))}
              placeholder="Emergency contact phone"
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input className="px-3 py-2 border border-ink/20 rounded" value={form.first_name || ''} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} placeholder="First name" />
                    <input className="px-3 py-2 border border-ink/20 rounded" value={form.last_name || ''} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Last name" />
                  </div>
                  <input type="date" className="px-3 py-2 border border-ink/20 rounded" value={form.date_of_birth || ''} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
                  <input className="px-3 py-2 border border-ink/20 rounded" value={form.allergies || ''} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} placeholder="Allergies" />
                  <input className="px-3 py-2 border border-ink/20 rounded" value={form.dietary_restrictions || ''} onChange={e => setForm(f => ({ ...f, dietary_restrictions: e.target.value }))} placeholder="Dietary restrictions" />
                  <input className="px-3 py-2 border border-ink/20 rounded" value={form.emergency_contact_name || ''} onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))} placeholder="Emergency contact name" />
                  <input type="tel" className="px-3 py-2 border border-ink/20 rounded" value={form.emergency_contact_phone || ''} onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} placeholder="Emergency contact phone" />
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
                  {(c.emergency_contact_name || c.emergency_contact_phone) && (
                    <div className="text-sm text-ink/70">Emergency Contact: {[c.emergency_contact_name, c.emergency_contact_phone].filter(Boolean).join(' - ')}</div>
                  )}
                  {c.notes && <div className="text-sm text-ink/60">Notes: {c.notes}</div>}

                  {features.student_progress && (
                    <div className="mt-3 pt-3 border-t border-ink/10">
                      <button
                        onClick={() => toggleMilestones(c.id)}
                        className="text-sm text-cobalt hover:text-ink font-medium"
                      >
                        {expandedChild === c.id ? 'Hide Progress' : 'View Progress'}
                      </button>
                      {expandedChild === c.id && (
                        <div className="mt-3 space-y-2">
                          {!milestones[c.id] ? (
                            <p className="text-sm text-ink/50">Loading...</p>
                          ) : milestones[c.id].length === 0 ? (
                            <p className="text-sm text-ink/50">No milestones recorded yet.</p>
                          ) : (
                            milestones[c.id].map(m => (
                              <div key={m.id} className="flex items-start gap-2 text-sm">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryColors[m.category] || 'bg-gray-100 text-gray-700'}`}>
                                  {m.category}
                                </span>
                                <div>
                                  <span className="font-medium text-ink">{m.title}</span>
                                  {m.notes && <span className="text-ink/60 ml-1">— {m.notes}</span>}
                                  {m.achieved_date && (
                                    <span className="text-ink/40 ml-1 text-xs">
                                      ({new Date(m.achieved_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
