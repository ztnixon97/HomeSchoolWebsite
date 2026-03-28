import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/Toast';

/* ──────────────── Types ──────────────── */

interface AdminPayment {
  id: number;
  user_id: number;
  user_name: string;
  description: string;
  amount: number;
  payment_type: string;
  category: string | null;
  status: string;
  payment_method: string | null;
  due_date: string | null;
  reference_number: string | null;
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

interface OverdueCharge {
  id: number;
  user_id: number;
  user_name: string;
  description: string;
  amount: number;
  due_date: string;
  days_overdue: number;
}

interface PaymentStats {
  total_charged: number;
  total_collected: number;
  outstanding_balance: number;
  overdue_amount: number;
  members_with_balance: number;
}

interface AdminUser {
  id: number;
  display_name: string;
  email: string;
  role: string;
}

interface AdminSession {
  id: number;
  title: string;
  session_date: string;
}

interface BulkChargeResult {
  created: number;
  skipped: number;
}

/* ──────────────── Helpers ──────────────── */

function fmt(amount: number): string {
  return '$' + Math.abs(amount).toFixed(2);
}

type Tab = 'transactions' | 'balances' | 'overdue' | 'bulk';

const inputClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors';

const inlineInputClass =
  'px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors';

const thClass = 'pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider';

const CATEGORIES = [
  { value: 'tuition', label: 'Tuition' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'field_trip', label: 'Field Trip' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'other', label: 'Other' },
];

/* ──────────────── Badges ──────────────── */

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

function CategoryLabel({ category }: { category: string | null }) {
  if (!category) return <span className="text-gray-400">--</span>;
  const found = CATEGORIES.find(c => c.value === category);
  return <span className="capitalize">{found ? found.label : category}</span>;
}

/* ──────────────── Component ──────────────── */

export default function ManagePayments() {
  const { showToast } = useToast();

  /* ── Data state ── */
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [summary, setSummary] = useState<PaymentSummary[]>([]);
  const [overdue, setOverdue] = useState<OverdueCharge[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Tab state ── */
  const [tab, setTab] = useState<Tab>('transactions');

  /* ── Filter state ── */
  const [filterName, setFilterName] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  /* ── Create form state ── */
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createUserId, setCreateUserId] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createAmount, setCreateAmount] = useState('');
  const [createType, setCreateType] = useState<'charge' | 'payment'>('charge');
  const [createCategory, setCreateCategory] = useState('tuition');
  const [createPaymentMethod, setCreatePaymentMethod] = useState('');
  const [createDueDate, setCreateDueDate] = useState('');
  const [createReferenceNumber, setCreateReferenceNumber] = useState('');
  const [createStatus, setCreateStatus] = useState<'pending' | 'paid'>('pending');
  const [createNotes, setCreateNotes] = useState('');
  const [createSessionId, setCreateSessionId] = useState('');
  const [creating, setCreating] = useState(false);

