import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/api/auth/forgot-password', { email });
      setSubmitted(true);
      setEmail('');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="china-crest" />
          </div>
          <h1 className="text-2xl font-semibold text-ink">Reset Password</h1>
          <p className="text-ink/60 text-sm mt-1">Enter your email to receive a reset link</p>
        </div>

        {submitted ? (
          <div className="panel p-6 text-center space-y-4">
            <div className="text-green-600 text-sm">
              If an account exists with that email, a reset link has been sent.
            </div>
            <Link to="/login" className="inline-block text-cobalt font-medium hover:text-cobalt-dark text-sm">
              Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="panel-quiet p-6 space-y-4">
            {error && (
              <div className="text-red-700 text-sm bg-red-50 border border-red-100 p-3 rounded-lg">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 border border-ink/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(31,75,122,0.2)] focus:border-[rgba(31,75,122,0.4)] transition-colors bg-white"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <p className="text-center text-sm text-ink/60 pt-2">
              Remember your password?{' '}
              <Link to="/login" className="text-cobalt font-medium hover:text-cobalt-dark">
                Sign In
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
