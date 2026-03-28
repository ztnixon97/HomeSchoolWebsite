import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import RichTextDisplay from '../../components/RichTextDisplay';
import { FilePreviewGrid } from '../../components/FilePreview';
import { getCategoryLabel } from '../../utils/postCategories';

interface Post {
  id: number;
  author_id: number;
  author_name: string | null;
  title: string;
  content: string;
  category: string | null;
  created_at: string;
}

interface FileRecord {
  id: number;
  filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
}

interface Neighbor {
  id: number;
  title: string;
  created_at: string;
}

interface NeighborsResponse {
  prev: Neighbor | null;
  next: Neighbor | null;
}

interface Comment {
  id: number;
  post_id: number;
  author_id: number;
  author_name: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export default function BlogPost() {
  const { id } = useParams();
  const { user, isTeacher, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [neighbors, setNeighbors] = useState<NeighborsResponse | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [commentError, setCommentError] = useState('');
  const [commentSuccess, setCommentSuccess] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get<Post>(`/api/posts/${id}`).then(setPost).catch(() => {});
    api.get<NeighborsResponse>(`/api/posts/${id}/neighbors`).then(setNeighbors).catch(() => {});
    if (user) {
      api.get<FileRecord[]>(`/api/files/post/${id}`).then(setFiles).catch(() => {});
      api.get<Comment[]>(`/api/posts/${id}/comments`).then(setComments).catch(() => {});
    } else {
      setFiles([]);
      setComments([]);
    }
  }, [id, user]);

  if (!post) return (
    <div className="text-center py-16">
      <p className="text-ink/40">Loading post...</p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-4 sm:px-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Link to="/blog" className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:text-emerald-800 font-medium">
          &larr; Back to Blog
        </Link>
        {(isAdmin || (user && user.id === post.author_id)) && (
          <div className="flex items-center gap-3">
            <Link
              to={`/posts/${post.id}/edit`}
              className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors inline-block"
            >
              Edit Post
            </Link>
            <button
              onClick={async () => {
                if (!window.confirm('Delete this post? This cannot be undone.')) return;
                await api.del(`/api/posts/${post.id}`);
                navigate('/blog');
              }}
              className="text-sm text-red-500 hover:text-red-700 font-medium"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <article className="panel p-8 md:p-10">
        <h1 className="text-3xl font-bold text-ink mb-3">{post.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400 mb-8 pb-6 border-b border-gray-100">
          {post.author_name && (
            <span className="bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-xs font-medium">{post.author_name}</span>
          )}
          {post.category && (
            <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-xs font-medium">{getCategoryLabel(post.category)}</span>
          )}
          <span>{new Date(post.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>

        <div>
          <RichTextDisplay content={post.content} />
        </div>
      </article>

      {user && files.length > 0 && (
        <section className="panel-quiet p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Attachments ({files.length})</h2>
          <FilePreviewGrid files={files} />
        </section>
      )}

      {neighbors && (neighbors.prev || neighbors.next) && (
        <section className="panel-quiet p-6 md:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {neighbors.prev ? (
              <Link to={`/blog/${neighbors.prev.id}`} className="block border border-gray-200 rounded-lg p-4 hover:border-emerald-200 hover:bg-emerald-50/40 transition-colors">
                <div className="text-xs text-gray-500 mb-1">Previous</div>
                <div className="font-medium text-gray-900">{neighbors.prev.title}</div>
                <div className="text-xs text-gray-400">{new Date(neighbors.prev.created_at).toLocaleDateString()}</div>
              </Link>
            ) : (
              <div className="border border-dashed border-gray-200 rounded-lg p-4 text-sm text-gray-400">No previous post</div>
            )}
            {neighbors.next ? (
              <Link to={`/blog/${neighbors.next.id}`} className="block border border-gray-200 rounded-lg p-4 hover:border-emerald-200 hover:bg-emerald-50/40 transition-colors">
                <div className="text-xs text-gray-500 mb-1">Next</div>
                <div className="font-medium text-gray-900">{neighbors.next.title}</div>
                <div className="text-xs text-gray-400">{new Date(neighbors.next.created_at).toLocaleDateString()}</div>
              </Link>
            ) : (
              <div className="border border-dashed border-gray-200 rounded-lg p-4 text-sm text-gray-400">No next post</div>
            )}
          </div>
        </section>
      )}

      <section className="panel-quiet p-6 md:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Comments</h2>
          <span className="text-xs text-gray-400">{comments.length} total</span>
        </div>

        {!user && (
          <div className="text-sm text-gray-500">
            <Link to="/login" className="text-emerald-700 hover:text-emerald-800 font-medium">Log in</Link> to comment.
          </div>
        )}

        {user && (
          <form
            onSubmit={async e => {
              e.preventDefault();
              if (!id) return;
              setCommentError('');
              try {
                const created = await api.post<Comment>(`/api/posts/${id}/comments`, { content: newComment });
                setComments(prev => [...prev, created]);
                setNewComment('');
                setCommentSuccess('Comment posted!');
                setTimeout(() => setCommentSuccess(''), 3000);
              } catch (err: any) {
                setCommentError(err.message || 'Failed to post comment');
              }
            }}
            className="space-y-2"
          >
            {commentError && <div className="text-red-600 text-sm bg-red-50 p-3 rounded">{commentError}</div>}
            {commentSuccess && <div className="text-emerald-700 text-sm bg-emerald-50 p-3 rounded">{commentSuccess}</div>}
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Share a quick note or question..."
              className="w-full min-h-[90px] px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
            />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button type="submit" className="w-full sm:w-auto bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-800">
                Post Comment
              </button>
            </div>
          </form>
        )}

        {comments.length === 0 && (
          <p className="text-sm text-gray-500">No comments yet.</p>
        )}

        {comments.map(comment => {
          const isOwner = user && user.id === comment.author_id;
          const canDelete = isOwner || user?.role === 'admin';
          return (
            <div key={comment.id} className={`border-t border-gray-100 pt-4 ${editingId === comment.id ? 'bg-blue-50 -mx-3 px-3 py-3 rounded-lg border-blue-200' : ''}`}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-700">{comment.author_name || 'Member'}</span>
                  <span>·</span>
                  <span className="text-xs sm:text-sm">{new Date(comment.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
                {user && editingId !== comment.id && (
                  <div className="flex items-center gap-2 text-xs sm:ml-auto">
                    {isOwner && (
                      <button
                        onClick={() => {
                          setEditingId(comment.id);
                          setEditingText(comment.content.replace(/<[^>]*>/g, ''));
                        }}
                        className="text-emerald-700 hover:text-emerald-800"
                      >
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={async () => {
                          if (!window.confirm('Remove this comment?')) return;
                          await api.del(`/api/comments/${comment.id}`);
                          setComments(prev => prev.filter(c => c.id !== comment.id));
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
              {editingId === comment.id ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editingText}
                    onChange={e => setEditingText(e.target.value)}
                    className="w-full min-h-[80px] px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                  />
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await api.put(`/api/comments/${comment.id}`, { content: editingText });
                          setComments(prev =>
                            prev.map(c => (c.id === comment.id ? { ...c, content: editingText } : c))
                          );
                          setEditingId(null);
                          setEditingText('');
                        } catch (err: any) {
                          setCommentError(err.message || 'Failed to update comment');
                        }
                      }}
                      className="w-full sm:w-auto bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-800"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditingText('');
                      }}
                      className="w-full sm:w-auto text-gray-500 hover:text-gray-700 text-xs px-3 py-1.5 border border-gray-200 rounded sm:border-0"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none mt-2 text-gray-700">
                  {comment.content}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
