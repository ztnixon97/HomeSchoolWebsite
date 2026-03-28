import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/Toast';

interface DocumentTemplate {
  id: number;
  title: string;
  description: string | null;
  category: string;
  required: boolean;
  active: boolean;
  file_id: number | null;
  created_by: number;
  created_by_name: string | null;
  created_at: string;
}

interface DocumentSubmission {
  id: number;
  template_id: number;
  template_title: string;
  user_id: number;
  user_name: string;
  student_id: number | null;
  file_id: number | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
}

const CATEGORIES = ['waiver', 'medical', 'registration', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

function formatCategory(cat: string) {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

const inputClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors';

export default function ManageDocuments() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [submissions, setSubmissions] = useState<DocumentSubmission[]>([]);
  const [activeTab, setActiveTab] = useState<'templates' | 'submissions'>('templates');

  // Template form state
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState<Category>('waiver');
  const [formRequired, setFormRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  // Submission review state
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  // Filter state
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState('');

  const { showToast } = useToast();

  const refresh = () => {
    api.get<DocumentTemplate[]>('/api/admin/document-templates').then(setTemplates).catch(() => {});
    api
      .get<DocumentSubmission[]>('/api/admin/document-submissions')
      .then(setSubmissions)
      .catch(() => {});
  };

  useEffect(refresh, []);

  const resetForm = () => {
    setEditingTemplate(null);
    setFormTitle('');
    setFormDescription('');
    setFormCategory('waiver');
    setFormRequired(false);
  };

  const startEdit = (t: DocumentTemplate) => {
    setEditingTemplate(t);
    setFormTitle(t.title);
    setFormDescription(t.description ?? '');
    setFormCategory((CATEGORIES.includes(t.category as Category) ? t.category : 'other') as Category);
    setFormRequired(t.required);
    setActiveTab('templates');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const body = {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        category: formCategory,
        required: formRequired,
      };
      if (editingTemplate) {
        await api.put(`/api/admin/document-templates/${editingTemplate.id}`, body);
        showToast('Template updated', 'success');
      } else {
        await api.post('/api/admin/document-templates', body);
        showToast('Template created', 'success');
      }
      resetForm();
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (t: DocumentTemplate) => {
    try {
      await api.put(`/api/admin/document-templates/${t.id}`, { active: !t.active });
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to update template', 'error');
    }
  };

  const deleteTemplate = async (t: DocumentTemplate) => {
    if (!window.confirm(`Delete template "${t.title}"? This cannot be undone.`)) return;
    try {
      await api.del(`/api/admin/document-templates/${t.id}`);
      showToast('Template deleted', 'success');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete template', 'error');
    }
  };

  const reviewSubmission = async (submissionId: number, status: 'approved' | 'rejected') => {
    setReviewSaving(true);
    try {
      await api.put(`/api/admin/document-submissions/${submissionId}`, {
        status,
        notes: reviewNotes.trim() || undefined,
      });
      showToast(`Submission ${status}`, 'success');
      setReviewingId(null);
      setReviewNotes('');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to update submission', 'error');
    } finally {
      setReviewSaving(false);
    }
  };

  const filteredSubmissions = submissionStatusFilter
    ? submissions.filter(s => s.status === submissionStatusFilter)
    : submissions;

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-[#1e3a5f] hover:underline mb-4 inline-block">
        &larr; Admin Dashboard
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Manage Documents</h1>
        <p className="text-gray-500 text-sm mt-1">
          Create document templates and review member submissions.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === 'templates'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Templates ({templates.length})
        </button>
        <button
          onClick={() => setActiveTab('submissions')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === 'submissions'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Submissions ({submissions.filter(s => s.status === 'pending').length > 0
            ? `${submissions.filter(s => s.status === 'pending').length} pending`
            : submissions.length})
        </button>
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* Create / Edit Form */}
          <form
            onSubmit={saveTemplate}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4"
          >
            <h2 className="text-lg font-semibold text-gray-900">
              {editingTemplate ? 'Edit Template' : 'New Template'}
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  required
                  placeholder="e.g. Liability Waiver"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value as Category)}
                  className={inputClass}
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {formatCategory(c)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Description <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                rows={2}
                placeholder="Briefly describe what this document is for..."
                className={inputClass + ' resize-none'}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="form-required"
                type="checkbox"
                checked={formRequired}
                onChange={e => setFormRequired(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="form-required" className="text-sm font-medium text-gray-700">
                Required for all members
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}
              </button>
              {editingTemplate && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          {/* Template List */}
          <div className="space-y-3">
            {templates.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No templates created yet.</p>
              </div>
            ) : (
              templates.map(t => (
                <div
                  key={t.id}
                  className={`bg-white rounded-xl border shadow-sm p-4 flex items-start justify-between gap-4 ${
                    t.active ? 'border-gray-100' : 'border-gray-100 opacity-60'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{t.title}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                        {t.category}
                      </span>
                      {t.required && (
                        <span className="text-xs bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full">
                          Required
                        </span>
                      )}
                      {!t.active && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-xs text-gray-500 mt-1">{t.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Created by {t.created_by_name ?? 'Unknown'} on{' '}
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                      onClick={() => startEdit(t)}
                      className="text-xs text-emerald-700 hover:text-emerald-800 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(t)}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                    >
                      {t.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => deleteTemplate(t)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Submissions Tab */}
      {activeTab === 'submissions' && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex gap-3">
            <select
              value={submissionStatusFilter}
              onChange={e => setSubmissionStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Submissions ({submissions.length})</option>
              <option value="pending">
                Pending ({submissions.filter(s => s.status === 'pending').length})
              </option>
              <option value="approved">
                Approved ({submissions.filter(s => s.status === 'approved').length})
              </option>
              <option value="rejected">
                Rejected ({submissions.filter(s => s.status === 'rejected').length})
              </option>
            </select>
          </div>

          {filteredSubmissions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No submissions found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSubmissions.map(sub => (
                <div
                  key={sub.id}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">{sub.user_name}</span>
                        <span className="text-gray-400 text-sm">—</span>
                        <span className="text-sm text-gray-600">{sub.template_title}</span>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[sub.status]}`}
                        >
                          {STATUS_LABELS[sub.status]}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Submitted {new Date(sub.created_at).toLocaleDateString()}
                        {sub.reviewed_by_name && sub.reviewed_at && (
                          <span>
                            {' '}
                            &middot; Reviewed by {sub.reviewed_by_name} on{' '}
                            {new Date(sub.reviewed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {sub.notes && (
                        <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                          <span className="font-medium">Notes:</span> {sub.notes}
                        </div>
                      )}
                    </div>

                    {/* Review actions */}
                    {sub.status === 'pending' && reviewingId !== sub.id && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => {
                            setReviewingId(sub.id);
                            setReviewNotes('');
                          }}
                          className="text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-800 transition-colors"
                        >
                          Review
                        </button>
                      </div>
                    )}
                    {sub.status !== 'pending' && reviewingId !== sub.id && (
                      <button
                        onClick={() => {
                          setReviewingId(sub.id);
                          setReviewNotes(sub.notes ?? '');
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium flex-shrink-0"
                      >
                        Update
                      </button>
                    )}
                  </div>

                  {/* Inline review panel */}
                  {reviewingId === sub.id && (
                    <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Notes <span className="text-gray-400 font-normal">(optional)</span>
                        </label>
                        <textarea
                          value={reviewNotes}
                          onChange={e => setReviewNotes(e.target.value)}
                          rows={2}
                          placeholder="Leave a note for the member..."
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => reviewSubmission(sub.id, 'approved')}
                          disabled={reviewSaving}
                          className="bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => reviewSubmission(sub.id, 'rejected')}
                          disabled={reviewSaving}
                          className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => {
                            setReviewingId(null);
                            setReviewNotes('');
                          }}
                          className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
