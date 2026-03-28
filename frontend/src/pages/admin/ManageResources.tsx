import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import RichTextEditor from '../../components/RichTextEditor';

interface Resource {
  id: number;
  title: string;
  content: string;
  category: string;
  sort_order: number;
  published: boolean;
}

export default function ManageResources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const refresh = () => {
    api.get<Resource[]>('/api/resources').then(setResources).catch(() => {});
  };

  useEffect(refresh, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await api.put(`/api/admin/resources/${editing.id}`, { title, content, category });
    } else {
      await api.post('/api/admin/resources', { title, content, category });
    }
    setTitle('');
    setContent('');
    setCategory('general');
    setEditing(null);
    refresh();
  };

  const startEdit = (r: Resource) => {
    setEditing(r);
    setTitle(r.title);
    setContent(r.content);
    setCategory(r.category);
  };

  const deleteResource = async (id: number) => {
    if (!confirm('Are you sure you want to delete this?')) return;
    await api.del(`/api/admin/resources/${id}`);
    refresh();
  };

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors";

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium mb-4 inline-block">
        ← Admin Dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-ink">Manage Resources</h1>
        <p className="text-ink/60 text-sm mt-1">Create and edit handbooks, guides, and info pages for families.</p>
      </div>

      <form onSubmit={save} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Resource' : 'New Resource'}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
              <option value="general">General</option>
              <option value="handbook">Handbook</option>
              <option value="supplies">Supplies</option>
              <option value="enrollment">Enrollment</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Content</label>
          <RichTextEditor content={content} onChange={setContent} />
        </div>
        <div className="flex gap-3">
          <button type="submit" className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors">
            {editing ? 'Update' : 'Create'}
          </button>
          {editing && (
            <button type="button" onClick={() => { setEditing(null); setTitle(''); setContent(''); }} className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search resources..."
          className={`flex-1 min-w-[200px] ${inputClass}`}
        />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={inputClass}>
          <option value="">All Categories</option>
          <option value="general">General</option>
          <option value="handbook">Handbook</option>
          <option value="supplies">Supplies</option>
          <option value="enrollment">Enrollment</option>
        </select>
      </div>

      <div className="space-y-3">
        {resources.filter(r => {
          const matchesSearch = !search || r.title.toLowerCase().includes(search.toLowerCase());
          const matchesCat = !categoryFilter || r.category === categoryFilter;
          return matchesSearch && matchesCat;
        }).map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
            <div>
              <div className="font-medium text-sm text-gray-900">{r.title}</div>
              <div className="text-xs text-gray-400 capitalize">{r.category}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => startEdit(r)} className="text-xs text-emerald-700 hover:text-emerald-800 font-medium">Edit</button>
              <button onClick={() => deleteResource(r.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
            </div>
          </div>
        ))}
        {resources.length === 0 && (
          <div className="text-center py-12">
            <p className="text-ink/40">No resources created yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
