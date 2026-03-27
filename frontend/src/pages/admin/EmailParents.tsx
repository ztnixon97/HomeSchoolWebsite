import { useState } from 'react';
import { api } from '../../api';
import { useToast } from '../../components/Toast';
import RichTextEditor from '../../components/RichTextEditor';

export default function EmailParents() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const { showToast } = useToast();

  const handleSend = async () => {
    // Strip tags to check if there's actual content
    const plainBody = body.replace(/<[^>]*>/g, '').trim();
    if (!subject.trim() || !plainBody) {
      showToast('Subject and message are required', 'error');
      return;
    }
    setShowConfirm(true);
  };

  const confirmSend = async () => {
    setShowConfirm(false);
    setLoading(true);
    try {
      const response = await api.post<{ sent_count: number }>('/api/admin/email-parents', {
        subject,
        body,
      });
      setSentCount(response.sent_count);
      setSent(true);
      setSubject('');
      setBody('');
      showToast(`Email sent to ${response.sent_count} recipients`, 'success');
    } catch (error) {
      console.error('Failed to send email:', error);
      showToast('Failed to send email', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-ink">Email Parents</h1>
          <p className="text-ink/60 text-sm mt-1">Send announcements to all co-op members.</p>
        </div>

        <div className="panel p-8 text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="text-2xl font-semibold text-ink mb-3">Email Sent Successfully</h2>
          <p className="text-ink/70 mb-6">
            Your message has been sent to <strong>{sentCount}</strong> {sentCount === 1 ? 'recipient' : 'recipients'}.
          </p>
          <button
            onClick={() => setSent(false)}
            className="btn-primary"
          >
            Send Another Email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-ink">Email Parents</h1>
        <p className="text-ink/60 text-sm mt-1">Send announcements to all co-op members.</p>
      </div>

      <div className="panel-quiet p-6 max-w-4xl space-y-6">
        <div>
          <label className="block text-sm font-medium text-ink mb-2">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject..."
            className="w-full px-3 py-2.5 border border-ink/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(31,75,122,0.2)] bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-2">Message</label>
          <RichTextEditor
            content={body}
            onChange={setBody}
            placeholder="Compose your email message..."
          />
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={loading}
          className="btn-primary disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send to All Members'}
        </button>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-auto">
            <h2 className="text-lg font-semibold text-ink mb-4">Confirm Send</h2>
            <p className="text-ink/70 mb-6">
              Are you sure you want to send this email to all co-op members? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={confirmSend}
                disabled={loading}
                className="flex-1 btn-primary disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
