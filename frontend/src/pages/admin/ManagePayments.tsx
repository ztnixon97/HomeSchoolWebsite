import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/Toast';

interface AdminPayment {
  id: number;
  user_id: number;
  user_name: string;
  description: string;
  amount: number;
  payment_type: string;
  status: string;
  session_id: number | null;
  session_title: string | null;
  paid_at: string | null;
  recorded_by: number | null;
  recorded_by_name: string | null;
  notes: string | null;
  created_at: string;
}

interface PaymentSummary {
  user_id: number;
  display_name: string;
  email: string;
  total_charges: number;
  total_payments: number;
  balance: number;
}

interface AdminUser {
  id: number;
  display_name: string;
  email: string;
  role: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function TypeBadge({ type }: { type: string }) {
  const isCharge = type === 'charge';
  return (
    <span
      className={`inline-block text-xs px-2.5 py-0.5 rounded-full font-medium ${
        isCharge ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
      }`}
    >
      {isCharge ? 'Charge' : 'Payment'}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: 'bg-emerald-100 text-emerald-800',
    pending: 'bg-amber-100 text-amber-800',
    overdue: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`inline-block text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${
        styles[status] ?? 'bg-gray-100 text-gray-700'
      }`}
    >
      {status}
    </span>
  );
}

const inputClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors';

const inlineInputClass =
  'px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors';