  /* ── Edit state ── */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editReferenceNumber, setEditReferenceNumber] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');

  /* ── Bulk charge state ── */
  const [bulkSessionId, setBulkSessionId] = useState('');
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkCategory, setBulkCategory] = useState('tuition');
  const [bulkDueDate, setBulkDueDate] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkChargeResult | null>(null);

  /* ── Data fetching ── */

  const refreshPayments = () => {
    api.get<AdminPayment[]>('/api/admin/payments').then(setPayments).catch(() => {});
  };

  const refreshSummary = () => {
    api.get<PaymentSummary[]>('/api/admin/payments/summary').then(setSummary).catch(() => {});
  };

  const refreshOverdue = () => {
    api.get<OverdueCharge[]>('/api/admin/payments/overdue').then(setOverdue).catch(() => {});
  };

  const refreshStats = () => {
    api.get<PaymentStats>('/api/admin/payments/stats').then(setStats).catch(() => {});
  };

  const refreshAll = () => {
    refreshPayments();
    refreshSummary();
    refreshOverdue();
    refreshStats();
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<AdminPayment[]>('/api/admin/payments').then(setPayments),
      api.get<PaymentSummary[]>('/api/admin/payments/summary').then(setSummary),
      api.get<OverdueCharge[]>('/api/admin/payments/overdue').then(setOverdue),
      api.get<PaymentStats>('/api/admin/payments/stats').then(setStats),
      api.get<AdminUser[]>('/api/admin/users').then(setUsers),
      api.get<AdminSession[]>('/api/admin/sessions').then(setSessions),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /* ── Filtered transactions ── */

  const filteredPayments = payments.filter(p => {
    if (filterName && !p.user_name.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterType !== 'all' && p.payment_type !== filterType) return false;
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    return true;
  });

  /* ── Create ── */

  const resetCreateForm = () => {
    setCreateUserId('');
    setCreateDescription('');
    setCreateAmount('');
    setCreateType('charge');
    setCreateCategory('tuition');
    setCreatePaymentMethod('');
    setCreateDueDate('');
    setCreateReferenceNumber('');
    setCreateStatus('pending');
    setCreateNotes('');
    setCreateSessionId('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUserId) {
      showToast('Please select a member', 'error');
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
        category: createCategory || undefined,
        payment_method: createPaymentMethod || undefined,
        due_date: createDueDate || undefined,
        reference_number: createReferenceNumber || undefined,
        status: createStatus,
        notes: createNotes || undefined,
        session_id: createSessionId ? parseInt(createSessionId, 10) : undefined,
      });
      showToast('Transaction created', 'success');
      resetCreateForm();
      setShowCreateForm(false);
      refreshAll();
    } catch (err: any) {
      showToast(err.message || 'Failed to create transaction', 'error');
    } finally {
      setCreating(false);
    }
  };

  /* ── Inline Edit ── */

  const startEdit = (p: AdminPayment) => {
    setEditingId(p.id);
    setEditDescription(p.description);
    setEditAmount(String(p.amount));
    setEditType(p.payment_type);
    setEditCategory(p.category ?? '');
    setEditPaymentMethod(p.payment_method ?? '');
    setEditDueDate(p.due_date ? p.due_date.slice(0, 10) : '');
    setEditReferenceNumber(p.reference_number ?? '');
    setEditStatus(p.status);
    setEditNotes(p.notes ?? '');
  };

  const cancelEdit = () => setEditingId(null);

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
        category: editCategory || undefined,
        payment_method: editPaymentMethod || undefined,
        due_date: editDueDate || undefined,
        reference_number: editReferenceNumber || undefined,
        status: editStatus || undefined,
        notes: editNotes || undefined,
      });
      showToast('Transaction updated', 'success');
      setEditingId(null);
      refreshAll();
    } catch (err: any) {
      showToast(err.message || 'Failed to update transaction', 'error');
    }
  };

  /* ── Delete ── */

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    try {
      await api.del(`/api/admin/payments/${id}`);
      showToast('Transaction deleted', 'success');
      refreshAll();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete transaction', 'error');
    }
  };

  /* ── Mark overdue as paid ── */

  const markAsPaid = async (id: number) => {
    try {
      await api.put(`/api/admin/payments/${id}`, { status: 'paid' });
      showToast('Marked as paid', 'success');
      refreshAll();
    } catch (err: any) {
      showToast(err.message || 'Failed to update', 'error');
    }
  };

  /* ── Bulk Charge ── */

  const handleBulkCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkSessionId) {
      showToast('Please select a session', 'error');
      return;
    }
    const parsedAmount = parseFloat(bulkAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    setBulkSubmitting(true);
    setBulkResult(null);
    try {
      const result = await api.post<BulkChargeResult>('/api/admin/payments/bulk-charge', {
        session_id: parseInt(bulkSessionId, 10),
        description: bulkDescription,
        amount: parsedAmount,
        category: bulkCategory || undefined,
        due_date: bulkDueDate || undefined,
        notes: bulkNotes || undefined,
      });
      setBulkResult(result);
      showToast(`Bulk charge complete: ${result.created} created, ${result.skipped} skipped`, 'success');
      refreshAll();
    } catch (err: any) {
      showToast(err.message || 'Bulk charge failed', 'error');
    } finally {
      setBulkSubmitting(false);
    }
  };

  /* ── Navigate from Balances to filtered Transactions ── */

  const viewMemberTransactions = (name: string) => {
    setFilterName(name);
    setFilterType('all');
    setFilterStatus('all');
    setFilterCategory('all');
    setTab('transactions');
  };

  /* ── Auto-fill bulk description from session ── */

  useEffect(() => {
    if (bulkSessionId) {
      const session = sessions.find(s => s.id === parseInt(bulkSessionId, 10));
      if (session) {
        setBulkDescription(session.title);
      }
    }
  }, [bulkSessionId, sessions]);

  /* ──────────────── Render ──────────────── */

  if (loading) {
    return <p className="text-center py-16 text-ink/40">Loading payments...</p>;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'transactions', label: 'Transactions' },
    { key: 'balances', label: 'Balances' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'bulk', label: 'Bulk Charge' },
  ];

  return (
    <div className="space-y-8">
      <Link to="/admin" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium inline-block mb-4">
        &larr; Admin Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Manage Payments</h1>
          <p className="text-ink/60 text-sm mt-1">Track charges, payments, and balances for all members.</p>
        </div>
        {tab === 'transactions' && (
          <button
            onClick={() => setShowCreateForm(v => !v)}
            className="bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors"
          >
            {showCreateForm ? 'Cancel' : 'Add Transaction'}
          </button>
        )}
      </div>

      {/* ── Stats Summary Bar ── */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Charged</p>
            <p className="text-xl font-bold text-ink mt-1">{fmt(stats.total_charged)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Collected</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">{fmt(stats.total_collected)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding</p>
            <p className="text-xl font-bold text-amber-600 mt-1">{fmt(stats.outstanding_balance)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Overdue</p>
            <p className={`text-xl font-bold mt-1 ${stats.overdue_amount > 0 ? 'text-red-600' : 'text-ink'}`}>
              {fmt(stats.overdue_amount)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Members w/ Balance</p>
            <p className="text-xl font-bold text-ink mt-1">{stats.members_with_balance}</p>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="flex gap-1 border-b border-gray-200 mb-6 min-w-max">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════ TRANSACTIONS TAB ════════════════════════ */}
      {tab === 'transactions' && (
        <div className="space-y-6">
          {/* Create Form */}
          {showCreateForm && (
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">New Transaction</h2>
              <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Member</label>
                  <select value={createUserId} onChange={e => setCreateUserId(e.target.value)} required className={inputClass}>
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
                    placeholder="e.g. Monthly tuition"
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
                  <select value={createType} onChange={e => setCreateType(e.target.value as 'charge' | 'payment')} className={inputClass}>
                    <option value="charge">Charge</option>
                    <option value="payment">Payment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                  <select value={createCategory} onChange={e => setCreateCategory(e.target.value)} className={inputClass}>
                    {CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {createType === 'payment' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Method</label>
                    <select value={createPaymentMethod} onChange={e => setCreatePaymentMethod(e.target.value)} className={inputClass}>
                      <option value="">Select method...</option>
                      {PAYMENT_METHODS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {createType === 'charge' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Due Date</label>
                    <input
                      type="date"
                      value={createDueDate}
                      onChange={e => setCreateDueDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Reference Number</label>
                  <input
                    type="text"
                    value={createReferenceNumber}
                    onChange={e => setCreateReferenceNumber(e.target.value)}
                    placeholder="Check #, confirmation code"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                  <select value={createStatus} onChange={e => setCreateStatus(e.target.value as 'pending' | 'paid')} className={inputClass}>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Link to Session (optional)</label>
                  <select value={createSessionId} onChange={e => setCreateSessionId(e.target.value)} className={inputClass}>
                    <option value="">None</option>
                    {sessions.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.title} ({new Date(s.session_date).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
                  <textarea
                    value={createNotes}
                    onChange={e => setCreateNotes(e.target.value)}
                    placeholder="Additional notes..."
                    rows={2}
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowCreateForm(false); resetCreateForm(); }}
                    className="px-4 py-2.5 border border-emerald-700 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
                  >
                    {creating ? 'Saving...' : 'Create Transaction'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Filter Bar */}
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input
                type="text"
                value={filterName}
                onChange={e => setFilterName(e.target.value)}
                placeholder="Search by member name..."
                className={inputClass}
              />
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className={inputClass}>
                <option value="all">All Types</option>
                <option value="charge">Charges</option>
                <option value="payment">Payments</option>
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inputClass}>
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className={inputClass}>
                <option value="all">All Categories</option>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </section>

          {/* Transaction Table */}
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Transactions ({filteredPayments.length})
            </h2>
            {filteredPayments.length === 0 ? (
              <p className="text-ink/40 text-sm">No transactions found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className={thClass}>Date</th>
                      <th className={thClass}>Member</th>
                      <th className={thClass}>Description</th>
                      <th className={thClass}>Category</th>
                      <th className={`${thClass} text-right`}>Amount</th>
                      <th className={thClass}>Type</th>
                      <th className={thClass}>Status</th>
                      <th className={thClass}>Method</th>
                      <th className={thClass}>Due Date</th>
                      <th className={thClass}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map(p =>
                      editingId === p.id ? (
                        <tr key={p.id} className="border-b border-gray-50 bg-emerald-50/30 align-top">
                          <td className="py-3 text-gray-500 text-xs">
                            {new Date(p.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 font-medium text-gray-800">{p.user_name}</td>
                          <td className="py-3">
                            <input type="text" value={editDescription} onChange={e => setEditDescription(e.target.value)} className={inlineInputClass + ' w-32'} />
                            <div className="mt-1">
                              <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes" className={inlineInputClass + ' w-32 text-xs'} />
                            </div>
                          </td>
                          <td className="py-3">
                            <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className={inlineInputClass + ' w-24'}>
                              <option value="">--</option>
                              {CATEGORIES.map(c => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3">
                            <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} min="0.01" step="0.01" className={inlineInputClass + ' w-24'} />
                          </td>
                          <td className="py-3">
                            <select value={editType} onChange={e => setEditType(e.target.value)} className={inlineInputClass + ' w-24'}>
                              <option value="charge">Charge</option>
                              <option value="payment">Payment</option>
                            </select>
                          </td>
                          <td className="py-3">
                            <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className={inlineInputClass + ' w-24'}>
                              <option value="pending">Pending</option>
                              <option value="paid">Paid</option>
                              <option value="overdue">Overdue</option>
                            </select>
                          </td>
                          <td className="py-3">
                            <select value={editPaymentMethod} onChange={e => setEditPaymentMethod(e.target.value)} className={inlineInputClass + ' w-24'}>
                              <option value="">--</option>
                              {PAYMENT_METHODS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3">
                            <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} className={inlineInputClass + ' w-36'} />
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button onClick={() => saveEdit(p.id)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Save</button>
                              <button onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 align-top">
                          <td className="py-3 text-gray-500 text-xs">
                            {new Date(p.created_at).toLocaleDateString()}
                            {p.recorded_by_name && <p className="text-xs text-gray-400 mt-0.5">by {p.recorded_by_name}</p>}
                          </td>
                          <td className="py-3 font-medium text-gray-800">{p.user_name}</td>
                          <td className="py-3 text-gray-800">
                            {p.description}
                            {p.notes && <p className="text-xs text-gray-400 mt-0.5">{p.notes}</p>}
                            {p.session_title && <p className="text-xs text-gray-400 mt-0.5">Session: {p.session_title}</p>}
                            {p.reference_number && <p className="text-xs text-gray-400 mt-0.5">Ref: {p.reference_number}</p>}
                          </td>
                          <td className="py-3 text-gray-600">
                            <CategoryLabel category={p.category} />
                          </td>
                          <td className={`py-3 font-semibold text-right ${p.payment_type === 'charge' ? 'text-red-600' : 'text-emerald-700'}`}>
                            {p.payment_type === 'charge' ? '-' : '+'}{fmt(p.amount)}
                          </td>
                          <td className="py-3"><TypeBadge type={p.payment_type} /></td>
                          <td className="py-3"><StatusBadge status={p.status} /></td>
                          <td className="py-3 text-gray-500 text-xs capitalize">{p.payment_method ?? '--'}</td>
                          <td className="py-3 text-gray-500 text-xs">
                            {p.due_date ? new Date(p.due_date).toLocaleDateString() : '--'}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => startEdit(p)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Edit</button>
                              <button onClick={() => handleDelete(p.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ════════════════════════ BALANCES TAB ════════════════════════ */}
      {tab === 'balances' && (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Member Balances</h2>
          {summary.length === 0 ? (
            <p className="text-ink/40 text-sm">No data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className={thClass}>Member</th>
                    <th className={thClass}>Email</th>
                    <th className={`${thClass} text-right`}>Total Charges</th>
                    <th className={`${thClass} text-right`}>Total Payments</th>
                    <th className={`${thClass} text-right`}>Balance</th>
                    <th className={thClass}></th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(s => (
                    <tr key={s.user_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 font-medium text-gray-800">{s.display_name}</td>
                      <td className="py-3 text-gray-500">{s.email}</td>
                      <td className="py-3 text-red-600 text-right">{fmt(s.total_charges)}</td>
                      <td className="py-3 text-emerald-700 text-right">{fmt(s.total_payments)}</td>
                      <td className={`py-3 font-semibold text-right ${s.balance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {s.balance > 0 ? '' : s.balance === 0 ? '' : '-'}{fmt(s.balance)}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => viewMemberTransactions(s.display_name)}
                          className="text-xs text-emerald-700 hover:text-emerald-800 font-medium"
                        >
                          View Transactions
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ════════════════════════ OVERDUE TAB ════════════════════════ */}
      {tab === 'overdue' && (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Overdue Charges</h2>
          {overdue.length === 0 ? (
            <p className="text-ink/40 text-sm">No overdue charges. All caught up!</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className={thClass}>Member</th>
                    <th className={thClass}>Description</th>
                    <th className={`${thClass} text-right`}>Amount</th>
                    <th className={thClass}>Due Date</th>
                    <th className={thClass}>Days Overdue</th>
                    <th className={thClass}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map(o => (
                    <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 font-medium text-gray-800">{o.user_name}</td>
                      <td className="py-3 text-gray-800">{o.description}</td>
                      <td className="py-3 text-red-600 font-semibold text-right">{fmt(o.amount)}</td>
                      <td className="py-3 text-gray-500">{new Date(o.due_date).toLocaleDateString()}</td>
                      <td className="py-3">
                        <span className="inline-block text-xs px-2.5 py-0.5 rounded-full font-medium bg-red-100 text-red-800">
                          {o.days_overdue} days
                        </span>
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => markAsPaid(o.id)}
                          className="text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-800 font-medium transition-colors"
                        >
                          Mark Paid
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ════════════════════════ BULK CHARGE TAB ════════════════════════ */}
      {tab === 'bulk' && (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Bulk Charge Session RSVPs</h2>
          <p className="text-ink/60 text-sm mb-6">
            Charge all members who RSVP'd to a session. Members who have already been charged for this session will be skipped.
          </p>

          <form onSubmit={handleBulkCharge} className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Session</label>
              <select value={bulkSessionId} onChange={e => setBulkSessionId(e.target.value)} required className={inputClass}>
                <option value="">Select a session...</option>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({new Date(s.session_date).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <input
                type="text"
                value={bulkDescription}
                onChange={e => setBulkDescription(e.target.value)}
                placeholder="Charge description"
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount ($)</label>
              <input
                type="number"
                value={bulkAmount}
                onChange={e => setBulkAmount(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} className={inputClass}>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Due Date</label>
              <input
                type="date"
                value={bulkDueDate}
                onChange={e => setBulkDueDate(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
              <input
                type="text"
                value={bulkNotes}
                onChange={e => setBulkNotes(e.target.value)}
                placeholder="Optional notes"
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={bulkSubmitting}
                className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
              >
                {bulkSubmitting ? 'Processing...' : 'Charge All RSVPs'}
              </button>
            </div>
          </form>

          {bulkResult && (
            <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm font-medium text-emerald-800">
                Bulk charge complete: <span className="font-bold">{bulkResult.created}</span> charges created,{' '}
                <span className="font-bold">{bulkResult.skipped}</span> skipped (already charged).
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
