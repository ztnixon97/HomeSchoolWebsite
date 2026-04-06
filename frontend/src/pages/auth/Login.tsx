import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      const redirectTo = searchParams.get('redirect') || '/schedule';
      navigate(redirectTo);
    } catch (err: any) {
      setError(err.message || 'Login failed');
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
          <h1 className="text-2xl font-semibold text-ink">Welcome Back</h1>
          <p className="text-ink/60 text-sm mt-1">Sign in to your co-op account</p>
        </div>

        <form onSubmit={handleSubmit} className="panel-quiet p-6 space-y-4">
          {error && (
            <div className="text-red-700 text-sm bg-red-50 border border-red-100 p-3 rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2.5 border border-ink/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(31,75,122,0.2)] focus:border-[rgba(31,75,122,0.4)] transition-colors bg-white"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2.5 border border-ink/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(31,75,122,0.2)] focus:border-[rgba(31,75,122,0.4)] transition-colors bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="text-center text-xs text-ink/60 pt-2">
            <Link to="/forgot-password" className="hover:text-ink">
              Forgot password?
            </Link>
          </div>

          <p className="text-center text-sm text-ink/60 pt-2">
            Received an invite?{' '}
            <Link to="/register" className="text-cobalt font-medium hover:text-cobalt-dark">
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
