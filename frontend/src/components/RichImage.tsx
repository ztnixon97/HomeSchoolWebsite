import { Image } from '@tiptap/extension-image';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useRef } from 'react';

const parseStyleString = (style: string): React.CSSProperties => {
  const result: Record<string, string> = {};
  style.split(';').filter(Boolean).forEach(part => {
    const [key, ...vals] = part.split(':');
    if (key && vals.length) {
      const camelKey = key.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      result[camelKey] = vals.join(':').trim();
    }
  });
  return result;
};

const floatTokens = ['img-float-left', 'img-float-right', 'img-float-none'];
const sizeTokens = ['img-size-sm', 'img-size-md', 'img-size-lg', 'img-size-full'];
const alignTokens = ['img-align-center'];
const displayTokens = ['img-inline', 'img-block'];

const updateClassList = (current: string, remove: string[], add?: string) => {
  const tokens = current.split(' ').filter(Boolean);
  const filtered = tokens.filter(t => !remove.includes(t));
  if (add) filtered.push(add);
  return Array.from(new Set(filtered)).join(' ');
};

const setStyleWidth = (style: string, widthPx: number) => {
  const parts = style.split(';').map(s => s.trim()).filter(Boolean);
  const filtered = parts.filter(p => !p.startsWith('width:') && !p.startsWith('height:'));
  filtered.push(`width: ${widthPx}px`);
  return filtered.join('; ');
};

const getWidthFromStyle = (style: string) => {
  const match = style.match(/width:\s*(\d+)px/i);
  return match ? parseInt(match[1], 10) : null;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    richImage: {
      setImageWrap: (wrap: 'none' | 'left' | 'right') => ReturnType;
      setImageSize: (size: 'sm' | 'md' | 'lg' | 'full') => ReturnType;
      setImageCenter: (enabled: boolean) => ReturnType;
      setImageDisplay: (display: 'inline' | 'block') => ReturnType;
    };
  }
}

function RichImageNodeView({
  node,
  updateAttributes,
  extension,
}: {
  node: { attrs: { src: string; alt?: string; title?: string; class?: string; style?: string } };
  updateAttributes: (attrs: { class?: string; style?: string }) => void;
  extension: { options: { readOnly: boolean } };
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const startResize = (e: React.MouseEvent, mode: 'br' | 'tr' | 'bl' | 'tl') => {
    if (extension.options.readOnly) return;
    e.preventDefault();
    const img = imgRef.current;
    if (!img) return;
    startX.current = e.clientX;
    startWidth.current = img.getBoundingClientRect().width;
    const startHeight = img.getBoundingClientRect().height;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX.current;
      const invert = mode === 'tr' || mode === 'tl';
      const next = Math.max(120, Math.round(startWidth.current + delta * (invert ? -1 : 1)));
      const currentStyle = node.attrs.style || '';
      updateAttributes({ style: setStyleWidth(currentStyle, next) });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <NodeViewWrapper className="image-node">
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || undefined}
        title={node.attrs.title || undefined}
        className={node.attrs.class || undefined}
        style={node.attrs.style ? parseStyleString(node.attrs.style) : undefined}
        draggable
      />
      {!extension.options.readOnly && (
        <>
          <span className="image-resize-handle image-resize-br" onMouseDown={e => startResize(e, 'br')} />
          <span className="image-resize-handle image-resize-tr" onMouseDown={e => startResize(e, 'tr')} />
          <span className="image-resize-handle image-resize-bl" onMouseDown={e => startResize(e, 'bl')} />
          <span className="image-resize-handle image-resize-tl" onMouseDown={e => startResize(e, 'tl')} />
        </>
      )}
    </NodeViewWrapper>
  );
}

export const RichImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: '',
        parseHTML: element => element.getAttribute('class') || '',
        renderHTML: attributes => ({ class: attributes.class || '' }),
      },
      style: {
        default: '',
        parseHTML: element => element.getAttribute('style') || '',
        renderHTML: attributes => ({ style: attributes.style || '' }),
      },
    };
  },
  addOptions() {
    return {
      ...this.parent?.(),
      allowBase64: true,
      readOnly: false,
    };
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setImageWrap:
        wrap =>
        ({ editor }) => {
          const current = editor.getAttributes('image').class || '';
          const next = updateClassList(
            current,
            floatTokens,
            wrap === 'left' ? 'img-float-left' : wrap === 'right' ? 'img-float-right' : 'img-float-none'
          );
          return editor.chain().focus().updateAttributes('image', { class: next }).run();
        },
      setImageSize:
        size =>
        ({ editor }) => {
          const current = editor.getAttributes('image').class || '';
          const next = updateClassList(
            current,
            sizeTokens,
            size === 'sm'
              ? 'img-size-sm'
              : size === 'md'
                ? 'img-size-md'
                : size === 'lg'
                  ? 'img-size-lg'
                  : 'img-size-full'
          );
          return editor.chain().focus().updateAttributes('image', { class: next }).run();
        },
      setImageCenter:
        enabled =>
        ({ editor }) => {
          const current = editor.getAttributes('image').class || '';
          const next = updateClassList(current, alignTokens, enabled ? 'img-align-center' : undefined);
          return editor.chain().focus().updateAttributes('image', { class: next }).run();
        },
      setImageDisplay:
        display =>
        ({ editor }) => {
          const current = editor.getAttributes('image').class || '';
          const next = updateClassList(
            current,
            displayTokens,
            display === 'inline' ? 'img-inline' : 'img-block'
          );
          return editor.chain().focus().updateAttributes('image', { class: next }).run();
        },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(RichImageNodeView);
  },
  draggable: true,
});
