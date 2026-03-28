import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

interface Payment {
  id: number;
  description: string;
  amount: number;
  payment_type: string;
  status: string;
  session_id: number | null;
  session_title: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  payment_method: string | null;
  due_date: string | null;
  category: string | null;
  reference_number: string | null;
}

type TypeFilter = 'all' | 'charge' | 'payment';
type StatusFilter = 'all' | 'pending' | 'paid';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

export default function MyPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    api.get<Payment[]>('/api/my-payments')
      .then(setPayments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalCharges = payments
    .filter(p => p.payment_type === 'charge')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalPayments = payments
    .filter(p => p.payment_type === 'payment')
    .reduce((sum, p) => sum + p.amount, 0);

  const balance = totalCharges - totalPayments;

  const today = new Date().toISOString().split('T')[0];

  const overdueItems = useMemo(
    () =>
      payments.filter(
        p =>
          p.payment_type === 'charge' &&
          p.status === 'pending' &&
          p.due_date &&
          p.due_date < today,
      ),
    [payments, today],
  );

  const filteredPayments = useMemo(() => {
    let result = [...payments];

    if (typeFilter !== 'all') {
      result = result.filter(p => p.payment_type === typeFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }

    result.sort((a, b) => {
      const dateA = a.paid_at || a.created_at;
      const dateB = b.paid_at || b.created_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return result;
  }, [payments, typeFilter, statusFilter]);

  if (loading) {
    return <p className="text-center py-16 text-ink/40">Loading...</p>;
  }

  return (
    <div className="space-y-8">
      <Link
        to="/dashboard"
        className="text-sm text-emerald-700 hover:text-emerald-800 font-medium inline-block mb-4"
      >
        &larr; Dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-ink">My Payments</h1>
        <p className="text-ink/60 text-sm mt-1">Your charges and payment history.</p>
      </div>

      {/* Balance Summary Card */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Summary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">
              Total Charges
            </p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalCharges)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">
              Total Payments
            </p>
            <p className="text-2xl font-bold text-emerald-700">{formatCurrency(totalPayments)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">
              {balance > 0 ? 'Balance Due' : 'Paid in Full'}
            </p>
            <p className={`text-2xl font-bold ${balance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {formatCurrency(balance)}
            </p>
          </div>
        </div>
      </section>

      {/* Overdue Warning Banner */}
      {overdueItems.length > 0 && (
        <section className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-red-500 mt-0.5 text-lg leading-none">!</span>
            <div>
              <h3 className="text-sm font-semibold text-red-800 mb-1">Overdue Charges</h3>
              <ul className="space-y-1">
                {overdueItems.map(item => (
                  <li key={item.id} className="text-sm text-red-700">
                    {item.description} &mdash; {formatCurrency(item.amount)} (due{' '}
                    {formatDate(item.due_date!)})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Transaction History */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Transaction History</h2>

          <div className="flex flex-wrap gap-3">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as TypeFilter)}
              className="w-full sm:w-auto px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            >
              <option value="all">All Types</option>
              <option value="charge">Charges</option>
              <option value="payment">Payments</option>
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full sm:w-auto px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>

        {filteredPayments.length === 0 ? (
          <p className="text-center py-16 text-ink/40">No transactions found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Date</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Description</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Category</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Amount</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Type</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Status</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Payment Method</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Due Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 text-gray-500 whitespace-nowrap">
                      {formatDate(p.paid_at || p.created_at)}
                    </td>
                    <td className="py-3">
                      <span className="font-medium text-gray-800">{p.description}</span>
                      {p.session_id && p.session_title && (
                        <Link
                          to={`/dashboard/sessions/${p.session_id}`}
                          className="block text-xs text-emerald-700 hover:text-emerald-800 mt-0.5"
                        >
                          {p.session_title}
                        </Link>
                      )}
                      {p.notes && (
                        <p className="text-xs text-gray-400 font-normal mt-0.5">{p.notes}</p>
                      )}
                    </td>
                    <td className="py-3 text-gray-500 capitalize whitespace-nowrap">
                      {p.category ?? <span className="text-gray-300">&mdash;</span>}
                    </td>
                    <td
                      className={`py-3 font-semibold whitespace-nowrap ${
                        p.payment_type === 'charge' ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {p.payment_type === 'charge' ? '+' : '-'}
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="py-3">
                      <TypeBadge type={p.payment_type} />
                    </td>
                    <td className="py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="py-3 text-gray-500 capitalize whitespace-nowrap">
                      {p.payment_method ?? <span className="text-gray-300">&mdash;</span>}
                    </td>
                    <td className="py-3 text-gray-500 whitespace-nowrap">
                      {p.due_date ? (
                        <span
                          className={
                            p.status === 'pending' && p.due_date < today
                              ? 'text-red-600 font-medium'
                              : ''
                          }
                        >
                          {formatDate(p.due_date)}
                        </span>
                      ) : (
                        <span className="text-gray-300">&mdash;</span>
                      )}
                    </td>
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
