import { useState, useMemo } from 'react';

interface PaginationProps<T> {
  items: T[];
  pageSize?: number;
  children: (pageItems: T[]) => React.ReactNode;
}

export default function Pagination<T>({ items, pageSize = 12, children }: PaginationProps<T>) {
  const [page, setPage] = useState(0);

  // Reset to page 0 when items change (e.g. filter applied)
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
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6 text-sm">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="px-3 py-1.5 rounded-lg border border-ink/20 hover:bg-ink/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-ink/50 text-xs px-2">
            {safePage + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg border border-ink/20 hover:bg-ink/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
