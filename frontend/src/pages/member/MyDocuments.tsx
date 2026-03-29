import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/Toast';
// SignaturePad removed — using print-sign-upload flow instead

interface DocumentTemplate {
  id: number;
  title: string;
  description: string | null;
  category: string;
  required: boolean;
  file_id: number | null;
  created_at: string;
}

interface MyDocument {
  id: number;
  template_id: number;
  template_title: string;
  category: string;
  file_id: number | null;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

function formatCategory(cat: string) {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

export default function MyDocuments() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [submissions, setSubmissions] = useState<MyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<number | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const { showToast } = useToast();

  const refresh = () => {
    Promise.all([
      api.get<DocumentTemplate[]>('/api/document-types'),
      api.get<MyDocument[]>('/api/my-documents'),
    ])
      .then(([t, s]) => {
        setTemplates(t);
        setSubmissions(s);
      })
      .catch(() => showToast('Failed to load documents', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submissionByTemplate = (templateId: number) =>
    submissions.find(s => s.template_id === templateId) ?? null;

  const handleUpload = async (template: DocumentTemplate, file: File) => {
    setUploading(template.id);
    try {
      const uploaded = await api.upload(file);
      await api.post(`/api/documents/${template.id}/submit`, { file_id: uploaded.id });
      showToast('Document submitted successfully', 'success');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit document', 'error');
    } finally {
      setUploading(null);
      const ref = fileInputRefs.current[template.id];
      if (ref) ref.value = '';
    }
  };

  const triggerFileInput = (templateId: number) => {
    fileInputRefs.current[templateId]?.click();
  };


  // Group templates by category
  const categories = Array.from(new Set(templates.map(t => t.category)));

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-ink/40">Loading documents...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <Link to="/dashboard" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium inline-block">
        &larr; Dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-ink">My Documents</h1>
        <p className="text-ink/60 text-sm mt-1">
          Submit required waivers and forms for your family.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-ink/40">No documents are required at this time.</p>
        </div>
      ) : (
        categories.map(category => {
          const categoryTemplates = templates.filter(t => t.category === category);
          return (
            <section key={category}>
              <h2 className="text-base font-semibold text-gray-700 uppercase tracking-wide mb-3">
                {formatCategory(category)}
              </h2>
              <div className="space-y-3">
                {categoryTemplates.map(template => {
                  const submission = submissionByTemplate(template.id);
                  const isUploading = uploading === template.id;

                  return (
                    <div
                      key={template.id}
                      className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900">{template.title}</span>
                            {template.required && (
                              <span className="text-xs bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full font-medium">
                                Required
                              </span>
                            )}
                            {!template.required && (
                              <span className="text-xs bg-gray-50 text-gray-500 border border-gray-100 px-2 py-0.5 rounded-full">
                                Optional
                              </span>
                            )}
                          </div>
                          {template.description && (
                            <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                          )}
                        </div>

                        <div className="flex-shrink-0 flex items-center gap-2">
                          {submission ? (
                            <span
                              className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLES[submission.status]}`}
                            >
                              {STATUS_LABELS[submission.status]}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Not submitted</span>
                          )}
                        </div>
                      </div>

                      {/* Rejection notes */}
                      {submission?.status === 'rejected' && submission.notes && (
                        <div className="mt-3 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                          <p className="text-xs font-medium text-red-700 mb-0.5">Review notes:</p>
                          <p className="text-sm text-red-800">{submission.notes}</p>
                        </div>
                      )}

                      {/* Actions: download template → print → sign → scan/photo → upload */}
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <input
                          ref={el => { fileInputRefs.current[template.id] = el; }}
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(template, file);
                          }}
                        />
                        {template.file_id && (
                          <a
                            href={`/api/files/${template.file_id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 border border-emerald-200 rounded-lg text-sm text-emerald-700 hover:bg-emerald-50 font-medium transition-colors"
                          >
                            1. Download Form
                          </a>
                        )}
                        {(!submission || submission.status === 'rejected') && (
                          <button
                            onClick={() => triggerFileInput(template.id)}
                            disabled={isUploading}
                            className="bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
                          >
                            {isUploading ? 'Uploading...' : template.file_id ? '2. Upload Signed Copy' : 'Upload Document'}
                          </button>
                        )}
                        {submission?.status === 'pending' && (
                          <>
                            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded">Awaiting review</span>
                            <button
                              onClick={() => triggerFileInput(template.id)}
                              disabled={isUploading}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Replace
                            </button>
                          </>
                        )}
                        {submission?.status === 'approved' && (
                          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded">Approved</span>
                        )}
                        {submission && (
                          <span className="text-xs text-gray-400">
                            Submitted {new Date(submission.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {template.file_id && (!submission || submission.status === 'rejected') && (
                        <p className="mt-2 text-xs text-gray-400">Download the form, print it, sign it, then scan or photograph it and upload.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
