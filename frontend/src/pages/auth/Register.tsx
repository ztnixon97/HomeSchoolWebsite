import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { api } from '../../api';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Pre-fill from email invite link
  const [inviteCode, setInviteCode] = useState(searchParams.get('code') || '');
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteInvalid, setInviteInvalid] = useState(false);
  const [isBulkInvite, setIsBulkInvite] = useState(false);

  const hasInviteFromLink = !!searchParams.get('code');

  // Validate invite code upfront when arriving via link
  useEffect(() => {
    if (!hasInviteFromLink) return;
    const code = searchParams.get('code')!;
    api.get<{ valid: boolean; message?: string; is_bulk?: boolean; email?: string | null }>(`/api/auth/check-invite?code=${encodeURIComponent(code)}`)
      .then(res => {
        if (!res.valid) {
          setInviteInvalid(true);
          setError(res.message || 'This invite link is no longer valid.');
        } else {
          if (res.is_bulk) setIsBulkInvite(true);
          // Only pre-fill email if the invite has one (not bulk)
          if (res.email && !isBulkInvite) setEmail(res.email);
        }
      })
      .catch(() => {});
  }, [hasInviteFromLink, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be at least 8 characters with an uppercase letter, lowercase letter, and number');
      return;
    }

    setLoading(true);
    try {
      await register(inviteCode, email, password, displayName);
      navigate('/schedule');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
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
          <h1 className="text-2xl font-semibold text-ink">Join Our Co-op</h1>
          <p className="text-ink/60 text-sm mt-1">
            {hasInviteFromLink
              ? 'Complete your account setup below'
              : 'Create your account with an invite'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="panel-quiet p-6 space-y-4">
          {error && (
            <div className="text-red-700 text-sm bg-red-50 border border-red-100 p-3 rounded-lg">{error}</div>
          )}

          {!hasInviteFromLink && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Invite Code</label>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-ink/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(31,75,122,0.2)] focus:border-[rgba(31,75,122,0.4)] transition-colors bg-white"
                placeholder="Paste your invite code"
              />
              <p className="text-xs text-ink/50 mt-1">Check your email for an invite from the co-op.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              autoComplete="name"
              className="w-full px-3 py-2.5 border border-ink/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(31,75,122,0.2)] focus:border-[rgba(31,75,122,0.4)] transition-colors bg-white"
              placeholder="Full name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              readOnly={hasInviteFromLink && !isBulkInvite}
              autoComplete="email"
              className={`w-full px-3 py-2.5 border border-ink/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(31,75,122,0.2)] focus:border-[rgba(31,75,122,0.4)] transition-colors bg-white ${hasInviteFromLink && !isBulkInvite ? 'bg-gray-50 text-ink/60' : ''}`}
              placeholder="you@example.com"
            />
            {hasInviteFromLink && (
              <p className="text-xs text-ink/50 mt-1">This email is linked to your invite.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-3 py-2.5 border border-ink/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(31,75,122,0.2)] focus:border-[rgba(31,75,122,0.4)] transition-colors bg-white"
              placeholder="8+ chars, uppercase, lowercase, number"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-3 py-2.5 border border-ink/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(31,75,122,0.2)] focus:border-[rgba(31,75,122,0.4)] transition-colors bg-white"
              placeholder="Re-enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading || inviteInvalid}
            className="w-full btn-primary disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          <p className="text-center text-sm text-ink/60 pt-2">
            Already have an account?{' '}
            <Link to="/login" className="text-cobalt font-medium hover:text-cobalt-dark">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
