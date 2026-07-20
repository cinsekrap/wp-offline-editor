import { useRef, useState, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link,
  ImageIcon,
  Braces,
  Undo2,
  Redo2,
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

  const items = [
    {
      icon: Bold,
      label: 'Bold',
      action: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive('bold')
    },
    {
      icon: Italic,
      label: 'Italic',
      action: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive('italic')
    },
    {
      icon: Underline,
      label: 'Underline',
      action: () => editor.chain().focus().toggleUnderline().run(),
      active: editor.isActive('underline')
    },
    { type: 'separator' as const },
    {
      icon: Heading1,
      label: 'Heading 1',
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      active: editor.isActive('heading', { level: 1 })
    },
    {
      icon: Heading2,
      label: 'Heading 2',
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      active: editor.isActive('heading', { level: 2 })
    },
    {
      icon: Heading3,
      label: 'Heading 3',
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      active: editor.isActive('heading', { level: 3 })
    },
    { type: 'separator' as const },
    {
      icon: List,
      label: 'Bullet List',
      action: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive('bulletList')
    },
    {
      icon: ListOrdered,
      label: 'Ordered List',
      action: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive('orderedList')
    },
    {
      icon: Quote,
      label: 'Blockquote',
      action: () => editor.chain().focus().toggleBlockquote().run(),
      active: editor.isActive('blockquote')
    },
    {
      icon: Code,
      label: 'Code',
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      active: editor.isActive('codeBlock')
    },
    {
      icon: Link,
      label: 'Link',
      action: () => setLinkDialogOpen(true),
      active: editor.isActive('link')
    },
    ...(siteId && onLibraryImageInsert
      ? [{ type: 'image-menu' as const }]
      : [{
          icon: ImageIcon,
          label: 'Image',
          action: handleImageClick,
          active: false
        }]),
    ...(siteId ? [{ type: 'shortcode-button' as const }] : []),
    { type: 'table-button' as const },
    { type: 'separator' as const },
    {
      icon: Undo2,
      label: 'Undo',
      action: () => editor.chain().focus().undo().run(),
      active: false
    },
    {
      icon: Redo2,
      label: 'Redo',
      action: () => editor.chain().focus().redo().run(),
      active: false
    },
  ]

  return (
    <div className="flex items-center gap-0.5 p-1 border border-b-0 rounded-t-md bg-muted/30 flex-wrap">
      {items.map((item, i) => {
        if ('type' in item && item.type === 'separator') {
          return <div key={i} className="w-px h-6 bg-border mx-1" />
        }
        if ('type' in item && item.type === 'image-menu') {
          return (
            <Popover key="image-menu" open={imageMenuOpen} onOpenChange={setImageMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Insert Image"
                >
                  <ImageIcon className="h-4 w-4" />
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
                  className="h-8 w-8"
                  title="Insert Shortcode"
                >
                  <Braces className="h-4 w-4" />
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
                  className={cn('h-8 w-8', inTable && 'bg-accent text-accent-foreground')}
                  title="Table"
                >
                  <Table2 className="h-4 w-4" />
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
            className={cn('h-8 w-8', active && 'bg-accent text-accent-foreground')}
            onClick={action}
            title={label}
          >
            <Icon className="h-4 w-4" />
          </Button>
        )
      })}
      {onExitFocusMode && (
        <>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onExitFocusMode}
            title="Exit focus mode"
          >
            <Minimize2 className="h-4 w-4" />
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
  )
}
