import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import RichTextDisplay from '../../components/RichTextDisplay';
import { FilePreviewGrid } from '../../components/FilePreview';

interface LessonPlan {
  id: number;
  author_id: number;
  author_name: string | null;
  title: string;
  description: string;
  age_group: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

interface Collaborator {
  user_id: number;
  display_name: string;
  email: string;
}

interface FileRecord {
  id: number;
  filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
}

const categoryColors: Record<string, string> = {
  art: 'bg-pink-100 text-pink-800',
  science: 'bg-green-100 text-green-800',
  literacy: 'bg-blue-100 text-blue-800',
  math: 'bg-yellow-100 text-yellow-800',
  social: 'bg-purple-100 text-purple-800',
  outdoor: 'bg-emerald-100 text-emerald-800',
};

export default function LessonPlanDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.get<LessonPlan>(`/api/lesson-plans/${id}`),
      api.get<FileRecord[]>(`/api/files/lesson_plan/${id}`).catch(() => []),
      api.get<Collaborator[]>(`/api/lesson-plans/${id}/collaborators`).catch(() => []),
    ]).then(([p, f, c]) => {
      setPlan(p);
      setFiles(f);
      setCollaborators(c);
    }).catch(() => {
      setPlan(null);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="text-center py-16">
      <p className="text-ink/40">Loading...</p>
    </div>
  );

  if (!plan) return (
    <div className="text-center py-16">
      <p className="text-gray-500">Lesson plan not found.</p>
    </div>
  );

  const isCollaborator = user ? collaborators.some(c => c.user_id === user.id) : false;
  const canEdit = user && (user.id === plan.author_id || user.role === 'admin' || isCollaborator);

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-4 sm:px-6">
      <Link to="/lesson-plans" className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:text-emerald-800 font-medium">
        &larr; Back to Lesson Plans
      </Link>

      <article className="panel p-8 md:p-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-ink mb-2">{plan.title}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-400">
              {plan.author_name && (
                <span className="bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-xs font-medium">{plan.author_name}</span>
              )}
              {plan.age_group && <span>Ages {plan.age_group}</span>}
              <span>{new Date(plan.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {plan.category && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${categoryColors[plan.category] || 'bg-gray-100 text-gray-700'}`}>
                {plan.category}
              </span>
            )}
            {canEdit && (
              <div className="flex items-center gap-3">
                <Link to={`/lesson-plans/${plan.id}/edit`} className="text-xs text-emerald-700 hover:text-emerald-800 font-medium py-2 px-3 rounded-lg">
                  Edit
                </Link>
                <button
                  onClick={async () => {
                    const res = await api.post<{ id: number }>('/api/lesson-plans', {
                      title: `${plan.title} (Copy)`,
                      description: plan.description,
                      age_group: plan.age_group,
                      category: plan.category,
                    });
                    navigate(`/lesson-plans/${res.id}/edit`);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium py-2 px-3 rounded-lg"
                >
                  Duplicate
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm('Delete this lesson plan?')) return;
                    await api.del(`/api/lesson-plans/${plan.id}`);
                    navigate('/lesson-plans');
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium py-2 px-3 rounded-lg"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-6">
          <RichTextDisplay content={plan.description} />
        </div>
      </article>

      {files.length > 0 && (
        <section className="panel-quiet p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Attachments ({files.length})</h2>
          <FilePreviewGrid
            files={files}
            canDelete={!!canEdit}
            onDelete={async (fileId) => {
              await api.del(`/api/files/${fileId}`);
              setFiles(files.filter(f => f.id !== fileId));
            }}
          />
        </section>
      )}
    </div>
  );
}
