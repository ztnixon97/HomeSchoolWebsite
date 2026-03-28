import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import RichTextDisplay from '../../components/RichTextDisplay';
import { FilePreviewGrid } from '../../components/FilePreview';
import { getCategoryLabel } from '../../utils/postCategories';

interface Post {
  id: number;
  author_name: string | null;
  title: string;
  content: string;
  category: string | null;
  published: boolean;
  created_at: string;
}

interface FileRecord {
  id: number;
  filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
}

export default function PostPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [error, setError] = useState('');

  const refresh = () => {
    if (!id) return;
    api.get<Post>(`/api/posts/${id}/internal`).then(setPost).catch(() => {});
    api.get<FileRecord[]>(`/api/files/post/${id}`).then(setFiles).catch(() => {});
  };

  useEffect(refresh, [id]);

  const publish = async () => {
    if (!id) return;
    setError('');
    try {
      await api.put(`/api/posts/${id}`, { published: true });
      refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to publish');
    }
  };

  if (!post) return <div className="text-center py-8 text-ink/40">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-4 sm:px-6">
      <div className="flex items-center justify-between">
        <Link to="/posts/drafts" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium">&larr; Back to Drafts</Link>
        <div className="flex items-center gap-3">
          <Link to={`/posts/${post.id}/edit`} className="text-sm text-gray-700 hover:text-gray-900">Edit</Link>
          {!post.published && (
            <button onClick={publish} className="bg-emerald-700 text-white px-3 py-1.5 rounded text-sm hover:bg-emerald-800">
              Publish
            </button>
          )}
          {post.published && (
            <Link to={`/blog/${post.id}`} className="text-sm text-emerald-700 hover:text-emerald-800 font-medium">
              View Public
            </Link>
          )}
        </div>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</div>}

      <article className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 md:p-10">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
          <span className={`px-2 py-0.5 rounded ${post.published ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
            {post.published ? 'Published' : 'Draft'}
          </span>
          {post.category && (
            <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-xs font-medium">{getCategoryLabel(post.category)}</span>
          )}
          <span>{new Date(post.created_at).toLocaleDateString()}</span>
        </div>
        <h1 className="text-3xl font-bold mb-4">{post.title}</h1>
        <RichTextDisplay content={post.content} />
      </article>

      {files.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Attachments ({files.length})</h2>
          <FilePreviewGrid files={files} />
        </section>
      )}

      <div className="text-sm text-gray-500">
        <button onClick={() => navigate(-1)} className="text-emerald-700 hover:text-emerald-800 font-medium">
          Back
        </button>
      </div>
    </div>
  );
}
