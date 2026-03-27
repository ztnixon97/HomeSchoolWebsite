import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import Pagination from '../../components/Pagination';

interface LessonPlan {
  id: number;
  author_id: number;
  author_name: string | null;
  title: string;
  description: string;
  age_group: string | null;
  category: string | null;
  created_at: string;
}

const categoryColors: Record<string, string> = {
  art: 'bg-pink-100 text-pink-800',
  science: 'bg-green-100 text-green-800',
  literacy: 'bg-blue-100 text-blue-800',
  math: 'bg-yellow-100 text-yellow-800',
  social: 'bg-purple-100 text-purple-800',
  outdoor: 'bg-emerald-100 text-emerald-800',
};

export default function LessonPlans() {
  const { isTeacher, user } = useAuth();
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [ageGroup, setAgeGroup] = useState('');

  useEffect(() => {
    api.get<LessonPlan[]>('/api/lesson-plans').then(setPlans).catch(() => {});
  }, []);

  const filtered = plans.filter(p => {
    const text = `${p.title} ${p.description}`.toLowerCase();
    const q = query.trim().toLowerCase();
    if (q && !text.includes(q)) return false;
    if (category && p.category !== category) return false;
    if (ageGroup && p.age_group !== ageGroup) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lesson Plans</h1>
          <p className="text-gray-500 text-sm mt-1">Browse and share lesson plans for the co-op.</p>
        </div>
        {isTeacher && (
          <Link to="/lesson-plans/new" className="bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 no-underline transition-colors w-full sm:w-auto text-center">
            New Lesson Plan
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search plans..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">All</option>
              <option value="art">Art</option>
              <option value="science">Science</option>
              <option value="literacy">Literacy</option>
              <option value="math">Math</option>
              <option value="social">Social Skills</option>
              <option value="outdoor">Outdoor</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Age Group</label>
            <select value={ageGroup} onChange={e => setAgeGroup(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">All</option>
              <option value="2-3">2-3 years</option>
              <option value="3-4">3-4 years</option>
              <option value="4-5">4-5 years</option>
              <option value="mixed">Mixed ages</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="text-xs text-gray-500">Showing {filtered.length} / {plans.length}</div>
          </div>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No lesson plans yet.</p>
        </div>
      ) : (
        <Pagination items={filtered} pageSize={12}>
          {(pageItems) => (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pageItems.map(plan => (
                <Link
                  key={plan.id}
                  to={`/lesson-plans/${plan.id}`}
                  className="block bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-gray-200 transition-all no-underline"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                    <h2 className="text-lg font-semibold text-gray-900 flex-1">{plan.title}</h2>
                    {plan.category && (
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap ${categoryColors[plan.category] || 'bg-gray-100 text-gray-700'}`}>
                        {plan.category}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm line-clamp-2 leading-relaxed">
                    {plan.description.replace(/<[^>]*>/g, '').replace(/[#*`]/g, '').slice(0, 150)}
                  </p>
                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-gray-400">
                    {plan.author_name && (
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{plan.author_name}</span>
                    )}
                    {plan.age_group && <span>Ages {plan.age_group}</span>}
                    {user && (user.id === plan.author_id || user.role === 'admin') && (
                      <span className="sm:ml-auto text-xs text-emerald-700">Editable</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Pagination>
      )}
    </div>
  );
}
