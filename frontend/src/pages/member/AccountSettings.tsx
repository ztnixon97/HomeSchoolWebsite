import { useState } from 'react';
import { useAuth } from '../../auth';
import { api } from '../../api';
import { useToast } from '../../components/Toast';

export default function AccountSettings() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();

  // Profile
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [phone, setPhone] = useState((user as any)?.phone || '');
  const [address, setAddress] = useState((user as any)?.address || '');
  const [preferredContact, setPreferredContact] = useState((user as any)?.preferred_contact || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Email
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.put('/api/auth/profile', {
        display_name: displayName,
        phone: phone || null,
        address: address || null,
        preferred_contact: preferredContact || null,
      });
      showToast('Profile updated', 'success');
      await refreshUser();
    } catch (err: any) {
      showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      showToast('Please enter a new email', 'error');
      return;
    }
    setSavingEmail(true);
    try {
      await api.put('/api/auth/change-email', {
        new_email: newEmail,
        password: emailPassword,
      });
      showToast('Email updated successfully', 'success');
      setNewEmail('');
      setEmailPassword('');
      await refreshUser();
    } catch (err: any) {
      showToast(err.message || 'Failed to update email', 'error');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      showToast('Password must be at least 8 characters with uppercase, lowercase, and a number', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      await api.put('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      showToast('Password changed successfully', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showToast(err.message || 'Failed to change password', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const inputClass = "w-full px-3 py-2.5 border border-ink/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(31,75,122,0.2)] focus:border-[rgba(31,75,122,0.4)] transition-colors bg-white";

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-ink">Account Settings</h1>
        <p className="text-ink/60 text-sm mt-1">Manage your profile, email, and password.</p>
      </div>

      {/* Profile Section */}
      <form onSubmit={handleSaveProfile} className="panel-quiet p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink mb-2">Profile</h2>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">Display Name</label>
          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} required className={inputClass} />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">Phone</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="Optional" />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">Address</label>
          <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={inputClass} placeholder="Optional — shared with other members" />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">Preferred Contact Method</label>
          <select value={preferredContact} onChange={e => setPreferredContact(e.target.value)} className={inputClass}>
            <option value="">No preference</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="text">Text</option>
          </select>
        </div>

        <button type="submit" disabled={savingProfile} className="btn-primary disabled:opacity-50">
          {savingProfile ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      {/* Email Section */}
      <form onSubmit={handleChangeEmail} className="panel-quiet p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink mb-2">Change Email</h2>
        <p className="text-ink/50 text-sm">Current email: <span className="font-medium text-ink/70">{user?.email}</span></p>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">New Email</label>
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required className={inputClass} placeholder="new@example.com" />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">Current Password</label>
          <input type="password" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} required className={inputClass} placeholder="Confirm your password" />
        </div>

        <button type="submit" disabled={savingEmail} className="btn-primary disabled:opacity-50">
          {savingEmail ? 'Updating...' : 'Update Email'}
        </button>
      </form>

      {/* Password Section */}
      <form onSubmit={handleChangePassword} className="panel-quiet p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink mb-2">Change Password</h2>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">Current Password</label>
          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required className={inputClass} />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">New Password</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} className={inputClass} placeholder="8+ chars, uppercase, lowercase, number" />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">Confirm New Password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} className={inputClass} />
        </div>

        <button type="submit" disabled={savingPassword} className="btn-primary disabled:opacity-50">
          {savingPassword ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  );
}
