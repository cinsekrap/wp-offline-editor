import { useEditor, EditorContent, useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { Link as LinkIcon, Unlink } from 'lucide-react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { useState, useEffect, type CSSProperties, type ReactNode } from 'react'
import { MediaImage } from '@renderer/extensions/MediaImage'
import { useWordCount } from '@renderer/hooks/useWordCount'
import { useToast } from '@renderer/components/ui/use-toast'
import { cn } from '@renderer/lib/utils'
import { EditorToolbar } from './EditorToolbar'
import { LinkDialog } from './LinkDialog'
import { MediaLibraryPicker } from './acf/MediaLibraryPicker'
import '@renderer/styles/tiptap.css'

interface TipTapEditorProps {
  content: string
  postId: string
  siteId: string
  onChange: (html: string) => void
  onEditorReady?: (editor: Editor) => void
  onImageClick?: (mediaId: string, src: string, alt: string, position: { x: number; y: number }) => void
  fontSize?: number
  focusMode?: boolean
  onExitFocusMode?: () => void
  /** Rendered at the top of the page, inside the scrolling column (the post title). */
  header?: ReactNode
}

function toMediaUrl(localPath: string): string {
  return `media://file${encodeURI(localPath)}`
}

async function insertImageFile(
  editor: Editor | null,
  file: File,
  siteId: string,
  postId: string
): Promise<void> {
  if (!editor || !file.type.startsWith('image/')) return

  const arrayBuffer = await file.arrayBuffer()
  const media = await window.electronAPI.saveMediaLocal(siteId, postId, file.name, arrayBuffer)

  const src = media.wp_url || toMediaUrl(media.local_path)
  editor
    .chain()
    .focus()
    .setImage({ src, mediaId: media.id } as { src: string })
    .run()
}

export function TipTapEditor({
  content,
  postId,
  siteId,
  onChange,
  onEditorReady,
  onImageClick,
  fontSize,
  focusMode,
  onExitFocusMode,
  header
}: TipTapEditorProps): JSX.Element {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ codeBlock: false }),
        Underline,
        Link.configure({ openOnClick: false }),
        Placeholder.configure({ placeholder: 'Start writing...' }),
        MediaImage.configure({ onImageClick }),
        Table.configure({ resizable: false }),
        TableRow,
        TableCell,
        TableHeader,
        CodeBlockLowlight.configure({ lowlight: createLowlight(common) })
      ],
      content,
      onUpdate: ({ editor: e }) => {
        onChange(e.getHTML())
      },
      editorProps: {
        handlePaste: (_view, event) => {
          const files = event.clipboardData?.files
          if (!files || files.length === 0) return false

          const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
          if (imageFiles.length === 0) return false

          for (const file of imageFiles) {
            insertImageFile(editor, file, siteId, postId)
          }
          return true
        },
        handleDrop: (_view, event) => {
          const files = event.dataTransfer?.files
          if (!files || files.length === 0) return false

          const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
          if (imageFiles.length === 0) return false

          event.preventDefault()
          for (const file of imageFiles) {
            insertImageFile(editor, file, siteId, postId)
          }
          return true
        }
      }
    },
    [postId]
  )

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor)
    }
  }, [editor, onEditorReady])

  const { words, readingTime } = useWordCount(editor)
  const { toast } = useToast()
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)

  const linkActive = useEditorState({
    editor,
    selector: ({ editor: e }) => e?.isActive('link') ?? false
  })
  const marks = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      h2: e?.isActive('heading', { level: 2 }) ?? false,
      quote: e?.isActive('blockquote') ?? false
    })
  })

  const handleImageInsert = async (file: File): Promise<void> => {
    await insertImageFile(editor, file, siteId, postId)
  }

  const handleLibrarySelect = async (ids: number[]): Promise<void> => {
    if (!editor || ids.length === 0) return
    // Adopt each library item into this post's media table so push correctly
    // resolves the media:// URL to the WP source_url.
    const failures: string[] = []
    for (const wpId of ids) {
      try {
        const media = await window.electronAPI.saveMediaFromLibrary(siteId, postId, wpId)
        const src = `media://file${encodeURI(media.local_path)}`
        editor.chain().focus().setImage({ src, mediaId: media.id } as { src: string }).run()
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err))
      }
    }
    // A console warning was the only trace of this, so picking images and
    // getting none of them back looked like the editor ignoring the choice.
    // Reported once rather than per image: a failure here is usually the same
    // cause for every one of them.
    if (failures.length > 0) {
      toast({
        variant: 'destructive',
        title:
          failures.length === ids.length
            ? 'Could not insert those images'
            : `Could not insert ${failures.length} of ${ids.length} images`,
        description: failures[0]
      })
    }
  }

  const style = fontSize ? ({ '--editor-font-size': `${fontSize}px` } as CSSProperties) : undefined

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <EditorToolbar
        editor={editor}
        siteId={siteId}
        onImageInsert={handleImageInsert}
        onLibraryImageInsert={() => setLibraryPickerOpen(true)}
        onExitFocusMode={focusMode ? onExitFocusMode : undefined}
      />
      <MediaLibraryPicker
        open={libraryPickerOpen}
        onOpenChange={setLibraryPickerOpen}
        siteId={siteId}
        onSelect={handleLibrarySelect}
      />
      <div className="flex-1 overflow-y-auto bg-background" style={style}>
        {header && <div className="max-w-[38em] mx-auto px-6 pt-10 pb-4 text-[length:var(--editor-font-size,18px)]">{header}</div>}
        {editor && (
          <BubbleMenu
            editor={editor}
            shouldShow={({ editor: e, state }) =>
              !state.selection.empty && !e.isActive('codeBlock') && !e.isActive('image')
            }
          >
            <div className="flex items-center gap-0.5 rounded-lg border bg-popover text-popover-foreground shadow-lg p-1">
              {(
                [
                  { key: 'bold', label: 'B', title: 'Bold (⌘B)', cls: 'font-bold', run: () => editor.chain().focus().toggleBold().run() },
                  { key: 'italic', label: 'I', title: 'Italic (⌘I)', cls: 'italic font-editor', run: () => editor.chain().focus().toggleItalic().run() },
                  { key: 'h2', label: 'H2', title: 'Heading', cls: 'font-semibold', run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
                  { key: 'quote', label: '“', title: 'Quote', cls: 'font-editor text-base leading-none', run: () => editor.chain().focus().toggleBlockquote().run() }
                ] as const
              ).map((b) => (
                <button
                  key={b.key}
                  title={b.title}
                  onClick={b.run}
                  className={cn(
                    'h-7 min-w-7 px-1.5 rounded-sm text-xs transition-colors',
                    b.cls,
                    marks?.[b.key]
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                  )}
                >
                  {b.label}
                </button>
              ))}
              <div className="w-px h-4 bg-border mx-0.5" />
              <button
                className={cn(
                  'h-7 flex items-center gap-1.5 px-2 rounded-sm text-xs transition-colors',
                  linkActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                )}
                title={linkActive ? 'Edit link' : 'Insert link'}
                onClick={() => setLinkDialogOpen(true)}
              >
                <LinkIcon className="h-3.5 w-3.5" />
                {linkActive ? 'Edit link' : 'Link'}
              </button>
              {linkActive && (
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-sm text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground transition-colors"
                  title="Remove link"
                  onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
                >
                  <Unlink className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </BubbleMenu>
        )}
        <EditorContent editor={editor} className="h-full" />
      </div>
      <div className="flex items-center gap-4 h-8 shrink-0 px-4 border-t text-[11px] text-muted-foreground tabular-nums">
        <span>{words.toLocaleString()} words</span>
        <span>{readingTime}</span>
      </div>
      <LinkDialog editor={editor} open={linkDialogOpen} onOpenChange={setLinkDialogOpen} />
    </div>
  )
}
