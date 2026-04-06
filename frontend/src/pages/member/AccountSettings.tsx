import { useState, useEffect } from 'react';
import { useAuth } from '../../auth';
import { api } from '../../api';
import { useToast } from '../../components/Toast';

export default function AccountSettings() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();

  // Profile
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [preferredContact, setPreferredContact] = useState(user?.preferred_contact || '');
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

  // Push notifications
  const [pushSupported] = useState(() => 'Notification' in window && 'serviceWorker' in navigator);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushPrefs, setPushPrefs] = useState<Record<string, boolean>>({
    host_assignment: true, reminders: true, rsvp: true, announcements: true, messages: true,
  });

  useEffect(() => {
    if (pushSupported) {
      api.get<{ subscribed: boolean; preferences: Record<string, boolean> }>('/api/push/preferences')
        .then(r => {
          setPushSubscribed(r.subscribed);
          if (r.subscribed && Object.keys(r.preferences).length > 0) setPushPrefs(r.preferences);
        })
        .catch(() => {});
    }
  }, []);

  const handleTogglePush = async () => {
    if (pushSubscribed) {
      // Unsubscribe
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
        localStorage.removeItem('push-subscribed');
        setPushSubscribed(false);
        showToast('Notifications disabled', 'success');
      } catch { showToast('Failed to disable notifications', 'error'); }
    } else {
      // Subscribe
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') { showToast('Notification permission denied', 'error'); return; }
        const { public_key } = await api.get<{ public_key: string }>('/api/push/vapid-key');
        if (!public_key) { showToast('Push not configured on server', 'error'); return; }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: public_key });
        const json = sub.toJSON();
        await api.post('/api/push/subscribe', { endpoint: json.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth });
        localStorage.setItem('push-subscribed', '1');
        localStorage.setItem('push-prompt-dismissed', '1');
        setPushSubscribed(true);
        showToast('Notifications enabled', 'success');
      } catch { showToast('Failed to enable notifications', 'error'); }
    }
  };

  const handlePrefChange = async (key: string, value: boolean) => {
    const updated = { ...pushPrefs, [key]: value };
    setPushPrefs(updated);
    await api.put('/api/push/preferences', { [key]: value }).catch(() => {});
  };

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
          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} required autoComplete="name" className={inputClass} />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">Phone</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" className={inputClass} placeholder="Optional" />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">Address</label>
          <input type="text" value={address} onChange={e => setAddress(e.target.value)} autoComplete="street-address" className={inputClass} placeholder="Optional — shared with other members" />
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
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required autoComplete="email" className={inputClass} placeholder="new@example.com" />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">Current Password</label>
          <input type="password" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} required autoComplete="current-password" className={inputClass} placeholder="Confirm your password" />
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
          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required autoComplete="current-password" className={inputClass} />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">New Password</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" className={inputClass} placeholder="8+ chars, uppercase, lowercase, number" />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink/80 mb-1.5">Confirm New Password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} autoComplete="new-password" className={inputClass} />
        </div>

        <button type="submit" disabled={savingPassword} className="btn-primary disabled:opacity-50">
          {savingPassword ? 'Changing...' : 'Change Password'}
        </button>
      </form>

      {/* Push Notifications */}
      {pushSupported && (
        <div className="panel-quiet p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink mb-2">Push Notifications</h2>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink/80">Enable push notifications</p>
              <p className="text-xs text-ink/50">Receive alerts on your device</p>
            </div>
            <button
              onClick={handleTogglePush}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${pushSubscribed ? 'bg-cobalt' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${pushSubscribed ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {pushSubscribed && (
            <div className="border-t border-ink/10 pt-4 space-y-3">
              <p className="text-xs text-ink/50 uppercase tracking-wider font-medium">Notification types</p>
              {([
                ['host_assignment', 'Host assignments', 'When you are assigned to host a session'],
                ['reminders', 'Class reminders', 'Reminders for sessions happening tomorrow'],
                ['rsvp', 'RSVP activity', 'When someone RSVPs or cancels for your session'],
                ['announcements', 'Announcements', 'New announcements from admins'],
                ['messages', 'Messages', 'New messages in conversations'],
              ] as const).map(([key, label, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-ink/80">{label}</p>
                    <p className="text-xs text-ink/40">{desc}</p>
                  </div>
                  <button
                    onClick={() => handlePrefChange(key, !pushPrefs[key])}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${pushPrefs[key] ? 'bg-cobalt' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${pushPrefs[key] ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
