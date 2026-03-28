import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { POST_CATEGORIES, getCategoryLabel } from '../../utils/postCategories';

interface Post {
  id: number;
  author_name: string | null;
  title: string;
  content: string;
  category: string | null;
  created_at: string;
}

export default function Blog() {
  const { user, isTeacher } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(8);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
    const finalCategory = category === 'other' ? customCategory.trim() : category;
    if (finalCategory) params.set('category', finalCategory);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    api.get<{ items: Post[]; total: number; page: number; page_size: number }>(`/api/posts/search?${params.toString()}`)
      .then(res => {
        setPosts(res.items);
        setTotal(res.total);
      })
      .catch(() => {});
  }, [debouncedSearch, category, customCategory, fromDate, toDate, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [query, category, customCategory, fromDate, toDate]);

  const clean = (html: string) => html.replace(/<[^>]*>/g, '').replace(/[#*`]/g, '');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="-mx-4 -mt-6 px-4 py-12 section-slab">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex justify-center mb-3">
            <div className="china-crest" />
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-ink/60 mb-3">Co-op Journal</p>
          <h1 className="text-4xl font-bold text-ink mb-3">Blog</h1>
          <div className="accent-rule mx-auto mb-4" />
          <p className="text-ink/70 text-lg">Updates, lesson recaps, and stories from our co-op family.</p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto space-y-4 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-gray-500">{total} post{total === 1 ? '' : 's'}</div>
          {isTeacher && (
            <div className="flex gap-2 items-center">
              <Link to="/posts/drafts" className="px-3 py-1.5 border border-emerald-700 text-emerald-700 rounded text-sm font-medium hover:bg-emerald-50 transition-colors">Drafts</Link>
              <Link to="/posts/new" className="bg-emerald-700 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-emerald-800 transition-colors">New Post</Link>
            </div>
          )}
          {!user && (
            <Link to="/login" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium">Member login</Link>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search posts by title, author, or content..."
            className="w-full px-4 py-2.5 border border-ink/20 rounded-full focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink/40 text-sm bg-white"
          />
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="px-3 py-2 border border-ink/20 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            >
              <option value="">All categories</option>
              {POST_CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            {category === 'other' && (
              <input
                type="text"
                value={customCategory}
                onChange={e => setCustomCategory(e.target.value)}
                placeholder="Custom category"
                className="px-3 py-2 border border-ink/20 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              />
            )}
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="px-3 py-2 border border-ink/20 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            />
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="px-3 py-2 border border-ink/20 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-ink/40">{query ? 'No posts match your search.' : 'No posts yet. Check back soon!'}</p>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto space-y-4 px-4 sm:px-6">
          {posts.map((post) => (
            <Link
              key={post.id}
              to={`/blog/${post.id}`}
              className={`block panel-quiet p-8 hover:border-ink/30 transition-all no-underline`}
            >
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-3">{post.title}</h2>
                <p className="text-gray-500 text-sm line-clamp-2 leading-relaxed">
                  {clean(post.content).slice(0, 200)}
                  {post.content.length > 200 ? '...' : ''}
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                  {post.author_name && (
                    <>
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{post.author_name}</span>
                      <span>&middot;</span>
                    </>
                  )}
                  {post.category && (
                    <>
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{getCategoryLabel(post.category)}</span>
                      <span>&middot;</span>
                    </>
                  )}
                  <span>{new Date(post.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-8">
          <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <button
              className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-700 disabled:opacity-50"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={!canPrev}
            >
              Previous
            </button>
            <div className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </div>
            <button
              className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-700 disabled:opacity-50"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={!canNext}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