export default function ManagePayments() {
  const { showToast } = useToast();

  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [summary, setSummary] = useState<PaymentSummary[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);

  // Create form state
  const [createUserId, setCreateUserId] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createAmount, setCreateAmount] = useState('');
  const [createType, setCreateType] = useState<'charge' | 'payment'>('charge');
  const [createStatus, setCreateStatus] = useState<'pending' | 'paid'>('pending');
  const [createNotes, setCreateNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPaidAt, setEditPaidAt] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const refresh = () => {
    api.get<AdminPayment[]>('/api/admin/payments').then(setPayments).catch(() => {});
    api.get<PaymentSummary[]>('/api/admin/payments/summary').then(setSummary).catch(() => {});
  };

  useEffect(() => {
    refresh();
    api.get<AdminUser[]>('/api/admin/users').then(setUsers).catch(() => {});
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUserId) {
      showToast('Please select a user', 'error');
      return;
    }
    const parsedAmount = parseFloat(createAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    setCreating(true);
    try {
      await api.post('/api/admin/payments', {
        user_id: parseInt(createUserId, 10),
        description: createDescription,
        amount: parsedAmount,
        payment_type: createType,
        status: createStatus,
        notes: createNotes || undefined,
      });
      showToast('Payment entry created', 'success');
      setCreateUserId('');
      setCreateDescription('');
      setCreateAmount('');
      setCreateType('charge');
      setCreateStatus('pending');
      setCreateNotes('');
      setShowCreateForm(false);
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to create payment entry', 'error');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (p: AdminPayment) => {
    setEditingId(p.id);
    setEditDescription(p.description);
    setEditAmount(String(p.amount));
    setEditType(p.payment_type);
    setEditStatus(p.status);
    setEditPaidAt(p.paid_at ? p.paid_at.slice(0, 10) : '');
    setEditNotes(p.notes ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: number) => {
    const parsedAmount = parseFloat(editAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    try {
      await api.put(`/api/admin/payments/${id}`, {
        description: editDescription || undefined,
        amount: parsedAmount,
        payment_type: editType || undefined,
        status: editStatus || undefined,
        paid_at: editPaidAt || undefined,
        notes: editNotes || undefined,
      });
      showToast('Payment entry updated', 'success');
      setEditingId(null);
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to update payment entry', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this payment entry? This cannot be undone.')) return;
    try {
      await api.del(`/api/admin/payments/${id}`);
      showToast('Payment entry deleted', 'success');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete payment entry', 'error');
    }
  };

  return (
    <div className="space-y-8">
      <Link to="/admin" className="text-sm text-[#1e3a5f] hover:underline inline-block">
        &larr; Admin Dashboard
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Payments</h1>
          <p className="text-gray-500 text-sm mt-1">Track charges and payments for all members.</p>
        </div>
        <button
          onClick={() => setShowCreateForm(v => !v)}
          className="bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors"
        >
          {showCreateForm ? 'Cancel' : 'Add Entry'}
        </button>
      </div>

      {/* Balance Summary */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Member Balances</h2>
        {summary.length === 0 ? (
          <p className="text-gray-400 text-sm">No data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Member</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Email</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider text-right">Charges</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider text-right">Payments</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(s => (
                  <tr key={s.user_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 font-medium text-gray-800">{s.display_name}</td>
                    <td className="py-3 text-gray-500">{s.email}</td>
                    <td className="py-3 text-red-600 text-right">{formatCurrency(s.total_charges)}</td>
                    <td className="py-3 text-emerald-700 text-right">{formatCurrency(s.total_payments)}</td>
                    <td className={`py-3 font-semibold text-right ${s.balance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {formatCurrency(s.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create Form */}
      {showCreateForm && (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">New Payment Entry</h2>
          <form onSubmit={handleCreate} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Member</label>
              <select
                value={createUserId}
                onChange={e => setCreateUserId(e.target.value)}
                required
                className={inputClass}
              >
                <option value="">Select a member...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.display_name} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <input
                type="text"
                value={createDescription}
                onChange={e => setCreateDescription(e.target.value)}
                placeholder="e.g. Monthly dues"
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount ($)</label>
              <input
                type="number"
                value={createAmount}
                onChange={e => setCreateAmount(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
              <select
                value={createType}
                onChange={e => setCreateType(e.target.value as 'charge' | 'payment')}
                className={inputClass}
              >
                <option value="charge">Charge</option>
                <option value="payment">Payment</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <select
                value={createStatus}
                onChange={e => setCreateStatus(e.target.value as 'pending' | 'paid')}
                className={inputClass}
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
              <input
                type="text"
                value={createNotes}
                onChange={e => setCreateNotes(e.target.value)}
                placeholder="Optional notes"
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={creating}
                className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
              >
                {creating ? 'Saving...' : 'Create Entry'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Payments List */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">All Transactions ({payments.length})</h2>
        {payments.length === 0 ? (
          <p className="text-gray-400 text-sm">No payment entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Member</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Description</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Amount</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Type</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Status</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Date</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 align-top">
                    {editingId === p.id ? (
                      <>
                        <td className="py-3 font-medium text-gray-800">{p.user_name}</td>
                        <td className="py-3">
                          <input
                            type="text"
                            value={editDescription}
                            onChange={e => setEditDescription(e.target.value)}
                            className={inlineInputClass + ' w-40'}
                          />
                          <div className="mt-1">
                            <input
                              type="text"
                              value={editNotes}
                              onChange={e => setEditNotes(e.target.value)}
                              placeholder="Notes"
                              className={inlineInputClass + ' w-40 text-xs'}
                            />
                          </div>
                        </td>
                        <td className="py-3">
                          <input
                            type="number"
                            value={editAmount}
                            onChange={e => setEditAmount(e.target.value)}
                            min="0.01"
                            step="0.01"
                            className={inlineInputClass + ' w-24'}
                          />
                        </td>
                        <td className="py-3">
                          <select
                            value={editType}
                            onChange={e => setEditType(e.target.value)}
                            className={inlineInputClass}
                          >
                            <option value="charge">Charge</option>
                            <option value="payment">Payment</option>
                          </select>
                        </td>
                        <td className="py-3">
                          <select
                            value={editStatus}
                            onChange={e => setEditStatus(e.target.value)}
                            className={inlineInputClass}
                          >
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="overdue">Overdue</option>
                          </select>
                        </td>
                        <td className="py-3">
                          <input
                            type="date"
                            value={editPaidAt}
                            onChange={e => setEditPaidAt(e.target.value)}
                            className={inlineInputClass + ' w-36'}
                          />
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => saveEdit(p.id)}
                              className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 font-medium text-gray-800">{p.user_name}</td>
                        <td className="py-3 text-gray-800">
                          {p.description}
                          {p.notes && (
                            <p className="text-xs text-gray-400 mt-0.5">{p.notes}</p>
                          )}
                          {p.session_title && (
                            <p className="text-xs text-gray-400 mt-0.5">Session: {p.session_title}</p>
                          )}
                        </td>
                        <td className={`py-3 font-semibold ${p.payment_type === 'charge' ? 'text-red-600' : 'text-emerald-700'}`}>
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="py-3">
                          <TypeBadge type={p.payment_type} />
                        </td>
                        <td className="py-3">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="py-3 text-gray-500">
                          {p.paid_at
                            ? new Date(p.paid_at).toLocaleDateString()
                            : new Date(p.created_at).toLocaleDateString()}
                          {p.recorded_by_name && (
                            <p className="text-xs text-gray-400 mt-0.5">by {p.recorded_by_name}</p>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startEdit(p)}
                              className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="text-xs text-red-500 hover:text-red-700 font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
