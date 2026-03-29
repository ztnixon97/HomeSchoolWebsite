import { useRef, useState, useEffect } from 'react';

interface Props {
  onSign: (signatureDataUrl: string) => void;
  onCancel: () => void;
}

export default function SignaturePad({ onSign, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Signature line
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, rect.height - 30);
    ctx.lineTo(rect.width - 20, rect.height - 30);
    ctx.stroke();

    // "Sign here" label
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px sans-serif';
    ctx.fillText('Sign above this line', 20, rect.height - 12);

    // Drawing style
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    setDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => setDrawing(false);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, rect.height - 30);
    ctx.lineTo(rect.width - 20, rect.height - 30);
    ctx.stroke();
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px sans-serif';
    ctx.fillText('Sign above this line', 20, rect.height - 12);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    setHasDrawn(false);
  };

  const submit = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    onSign(canvas.toDataURL('image/png'));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Sign Document</h3>
      <p className="text-sm text-gray-500">Draw your signature below using your mouse or finger.</p>

      <canvas
        ref={canvasRef}
        className="w-full h-40 border border-gray-200 rounded-lg cursor-crosshair touch-none"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />

      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={!hasDrawn}
          className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
        >
          Submit Signature
        </button>
        <button onClick={clear} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          Clear
        </button>
        <button onClick={onCancel} className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  );
}
