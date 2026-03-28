import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/Toast';
import type { User } from '../../auth';

interface Invite {
  id: number;
  code: string;
  role: string;
  email: string | null;
  used_by: number | null;
  created_at: string;
}

export default function ManageUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteRole, setInviteRole] = useState('parent');
  const [inviteEmail, setInviteEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [resetPasswordId, setResetPasswordId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const { showToast } = useToast();

  const refresh = () => {
    api.get<User[]>('/api/admin/users').then(setUsers).catch(() => {});
    api.get<Invite[]>('/api/admin/invites').then(setInvites).catch(() => {});
  };

  useEffect(refresh, []);

  const createInvite = async () => {
    if (!inviteEmail.trim()) {
      showToast('Email is required to send an invite', 'error');
      return;
    }
    setSending(true);
    try {
      await api.post('/api/admin/invites', {
        role: inviteRole,
        email: inviteEmail,
      });
      showToast(`Invite sent to ${inviteEmail}`, 'success');
      setInviteEmail('');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to send invite', 'error');
    } finally {
      setSending(false);
    }
  };

  const toggleActive = async (user: User) => {
    const action = user.active ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    await api.put(`/api/admin/users/${user.id}`, { active: !user.active });
    refresh();
  };

  const changeRole = async (userId: number, role: string) => {
    await api.put(`/api/admin/users/${userId}`, { role });
    refresh();
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to permanently delete ${user.display_name}'s account? This cannot be undone.`)) return;
    try {
      await api.del(`/api/admin/users/${user.id}`);
      showToast(`${user.display_name}'s account has been deleted`, 'success');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete user', 'error');
    }
  };

  const resetPassword = async (userId: number) => {
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    try {
      await api.post(`/api/admin/users/${userId}/reset-password`, { new_password: newPassword });
      showToast('Password has been reset', 'success');
      setResetPasswordId(null);
      setNewPassword('');
    } catch (err: any) {
      showToast(err.message || 'Failed to reset password', 'error');
    }
  };

  const unusedInvites = invites.filter(i => !i.used_by);

  const filteredUsers = users.filter(u => {
    const matchesSearch = !search ||
      u.display_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = !roleFilter || u.role === roleFilter;
    const matchesStatus = !statusFilter ||
      (statusFilter === 'active' && u.active) ||
      (statusFilter === 'inactive' && !u.active);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const inputClass = "px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors";

  return (
    <div className="space-y-8">
      <Link to="/admin" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium mb-4 inline-block">
        ← Admin Dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-ink">Manage Users</h1>
        <p className="text-ink/60 text-sm mt-1">Invite new members and manage existing accounts.</p>
      </div>

      {/* Invite by Email */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Invite a New Member</h2>
        <p className="text-gray-500 text-sm mb-4">An email with a registration link will be sent to the address you enter.</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className={inputClass}>
              <option value="parent">Parent</option>
              <option value="teacher">Teacher</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="parent@example.com"
              required
              className={inputClass + " w-full"}
            />
          </div>
          <button
            onClick={createInvite}
            disabled={sending || !inviteEmail.trim()}
            className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send Invite'}
          </button>
        </div>

        {unusedInvites.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Pending Invites</h3>
            <div className="space-y-2">
              {unusedInvites.map(inv => (
                <div key={inv.id} className="flex items-center gap-3 text-sm bg-emerald-50 px-4 py-2.5 rounded-lg border border-emerald-100">
                  <span className="text-gray-700 font-medium">{inv.email}</span>
                  <span className="text-emerald-700 capitalize text-xs bg-emerald-100 px-2 py-0.5 rounded-full">{inv.role}</span>
                  <span className="text-gray-400 text-xs ml-auto">
                    Sent {new Date(inv.created_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={async () => { await api.del(`/api/admin/invites/${inv.id}`); refresh(); }}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Users List */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Members ({users.length})</h2>

        {/* Search and Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className={inputClass + " flex-1 min-w-[200px]"}
          />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={inputClass}>
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="teacher">Teacher</option>
            <option value="parent">Parent</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputClass}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        {search || roleFilter || statusFilter ? (
          <p className="text-xs text-gray-400 mb-3">Showing {filteredUsers.length} of {users.length} members</p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Name</th>
                <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Email</th>
                <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Role</th>
                <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Status</th>
                <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-3 font-medium text-gray-800">{u.display_name}</td>
                  <td className="py-3 text-gray-500">{u.email}</td>
                  <td className="py-3">
                    <select
                      value={u.role}
                      onChange={e => changeRole(u.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="admin">Admin</option>
                      <option value="teacher">Teacher</option>
                      <option value="parent">Parent</option>
                    </select>
                  </td>
                  <td className="py-3">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${u.active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActive(u)}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                      >
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => { setResetPasswordId(resetPasswordId === u.id ? null : u.id); setNewPassword(''); }}
                        className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                      >
                        Reset Password
                      </button>
                      <button
                        onClick={() => deleteUser(u)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                    {resetPasswordId === u.id && (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="New password (min 8 chars)"
                          className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 w-48"
                        />
                        <button onClick={() => resetPassword(u.id)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Save</button>
                        <button onClick={() => { setResetPasswordId(null); setNewPassword(''); }} className="text-xs text-gray-500">Cancel</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
