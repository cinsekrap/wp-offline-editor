import { useEditor, EditorContent, useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { useEffect, useRef } from 'react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { marked } from 'marked'
import TurndownService from 'turndown'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  TextQuote,
  Unlink
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import '@renderer/styles/tiptap.css'

const lowlight = createLowlight(common)

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*'
})
// GFM strikethrough — TipTap renders <s>, marked parses ~~...~~ back
turndown.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (content) => `~~${content}~~`
})

function mdToHtml(md: string): string {
  if (!md) return ''
  return marked.parse(md, { async: false }) as string
}

function htmlToMd(html: string): string {
  if (!html || html === '<p></p>') return ''
  return turndown.turndown(html)
}

interface ScratchpadEditorProps {
  content: string
  onChange: (md: string) => void
  placeholder?: string
}

export function ScratchpadEditor({
  content,
  onChange,
  placeholder = 'Write notes here...'
}: ScratchpadEditorProps): JSX.Element {
  // Tracks whether the last content prop change came from our own onUpdate
  const isLocalChange = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      CodeBlockLowlight.configure({ lowlight })
    ],
    content: mdToHtml(content),
    onUpdate: ({ editor: e }) => {
      isLocalChange.current = true
      onChange(htmlToMd(e.getHTML()))
    }
  })

  // Active-state tracking for the bubble menu buttons
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            strike: e.isActive('strike'),
            code: e.isActive('code'),
            h1: e.isActive('heading', { level: 1 }),
            h2: e.isActive('heading', { level: 2 }),
            bulletList: e.isActive('bulletList'),
            orderedList: e.isActive('orderedList'),
            blockquote: e.isActive('blockquote'),
            link: e.isActive('link')
          }
        : null
  })

  // Only sync external content changes (cross-window updates) into the editor.
  // Skip when the content prop change originated from our own onUpdate.
  useEffect(() => {
    if (!editor) return

    if (isLocalChange.current) {
      isLocalChange.current = false
      return
    }

    // External change — push into editor without triggering onUpdate echo
    const currentMd = htmlToMd(editor.getHTML())
    if (currentMd === content) return

    // Temporarily detach onUpdate to avoid echo
    const origOnUpdate = editor.options.onUpdate
    editor.options.onUpdate = () => {}
    editor.commands.setContent(mdToHtml(content), { emitUpdate: false })
    editor.options.onUpdate = origOnUpdate
  }, [editor, content])

  const btn = (isActive: boolean | undefined): string =>
    cn(
      'h-7 w-7 flex items-center justify-center rounded-sm transition-colors',
      isActive
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
    )

  return (
    <div className="scratchpad-editor h-full overflow-y-auto">
      {editor && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor: e, state }) =>
            !state.selection.empty && !e.isActive('codeBlock')
          }
        >
          <div className="flex items-center gap-0.5 rounded-md border bg-popover text-popover-foreground shadow-md p-1">
            <button className={btn(active?.bold)} title="Bold (⌘B)" onClick={() => editor.chain().focus().toggleBold().run()}>
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button className={btn(active?.italic)} title="Italic (⌘I)" onClick={() => editor.chain().focus().toggleItalic().run()}>
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button className={btn(active?.strike)} title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}>
              <Strikethrough className="h-3.5 w-3.5" />
            </button>
            <button className={btn(active?.code)} title="Inline code" onClick={() => editor.chain().focus().toggleCode().run()}>
              <Code className="h-3.5 w-3.5" />
            </button>
            <div className="w-px h-4 bg-border mx-0.5" />
            <button className={btn(active?.h1)} title="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              <Heading1 className="h-3.5 w-3.5" />
            </button>
            <button className={btn(active?.h2)} title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 className="h-3.5 w-3.5" />
            </button>
            <div className="w-px h-4 bg-border mx-0.5" />
            <button className={btn(active?.bulletList)} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List className="h-3.5 w-3.5" />
            </button>
            <button className={btn(active?.orderedList)} title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered className="h-3.5 w-3.5" />
            </button>
            <button className={btn(active?.blockquote)} title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <TextQuote className="h-3.5 w-3.5" />
            </button>
            {active?.link && (
              <>
                <div className="w-px h-4 bg-border mx-0.5" />
                <button className={btn(false)} title="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}>
                  <Unlink className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} className="h-full" />
    </div>
  )
}
