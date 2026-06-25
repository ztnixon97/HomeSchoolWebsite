import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/Toast';

interface BrowseStudent {
  student_id: number;
  name: string;
  status: 'none' | 'enrolled' | 'pending' | 'waitlisted' | 'denied' | 'approved';
}

interface BrowseClass {
  id: number;
  name: string;
  description: string | null;
  capacity: number | null;
  member_count: number;
  is_full: boolean;
  my_students: BrowseStudent[];
}

const statusLabel: Record<string, string> = {
  enrolled: 'Enrolled',
  pending: 'Requested',
  waitlisted: 'Waitlisted',
  approved: 'Enrolled',
  denied: 'Not approved',
};

export default function BrowseClasses() {
  const { showToast } = useToast();
  const [classes, setClasses] = useState<BrowseClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    api.get<BrowseClass[]>('/api/class-groups/browse')
      .then(setClasses)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const requestJoin = async (groupId: number, studentId: number) => {
    const key = `${groupId}:${studentId}`;
    setBusy(key);
    try {
      const res = await api.post<{ status: string }>(`/api/class-groups/${groupId}/enroll-request`, { student_id: studentId });
      setClasses(prev => prev.map(c => c.id === groupId
        ? { ...c, my_students: c.my_students.map(s => s.student_id === studentId ? { ...s, status: res.status as BrowseStudent['status'] } : s) }
        : c));
      showToast(res.status === 'waitlisted' ? 'Added to the waitlist' : 'Request sent for approval', 'success');
    } catch {
      showToast('Could not send request', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><p className="text-ink/40 text-sm">Loading classes…</p></div>;
  }

  const noChildren = classes.length > 0 && classes.every(c => c.my_students.length === 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Browse Classes</h1>
        <p className="text-sm text-ink/50 mt-1">Request to enroll your children in available classes. An admin reviews each request.</p>
      </div>

      {noChildren && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-800">
          Add your children first on the <Link to="/my-children" className="underline font-medium">My Children</Link> page, then come back to request enrollment.
        </div>
      )}

      {classes.length === 0 ? (
        <p className="text-ink/40 text-sm">No classes are open for enrollment right now.</p>
      ) : (
        <div className="space-y-3">
          {classes.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-ink">{c.name}</h3>
                  {c.description && <p className="text-sm text-gray-500 mt-0.5">{c.description}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">
                    {c.member_count}{c.capacity != null ? `/${c.capacity}` : ''} enrolled
                  </p>
                  {c.is_full && <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Full</span>}
                </div>
              </div>

              {c.my_students.length > 0 && (
                <div className="mt-3 border-t border-gray-50 pt-3 space-y-2">
                  {c.my_students.map(s => (
                    <div key={s.student_id} className="flex items-center justify-between text-sm">
                      <span className="text-ink">{s.name}</span>
                      {s.status === 'none' || s.status === 'denied' ? (
                        <button
                          onClick={() => requestJoin(c.id, s.student_id)}
                          disabled={busy === `${c.id}:${s.student_id}`}
                          className="px-3 py-1.5 bg-emerald-700 text-white text-xs rounded-lg hover:bg-emerald-800 disabled:opacity-50"
                        >
                          {c.is_full ? 'Join waitlist' : 'Request to join'}
                        </button>
                      ) : (
                        <span className={`text-xs font-medium ${s.status === 'enrolled' || s.status === 'approved' ? 'text-emerald-700' : 'text-gray-500'}`}>
                          {statusLabel[s.status] || s.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
