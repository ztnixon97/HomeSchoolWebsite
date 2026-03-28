import { useEffect, useState } from 'react';
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

export default function MyPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-8">
      <Link to="/dashboard" className="text-sm text-[#1e3a5f] hover:underline inline-block">
        &larr; Dashboard
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">My Payments</h1>
        <p className="text-gray-500 text-sm mt-1">Your charges and payment history.</p>
      </div>

      {/* Balance summary */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Summary</h2>
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">Total Charges</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalCharges)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">Total Payments</p>
            <p className="text-2xl font-bold text-emerald-700">{formatCurrency(totalPayments)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">Balance Due</p>
            <p className={`text-2xl font-bold ${balance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {formatCurrency(balance)}
            </p>
          </div>
        </div>
      </section>

      {/* Payment list */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Transaction History</h2>

        {loading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : payments.length === 0 ? (
          <p className="text-gray-400 text-sm">No transactions found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Description</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Amount</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Type</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Status</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Date</th>
                  <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Session</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 font-medium text-gray-800">
                      {p.description}
                      {p.notes && (
                        <p className="text-xs text-gray-400 font-normal mt-0.5">{p.notes}</p>
                      )}
                    </td>
                    <td className={`py-3 font-semibold ${p.payment_type === 'charge' ? 'text-red-600' : 'text-emerald-700'}`}>
                      {p.payment_type === 'charge' ? '+' : '-'}{formatCurrency(p.amount)}
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
                    </td>
                    <td className="py-3 text-gray-500">
                      {p.session_title ?? <span className="text-gray-300">—</span>}
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
