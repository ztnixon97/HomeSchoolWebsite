import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useToast } from '../../components/Toast';

interface Participant {
  id: number;
  display_name: string;
}

interface MessageAttachment {
  id: number;
  filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
}

interface Message {
  id: number;
  sender_id: number;
  sender_name: string;
  body: string | null;
  created_at: string;
  deleted: boolean;
  attachments?: MessageAttachment[];
}

interface ConversationData {
  id: number;
  subject: string | null;
  participants: Participant[];
  messages: Message[];
  has_more: boolean;
}

function normalizeTimestamp(ts: string): string {
  if (!ts) return ts;
  return ts.replace(' ', 'T').replace(/([^Z])$/, '$1Z');
}

function formatMessageTime(iso: string): string {
  const date = new Date(normalizeTimestamp(iso));
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ConversationDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);

  // File attachment state
  const [pendingFiles, setPendingFiles] = useState<{ file_id: number; filename: string; mime_type: string; size_bytes: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!id) return;
    api
      .get<ConversationData>(`/api/conversations/${id}?limit=50`)
      .then(convo => {
        setConversation(convo);
        setHasMore(convo.has_more);
        api.put(`/api/conversations/${id}/read`, {}).catch(() => {});
      })
      .catch(() => showToast('Failed to load conversation', 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (conversation && !loadingMore) {
      scrollToBottom();
    }
  }, [conversation?.messages.length]);

  const loadEarlier = useCallback(async () => {
    if (!id || !conversation || !hasMore || loadingMore) return;
    const oldest = conversation.messages[0];
    if (!oldest) return;

    setLoadingMore(true);
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;

    try {
      const data = await api.get<ConversationData>(`/api/conversations/${id}?before=${oldest.id}&limit=50`);
      setConversation(prev => {
        if (!prev) return prev;
        return { ...prev, messages: [...data.messages, ...prev.messages] };
      });
      setHasMore(data.has_more);

      // Preserve scroll position
      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - prevScrollHeight;
        }
      });
    } catch {
      showToast('Failed to load earlier messages', 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [id, conversation, hasMore, loadingMore]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const fileIds = pendingFiles.map(f => f.file_id);
    if ((!replyBody.trim() && fileIds.length === 0) || !id) return;
    setSending(true);
    try {
      const newMsg = await api.post<Message>(`/api/conversations/${id}/messages`, {
        body: replyBody.trim(),
        file_ids: fileIds.length > 0 ? fileIds : undefined,
      });
      // Optimistically append the returned message
      setConversation(prev => {
        if (!prev) return prev;
        return { ...prev, messages: [...prev.messages, newMsg] };
      });
      setReplyBody('');
      setPendingFiles([]);
      setTimeout(scrollToBottom, 50);
    } catch (err: any) {
      showToast(err.message || 'Failed to send reply', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteConversation = async () => {
    if (!id) return;
    try {
      await api.del(`/api/conversations/${id}`);
      showToast('Conversation deleted', 'success');
      navigate('/inbox');
    } catch {
      showToast('Failed to delete conversation', 'error');
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    try {
      await api.del(`/api/messages/${messageId}`);
      setConversation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map(m =>
            m.id === messageId ? { ...m, deleted: true, body: null, attachments: [] } : m
          ),
        };
      });
      setDeletingMessageId(null);
    } catch {
      showToast('Failed to delete message', 'error');
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

  if (loading) {
    return <div className="text-center py-16 text-ink/40">Loading conversation...</div>;
  }

  if (!conversation) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Link to="/inbox" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium inline-block">
          &larr; Inbox
        </Link>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-gray-400 text-sm">Conversation not found.</p>
        </div>
      </div>
    );
  }

  const otherParticipants = conversation.participants.filter(p => p.id !== user?.id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to="/inbox" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium inline-block">
        &larr; Inbox
      </Link>

      {/* Conversation header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink">
              {conversation.subject || 'No subject'}
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-gray-500">Participants:</span>
              {conversation.participants.map(p => (
                <span
                  key={p.id}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    p.id === user?.id
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {p.id === user?.id ? 'You' : p.display_name}
                </span>
              ))}
            </div>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-gray-400 hover:text-red-500 transition-colors p-1"
              title="Delete conversation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            {showDeleteConfirm && (
              <div className="absolute right-0 top-8 z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-56">
                <p className="text-sm text-gray-700 mb-2">Remove this conversation from your inbox?</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteConversation}
                    className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-700"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="border border-gray-200 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="space-y-3">
        {/* Load earlier button */}
        {hasMore && (
          <div className="text-center">
            <button
              onClick={loadEarlier}
              disabled={loadingMore}
              className="text-sm text-emerald-700 hover:text-emerald-800 font-medium disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load earlier messages'}
            </button>
          </div>
        )}

        {conversation.messages.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center">
            <p className="text-ink/40 text-sm">No messages yet. Send the first one below.</p>
          </div>
        ) : (
          conversation.messages.map(msg => {
            const isMine = msg.sender_id === user?.id;

            if (msg.deleted) {
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[80%] rounded-xl px-4 py-3 bg-gray-50 border border-gray-100">
                    <p className="text-xs text-gray-400 italic">This message was deleted</p>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'} group`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 shadow-sm ${
                    isMine
                      ? 'bg-emerald-700 text-white rounded-br-sm'
                      : 'bg-white border border-gray-100 text-ink rounded-bl-sm'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-semibold ${
                        isMine ? 'text-emerald-100' : 'text-gray-500'
                      }`}
                    >
                      {isMine ? 'You' : msg.sender_name}
                    </span>
                    <span
                      className={`text-xs ${isMine ? 'text-emerald-200' : 'text-gray-400'}`}
                    >
                      {formatMessageTime(msg.created_at)}
                    </span>
                    {isMine && (
                      <button
                        onClick={() => setDeletingMessageId(msg.id)}
                        className="text-xs opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                        title="Delete message"
                      >
                        <span className={isMine ? 'text-emerald-200 hover:text-white' : 'text-gray-400 hover:text-red-500'}>
                          &times;
                        </span>
                      </button>
                    )}
                  </div>
                  {msg.body && (
                    <p className={`text-sm whitespace-pre-wrap break-words ${isMine ? 'text-white' : 'text-gray-800'}`}>
                      {msg.body}
                    </p>
                  )}
                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {msg.attachments.map(att => {
                        const isImage = att.mime_type.startsWith('image/');
                        return isImage ? (
                          <a key={att.id} href={`/api/files/${att.id}/download`} target="_blank" rel="noopener noreferrer">
                            <img
                              src={`/api/files/${att.id}/download`}
                              alt={att.filename}
                              className="max-w-full max-h-60 rounded-lg mt-1"
                            />
                          </a>
                        ) : (
                          <a
                            key={att.id}
                            href={`/api/files/${att.id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                              isMine ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                            }`}
                          >
                            <span className="font-medium truncate">{att.filename}</span>
                            <span className={`${isMine ? 'text-emerald-200' : 'text-gray-400'} shrink-0`}>
                              {formatFileSize(att.size_bytes)}
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Delete confirmation popover for own messages */}
                {deletingMessageId === msg.id && (
                  <div className="self-center ml-2">
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1.5">
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="bg-red-600 text-white px-2.5 py-1 rounded text-xs font-medium hover:bg-red-700"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeletingMessageId(null)}
                        className="border border-gray-200 px-2.5 py-1 rounded text-xs hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply form */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <form onSubmit={handleReply} className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Reply
            {otherParticipants.length > 0 && (
              <span className="font-normal text-gray-400 ml-1">
                to {otherParticipants.map(p => p.display_name).join(', ')}
              </span>
            )}
          </label>
          <textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            rows={3}
            placeholder="Write a reply..."
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-sm resize-none"
          />

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

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
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
            </div>
            <button
              type="submit"
              disabled={sending || (!replyBody.trim() && pendingFiles.length === 0)}
              className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors"
            >
              {sending ? 'Sending...' : 'Send Reply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
