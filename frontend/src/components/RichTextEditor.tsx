import { useEditor, EditorContent } from '@tiptap/react';
import { Mark, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { RichImage } from './RichImage';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Underline } from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { Youtube } from '@tiptap/extension-youtube';
import { ExcalidrawExtension } from './ExcalidrawExtension';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ content, onChange, placeholder }: Props) {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const lastContent = useRef<string>(content);

  const CommentMark = useMemo(
    () =>
      Mark.create({
        name: 'comment',
        addAttributes() {
          return {
            text: {
              default: '',
              parseHTML: element => element.getAttribute('data-comment') || '',
              renderHTML: attributes => ({ 'data-comment': attributes.text || '' }),
            },
          };
        },
        parseHTML() {
          return [{ tag: 'span[data-comment]' }];
        },
        renderHTML({ HTMLAttributes }) {
          return ['span', { ...HTMLAttributes, class: 'doc-comment' }, 0];
        },
      }),
    []
  );
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
        link: false,
        underline: false,
        horizontalRule: false,
      }),
      RichImage,
      Link.configure({ openOnClick: false }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      HorizontalRule,
      Youtube.configure({ width: 640, height: 360, controls: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      ExcalidrawExtension,
      Extension.create({
        name: 'linkShortcuts',
        addKeyboardShortcuts() {
          return {
            'Mod-k': () => {
              const url = window.prompt('Link URL:');
              if (url) {
                return this.editor.chain().focus().setLink({ href: url }).run();
              }
              return this.editor.chain().focus().unsetLink().run();
            },
          };
        },
      }),
      Extension.create({
        name: 'highlightShortcut',
        addKeyboardShortcuts() {
          return {
            'Mod-Shift-h': () => this.editor.chain().focus().toggleHighlight().run(),
          };
        },
      }),
      Extension.create({
        name: 'commentShortcut',
        addKeyboardShortcuts() {
          return {
            'Mod-Shift-m': () => {
              const text = window.prompt('Comment:');
              if (!text) return false;
              return this.editor.chain().focus().setMark('comment', { text }).run();
            },
          };
        },
      }),
      CommentMark,
      Placeholder.configure({ placeholder: placeholder || 'Start writing...' }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      setSavedAt(new Date());
    },
    editorProps: {
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (!file) continue;
            // Images under 2MB: use data URL (simple, works everywhere including emails)
            // Images over 2MB: upload to server to avoid bloating the document
            const MAX_DATA_URL_SIZE = 2 * 1024 * 1024;
            if (file.size <= MAX_DATA_URL_SIZE) {
              const reader = new FileReader();
              reader.onload = () => {
                const src = reader.result as string;
                view.dispatch(
                  view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src })
                  )
                );
              };
              reader.readAsDataURL(file);
            } else {
              // Large image: upload to server
              api.upload(file).then((res: any) => {
                const src = `/api/files/${res.id}/download`;
                view.dispatch(
                  view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src })
                  )
                );
              }).catch(e => console.error('Image upload failed:', e));
            }
            event.preventDefault();
            return true;
          }
        }
        return false;
      },
      handleDrop(view, event) {
        const file = event.dataTransfer?.files?.[0];
        if (!file || !file.type.startsWith('image/')) return false;
        const MAX_DATA_URL_SIZE = 2 * 1024 * 1024;
        if (file.size <= MAX_DATA_URL_SIZE) {
          const reader = new FileReader();
          reader.onload = () => {
            const src = reader.result as string;
            view.dispatch(
              view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.image.create({ src })
              )
            );
          };
          reader.readAsDataURL(file);
        } else {
          api.upload(file).then((res: any) => {
            const src = `/api/files/${res.id}/download`;
            view.dispatch(
              view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.image.create({ src })
              )
            );
          }).catch(e => console.error('Image upload failed:', e));
        }
        event.preventDefault();
        return true;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (content !== lastContent.current && content !== editor.getHTML()) {
      editor.commands.setContent(content);
      lastContent.current = content;
    }
  }, [editor, content]);

  if (!editor) return null;

  return (
    <div className="border border-gray-300 rounded overflow-hidden bg-gray-50">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white text-xs text-gray-500">
        <div>Editing</div>
        <div>{savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : 'Not saved yet'}</div>
      </div>
      <ImageInlineToolbar editor={editor} />
      <Toolbar editor={editor} />
      <div className="p-4 bg-gray-50">
        <EditorContent
          editor={editor}
          className="doc-page prose prose-sm max-w-none p-6 min-h-[300px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[300px] [&_.tiptap.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400 [&_.tiptap.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.tiptap.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none"
        />
      </div>
    </div>
  );
}

function ImageInlineToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const btn = (active: boolean) =>
    `px-2 py-1 text-xs rounded border ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'}`;

  if (!editor.isActive('image')) return null;

  return (
    <div className="flex flex-wrap gap-1 p-2 bg-white border-b border-gray-200">
      <button type="button" onClick={() => editor.chain().focus().setImageWrap('left').run()} className={btn(false)}>
        Wrap Left
      </button>
      <button type="button" onClick={() => editor.chain().focus().setImageWrap('right').run()} className={btn(false)}>
        Wrap Right
      </button>
      <button type="button" onClick={() => editor.chain().focus().setImageWrap('none').run()} className={btn(false)}>
        Wrap Off
      </button>
      <span className="w-px bg-gray-200 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().setImageDisplay('inline').run()} className={btn(false)}>
        Inline
      </button>
      <button type="button" onClick={() => editor.chain().focus().setImageDisplay('block').run()} className={btn(false)}>
        Block
      </button>
      <span className="w-px bg-gray-200 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().setImageSize('sm').run()} className={btn(false)}>
        S
      </button>
      <button type="button" onClick={() => editor.chain().focus().setImageSize('md').run()} className={btn(false)}>
        M
      </button>
      <button type="button" onClick={() => editor.chain().focus().setImageSize('lg').run()} className={btn(false)}>
        L
      </button>
      <button type="button" onClick={() => editor.chain().focus().setImageSize('full').run()} className={btn(false)}>
        Full
      </button>
    </div>
  );
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const btn = (active: boolean, title?: string) =>
    `px-2 py-1.5 text-xs rounded transition-colors ${active ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'}`;
  const sep = <span className="w-px h-5 bg-gray-200 mx-0.5 flex-shrink-0" />;

  const inTable = editor.isActive('table');

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-white">
      {/* Undo/Redo */}
      <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btn(false)} title="Undo">&#8630;</button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btn(false)} title="Redo">&#8631;</button>
      {sep}

      {/* Text style */}
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))} title="Bold"><strong>B</strong></button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))} title="Italic"><em>I</em></button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive('underline'))} title="Underline"><u>U</u></button>
      <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'))} title="Strikethrough"><s>S</s></button>
      <button type="button" onClick={() => editor.chain().focus().toggleHighlight().run()} className={btn(editor.isActive('highlight'))} title="Highlight">
        <span className="bg-yellow-200 px-0.5 rounded">H</span>
      </button>
      <input type="color" className="w-6 h-6 border border-gray-200 rounded cursor-pointer" onChange={e => editor.chain().focus().setColor(e.target.value).run()} title="Text color" />
      {sep}

      {/* Headings */}
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))} title="Heading 2">H2</button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive('heading', { level: 3 }))} title="Heading 3">H3</button>
      {sep}

      {/* Lists */}
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))} title="Bullet list">&#8226; List</button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))} title="Numbered list">1. List</button>
      <button type="button" onClick={() => editor.chain().focus().toggleTaskList().run()} className={btn(editor.isActive('taskList'))} title="Checklist">&#9745;</button>
      {sep}

      {/* Alignment */}
      <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btn(editor.isActive({ textAlign: 'left' }))} title="Align left">&#8676;</button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btn(editor.isActive({ textAlign: 'center' }))} title="Center">&#8596;</button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btn(editor.isActive({ textAlign: 'right' }))} title="Align right">&#8677;</button>
      {sep}

      {/* Block elements */}
      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive('blockquote'))} title="Quote">&#10077;</button>
      <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btn(editor.isActive('codeBlock'))} title="Code block">&lt;/&gt;</button>
      <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)} title="Divider">&#8212;</button>
      {sep}

      {/* Insert */}
      <button type="button" onClick={() => {
        const url = window.prompt('Link URL:');
        if (url) editor.chain().focus().setLink({ href: url }).run();
        else editor.chain().focus().unsetLink().run();
      }} className={btn(editor.isActive('link'))} title="Link (Ctrl+K)">&#128279;</button>
      <button type="button" onClick={() => {
        const url = window.prompt('Image URL:');
        if (url) editor.chain().focus().setImage({ src: url }).run();
      }} className={btn(false)} title="Insert image from URL">&#128247;</button>
      <button type="button" onClick={() => {
        const url = window.prompt('YouTube URL:');
        if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
      }} className={btn(false)} title="YouTube video">&#9654;</button>
      <button type="button" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className={btn(false)} title="Insert table">&#9638;</button>
      <button type="button" onClick={() => editor.chain().focus().insertExcalidraw().run()} className={btn(false)} title="Insert drawing">&#9998;</button>

      {/* Table controls — only show when cursor is inside a table */}
      {inTable && (
        <>
          {sep}
          <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} className={btn(false)} title="Add column">+Col</button>
          <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} className={btn(false)} title="Add row">+Row</button>
          <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} className={btn(false)} title="Delete column">-Col</button>
          <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} className={btn(false)} title="Delete row">-Row</button>
          <button type="button" onClick={() => editor.chain().focus().deleteTable().run()} className="px-2 py-1.5 text-xs rounded text-red-500 hover:bg-red-50" title="Delete table">&#10005; Table</button>
        </>
      )}
    </div>
  );
}
