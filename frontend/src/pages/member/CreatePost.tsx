import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { POST_CATEGORIES } from '../../utils/postCategories';
import RichTextEditor from '../../components/RichTextEditor';

export default function CreatePost() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [published, setPublished] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const finalCategory = category === 'other' ? customCategory.trim() : category;
      const post = await api.post<{ id: number }>('/api/posts', {
        title,
        content,
        category: finalCategory || null,
        published,
      });

      // Upload files linked to this post
      for (const file of files) {
        await api.upload(file, 'post', post.id);
      }

      navigate(`/posts/${post.id}/preview`);
    } catch (err: any) {
      setError(err.message || 'Failed to create post');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors";

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-4 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900">New Blog Post</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-5">
        {error && <div className="text-red-700 text-sm bg-red-50 border border-red-100 p-3 rounded-lg">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Content</label>
          <RichTextEditor content={content} onChange={setContent} placeholder="Write your post here..." />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
            <option value="">Select...</option>
            {POST_CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
          {category === 'other' && (
            <input
              type="text"
              value={customCategory}
              onChange={e => setCustomCategory(e.target.value)}
              placeholder="Custom category"
              className={`${inputClass} mt-2`}
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Photos</label>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={e => setFiles(Array.from(e.target.files || []))}
            className="text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
          />
          {files.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">{files.length} file(s) selected</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="published"
            checked={published}
            onChange={e => setPublished(e.target.checked)}
            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <label htmlFor="published" className="text-sm text-gray-700">Publish immediately</label>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Create Post'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="px-6 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
