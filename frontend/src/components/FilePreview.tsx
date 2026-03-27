interface FileRecord {
  id: number;
  filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
}

interface Props {
  file: FileRecord;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string): string {
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('word') || mime.includes('document')) return 'DOC';
  if (mime.includes('sheet') || mime.includes('excel')) return 'XLS';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'PPT';
  if (mime.includes('image')) return 'IMG';
  return 'FILE';
}

function iconColor(mime: string): string {
  if (mime.includes('pdf')) return 'bg-red-100 text-red-700';
  if (mime.includes('word') || mime.includes('document')) return 'bg-blue-100 text-blue-700';
  if (mime.includes('sheet') || mime.includes('excel')) return 'bg-green-100 text-green-700';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'bg-orange-100 text-orange-700';
  if (mime.includes('image')) return 'bg-purple-100 text-purple-700';
  return 'bg-gray-100 text-gray-700';
}

export default function FilePreview({ file }: Props) {
  const url = `/api/files/${file.id}/download`;
  const isImage = file.mime_type.startsWith('image/');
  const isPdf = file.mime_type.includes('pdf');

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={url}
          alt={file.filename}
          className="rounded border border-gray-200 w-full h-48 object-cover hover:opacity-90 transition-opacity"
        />
        <p className="text-xs text-gray-500 mt-1 truncate">{file.filename}</p>
      </a>
    );
  }

  if (isPdf) {
    return (
      <div className="border border-gray-200 rounded overflow-hidden">
        <object data={url} type="application/pdf" className="w-full h-64">
          <div className="p-4 text-center text-sm text-gray-500">
            PDF preview not supported in this browser.
          </div>
        </object>
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-600 truncate">{file.filename}</span>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 shrink-0 ml-2">
            Open PDF
          </a>
        </div>
      </div>
    );
  }

  // Generic file (Word, Excel, PowerPoint, etc.)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 border border-gray-200 rounded hover:bg-gray-50 transition-colors no-underline"
    >
      <span className={`text-xs font-bold px-2 py-1 rounded ${iconColor(file.mime_type)}`}>
        {fileIcon(file.mime_type)}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{file.filename}</p>
        <p className="text-xs text-gray-500">{formatSize(file.size_bytes)}</p>
      </div>
      <span className="text-xs text-blue-600 shrink-0">Download</span>
    </a>
  );
}

export function FilePreviewGrid({ files }: { files: FileRecord[] }) {
  if (files.length === 0) return null;

  const images = files.filter(f => f.mime_type.startsWith('image/'));
  const docs = files.filter(f => !f.mime_type.startsWith('image/'));

  return (
    <div className="space-y-4">
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {images.map(f => <FilePreview key={f.id} file={f} />)}
        </div>
      )}
      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map(f => <FilePreview key={f.id} file={f} />)}
        </div>
      )}
    </div>
  );
}
