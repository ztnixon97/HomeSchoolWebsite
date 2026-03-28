import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/Toast';

interface Standard {
  id: number;
  code: string;
  title: string;
  description: string | null;
  subject: string | null;
  grade_level: string | null;
  sort_order: number | null;
  created_at: string;
}

interface EditFields {
  code: string;
  title: string;
  description: string;
  subject: string;
  grade_level: string;
  sort_order: string;
}

const EMPTY_EDIT: EditFields = {
  code: '',
  title: '',
  description: '',
  subject: '',
  grade_level: '',
  sort_order: '',
};

const inputClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors';

export default function ManageStandards() {
  const { showToast } = useToast();

  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // create-form state
  const [form, setForm] = useState<EditFields>(EMPTY_EDIT);

  // inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<EditFields>(EMPTY_EDIT);

  // filter
  const [subjectFilter, setSubjectFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const refresh = async () => {
    try {
      const data = await api.get<Standard[]>('/api/standards');
      setStandards(data);
    } catch {
      showToast('Failed to load standards', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Derived subject list for filter dropdown
  const subjectOptions = Array.from(
    new Set(standards.map(s => s.subject).filter((s): s is string => !!s))
  ).sort();

  // Filtered + sorted list
  const visibleStandards = standards
    .filter(s => {
      const matchesSubject = !subjectFilter || s.subject === subjectFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        s.code.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q);
      return matchesSubject && matchesSearch;
    })
    .sort((a, b) => {
      // Sort by subject then sort_order then code
      if ((a.subject ?? '') < (b.subject ?? '')) return -1;
      if ((a.subject ?? '') > (b.subject ?? '')) return 1;
      const ao = a.sort_order ?? 0;
      const bo = b.sort_order ?? 0;
      if (ao !== bo) return ao - bo;
      return a.code.localeCompare(b.code);
    });

  // Group visible standards by subject
  const grouped: { subject: string; items: Standard[] }[] = [];
  for (const std of visibleStandards) {
    const subject = std.subject || 'Uncategorized';
    const last = grouped[grouped.length - 1];
    if (last && last.subject === subject) {
      last.items.push(std);
    } else {
      grouped.push({ subject, items: [std] });
    }
  }

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.title.trim()) {
      showToast('Code and title are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/admin/standards', {
        code: form.code.trim(),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        subject: form.subject.trim() || undefined,
        grade_level: form.grade_level.trim() || undefined,
        sort_order: form.sort_order !== '' ? parseInt(form.sort_order, 10) : undefined,
      });
      setForm(EMPTY_EDIT);
      showToast('Standard created', 'success');
      await refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to create standard', 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (s: Standard) => {
    setEditingId(s.id);
    setEditFields({
      code: s.code,
      title: s.title,
      description: s.description ?? '',
      subject: s.subject ?? '',
      grade_level: s.grade_level ?? '',
      sort_order: s.sort_order != null ? String(s.sort_order) : '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFields(EMPTY_EDIT);
  };

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setEditFields(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const saveEdit = async (id: number) => {
    if (!editFields.code.trim() || !editFields.title.trim()) {
      showToast('Code and title are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/api/admin/standards/${id}`, {
        code: editFields.code.trim(),
        title: editFields.title.trim(),
        description: editFields.description.trim() || undefined,
        subject: editFields.subject.trim() || undefined,
        grade_level: editFields.grade_level.trim() || undefined,
        sort_order:
          editFields.sort_order !== ''
            ? parseInt(editFields.sort_order, 10)
            : undefined,
      });
      setEditingId(null);
      setEditFields(EMPTY_EDIT);
      showToast('Standard updated', 'success');
      await refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to update standard', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.del(`/api/admin/standards/${id}`);
      setConfirmDeleteId(null);
      showToast('Standard deleted', 'success');
      await refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete standard', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium mb-4 inline-block">
        &larr; Admin Dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-ink">Manage Curriculum Standards</h1>
        <p className="text-ink/60 text-sm mt-1">
          Create and manage learning standards referenced across sessions and lesson plans.
        </p>
      </div>

      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold text-gray-900">New Standard</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="code"
              value={form.code}
              onChange={handleFormChange}
              placeholder="e.g. ELA.K.1"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleFormChange}
              placeholder="Short descriptive title"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
            <input
              type="text"
              name="subject"
              value={form.subject}
              onChange={handleFormChange}
              placeholder="e.g. English Language Arts"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Grade Level</label>
            <input
              type="text"
              name="grade_level"
              value={form.grade_level}
              onChange={handleFormChange}
              placeholder="e.g. K, 1, 2-3"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Sort Order</label>
            <input
              type="number"
              name="sort_order"
              value={form.sort_order}
              onChange={handleFormChange}
              placeholder="0"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleFormChange}
            placeholder="Detailed description of the standard (optional)"
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Standard'}
          </button>
        </div>
      </form>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by code, title, or description..."
          className={`flex-1 min-w-[200px] ${inputClass}`}
        />
        <select
          value={subjectFilter}
          onChange={e => setSubjectFilter(e.target.value)}
          className={`w-auto min-w-[180px] ${inputClass}`}
        >
          <option value="">All Subjects</option>
          {subjectOptions.map(subj => (
            <option key={subj} value={subj}>
              {subj}
            </option>
          ))}
        </select>
      </div>

      {/* Standards list */}
      {loading ? (
        <div className="text-center py-12 text-ink/40 text-sm">Loading standards...</div>
      ) : standards.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <p className="text-ink/40 text-sm">No standards yet. Create one above.</p>
        </div>
      ) : visibleStandards.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-xl">
          <p className="text-ink/40 text-sm">No standards match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.subject}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1">
                {group.subject}
              </h3>
              <div className="space-y-2">
                {group.items.map(std => (
                  <div
                    key={std.id}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm"
                  >
                    {editingId === std.id ? (
                      /* Inline edit form */
                      <div className="p-5 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Code <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              name="code"
                              value={editFields.code}
                              onChange={handleEditChange}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Title <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              name="title"
                              value={editFields.title}
                              onChange={handleEditChange}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Subject
                            </label>
                            <input
                              type="text"
                              name="subject"
                              value={editFields.subject}
                              onChange={handleEditChange}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Grade Level
                            </label>
                            <input
                              type="text"
                              name="grade_level"
                              value={editFields.grade_level}
                              onChange={handleEditChange}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Sort Order
                            </label>
                            <input
                              type="number"
                              name="sort_order"
                              value={editFields.sort_order}
                              onChange={handleEditChange}
                              className={inputClass}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Description
                          </label>
                          <textarea
                            name="description"
                            value={editFields.description}
                            onChange={handleEditChange}
                            rows={3}
                            className={`${inputClass} resize-none`}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(std.id)}
                            disabled={saving}
                            className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-xs font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={saving}
                            className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : confirmDeleteId === std.id ? (
                      /* Delete confirmation */
                      <div className="p-5 flex items-center justify-between gap-4">
                        <p className="text-sm text-gray-700">
                          Delete{' '}
                          <span className="font-semibold">{std.code}</span>? This cannot be undone.
                        </p>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleDelete(std.id)}
                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
                          >
                            Confirm Delete
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-1.5 border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Read-only row */
                      <div className="p-4 flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-mono text-xs font-semibold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded">
                              {std.code}
                            </span>
                            {std.grade_level && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                Grade {std.grade_level}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-900 leading-snug">
                            {std.title}
                          </p>
                          {std.description && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {std.description}
                            </p>
                          )}
                          <p className="text-xs text-gray-300 mt-1.5">
                            Added {new Date(std.created_at).toLocaleDateString()}
                            {std.sort_order != null && ` · order ${std.sort_order}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => startEdit(std)}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(std.id)}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
