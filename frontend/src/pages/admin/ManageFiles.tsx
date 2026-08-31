import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useToast } from '../../components/Toast';
import { ServerPagination } from '../../components/Pagination';

const PAGE_SIZE = 20;

interface FileSummary {
  total_bytes: number;
  total_mb: string;
  file_count: number;
  session_bytes: number;
  lesson_plan_bytes: number;
  other_bytes: number;
  session_count: number;
  lesson_plan_count: number;
  other_count: number;
  r2_free_tier_gb: number;
}

interface FileEntry {
  id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  linked_type: string | null;
  linked_id: number | null;
  created_at: string;
  uploader_name: string | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ManageFiles() {
  const { showToast } = useToast();
  const [summary, setSummary] = useState<FileSummary | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    let ignore = false; // guard against an out-of-order (stale) response overwriting newer data
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    if (search) params.set('q', search);
    if (typeFilter) params.set('linked_type', typeFilter);
    api.get<{ summary: FileSummary; files: FileEntry[]; total: number }>(`/api/admin/files?${params}`).then(res => {
      if (ignore) return;
      setSummary(res.summary);
      setFiles(res.files);
      setTotal(res.total);
    }).catch(() => {});
    return () => { ignore = true; };
  }, [page, search, typeFilter, refreshKey]);

  // Reset to page 1 whenever a filter changes
  useEffect(() => { setPage(1); }, [search, typeFilter]);

  const handleDelete = async (id: number, filename: string) => {
    if (!window.confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    try {
      await api.del(`/api/admin/files/${id}`);
      showToast('File deleted', 'success');
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete file', 'error');
    }
  };

  const usagePercent = summary ? (summary.total_bytes / (summary.r2_free_tier_gb * 1024 * 1024 * 1024)) * 100 : 0;

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium mb-4 inline-block">&larr; Admin Dashboard</Link>

      <div>
        <h1 className="text-2xl font-bold text-ink">File Management</h1>
        <p className="text-ink/60 text-sm mt-1">Monitor storage usage and manage uploaded files.</p>
      </div>

      {/* Storage Summary */}
      {summary && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Storage Usage</h2>
          <div className="mb-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">{summary.total_mb} MB used</span>
              <span className="text-gray-400">{summary.r2_free_tier_gb} GB free tier</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${usagePercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'} ${usagePercent > 80 ? 'bg-red-500' : ''}`}
                style={{ width: `${Math.min(100, usagePercent)}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-sm">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-blue-700 font-semibold">{formatSize(summary.session_bytes)}</div>
              <div className="text-blue-500 text-xs">Session Photos</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3">
              <div className="text-emerald-700 font-semibold">{formatSize(summary.lesson_plan_bytes)}</div>
              <div className="text-emerald-500 text-xs">Lesson Plans</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-700 font-semibold">{formatSize(summary.other_bytes)}</div>
              <div className="text-gray-500 text-xs">Other</div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">{summary.file_count} files total. Session photos auto-delete after 30 days.</p>
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by filename or uploader..."
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">All Files ({summary?.file_count ?? 0})</option>
          <option value="session">Session Photos ({summary?.session_count ?? 0})</option>
          <option value="lesson_plan">Lesson Plan Files ({summary?.lesson_plan_count ?? 0})</option>
          <option value="other">Other ({summary?.other_count ?? 0})</option>
        </select>
      </div>

      {/* File List */}
      <div className="space-y-2">
        {files.map(f => (
          <div key={f.id} className="bg-white rounded-lg border border-gray-100 p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 truncate">{f.filename}</span>
                <span className="text-xs text-gray-400">{formatSize(f.size_bytes)}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {f.linked_type && (
                  <span className={`px-1.5 py-0.5 rounded text-xs mr-2 ${
                    f.linked_type === 'session' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    {f.linked_type === 'session' ? 'Session' : 'Lesson Plan'} #{f.linked_id}
                  </span>
                )}
                {f.uploader_name && <span>by {f.uploader_name}</span>}
                {' \u2014 '}
                {new Date(f.created_at).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={() => handleDelete(f.id, f.filename)}
              className="text-xs text-red-500 hover:text-red-700 font-medium flex-shrink-0 py-2 px-3 rounded-lg"
            >
              Delete
            </button>
          </div>
        ))}
        {files.length === 0 && (
          <p className="text-center text-ink/40 py-8 text-sm">No files found.</p>
        )}
      </div>
      <ServerPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
