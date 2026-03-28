import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

interface ClassGroup {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  member_count: number;
  upcoming_sessions: number;
}

export default function MyClasses() {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ClassGroup[]>('/api/class-groups')
      .then(setGroups)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-ink/40">Loading classes...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link to="/dashboard" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium mb-4 inline-block">&larr; Dashboard</Link>
      <h1 className="text-2xl font-bold text-ink mb-6">My Classes</h1>

      {groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-ink/40">No classes found. Your children may not be assigned to any class groups yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map(g => (
            <Link
              key={g.id}
              to={`/classes/${g.id}`}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 hover:border-emerald-300 hover:shadow-md transition-all no-underline group"
            >
              <h2 className="text-lg font-semibold text-ink group-hover:text-emerald-700 mb-1">{g.name}</h2>
              {g.description && (
                <p className="text-sm text-gray-500 mb-3">{g.description}</p>
              )}
              <div className="flex gap-4 text-xs text-gray-400">
                <span>{g.member_count} student{g.member_count !== 1 ? 's' : ''}</span>
                <span>{g.upcoming_sessions} upcoming session{g.upcoming_sessions !== 1 ? 's' : ''}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
