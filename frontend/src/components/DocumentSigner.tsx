import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import SignaturePad from './SignaturePad';

// PDF.js worker — use CDN to avoid Vite bundling issues
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

/* ── Types ── */

interface PlacedItem {
  id: string;
  type: 'signature' | 'date' | 'name';
  pageIndex: number;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  dataUrl?: string;
  text?: string;
}

interface Props {
  fileId: number;
  templateTitle: string;
  signerName: string;
  onComplete: (signedFile: File, signatureFile: File) => Promise<void>;
  onCancel: () => void;
}

type PlaceMode = 'view' | 'place-signature' | 'place-date' | 'place-name';

let _id = 0;
const nextId = () => `placed-${++_id}`;

/* ── Component ── */

export default function DocumentSigner({
  fileId,
  templateTitle,
  signerName,
  onComplete,
  onCancel,
}: Props) {
  // PDF state
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(600);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Interaction state
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
  const [mode, setMode] = useState<PlaceMode>('view');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    id: string;
    startX: number;
    startY: number;
    origXPct: number;
    origYPct: number;
  } | null>(null);

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* ── Load PDF ── */
  useEffect(() => {
    fetch(`/api/files/${fileId}/download`, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load document');
        return res.arrayBuffer();
      })
      .then(buf => {
        setPdfData(new Uint8Array(buf));
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [fileId]);

  /* ── Measure container width ── */
  useEffect(() => {
    const measure = () => {
      if (scrollRef.current) {
        setPageWidth(Math.min(scrollRef.current.clientWidth - 32, 800));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /* ── Signature helpers ── */
  const handleAddSignature = () => {
    if (!signatureDataUrl) {
      setShowSignaturePad(true);
    } else {
      setMode('place-signature');
      setSelectedId(null);
    }
  };

  const handleSignatureCapture = (dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
    setShowSignaturePad(false);
    setMode('place-signature');
  };

  const handleChangeSignature = () => {
    setSignatureDataUrl(null);
    setShowSignaturePad(true);
  };

  /* ── Place items on page click ── */
  const handlePageClick = useCallback(
    (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
      // Don't place if clicking an existing item
      if ((e.target as HTMLElement).closest('[data-item]')) return;

      const pageEl = pageRefs.current[pageIndex];
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();
      const xPct = (e.clientX - rect.left) / rect.width;
      const yPct = (e.clientY - rect.top) / rect.height;

      if (mode === 'place-signature' && signatureDataUrl) {
        // Compute aspect ratio from the signature image
        const img = new Image();
        img.src = signatureDataUrl;
        const aspect = img.naturalHeight && img.naturalWidth
          ? img.naturalHeight / img.naturalWidth
          : 0.4;
        const wPct = 0.25;
        const hPct = wPct * aspect * (rect.width / rect.height);

        setPlacedItems(prev => [
          ...prev,
          {
            id: nextId(),
            type: 'signature',
            pageIndex,
            xPct: clamp(xPct - wPct / 2, 0, 1 - wPct),
            yPct: clamp(yPct - hPct / 2, 0, 1 - hPct),
            widthPct: wPct,
            heightPct: hPct,
            dataUrl: signatureDataUrl,
          },
        ]);
        setMode('view');
      } else if (mode === 'place-date') {
        const dateStr = new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        setPlacedItems(prev => [
          ...prev,
          {
            id: nextId(),
            type: 'date',
            pageIndex,
            xPct: clamp(xPct - 0.1, 0, 0.8),
            yPct: clamp(yPct - 0.012, 0, 0.98),
            widthPct: 0.22,
            heightPct: 0.024,
            text: dateStr,
          },
        ]);
        setMode('view');
      } else if (mode === 'place-name') {
        setPlacedItems(prev => [
          ...prev,
          {
            id: nextId(),
            type: 'name',
            pageIndex,
            xPct: clamp(xPct - 0.1, 0, 0.75),
            yPct: clamp(yPct - 0.012, 0, 0.98),
            widthPct: 0.25,
            heightPct: 0.024,
            text: signerName,
          },
        ]);
        setMode('view');
      } else {
        // View mode — deselect
        setSelectedId(null);
      }
    },
    [mode, signatureDataUrl, signerName],
  );

  /* ── Drag placed items ── */
  const startDrag = (e: React.MouseEvent | React.TouchEvent, itemId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const item = placedItems.find(i => i.id === itemId);
    if (!item) return;
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragState({ id: itemId, startX: cx, startY: cy, origXPct: item.xPct, origYPct: item.yPct });
    setSelectedId(itemId);
  };

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const item = placedItems.find(i => i.id === dragState.id);
      if (!item) return;
      const pageEl = pageRefs.current[item.pageIndex];
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();
      const dx = (cx - dragState.startX) / rect.width;
      const dy = (cy - dragState.startY) / rect.height;
      setPlacedItems(prev =>
        prev.map(i =>
          i.id === dragState.id
            ? {
                ...i,
                xPct: clamp(dragState.origXPct + dx, 0, 1 - i.widthPct),
                yPct: clamp(dragState.origYPct + dy, 0, 1 - i.heightPct),
              }
            : i,
        ),
      );
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
  }, [dragState, placedItems]);

  /* ── Generate signed PDF ── */
  const handleSubmit = async () => {
    if (!pdfData) return;
    const sigs = placedItems.filter(i => i.type === 'signature');
    if (sigs.length === 0) {
      setError('Please place your signature on the document before submitting.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const pdfDoc = await PDFDocument.load(pdfData);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      for (const item of placedItems) {
        const page = pages[item.pageIndex];
        if (!page) continue;
        const { width: pw, height: ph } = page.getSize();
        const pdfX = item.xPct * pw;
        // Screen y is top-down, PDF y is bottom-up
        const itemH = item.heightPct * ph;
        const pdfY = ph - item.yPct * ph - itemH;

        if (item.type === 'signature' && item.dataUrl) {
          const sigRes = await fetch(item.dataUrl);
          const sigBytes = new Uint8Array(await sigRes.arrayBuffer());
          const sigImage = await pdfDoc.embedPng(sigBytes);
          page.drawImage(sigImage, {
            x: pdfX,
            y: pdfY,
            width: item.widthPct * pw,
            height: itemH,
          });
        } else if (item.text) {
          const fontSize = Math.max(10, Math.min(14, itemH * 0.75));
          page.drawText(item.text, {
            x: pdfX,
            y: pdfY + (itemH - fontSize) / 2,
            size: fontSize,
            font,
            color: rgb(0.12, 0.16, 0.21),
          });
        }
      }

      const signedBytes = await pdfDoc.save();
      const signedFile = new File(
        [signedBytes],
        `${templateTitle} - Signed.pdf`,
        { type: 'application/pdf' },
      );

      // Also create standalone signature file for records
      const sigDataUrl = sigs[0].dataUrl!;
      const sigBlobRes = await fetch(sigDataUrl);
      const sigBlob = await sigBlobRes.blob();
      const sigFile = new File([sigBlob], 'signature.png', { type: 'image/png' });

      await onComplete(signedFile, sigFile);
    } catch (err: any) {
      setError(err.message || 'Failed to generate signed document');
      setSubmitting(false);
    }
  };

  /* ── Render ── */

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error && !pdfData) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 max-w-sm text-center shadow-lg">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={onCancel} className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const modeLabel: Record<PlaceMode, string> = {
    view: '',
    'place-signature': 'Click on the document to place your signature',
    'place-date': 'Click on the document to place the date',
    'place-name': 'Click on the document to place your name',
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col">
      {/* ── Top toolbar ── */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 sm:px-4 sm:py-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900 truncate hidden sm:block">
            {templateTitle}
          </h2>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {/* Signature button */}
            <button
              type="button"
              onClick={handleAddSignature}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'place-signature'
                  ? 'bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              <span className="hidden sm:inline">Signature</span>
            </button>

            {/* Date button */}
            <button
              type="button"
              onClick={() => { setMode(mode === 'place-date' ? 'view' : 'place-date'); setSelectedId(null); }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'place-date'
                  ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="hidden sm:inline">Date</span>
            </button>

            {/* Name button */}
            <button
              type="button"
              onClick={() => { setMode(mode === 'place-name' ? 'view' : 'place-name'); setSelectedId(null); }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'place-name'
                  ? 'bg-purple-100 text-purple-800 ring-2 ring-purple-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="hidden sm:inline">Name</span>
            </button>

            <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block" />

            {/* Change signature */}
            {signatureDataUrl && (
              <button
                type="button"
                onClick={handleChangeSignature}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-2 rounded-lg"
              >
                Change Sig
              </button>
            )}

            {/* Delete selected */}
            {selectedId && (
              <button
                type="button"
                onClick={() => {
                  setPlacedItems(prev => prev.filter(i => i.id !== selectedId));
                  setSelectedId(null);
                }}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}

            <div className="w-px h-6 bg-gray-200 mx-1" />

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>

            {/* Cancel */}
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* ── Mode banner ── */}
      {mode !== 'view' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center flex-shrink-0">
          <p className="text-sm text-amber-800 font-medium">
            {modeLabel[mode]}
          </p>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="text-xs text-amber-600 hover:text-amber-800 underline mt-0.5"
          >
            Cancel placement
          </button>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-center flex-shrink-0">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── Scrollable PDF area ── */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="max-w-[840px] mx-auto py-4 px-4">
          {pdfData && (
            <Document
              file={{ data: pdfData }}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
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
                  {/* Page number */}
                  <div className="absolute -top-6 left-0 text-xs text-gray-400">
                    Page {i + 1} of {numPages}
                  </div>

                  {/* Rendered PDF page */}
                  <Page
                    pageNumber={i + 1}
                    width={pageWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />

                  {/* Interaction overlay */}
                  <div
                    className="absolute inset-0"
                    style={{ cursor: mode !== 'view' ? 'crosshair' : 'default' }}
                    onClick={e => handlePageClick(i, e)}
                  >
                    {placedItems
                      .filter(item => item.pageIndex === i)
                      .map(item => (
                        <div
                          key={item.id}
                          data-item
                          className={`absolute select-none ${
                            selectedId === item.id
                              ? 'ring-2 ring-emerald-500 ring-offset-1'
                              : 'hover:ring-2 hover:ring-gray-300'
                          }`}
                          style={{
                            left: `${item.xPct * 100}%`,
                            top: `${item.yPct * 100}%`,
                            width: `${item.widthPct * 100}%`,
                            height: `${item.heightPct * 100}%`,
                            cursor: dragState?.id === item.id ? 'grabbing' : 'grab',
                          }}
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedId(prev => (prev === item.id ? null : item.id));
                          }}
                          onMouseDown={e => startDrag(e, item.id)}
                          onTouchStart={e => startDrag(e, item.id)}
                        >
                          {item.type === 'signature' && item.dataUrl && (
                            <img
                              src={item.dataUrl}
                              alt="Signature"
                              className="w-full h-full object-contain pointer-events-none"
                              draggable={false}
                            />
                          )}
                          {item.type === 'date' && (
                            <span className="text-xs sm:text-sm font-medium text-ink leading-none whitespace-nowrap pointer-events-none">
                              {item.text}
                            </span>
                          )}
                          {item.type === 'name' && (
                            <span className="text-xs sm:text-sm font-medium text-ink leading-none whitespace-nowrap pointer-events-none">
                              {item.text}
                            </span>
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

      {/* ── Signature capture modal ── */}
      {showSignaturePad && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Your Signature</h3>
            <SignaturePad
              signerName={signerName}
              onSave={handleSignatureCapture}
              onCancel={() => setShowSignaturePad(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max));
}
