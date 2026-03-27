import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

interface FileSummary {
  total_bytes: number;
  total_mb: string;
  file_count: number;
  session_bytes: number;
  lesson_plan_bytes: number;
  other_bytes: number;
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
  const [summary, setSummary] = useState<FileSummary | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [typeFilter, setTypeFilter] = useState('');

  const refresh = () => {
    api.get<{ summary: FileSummary; files: FileEntry[] }>('/api/admin/files').then(res => {
      setSummary(res.summary);
      setFiles(res.files);
    }).catch(() => {});
  };

  useEffect(refresh, []);

  const handleDelete = async (id: number, filename: string) => {
    if (!window.confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    await api.del(`/api/admin/files/${id}`);
    refresh();
  };

  const filtered = typeFilter
    ? files.filter(f => (f.linked_type || 'other') === typeFilter)
    : files;

  const usagePercent = summary ? (summary.total_bytes / (summary.r2_free_tier_gb * 1024 * 1024 * 1024)) * 100 : 0;

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-[#1e3a5f] hover:underline mb-4 inline-block">&larr; Admin Dashboard</Link>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">File Management</h1>
        <p className="text-gray-500 text-sm mt-1">Monitor storage usage and manage uploaded files.</p>
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
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
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

      {/* Filter */}
      <div className="flex gap-3">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">All Files ({files.length})</option>
          <option value="session">Session Photos ({files.filter(f => f.linked_type === 'session').length})</option>
          <option value="lesson_plan">Lesson Plan Files ({files.filter(f => f.linked_type === 'lesson_plan').length})</option>
          <option value="other">Other ({files.filter(f => !f.linked_type).length})</option>
        </select>
      </div>

      {/* File List */}
      <div className="space-y-2">
        {filtered.map(f => (
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
              className="text-xs text-red-500 hover:text-red-700 font-medium flex-shrink-0"
            >
              Delete
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">No files found.</p>
        )}
      </div>
    </div>
  );
}
