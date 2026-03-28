import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

interface Post {
  id: number;
  author_name: string | null;
  title: string;
  created_at: string;
}

export default function DraftPosts() {
  const [drafts, setDrafts] = useState<Post[]>([]);

  useEffect(() => {
    api.get<Post[]>('/api/posts/drafts').then(setDrafts).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Draft Posts</h1>
        <Link to="/posts/new" className="text-sm text-blue-600 hover:text-blue-800">New Post</Link>
      </div>

      {drafts.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No drafts yet.</p>
      ) : (
        <div className="space-y-3">
          {drafts.map(p => (
            <Link
              key={p.id}
              to={`/posts/${p.id}/preview`}
              className="block bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-gray-300"
            >
              <div className="font-medium text-gray-900">{p.title}</div>
              <div className="text-xs text-gray-500 mt-1">
                {p.author_name && <span>By {p.author_name} · </span>}
                {new Date(p.created_at).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
