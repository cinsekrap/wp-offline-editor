import { useRef, useState, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link,
  ImageIcon,
  Braces,
  ChevronDown,
  Library,
  Upload,
  Table2,
  Minimize2
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import { LinkDialog } from './LinkDialog'

interface EditorToolbarProps {
  editor: Editor | null
  siteId?: string
  onImageInsert?: (file: File) => void
  onLibraryImageInsert?: () => void
  onExitFocusMode?: () => void
}

export function EditorToolbar({ editor, siteId, onImageInsert, onLibraryImageInsert, onExitFocusMode }: EditorToolbarProps): JSX.Element | null {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [shortcodes, setShortcodes] = useState<string[]>([])
  const [shortcodesOpen, setShortcodesOpen] = useState(false)
  const [shortcodesLoaded, setShortcodesLoaded] = useState(false)
  const [imageMenuOpen, setImageMenuOpen] = useState(false)
  const [tableMenuOpen, setTableMenuOpen] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [blockMenuOpen, setBlockMenuOpen] = useState(false)

  useEffect(() => {
    if (!shortcodesOpen || !siteId || shortcodesLoaded) return
    window.electronAPI.getShortcodes(siteId).then((tags) => {
      setShortcodes(tags)
      setShortcodesLoaded(true)
    }).catch(() => {
      setShortcodesLoaded(true)
    })
  }, [shortcodesOpen, siteId, shortcodesLoaded])

  if (!editor) return null

  function handleImageClick(): void {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (file && onImageInsert) {
      onImageInsert(file)
    }
    // Reset so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Block style: one menu instead of six buttons
  const BLOCK_STYLES = [
    { label: 'Paragraph', active: editor.isActive('paragraph'), run: () => editor.chain().focus().setParagraph().run() },
    { label: 'Heading 1', active: editor.isActive('heading', { level: 1 }), run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), cls: 'text-lg font-bold' },
    { label: 'Heading 2', active: editor.isActive('heading', { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), cls: 'text-base font-semibold' },
    { label: 'Heading 3', active: editor.isActive('heading', { level: 3 }), run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), cls: 'font-semibold' },
    { label: 'Quote', active: editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run(), cls: 'italic' },
    { label: 'Code block', active: editor.isActive('codeBlock'), run: () => editor.chain().focus().toggleCodeBlock().run(), cls: 'font-mono text-xs' }
  ]
  // Quote wraps paragraphs, so prefer it over "Paragraph" when both match
  const currentStyle =
    BLOCK_STYLES.slice(1).find((b) => b.active)?.label ?? 'Paragraph'

  const items = [
    { type: 'block-menu' as const },
    { type: 'separator' as const },
    {
      icon: Bold,
      label: 'Bold (⌘B)',
      action: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive('bold')
    },
    {
      icon: Italic,
      label: 'Italic (⌘I)',
      action: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive('italic')
    },
    {
      icon: Link,
      label: 'Link',
      action: () => setLinkDialogOpen(true),
      active: editor.isActive('link')
    },
    { type: 'separator' as const },
    {
      icon: List,
      label: 'Bullet list',
      action: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive('bulletList')
    },
    {
      icon: ListOrdered,
      label: 'Numbered list',
      action: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive('orderedList')
    },
    { type: 'separator' as const },
    ...(siteId && onLibraryImageInsert
      ? [{ type: 'image-menu' as const }]
      : [{
          icon: ImageIcon,
          label: 'Image',
          action: handleImageClick,
          active: false
        }]),
    { type: 'table-button' as const },
    ...(siteId ? [{ type: 'shortcode-button' as const }] : [])
  ]

  return (
    <div className="flex justify-center px-4 pt-3 pb-1 shrink-0 bg-background">
    <div className="flex items-center gap-0.5 rounded-xl border bg-background p-1 shadow-[0_6px_18px_-12px_hsl(var(--foreground)/0.35)] flex-wrap">
      {items.map((item, i) => {
        if ('type' in item && item.type === 'separator') {
          return <div key={i} className="w-px h-4 bg-border mx-1" />
        }
        if ('type' in item && item.type === 'block-menu') {
          return (
            <Popover key="block-menu" open={blockMenuOpen} onOpenChange={setBlockMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground/80 hover:bg-accent hover:text-foreground"
                  title="Text style"
                >
                  {currentStyle}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="start">
                {BLOCK_STYLES.map((b) => (
                  <button
                    key={b.label}
                    className={cn(
                      'flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-accent',
                      b.label === currentStyle && 'bg-accent',
                      b.cls
                    )}
                    onClick={() => {
                      b.run()
                      setBlockMenuOpen(false)
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )
        }
        if ('type' in item && item.type === 'image-menu') {
          return (
            <Popover key="image-menu" open={imageMenuOpen} onOpenChange={setImageMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Insert image"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="start">
                <button
                  className="flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setImageMenuOpen(false)
                    handleImageClick()
                  }}
                >
                  <Upload className="h-3.5 w-3.5" />
                  From Disk
                </button>
                <button
                  className="flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setImageMenuOpen(false)
                    onLibraryImageInsert?.()
                  }}
                >
                  <Library className="h-3.5 w-3.5" />
                  From Library
                </button>
              </PopoverContent>
            </Popover>
          )
        }
        if ('type' in item && item.type === 'shortcode-button') {
          return (
            <Popover key="shortcodes" open={shortcodesOpen} onOpenChange={setShortcodesOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Insert shortcode"
                >
                  <Braces className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                {!shortcodesLoaded ? (
                  <p className="text-sm text-muted-foreground px-2 py-1">Loading...</p>
                ) : shortcodes.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-2 py-1">No shortcodes found</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto flex flex-col">
                    {shortcodes.map((tag) => (
                      <button
                        key={tag}
                        className="text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground font-mono"
                        onClick={() => {
                          editor?.chain().focus().insertContent(`[${tag}]`).run()
                          setShortcodesOpen(false)
                        }}
                      >
                        [{tag}]
                      </button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )
        }
        if ('type' in item && item.type === 'table-button') {
          const inTable = editor.isActive('table')
          return (
            <Popover key="table-menu" open={tableMenuOpen} onOpenChange={setTableMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-7 w-7', inTable && 'bg-accent text-accent-foreground')}
                  title="Table"
                >
                  <Table2 className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1" align="start">
                {!inTable ? (
                  <button
                    className="flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                      setTableMenuOpen(false)
                    }}
                  >
                    Insert 3×3 table
                  </button>
                ) : (
                  <>
                    <button className="flex items-center w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground" onClick={() => { editor.chain().focus().addRowAfter().run(); setTableMenuOpen(false) }}>Add row below</button>
                    <button className="flex items-center w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground" onClick={() => { editor.chain().focus().addColumnAfter().run(); setTableMenuOpen(false) }}>Add column right</button>
                    <button className="flex items-center w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground" onClick={() => { editor.chain().focus().deleteRow().run(); setTableMenuOpen(false) }}>Delete row</button>
                    <button className="flex items-center w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground" onClick={() => { editor.chain().focus().deleteColumn().run(); setTableMenuOpen(false) }}>Delete column</button>
                    <div className="h-px bg-border my-1" />
                    <button className="flex items-center w-full text-left text-sm px-2 py-1.5 rounded text-destructive hover:bg-destructive/10" onClick={() => { editor.chain().focus().deleteTable().run(); setTableMenuOpen(false) }}>Delete table</button>
                  </>
                )}
              </PopoverContent>
            </Popover>
          )
        }
        const { icon: Icon, label, action, active } = item as {
          icon: typeof Bold
          label: string
          action: () => void
          active: boolean
        }
        return (
          <Button
            key={label}
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7', active && 'bg-accent text-accent-foreground')}
            onClick={action}
            title={label}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        )
      })}
      {onExitFocusMode && (
        <>
          <div className="w-px h-4 bg-border mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onExitFocusMode}
            title="Exit focus mode"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <LinkDialog editor={editor} open={linkDialogOpen} onOpenChange={setLinkDialogOpen} />
    </div>
    </div>
  )
}
