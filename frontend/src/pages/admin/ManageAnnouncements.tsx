import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

interface Announcement {
  id: number;
  title: string;
  body: string;
  announcement_type: string;
  active: boolean;
  created_by_name: string | null;
  created_at: string;
  expires_at: string | null;
}

export default function ManageAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('info');
  const [expiresAt, setExpiresAt] = useState('');

  const refresh = () => {
    api.get<Announcement[]>('/api/admin/announcements').then(setAnnouncements).catch(() => {});
  };

  useEffect(refresh, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      if (editing) {
        await api.put(`/api/admin/announcements/${editing.id}`, {
          title,
          body,
          announcement_type: type,
          expires_at: expiresAt || null,
        });
      } else {
        await api.post('/api/admin/announcements', {
          title,
          body,
          announcement_type: type,
          expires_at: expiresAt || null,
        });
      }
      setTitle('');
      setBody('');
      setType('info');
      setExpiresAt('');
      setEditing(null);
      refresh();
    } catch (err) {
      alert('Error saving announcement');
    }
  };

  const startEdit = (a: Announcement) => {
    setEditing(a);
    setTitle(a.title);
    setBody(a.body);
    setType(a.announcement_type);
    setExpiresAt(a.expires_at || '');
  };

  const deleteAnnouncement = async (id: number) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      await api.del(`/api/admin/announcements/${id}`);
      refresh();
    } catch (err) {
      alert('Error deleting announcement');
    }
  };

  const toggleActive = async (a: Announcement) => {
    try {
      await api.put(`/api/admin/announcements/${a.id}`, { active: !a.active });
      refresh();
    } catch (err) {
      alert('Error updating announcement');
    }
  };

  const cancel = () => {
    setEditing(null);
    setTitle('');
    setBody('');
    setType('info');
    setExpiresAt('');
  };

  const inputClass = 'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cobalt focus:border-cobalt transition-colors';

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-cobalt hover:underline mb-4 inline-block">
        ← Admin Dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-ink">Manage Announcements</h1>
        <p className="text-ink/60 text-sm mt-1">Create and manage alerts and announcements that appear on the member dashboard.</p>
      </div>

      <form onSubmit={save} className="bg-white rounded-xl border border-ink/10 shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink">{editing ? 'Edit Announcement' : 'New Announcement'}</h2>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Title *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            placeholder="e.g., No class Thursday due to weather"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Message</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Additional details (optional)"
            className={`${inputClass} resize-none`}
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className={inputClass}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Expires At (optional)</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" className="px-4 py-2.5 bg-cobalt text-white rounded-lg font-medium text-sm hover:bg-cobalt/90 transition-colors">
            {editing ? 'Update' : 'Create'} Announcement
          </button>
          {editing && (
            <button type="button" onClick={cancel} className="px-4 py-2.5 border border-ink/20 text-ink rounded-lg font-medium text-sm hover:bg-ink/5 transition-colors">
              Cancel
            </button>
          )}
        </div>
      </form>

      {announcements.length === 0 ? (
        <div className="text-center py-12 bg-cream/40 rounded-xl">
          <p className="text-ink/50 text-sm">No announcements yet. Create one above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {announcements.map(a => {
            const bgColor = a.announcement_type === 'urgent' ? 'bg-red-50' : a.announcement_type === 'warning' ? 'bg-amber-50' : 'bg-blue-50';
            const borderColor = a.announcement_type === 'urgent' ? 'border-l-red-400' : a.announcement_type === 'warning' ? 'border-l-amber-400' : 'border-l-cobalt';

            return (
              <div key={a.id} className={`${bgColor} border border-l-4 ${borderColor} rounded-lg p-4 flex items-start justify-between gap-4`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-ink text-sm truncate">{a.title}</h3>
                    {!a.active && (
                      <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      a.announcement_type === 'urgent' ? 'bg-red-200 text-red-700' :
                      a.announcement_type === 'warning' ? 'bg-amber-200 text-amber-700' :
                      'bg-blue-200 text-blue-700'
                    }`}>
                      {a.announcement_type}
                    </span>
                  </div>
                  {a.body && <p className="text-sm text-ink/70 mb-2">{a.body}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-ink/50">
                    <span>By {a.created_by_name || 'Admin'}</span>
                    <span>{new Date(a.created_at).toLocaleDateString()}</span>
                    {a.expires_at && (
                      <span>Expires {new Date(a.expires_at).toLocaleDateString()} {new Date(a.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleActive(a)}
                    className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                      a.active
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {a.active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => startEdit(a)}
                    className="px-2 py-1.5 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteAnnouncement(a.id)}
                    className="px-2 py-1.5 text-xs font-medium rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
