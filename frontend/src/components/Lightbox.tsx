import { useState, useEffect, useCallback } from 'react';

interface Photo {
  id: number;
  filename: string;
  url: string;
}

interface LightboxProps {
  photos: Photo[];
  canDelete?: boolean;
  onDelete?: (id: number) => void;
}

export default function PhotoGallery({ photos, canDelete, onDelete }: LightboxProps) {
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  const close = useCallback(() => setViewIndex(null), []);
  const prev = useCallback(() => setViewIndex(i => i !== null ? Math.max(0, i - 1) : null), []);
  const next = useCallback(() => setViewIndex(i => i !== null ? Math.min(photos.length - 1, i + 1) : null), [photos.length]);

  useEffect(() => {
    if (viewIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewIndex, close, prev, next]);

  if (photos.length === 0) return null;

  const current = viewIndex !== null ? photos[viewIndex] : null;

  return (
    <>
      {/* Thumbnail Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map((p, i) => (
          <div key={p.id} className="relative group">
            <button
              onClick={() => setViewIndex(i)}
              className="w-full focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-lg"
            >
              <img
                src={p.url}
                alt={p.filename}
                className="rounded-lg border border-gray-200 w-full h-36 object-cover hover:opacity-90 transition-opacity cursor-pointer"
                loading="lazy"
              />
            </button>
            {canDelete && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('Delete this photo?')) onDelete(p.id);
                }}
                className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete photo"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox Overlay */}
      {current && viewIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={close}
        >
          {/* Close button */}
          <button
            onClick={close}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl font-light z-10"
          >
            &times;
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-4 text-white/60 text-sm">
            {viewIndex + 1} / {photos.length}
          </div>

          {/* Delete button in lightbox */}
          {canDelete && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Delete this photo?')) {
                  onDelete(current.id);
                  if (photos.length <= 1) close();
                  else if (viewIndex >= photos.length - 1) setViewIndex(viewIndex - 1);
                }
              }}
              className="absolute top-4 right-16 text-red-400 hover:text-red-300 text-sm font-medium z-10"
            >
              Delete
            </button>
          )}

          {/* Download */}
          <a
            href={current.url}
            download={current.filename}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 right-32 text-white/70 hover:text-white text-sm font-medium z-10"
          >
            Download
          </a>

          {/* Previous */}
          {viewIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-5xl font-light"
            >
              &#8249;
            </button>
          )}

          {/* Image */}
          <img
            src={current.url}
            alt={current.filename}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next */}
          {viewIndex < photos.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-5xl font-light"
            >
              &#8250;
            </button>
          )}

          {/* Filename */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-xs">
            {current.filename}
          </div>
        </div>
      )}
    </>
  );
}
