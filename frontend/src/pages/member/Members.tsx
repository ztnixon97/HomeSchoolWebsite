import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ServerPagination } from '../../components/Pagination';

interface Member {
  id: number;
  display_name: string;
  email: string;
  role: string;
  phone: string | null;
  address: string | null;
  preferred_contact: string | null;
  hosted_sessions: string[];
  upcoming_sessions: string[];
  children: string[];
}

export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 12;

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    if (query) params.set('q', query);
    api.get<{ items: Member[]; total: number } | Member[]>(`/api/members?${params}`).then(res => {
      if (Array.isArray(res)) { setMembers(res); setTotal(res.length); }
      else { setMembers(res.items); setTotal(res.total); }
    }).catch(() => {});
  }, [page, query]);

  useEffect(() => { setPage(1); }, [query]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Members</h1>
          <p className="text-gray-500 text-sm mt-1">Contact info and hosting history.</p>
        </div>
        <div className="w-64">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search members..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {members.map(m => (
          <div key={m.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">{m.display_name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                  m.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                  m.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{m.role === 'parent' ? 'Member' : m.role}</span>
              </div>
            </div>
            <div className="text-sm text-gray-600 mt-2 space-y-1">
              <div>Email: <span className="text-gray-900">{m.email}</span></div>
              {m.phone && <div>Phone: <span className="text-gray-900">{m.phone}</span></div>}
              {m.preferred_contact && <div>Preferred contact: <span className="text-gray-900">{m.preferred_contact}</span></div>}
            </div>

            {(m.children?.length ?? 0) > 0 && (
              <div className="mt-3 p-2 bg-blue-50 rounded-lg">
                <span className="text-xs text-blue-600 font-medium">Children: </span>
                <span className="text-sm text-blue-800">{m.children.join(', ')}</span>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-1">Upcoming Hosting</h3>
                {m.upcoming_sessions.length === 0 ? (
                  <p className="text-sm text-gray-400">None</p>
                ) : (
                  <ul className="text-sm text-gray-700 list-disc list-inside">
                    {m.upcoming_sessions.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-1">Hosting History</h3>
                {m.hosted_sessions.length === 0 ? (
                  <p className="text-sm text-gray-400">None</p>
                ) : (
                  <ul className="text-sm text-gray-700 list-disc list-inside">
                    {m.hosted_sessions.slice(0, 5).map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <ServerPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
