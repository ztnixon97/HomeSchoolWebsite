import { useState, useEffect } from 'react';
import { api } from '../../api';
import RichTextEditor from '../../components/RichTextEditor';
import { useToast } from '../../components/Toast';

interface SitePage {
  slug: string;
  title: string;
  content: string;
  updated_at: string;
}

export default function ManageSiteContent() {
  const [pages, setPages] = useState<SitePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    fetchPages();
  }, []);

  const fetchPages = async () => {
    try {
      const data = await api.get<SitePage[]>('/api/admin/pages');
      setPages(data);
    } catch (error) {
      console.error('Failed to fetch pages:', error);
      showToast('Failed to load pages', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (page: SitePage) => {
    setEditingSlug(page.slug);
    setEditTitle(page.title);
    setEditContent(page.content);
  };

  const handleCancel = () => {
    setEditingSlug(null);
    setEditTitle('');
    setEditContent('');
  };

  const handleSave = async (slug: string) => {
    if (!editTitle.trim() || !editContent.trim()) {
      showToast('Title and content are required', 'error');
      return;
    }

    setSaving(true);
    try {
      await api.put<SitePage>(`/api/admin/pages/${slug}`, {
        title: editTitle,
        content: editContent,
      });
      showToast('Page updated successfully', 'success');
      setEditingSlug(null);
      setEditTitle('');
      setEditContent('');
      await fetchPages();
    } catch (error) {
      console.error('Failed to save page:', error);
      showToast('Failed to save page', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">Site Content</h1>
        <p className="text-ink/60 text-sm mt-1">Edit public pages and content.</p>
      </div>

      {loading ? (
        <div className="text-center text-ink/60">Loading pages...</div>
      ) : pages.length === 0 ? (
        <div className="text-center text-ink/60">No pages found.</div>
      ) : (
        <div className="space-y-4">
          {pages.map((page) => (
            <div key={page.slug} className="panel-quiet p-6">
              {editingSlug === page.slug ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">Title</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-ink/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(31,75,122,0.2)] bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">Content</label>
                    <RichTextEditor
                      content={editContent}
                      onChange={setEditContent}
                      placeholder="Page content..."
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleSave(page.slug)}
                      disabled={saving}
                      className="btn-primary disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      className="btn-ghost disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-ink mb-1">{page.title}</h3>
                    <p className="text-ink/60 text-sm">
                      Slug: {page.slug}
                    </p>
                    <p className="text-ink/50 text-xs mt-2">
                      Last updated: {new Date(page.updated_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleEdit(page)}
                    className="btn-primary"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
