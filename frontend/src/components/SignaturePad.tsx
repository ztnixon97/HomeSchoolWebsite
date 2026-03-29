import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';

interface Props {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  signerName?: string;
}

export default function SignaturePad({ onSave, onCancel, signerName }: Props) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState(signerName || '');
  const [isEmpty, setIsEmpty] = useState(true);

  const handleClear = () => {
    sigRef.current?.clear();
    setIsEmpty(true);
  };

  const handleSave = () => {
    if (mode === 'draw') {
      if (sigRef.current?.isEmpty()) return;
      const dataUrl = sigRef.current!.getTrimmedCanvas().toDataURL('image/png');
      onSave(dataUrl);
    } else {
      if (!typedName.trim()) return;
      // Render typed name to canvas
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 400, 100);
      ctx.fillStyle = '#1e2a35';
      ctx.font = 'italic 36px "Georgia", "Times New Roman", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(typedName.trim(), 200, 50);
      onSave(canvas.toDataURL('image/png'));
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          type="button"
          onClick={() => setMode('draw')}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            mode === 'draw' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Draw Signature
        </button>
        <button
          type="button"
          onClick={() => setMode('type')}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            mode === 'type' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Type Signature
        </button>
      </div>

      {mode === 'draw' ? (
        <div>
          <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white overflow-hidden">
            <SignatureCanvas
              ref={sigRef}
              penColor="#1e2a35"
              canvasProps={{
                className: 'w-full',
                style: { height: '160px', width: '100%' },
              }}
              onBegin={() => setIsEmpty(false)}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-400">Sign above using your mouse or finger</p>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-gray-500 hover:text-gray-700 py-1 px-2 rounded"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input
            type="text"
            value={typedName}
            onChange={e => setTypedName(e.target.value)}
            placeholder="Type your full name"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          {typedName.trim() && (
            <div className="mt-3 border border-gray-200 rounded-lg bg-white p-4 text-center">
              <p className="text-3xl italic text-ink" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                {typedName}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Date stamp */}
      <p className="text-xs text-gray-500">
        Date: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={mode === 'draw' ? isEmpty : !typedName.trim()}
          className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
        >
          Apply Signature
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
