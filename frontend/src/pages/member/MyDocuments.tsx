import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useToast } from '../../components/Toast';

const DocumentSigner = lazy(() => import('../../components/DocumentSigner'));

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
  signature_file_id: number | null;
  status: 'submitted' | 'pending' | 'approved' | 'rejected';
  notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  submitted: 'bg-amber-100 text-amber-800',
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Pending Review',
  pending: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

function formatCategory(cat: string) {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

export default function MyDocuments() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [submissions, setSubmissions] = useState<MyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<number | null>(null);
  const [signingTemplateId, setSigningTemplateId] = useState<number | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<number | null>(null);
  const [viewingFileId, setViewingFileId] = useState<number | null>(null);
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
      // Smart naming: ParentName_DocumentTitle.ext
      const safeName = (user?.display_name || 'User').replace(/[^a-zA-Z0-9]/g, '_');
      const safeTitle = template.title.replace(/[^a-zA-Z0-9]/g, '_');
      const ext = file.name.split('.').pop() || 'pdf';
      const renamedFile = new File([file], `${safeName}_${safeTitle}.${ext}`, { type: file.type });
      const uploaded = await api.upload(renamedFile);
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

  const handleSigningComplete = async (
    templateId: number,
    signedFile: File,
    signatureFile: File,
  ) => {
    try {
      // Smart naming: ParentName_DocumentTitle.pdf
      const template = templates.find(t => t.id === templateId);
      const safeName = (user?.display_name || 'User').replace(/[^a-zA-Z0-9]/g, '_');
      const safeTitle = (template?.title || 'Document').replace(/[^a-zA-Z0-9]/g, '_');
      const renamedFile = new File([signedFile], `${safeName}_${safeTitle}.pdf`, { type: signedFile.type });
      const renamedSig = new File([signatureFile], `${safeName}_signature.png`, { type: signatureFile.type });

      // Upload the signed PDF
      const uploaded = await api.upload(renamedFile);
      // Upload the raw signature for records
      const sigUploaded = await api.upload(renamedSig);

      await api.post(`/api/documents/${templateId}/submit`, {
        file_id: uploaded.id,
        signature_file_id: sigUploaded.id,
      });

      showToast('Document signed and submitted', 'success');
      setSigningTemplateId(null);
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit signed document', 'error');
    }
  };

  const triggerFileInput = (templateId: number) => {
    fileInputRefs.current[templateId]?.click();
  };

  // Group templates by category
  const categories = Array.from(new Set(templates.map(t => t.category)));

  // If signing a document, show the full-screen DocumentSigner
  const signingTemplate = signingTemplateId
    ? templates.find(t => t.id === signingTemplateId)
    : null;

  if (signingTemplate?.file_id) {
    return (
      <Suspense
        fallback={
          <div className="fixed inset-0 z-50 bg-gray-100 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-600">Loading document signer...</p>
            </div>
          </div>
        }
      >
        <DocumentSigner
          fileId={signingTemplate.file_id}
          templateId={signingTemplate.id}
          templateTitle={signingTemplate.title}
          signerName={user?.display_name ?? ''}
          onComplete={(signedFile, sigFile) =>
            handleSigningComplete(signingTemplate.id, signedFile, sigFile)
          }
          onCancel={() => setSigningTemplateId(null)}
        />
      </Suspense>
    );
  }

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
          Review, sign, and submit required waivers and forms for your family.
        </p>
      </div>

      {/* Progress summary */}
      {templates.length > 0 && (() => {
        const required = templates.filter(t => t.required);
        const completed = required.filter(t => {
          const sub = submissionByTemplate(t.id);
          return sub && sub.status === 'approved';
        });
        if (required.length === 0) return null;
        return (
          <div className={`rounded-xl p-4 border ${completed.length === required.length ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center justify-between">
              <p className={`text-sm font-medium ${completed.length === required.length ? 'text-emerald-800' : 'text-amber-800'}`}>
                {completed.length === required.length
                  ? 'All required documents are approved!'
                  : `${completed.length} of ${required.length} required documents approved`}
              </p>
            </div>
            {completed.length < required.length && (
              <div className="mt-2 w-full bg-amber-200 rounded-full h-2">
                <div
                  className="bg-amber-500 rounded-full h-2 transition-all"
                  style={{ width: `${(completed.length / required.length) * 100}%` }}
                />
              </div>
            )}
          </div>
        );
      })()}

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
                  const isPreviewing = previewTemplateId === template.id;
                  const canSubmit = !submission || submission.status === 'rejected';
                  const canResubmit = submission?.status === 'submitted' || submission?.status === 'pending';
                  const hasTemplateFile = template.file_id != null;

                  return (
                    <div
                      key={template.id}
                      className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
                    >
                      {/* Header */}
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

                      {/* Template PDF preview/download */}
                      {hasTemplateFile && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => setPreviewTemplateId(isPreviewing ? null : template.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium py-2 px-3 rounded-lg inline-flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                            {isPreviewing ? 'Hide Document' : 'View Document'}
                          </button>
                          <a
                            href={`/api/files/${template.file_id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-500 hover:text-gray-700 font-medium py-2 px-3 rounded-lg inline-flex items-center gap-1.5 ml-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Download PDF
                          </a>
                        </div>
                      )}

                      {/* Inline PDF Preview */}
                      {isPreviewing && hasTemplateFile && (
                        <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                          <iframe
                            src={`/api/files/${template.file_id}/download`}
                            className="w-full border-0"
                            style={{ height: '500px' }}
                            title={`Preview: ${template.title}`}
                          />
                        </div>
                      )}

                      {/* Submission details */}
                      {submission && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            {submission.file_id && (
                              <button
                                type="button"
                                onClick={() => setViewingFileId(viewingFileId === submission.file_id ? null : submission.file_id)}
                                className="text-xs text-emerald-700 hover:text-emerald-800 font-medium py-2 px-3 rounded-lg inline-flex items-center gap-1.5"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                {viewingFileId === submission.file_id ? 'Hide Document' : (submission.signature_file_id ? 'View Signed Document' : 'View Submitted File')}
                              </button>
                            )}
                            <span className="text-xs text-gray-400">
                              Submitted {new Date(submission.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {viewingFileId === submission.file_id && submission.file_id && (
                            <div className="border border-gray-200 rounded-lg overflow-hidden">
                              <iframe
                                src={`/api/files/${submission.file_id}/download`}
                                className="w-full border-0"
                                style={{ height: '500px' }}
                                title={`Submitted: ${template.title}`}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Rejection notes */}
                      {submission?.status === 'rejected' && submission.notes && (
                        <div className="mt-3 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                          <p className="text-xs font-medium text-red-700 mb-0.5">Review notes:</p>
                          <p className="text-sm text-red-800">{submission.notes}</p>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="mt-4 flex items-center gap-3 flex-wrap">
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

                        {/* Sign button — opens full-screen signer */}
                        {hasTemplateFile && canSubmit && (
                          <button
                            onClick={() => setSigningTemplateId(template.id)}
                            disabled={isUploading}
                            className="bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            {submission ? 'Re-sign Document' : 'Sign Document'}
                          </button>
                        )}

                        {/* Upload button */}
                        {canSubmit && (
                          <button
                            onClick={() => triggerFileInput(template.id)}
                            disabled={isUploading}
                            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 ${
                              hasTemplateFile
                                ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                                : 'bg-emerald-700 text-white hover:bg-emerald-800'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            {isUploading ? 'Uploading...' : submission ? 'Upload New File' : 'Upload Document'}
                          </button>
                        )}

                        {/* Resubmit for pending */}
                        {canResubmit && (
                          <>
                            {hasTemplateFile && (
                              <button
                                onClick={() => setSigningTemplateId(template.id)}
                                disabled={isUploading}
                                className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                Re-sign
                              </button>
                            )}
                            <button
                              onClick={() => triggerFileInput(template.id)}
                              disabled={isUploading}
                              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                              {isUploading ? 'Uploading...' : 'Replace File'}
                            </button>
                          </>
                        )}
                      </div>
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
