import { useEditor, EditorContent } from '@tiptap/react'
import { useEffect, useRef } from 'react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { marked } from 'marked'
import TurndownService from 'turndown'
import '@renderer/styles/tiptap.css'

const lowlight = createLowlight(common)

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*'
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
    editor.commands.setContent(mdToHtml(content), false)
    editor.options.onUpdate = origOnUpdate
  }, [editor, content])

  return (
    <div className="scratchpad-editor h-full overflow-y-auto">
      <EditorContent editor={editor} className="h-full" />
    </div>
  )
}
