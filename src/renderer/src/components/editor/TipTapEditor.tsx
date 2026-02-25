import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useState, useEffect, type CSSProperties } from 'react'
import { MediaImage } from '@renderer/extensions/MediaImage'
import { EditorToolbar } from './EditorToolbar'
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
    .setImage({ src, mediaId: media.id } as Record<string, unknown>)
    .run()
}

export function TipTapEditor({
  content,
  postId,
  siteId,
  onChange,
  onEditorReady,
  onImageClick,
  fontSize
}: TipTapEditorProps): JSX.Element {
  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Underline,
        Link.configure({ openOnClick: false }),
        Placeholder.configure({ placeholder: 'Start writing...' }),
        MediaImage.configure({ onImageClick })
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

  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)

  const handleImageInsert = async (file: File): Promise<void> => {
    await insertImageFile(editor, file, siteId, postId)
  }

  const handleLibrarySelect = (ids: number[]): void => {
    if (!editor || ids.length === 0) return
    // Look up the library item to get its thumbnail path for the src
    window.electronAPI.getMediaLibrary(siteId).then((items) => {
      for (const wpId of ids) {
        const item = items.find((i) => i.id === wpId)
        if (item) {
          const src = `media://file${encodeURI(item.thumbnail_path)}`
          editor.chain().focus().setImage({ src } as Record<string, unknown>).run()
        }
      }
    })
  }

  const style = fontSize ? ({ '--editor-font-size': `${fontSize}px` } as CSSProperties) : undefined

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <EditorToolbar
        editor={editor}
        siteId={siteId}
        onImageInsert={handleImageInsert}
        onLibraryImageInsert={() => setLibraryPickerOpen(true)}
      />
      <MediaLibraryPicker
        open={libraryPickerOpen}
        onOpenChange={setLibraryPickerOpen}
        siteId={siteId}
        onSelect={handleLibrarySelect}
      />
      <div className="flex-1 overflow-y-auto border rounded-b-md" style={style}>
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  )
}
