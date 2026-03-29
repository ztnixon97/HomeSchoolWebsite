import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { api } from '../api';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

interface FieldItem {
  id: string;
  type: 'signature' | 'date' | 'name';
  pageIndex: number;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  label: string;
}

interface Props {
  templateId: number;
  fileId: number;
  templateTitle: string;
  onClose: () => void;
}

type PlaceMode = 'view' | 'place-signature' | 'place-date' | 'place-name';

let _fid = 0;
const nextFieldId = () => `field-${++_fid}`;

const TYPE_STYLES: Record<string, string> = {
  signature: 'border-emerald-400 bg-emerald-50/80',
  date: 'border-blue-400 bg-blue-50/80',
  name: 'border-purple-400 bg-purple-50/80',
};

const TYPE_LABELS: Record<string, string> = {
  signature: 'Sign here',
  date: 'Date',
  name: 'Name',
};

const MIN_W = 0.05;
const MIN_H = 0.015;

export default function FieldEditor({ templateId, fileId, templateTitle, onClose }: Props) {
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const pdfFile = useMemo(() => pdfData ? { data: pdfData.slice() } : null, [pdfData]);
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(600);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fields, setFields] = useState<FieldItem[]>([]);
  const [mode, setMode] = useState<PlaceMode>('view');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    id: string; startX: number; startY: number; origX: number; origY: number;
  } | null>(null);
  const [resizeState, setResizeState] = useState<{
    id: string; corner: string; startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Load PDF
  useEffect(() => {
    fetch(`/api/files/${fileId}/download?proxy=true`, { credentials: 'include' })
      .then(res => { if (!res.ok) throw new Error('Failed'); return res.arrayBuffer(); })
      .then(buf => setPdfData(new Uint8Array(buf)))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [fileId]);

  // Load existing fields
  useEffect(() => {
    api.get<any[]>(`/api/document-templates/${templateId}/fields`)
      .then(data => {
        setFields(data.map(f => ({
          id: nextFieldId(),
          type: f.field_type,
          pageIndex: f.page_index,
          xPct: f.x_pct,
          yPct: f.y_pct,
          widthPct: f.width_pct,
          heightPct: f.height_pct,
          label: f.label || TYPE_LABELS[f.field_type] || f.field_type,
        })));
      })
      .catch(() => {});
  }, [templateId]);

  // Measure
  useEffect(() => {
    const measure = () => {
      if (scrollRef.current) setPageWidth(Math.min(scrollRef.current.clientWidth - 32, 800));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Place
  const handlePageClick = useCallback((pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-field]')) return;
    const pageEl = pageRefs.current[pageIndex];
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;

    if (mode === 'place-signature') {
      setFields(prev => [...prev, {
        id: nextFieldId(), type: 'signature', pageIndex,
        xPct: clamp(xPct - 0.125, 0, 0.75), yPct: clamp(yPct - 0.03, 0, 0.94),
        widthPct: 0.25, heightPct: 0.06, label: 'Sign here',
      }]);
      setMode('view');
    } else if (mode === 'place-date') {
      setFields(prev => [...prev, {
        id: nextFieldId(), type: 'date', pageIndex,
        xPct: clamp(xPct - 0.1, 0, 0.8), yPct: clamp(yPct - 0.012, 0, 0.98),
        widthPct: 0.22, heightPct: 0.024, label: 'Date',
      }]);
      setMode('view');
    } else if (mode === 'place-name') {
      setFields(prev => [...prev, {
        id: nextFieldId(), type: 'name', pageIndex,
        xPct: clamp(xPct - 0.1, 0, 0.75), yPct: clamp(yPct - 0.012, 0, 0.98),
        widthPct: 0.25, heightPct: 0.024, label: 'Name',
      }]);
      setMode('view');
    } else {
      setSelectedId(null);
    }
  }, [mode]);

  // Drag
  const startDrag = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation(); e.preventDefault();
    const item = fields.find(f => f.id === id);
    if (!item) return;
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragState({ id, startX: cx, startY: cy, origX: item.xPct, origY: item.yPct });
    setSelectedId(id);
  };

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const item = fields.find(f => f.id === dragState.id);
      if (!item) return;
      const pageEl = pageRefs.current[item.pageIndex];
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();
      const dx = (cx - dragState.startX) / rect.width;
      const dy = (cy - dragState.startY) / rect.height;
      setFields(prev => prev.map(f =>
        f.id === dragState.id ? {
          ...f,
          xPct: clamp(dragState.origX + dx, 0, 1 - f.widthPct),
          yPct: clamp(dragState.origY + dy, 0, 1 - f.heightPct),
        } : f
      ));
    };
    const onUp = () => setDragState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragState, fields]);

  // Resize
  const startResize = (e: React.MouseEvent | React.TouchEvent, id: string, corner: string) => {
    e.stopPropagation(); e.preventDefault();
    const item = fields.find(f => f.id === id);
    if (!item) return;
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setResizeState({
      id, corner, startX: cx, startY: cy,
      origX: item.xPct, origY: item.yPct, origW: item.widthPct, origH: item.heightPct,
    });
    setSelectedId(id);
  };

  useEffect(() => {
    if (!resizeState) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const item = fields.find(f => f.id === resizeState.id);
      if (!item) return;
      const pageEl = pageRefs.current[item.pageIndex];
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();
      const dx = (cx - resizeState.startX) / rect.width;
      const dy = (cy - resizeState.startY) / rect.height;
      const { corner, origX, origY, origW, origH } = resizeState;

      let nX = origX, nY = origY, nW = origW, nH = origH;
      if (corner === 'se') { nW = Math.max(MIN_W, origW + dx); nH = Math.max(MIN_H, origH + dy); }
      else if (corner === 'sw') { nX = clamp(origX + dx, 0, origX + origW - MIN_W); nW = Math.max(MIN_W, origW - dx); nH = Math.max(MIN_H, origH + dy); }
      else if (corner === 'ne') { nY = clamp(origY + dy, 0, origY + origH - MIN_H); nW = Math.max(MIN_W, origW + dx); nH = Math.max(MIN_H, origH - dy); }
      else if (corner === 'nw') { nX = clamp(origX + dx, 0, origX + origW - MIN_W); nY = clamp(origY + dy, 0, origY + origH - MIN_H); nW = Math.max(MIN_W, origW - dx); nH = Math.max(MIN_H, origH - dy); }
      nW = Math.min(nW, 1 - nX); nH = Math.min(nH, 1 - nY);

      setFields(prev => prev.map(f =>
        f.id === resizeState.id ? { ...f, xPct: nX, yPct: nY, widthPct: nW, heightPct: nH } : f
      ));
    };
    const onUp = () => setResizeState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [resizeState, fields]);

  // Save
  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/api/admin/document-templates/${templateId}/fields`, {
        fields: fields.map(f => ({
          field_type: f.type,
          label: f.label,
          page_index: f.pageIndex,
          x_pct: f.xPct,
          y_pct: f.yPct,
          width_pct: f.widthPct,
          height_pct: f.heightPct,
          required: true,
        })),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save fields');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-100 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const modeLabels: Record<PlaceMode, string> = {
    view: '',
    'place-signature': 'Click to place a signature field',
    'place-date': 'Click to place a date field',
    'place-name': 'Click to place a name field',
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 sm:px-4 sm:py-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900 truncate">
            Set Signature Spots &mdash; {templateTitle}
          </h2>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setMode(mode === 'place-signature' ? 'view' : 'place-signature')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'place-signature' ? 'bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              <span className="hidden sm:inline">Signature</span>
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === 'place-date' ? 'view' : 'place-date')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'place-date' ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span className="hidden sm:inline">Date</span>
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === 'place-name' ? 'view' : 'place-name')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'place-name' ? 'bg-purple-100 text-purple-800 ring-2 ring-purple-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              <span className="hidden sm:inline">Name</span>
            </button>

            {selectedId && (
              <>
                <div className="w-px h-6 bg-gray-200 mx-1" />
                <button
                  type="button"
                  onClick={() => { setFields(prev => prev.filter(f => f.id !== selectedId)); setSelectedId(null); }}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete
                </button>
              </>
            )}

            <div className="w-px h-6 bg-gray-200 mx-1" />

            <span className="text-xs text-gray-500">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Mode banner */}
      {mode !== 'view' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center flex-shrink-0">
          <p className="text-sm text-amber-800 font-medium">{modeLabels[mode]}</p>
          <button onClick={() => setMode('view')} className="text-xs text-amber-600 hover:text-amber-800 underline mt-0.5">
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-center flex-shrink-0">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* PDF area */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="max-w-[840px] mx-auto py-4 px-4">
          {pdfFile && (
            <Document
              file={pdfFile}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              onLoadError={(err) => setError(`PDF error: ${err.message}`)}
              loading={
                <div className="flex justify-center py-20">
                  <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              {Array.from({ length: numPages }, (_, i) => (
                <div
                  key={i}
                  className="relative mb-4 shadow-lg bg-white mx-auto"
                  style={{ width: pageWidth }}
                  ref={el => { pageRefs.current[i] = el; }}
                >
                  <div className="absolute -top-6 left-0 text-xs text-gray-400">
                    Page {i + 1} of {numPages}
                  </div>
                  <Page pageNumber={i + 1} width={pageWidth} renderTextLayer={false} renderAnnotationLayer={false} />
                  <div
                    className="absolute inset-0"
                    style={{ cursor: mode !== 'view' ? 'crosshair' : 'default' }}
                    onClick={e => handlePageClick(i, e)}
                  >
                    {fields.filter(f => f.pageIndex === i).map(field => (
                      <div
                        key={field.id}
                        data-field
                        className={`absolute select-none border-2 border-dashed ${TYPE_STYLES[field.type]} ${
                          selectedId === field.id ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
                        }`}
                        style={{
                          left: `${field.xPct * 100}%`,
                          top: `${field.yPct * 100}%`,
                          width: `${field.widthPct * 100}%`,
                          height: `${field.heightPct * 100}%`,
                          cursor: dragState?.id === field.id ? 'grabbing' : 'grab',
                        }}
                        onClick={e => { e.stopPropagation(); setSelectedId(prev => prev === field.id ? null : field.id); }}
                        onMouseDown={e => startDrag(e, field.id)}
                        onTouchStart={e => startDrag(e, field.id)}
                      >
                        <div className="w-full h-full flex items-center justify-center pointer-events-none">
                          <span className="text-xs font-medium opacity-70">{field.label}</span>
                        </div>

                        {selectedId === field.id && (
                          <>
                            {['nw', 'ne', 'sw', 'se'].map(corner => (
                              <div
                                key={corner}
                                className="absolute w-3 h-3 bg-white border-2 border-emerald-500 rounded-full z-10"
                                style={{
                                  top: corner.startsWith('n') ? -6 : undefined,
                                  bottom: corner.startsWith('s') ? -6 : undefined,
                                  left: corner.endsWith('w') ? -6 : undefined,
                                  right: corner.endsWith('e') ? -6 : undefined,
                                  cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
                                }}
                                onMouseDown={e => startResize(e, field.id, corner)}
                                onTouchStart={e => startResize(e, field.id, corner)}
                              />
                            ))}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Document>
          )}
        </div>
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max));
}
