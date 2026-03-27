import { useState, useMemo } from 'react';

// Client-side pagination (used when all data is already loaded)
interface ClientPaginationProps<T> {
  items: T[];
  pageSize?: number;
  children: (pageItems: T[]) => React.ReactNode;
}

export default function Pagination<T>({ items, pageSize = 12, children }: ClientPaginationProps<T>) {
  const [page, setPage] = useState(0);

  const itemCount = items.length;
  const totalPages = Math.max(1, Math.ceil(itemCount / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  const pageItems = useMemo(
    () => items.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [items, safePage, pageSize]
  );

  if (safePage !== page) setPage(safePage);

  return (
    <div>
      {children(pageItems)}
      {totalPages > 1 && <PageControls page={safePage + 1} totalPages={totalPages} onPageChange={(p) => setPage(p - 1)} />}
    </div>
  );
}

// Server-side pagination controls (used when API handles pagination)
interface ServerPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function ServerPagination({ page, pageSize, total, onPageChange }: ServerPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return <PageControls page={page} totalPages={totalPages} onPageChange={onPageChange} />;
}

function PageControls({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-6 text-sm">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="px-3 py-1.5 rounded-lg border border-ink/20 hover:bg-ink/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Previous
      </button>
      <span className="text-ink/50 text-xs px-2">
        {page} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="px-3 py-1.5 rounded-lg border border-ink/20 hover:bg-ink/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Next
      </button>
    </div>
  );
}
