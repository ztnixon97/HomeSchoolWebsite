import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../../api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setError('Invalid or missing reset token');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', {
        token,
        new_password: password,
      });
      setSubmitted(true);
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-3">
              <div className="china-crest" />
            </div>
            <h1 className="text-2xl font-semibold text-ink">Reset Password</h1>
          </div>

          <div className="panel p-6 text-center space-y-4">
            <div className="text-red-600 text-sm">
              Invalid or missing reset token. Please try again.
            </div>
            <Link to="/login" className="inline-block text-cobalt font-medium hover:text-cobalt-dark text-sm">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="china-crest" />
          </div>
          <h1 className="text-2xl font-semibold text-ink">Set New Password</h1>
          <p className="text-ink/60 text-sm mt-1">Enter your new password below</p>
        </div>

        {submitted ? (
          <div className="panel p-6 text-center space-y-4">
            <div className="text-green-600 text-sm">
              Password reset successful!
            </div>
            <Link to="/login" className="inline-block text-cobalt font-medium hover:text-cobalt-dark text-sm">
              Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="panel-quiet p-6 space-y-4">
            {error && (
              <div className="text-red-700 text-sm bg-red-50 border border-red-100 p-3 rounded-lg">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-ink/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(31,75,122,0.2)] focus:border-[rgba(31,75,122,0.4)] transition-colors bg-white"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-ink/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(31,75,122,0.2)] focus:border-[rgba(31,75,122,0.4)] transition-colors bg-white"
                placeholder="Confirm your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>

            <p className="text-center text-sm text-ink/60 pt-2">
              <Link to="/login" className="text-cobalt font-medium hover:text-cobalt-dark">
                Back to Login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
