import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useToast } from '../../components/Toast';

interface Participant {
  id: number;
  display_name: string;
}

interface Message {
  id: number;
  sender_id: number;
  sender_name: string;
  body: string;
  created_at: string;
}

interface ConversationDetail {
  id: number;
  subject: string | null;
  participants: Participant[];
  messages: Message[];
}

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
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

export default function ConversationDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!id) return;
    api
      .get<ConversationDetail>(`/api/conversations/${id}`)
      .then(convo => {
        setConversation(convo);
        // Mark as read silently after loading
        api.put(`/api/conversations/${id}/read`, {}).catch(() => {});
      })
      .catch(() => showToast('Failed to load conversation', 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (conversation) {
      scrollToBottom();
    }
  }, [conversation]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim() || !id) return;
    setSending(true);
    try {
      const newMessage = await api.post<Message>(`/api/conversations/${id}/messages`, {
        body: replyBody.trim(),
      });
      setConversation(prev =>
        prev ? { ...prev, messages: [...prev.messages, newMessage] } : prev
      );
      setReplyBody('');
      setTimeout(scrollToBottom, 50);
    } catch (err: any) {
      showToast(err.message || 'Failed to send reply', 'error');
    } finally {
      setSending(false);
    }
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

      {/* Messages */}
      <div className="space-y-3">
        {conversation.messages.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center">
            <p className="text-ink/40 text-sm">No messages yet. Send the first one below.</p>
          </div>
        ) : (
          conversation.messages.map(msg => {
            const isMine = msg.sender_id === user?.id;
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
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
                  </div>
                  <p className={`text-sm whitespace-pre-wrap break-words ${isMine ? 'text-white' : 'text-gray-800'}`}>
                    {msg.body}
                  </p>
                </div>
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
            required
            rows={3}
            placeholder="Write a reply..."
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-sm resize-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={sending || !replyBody.trim()}
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
