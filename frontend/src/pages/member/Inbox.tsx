import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useToast } from '../../components/Toast';

interface Conversation {
  id: number;
  subject: string | null;
  created_at: string;
  last_message: string | null;
  last_message_at: string | null;
  last_sender: string | null;
  unread_count: number;
}

interface AdminUser {
  id: number;
  display_name: string;
  email: string;
  role: string;
}

function normalizeTimestamp(ts: string): string {
  if (!ts) return ts;
  return ts.replace(' ', 'T').replace(/([^Z])$/, '$1Z');
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(normalizeTimestamp(iso));
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Inbox() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);

  // New conversation form state
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // File attachment state
  const [pendingFiles, setPendingFiles] = useState<{ file_id: number; filename: string; mime_type: string; size_bytes: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api.get<Conversation[]>('/api/conversations'),
      api.get<AdminUser[]>('/api/messaging/members'),
    ])
      .then(([convos, userList]) => {
        const sorted = [...convos].sort((a, b) => {
          const aTime = a.last_message_at ?? a.created_at;
          const bTime = b.last_message_at ?? b.created_at;
          return new Date(normalizeTimestamp(bTime)).getTime() - new Date(normalizeTimestamp(aTime)).getTime();
        });
        setConversations(sorted);
        setUsers(userList.filter(u => u.id !== user?.id));
      })
      .catch(() => showToast('Failed to load inbox', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const toggleUser = (id: number) => {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUserIds.length === 0) {
      showToast('Please select at least one recipient', 'error');
      return;
    }
    const fileIds = pendingFiles.map(f => f.file_id);
    if (!body.trim() && fileIds.length === 0) {
      showToast('Message body or attachment is required', 'error');
      return;
    }
    setSending(true);
    try {
      const convo = await api.post<{ id: number }>('/api/conversations', {
        subject: subject.trim() || undefined,
        participant_ids: selectedUserIds,
        body: body.trim(),
        file_ids: fileIds.length > 0 ? fileIds : undefined,
      });
      showToast('Conversation started', 'success');
      navigate(`/inbox/${convo.id}`);
    } catch (err: any) {
      showToast(err.message || 'Failed to send message', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convoId: number) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.del(`/api/conversations/${convoId}`);
      setConversations(prev => prev.filter(c => c.id !== convoId));
      showToast('Conversation deleted', 'success');
    } catch {
      showToast('Failed to delete conversation', 'error');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const res = await api.upload(file, 'message');
        setPendingFiles(prev => [...prev, {
          file_id: res.id,
          filename: res.filename,
          mime_type: res.mime_type,
          size_bytes: res.size_bytes,
        }]);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to upload file', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePendingFile = (fileId: number) => {
    setPendingFiles(prev => prev.filter(f => f.file_id !== fileId));
  };

  const resetForm = () => {
    setSelectedUserIds([]);
    setSubject('');
    setBody('');
    setUserSearch('');
    setPendingFiles([]);
    setShowNewForm(false);
  };

  const filteredUsers = userSearch.trim()
    ? users.filter(
        u =>
          u.display_name.toLowerCase().includes(userSearch.toLowerCase()) ||
          u.email.toLowerCase().includes(userSearch.toLowerCase())
      )
    : users;

  const inputClass =
    'w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-sm';

  if (loading) {
    return <div className="text-center py-16 text-ink/40">Loading inbox...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to="/dashboard" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium inline-block">
        &larr; Dashboard
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Inbox</h1>
          <p className="text-ink/60 text-sm mt-1">
            {conversations.length > 0
              ? `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`
              : 'No conversations yet'}
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(v => !v)}
          className="bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors"
        >
          {showNewForm ? 'Cancel' : 'New Conversation'}
        </button>
      </div>

      {showNewForm && (
        <form
          onSubmit={handleSend}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-ink">Start a New Conversation</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Recipients
            </label>
            <input
              type="text"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="Search members..."
              className={`${inputClass} mb-2`}
            />
            <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-gray-400 px-3 py-3">No members found.</p>
              ) : (
                filteredUsers.map(u => (
                  <label
                    key={u.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(u.id)}
                      onChange={() => toggleUser(u.id)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900">
                        {u.display_name}
                      </span>
                      <span className="text-xs text-gray-500 ml-2 capitalize">{u.role}</span>
                    </div>
                  </label>
                ))
              )}
            </div>
            {selectedUserIds.length > 0 && (
              <p className="text-xs text-emerald-700 mt-1.5">
                {selectedUserIds.length} recipient{selectedUserIds.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Subject <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Enter a subject..."
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              placeholder="Write your message..."
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Pending file attachments */}
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingFiles.map(f => (
                <div key={f.file_id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs">
                  <span className="truncate max-w-[120px]">{f.filename}</span>
                  <span className="text-gray-400">{formatFileSize(f.size_bytes)}</span>
                  <button type="button" onClick={() => removePendingFile(f.file_id)} className="text-gray-400 hover:text-red-500 ml-0.5">&times;</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-gray-400 hover:text-emerald-600 transition-colors p-1"
              title="Attach file"
            >
              {uploading ? (
                <span className="text-xs text-gray-400">Uploading...</span>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              )}
            </button>
            <button
              type="submit"
              disabled={sending}
              className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors"
            >
              {sending ? 'Sending...' : 'Send Message'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {conversations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-gray-400 text-sm">Your inbox is empty.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map(convo => {
            const isUnread = convo.unread_count > 0;
            const timestamp = convo.last_message_at ?? convo.created_at;
            return (
              <div
                key={convo.id}
                className={`relative bg-white rounded-xl border shadow-sm transition-colors hover:border-emerald-300 ${
                  isUnread ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-100'
                }`}
              >
                <Link
                  to={`/inbox/${convo.id}`}
                  className="block p-4 no-underline"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3
                          className={`text-sm truncate ${
                            isUnread ? 'font-semibold text-ink' : 'font-medium text-gray-700'
                          }`}
                        >
                          {convo.subject || 'No subject'}
                        </h3>
                        {isUnread && (
                          <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 bg-emerald-500 text-white text-xs font-bold rounded-full">
                            {convo.unread_count}
                          </span>
                        )}
                      </div>
                      {convo.last_message && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {convo.last_sender ? (
                            <span className="font-medium text-gray-600">{convo.last_sender}: </span>
                          ) : null}
                          {convo.last_message}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                      <span className="text-xs text-gray-400">
                        {formatTime(timestamp)}
                      </span>
                      <button
                        onClick={(e) => handleDeleteConversation(e, convo.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors p-0.5"
                        title="Delete conversation"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
