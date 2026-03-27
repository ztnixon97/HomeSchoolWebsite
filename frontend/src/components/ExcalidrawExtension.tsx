import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';
import '@excalidraw/excalidraw/index.css';
import { useEffect, useMemo, useRef } from 'react';

type ExcalidrawData = {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

const encodeData = (data: ExcalidrawData) => {
  const json = JSON.stringify(data);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `b64:${b64}`;
};

const decodeData = (input: string) => {
  if (!input) return '';
  if (input.startsWith('b64:')) {
    const raw = input.slice(4);
    const json = decodeURIComponent(escape(atob(raw)));
    return json;
  }
  return input;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    excalidraw: {
      insertExcalidraw: () => ReturnType;
    };
  }
}

function safeParse(data: string): ExcalidrawData {
  if (!data) return { elements: [] };
  try {
    const parsed = JSON.parse(decodeData(data)) as ExcalidrawData;
    if (!Array.isArray(parsed.elements)) return { elements: [] };
    const appState = parsed.appState && typeof parsed.appState === 'object' ? parsed.appState : undefined;
    if (appState && 'collaborators' in appState) {
      (appState as Record<string, unknown>).collaborators = new Map();
    }
    return { ...parsed, appState };
  } catch {
    return { elements: [] };
  }
}

function ExcalidrawNodeView({
  node,
  updateAttributes,
  extension,
}: {
  node: { attrs: { data: string } };
  updateAttributes: (attrs: { data: string }) => void;
  extension: { options: { readOnly: boolean } };
}) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const initialData = useMemo(() => safeParse(node.attrs.data), [node.attrs.data]);
  const lastSerialized = useRef<string>(node.attrs.data || '');
  const readOnly = extension.options.readOnly;

  useEffect(() => {
    const incoming = node.attrs.data || '';
    if (incoming && incoming !== lastSerialized.current && apiRef.current) {
      const parsed = safeParse(incoming);
      apiRef.current.updateScene({
        elements: parsed.elements as any,
        appState: parsed.appState as any,
        files: parsed.files as any,
      });
      lastSerialized.current = incoming;
    }
  }, [node.attrs.data]);

  return (
    <NodeViewWrapper className="excalidraw-node border border-gray-200 rounded bg-white">
      <div className={`h-[420px]${readOnly ? ' pointer-events-none' : ''}`}>
        <Excalidraw
          excalidrawAPI={api => {
            apiRef.current = api;
          }}
          viewModeEnabled={readOnly}
          initialData={{
            elements: initialData.elements as any,
            appState: {
              ...(initialData.appState as any),
              collaborators: new Map(),
              viewModeEnabled: readOnly,
            },
            files: initialData.files as any,
          }}
          UIOptions={readOnly ? {
            canvasActions: {
              changeViewBackgroundColor: false,
              clearCanvas: false,
              export: false,
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: false,
            },
          } : undefined}
          onChange={readOnly ? undefined : (elements, appState, files) => {
            const { collaborators, ...restAppState } = (appState || {}) as Record<string, unknown>;
            const payload: ExcalidrawData = { elements, appState: restAppState, files: files as any };
            const serialized = encodeData(payload);
            if (serialized !== lastSerialized.current) {
              lastSerialized.current = serialized;
              updateAttributes({ data: serialized });
            }
          }}
        />
      </div>
    </NodeViewWrapper>
  );
}

export const ExcalidrawExtension = Node.create({
  name: 'excalidraw',
  group: 'block',
  atom: true,
  selectable: true,

  addOptions() {
    return {
      readOnly: false,
    };
  },

  addAttributes() {
    return {
      data: {
        default: '',
        parseHTML: element => element.getAttribute('data-excalidraw') || '',
        renderHTML: attributes => ({ 'data-excalidraw': attributes.data || '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-excalidraw]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      insertExcalidraw:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { data: '' } }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExcalidrawNodeView);
  },
});
