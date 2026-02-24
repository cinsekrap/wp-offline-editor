import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent } from 'react'
import type { Editor } from '@tiptap/react'
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
  PanelLeft,
  PanelRight,
  ImageIcon,
  Upload,
  CloudUpload,
  AlertTriangle,
  WifiOff,
  Pencil,
  Trash2
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Separator } from '@renderer/components/ui/separator'
import { Badge } from '@renderer/components/ui/badge'
import { Popover, PopoverTrigger, PopoverContent } from '@renderer/components/ui/popover'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { TipTapEditor } from './TipTapEditor'
import { PostMeta } from './PostMeta'
import { AcfPanel } from './acf/AcfPanel'
import { AcfMediaProvider } from './acf/AcfMediaContext'
import { ConflictDialog } from './ConflictDialog'
import { ImageCropDialog } from './ImageCropDialog'
import { useAutoSave, type SaveStatus } from '@renderer/hooks/useAutoSave'
import { useMediaQueue } from '@renderer/hooks/useMediaQueue'
import { useToast } from '@renderer/components/ui/use-toast'
import type { Post, PostStatus, PostUpdate } from '@shared/types'

interface PostEditorProps {
  postId: string
  siteId: string
  onBack: () => void
  onPostUpdated: () => void
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
  online?: boolean
  editorFontSize?: number
}

function SaveIndicator({ status }: { status: SaveStatus }): JSX.Element | null {
  switch (status) {
    case 'saving':
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving
        </span>
      )
    case 'saved':
      return (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <CheckCircle className="h-3 w-3" />
          Saved
        </span>
      )
    case 'error':
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          Error saving
        </span>
      )
    default:
      return null
  }
}

function swapImageSrc(editor: Editor, mediaId: string, wpUrl: string): void {
  const { doc, tr } = editor.state
  doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs.mediaId === mediaId) {
      editor.view.dispatch(
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: wpUrl })
      )
    }
  })
}

export function PostEditor({
  postId,
  siteId,
  onBack,
  onPostUpdated,
  sidebarOpen,
  onToggleSidebar,
  online = true,
  editorFontSize
}: PostEditorProps): JSX.Element {
  const { toast } = useToast()
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [pushing, setPushing] = useState(false)
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const [cropTarget, setCropTarget] = useState<{ mediaId: string; src: string } | null>(null)
  const [imageMenu, setImageMenu] = useState<{
    mediaId: string
    src: string
    x: number
    y: number
  } | null>(null)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [postStatus, setPostStatus] = useState<PostStatus>('draft')
  const [acf, setAcf] = useState<Record<string, unknown>>({})
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>()

  const editorRef = useRef<Editor | null>(null)

  // Track whether we've initialized from the loaded post
  const initializedRef = useRef(false)

  const { queue, pending, refresh: refreshQueue, uploadItem, uploadAll } = useMediaQueue(siteId, postId)

  useEffect(() => {
    initializedRef.current = false
    setLoading(true)
    window.electronAPI.getPost(postId).then((p) => {
      setPost(p)
      if (p) {
        setTitle(p.title)
        setContent(p.content)
        setPostStatus(p.status)
        setAcf(p.acf ?? {})
        setScheduledDate(p.date ? new Date(p.date) : undefined)
        initializedRef.current = true
      }
      setLoading(false)
    })
  }, [postId])

  const update = useMemo<PostUpdate | null>(() => {
    if (!initializedRef.current || !post) return null
    const date = postStatus === 'future' && scheduledDate
      ? scheduledDate.toISOString()
      : post.date
    return { id: postId, title, content, status: postStatus, acf, date }
  }, [postId, title, content, postStatus, acf, scheduledDate, post])

  const { status: saveStatus, flush } = useAutoSave(update)

  // Flush on unmount or post switch
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => {
    return () => {
      flushRef.current()
    }
  }, [postId])

  // Notify parent when save completes
  useEffect(() => {
    if (saveStatus === 'saved') {
      onPostUpdated()
    }
  }, [saveStatus, onPostUpdated])

  // Refresh media queue when content changes (new images inserted)
  // and clean up orphaned media (images removed via backspace, cut, etc.)
  useEffect(() => {
    refreshQueue().then(async () => {
      // Extract media IDs still present in the editor content
      const idRegex = /data-media-id="([^"]+)"/g
      const activeIds = new Set<string>()
      let match: RegExpExecArray | null
      while ((match = idRegex.exec(content)) !== null) {
        activeIds.add(match[1])
      }

      // Delete any media in the queue that's no longer in the content
      const currentQueue = await window.electronAPI.getMediaForPost(postId)
      const orphans = currentQueue.filter((m) => !activeIds.has(m.id))
      if (orphans.length > 0) {
        await Promise.all(orphans.map((m) => window.electronAPI.deleteMedia(m.id)))
        refreshQueue()
      }
    })
  }, [content, refreshQueue, postId])

  const handleAcfChange = useCallback((name: string, value: unknown) => {
    setAcf((prev) => ({ ...prev, [name]: value }))
  }, [])

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
  }, [])

  const handleUploadItem = useCallback(
    async (mediaId: string) => {
      setUploading(mediaId)
      try {
        const updated = await uploadItem(mediaId)
        if (updated.wp_url && editorRef.current) {
          swapImageSrc(editorRef.current, mediaId, updated.wp_url)
        }
      } finally {
        setUploading(null)
      }
    },
    [uploadItem]
  )

  const handleUploadAll = useCallback(async () => {
    setUploading('all')
    try {
      const results = await uploadAll()
      for (const media of results) {
        if (media.wp_url && editorRef.current) {
          swapImageSrc(editorRef.current, media.id, media.wp_url)
        }
      }
    } finally {
      setUploading(null)
    }
  }, [uploadAll])

  const reloadPost = useCallback(async () => {
    const p = await window.electronAPI.getPost(postId)
    if (p) {
      setPost(p)
      setTitle(p.title)
      setContent(p.content)
      setPostStatus(p.status)
      setAcf(p.acf ?? {})
      setScheduledDate(p.date ? new Date(p.date) : undefined)
    }
  }, [postId])

  const handlePush = useCallback(async () => {
    if (!post || pushing) return

    // Flush pending auto-save first
    flush()
    // Give auto-save a moment to complete
    await new Promise((r) => setTimeout(r, 200))

    // Re-fetch to see if conflict flag was set
    const fresh = await window.electronAPI.getPost(postId)
    if (fresh?.conflict) {
      setPost(fresh)
      setConflictDialogOpen(true)
      return
    }

    setPushing(true)
    try {
      await window.electronAPI.pushPost(postId)
      await reloadPost()
      onPostUpdated()
      toast({ title: 'Pushed', description: 'Post pushed to WordPress.' })
    } catch (err) {
      toast({
        title: 'Push failed',
        description: err instanceof Error ? err.message : 'Could not push to WordPress.',
        variant: 'destructive'
      })
    } finally {
      setPushing(false)
    }
  }, [post, pushing, postId, flush, reloadPost, onPostUpdated, toast])

  const handleResolveConflict = useCallback(
    async (strategy: 'keep-mine' | 'keep-theirs' | 'fork') => {
      await window.electronAPI.resolveConflict(postId, strategy)
      await reloadPost()
      onPostUpdated()
      toast({ title: 'Conflict resolved', description: `Strategy: ${strategy.replace(/-/g, ' ')}` })
    },
    [postId, reloadPost, onPostUpdated, toast]
  )

  const handleImageClick = useCallback(
    (mediaId: string, src: string, position: { x: number; y: number }) => {
      setImageMenu({ mediaId, src, x: position.x, y: position.y })
    },
    []
  )

  const handleImageEdit = useCallback(() => {
    if (!imageMenu) return
    const media = queue.find((m) => m.id === imageMenu.mediaId)
    const safeSrc = media ? `media://file${encodeURI(media.local_path)}` : imageMenu.src
    setCropTarget({ mediaId: imageMenu.mediaId, src: safeSrc })
    setImageMenu(null)
  }, [imageMenu, queue])

  const handleImageDelete = useCallback(async () => {
    if (!imageMenu || !editorRef.current) return
    const { mediaId } = imageMenu
    // Remove the image node from the editor
    const editor = editorRef.current
    const { doc, tr } = editor.state
    doc.descendants((node, pos) => {
      if (node.type.name === 'image' && node.attrs.mediaId === mediaId) {
        tr.delete(pos, pos + node.nodeSize)
      }
    })
    editor.view.dispatch(tr)
    // Delete the media file
    await window.electronAPI.deleteMedia(mediaId)
    await refreshQueue()
    setImageMenu(null)
  }, [imageMenu, refreshQueue])

  const handleCropApply = useCallback(
    async (mediaId: string, buffer: ArrayBuffer) => {
      const updated = await window.electronAPI.replaceMediaFile(mediaId, buffer)
      // Update the image src in the editor with cache-busting param
      if (editorRef.current) {
        const newSrc = `media://file${encodeURI(updated.local_path)}?t=${Date.now()}`
        const { doc, tr } = editorRef.current.state
        doc.descendants((node, pos) => {
          if (node.type.name === 'image' && node.attrs.mediaId === mediaId) {
            editorRef.current!.view.dispatch(
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: newSrc })
            )
          }
        })
      }
      await refreshQueue()
      setCropTarget(null)
    },
    [refreshQueue]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Post not found
      </div>
    )
  }

  return (
    <div className="flex h-full" onClick={() => imageMenu && setImageMenu(null)}>
      {/* Image context menu */}
      {imageMenu && (
        <div
          className="fixed z-50 bg-popover border rounded-md shadow-md py-1 min-w-[120px] animate-in fade-in-0 zoom-in-95"
          style={{ left: imageMenu.x, top: imageMenu.y }}
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={handleImageEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            onClick={handleImageDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}

      {/* Main editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onToggleSidebar}
              title={sidebarOpen ? 'Hide post list' : 'Show post list'}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <SaveIndicator status={saveStatus} />

          {/* Push / Conflict button */}
          {post.conflict ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-orange-400 text-orange-600 hover:bg-orange-50"
              onClick={() => setConflictDialogOpen(true)}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              Conflict
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={pushing || !online || post.synced}
              onClick={handlePush}
            >
              {pushing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : !online ? (
                <WifiOff className="h-3.5 w-3.5 mr-1" />
              ) : (
                <CloudUpload className="h-3.5 w-3.5 mr-1" />
              )}
              Push
            </Button>
          )}

          <div className="flex-1" />

          {/* Media queue badge */}
          {queue.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 relative" title="Media queue">
                  <ImageIcon className="h-4 w-4" />
                  {pending > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-none">
                      {pending}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between p-3 border-b">
                  <span className="text-sm font-medium">Media ({queue.length})</span>
                  {pending > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleUploadAll}
                      disabled={uploading !== null}
                    >
                      {uploading === 'all' ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Upload className="h-3 w-3 mr-1" />
                      )}
                      Upload all
                    </Button>
                  )}
                </div>
                <ScrollArea className="max-h-60">
                  <div className="p-2 space-y-1">
                    {queue.map((media) => (
                      <div
                        key={media.id}
                        className="flex items-center gap-2 p-2 rounded-md text-sm hover:bg-muted/50"
                      >
                        <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate flex-1">{media.filename}</span>
                        {media.synced ? (
                          <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => handleUploadItem(media.id)}
                            disabled={uploading !== null}
                            title="Upload to WordPress"
                          >
                            {uploading === media.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Upload className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setRightPanelOpen((prev) => !prev)}
            title={rightPanelOpen ? 'Hide details panel' : 'Show details panel'}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Title */}
        <div className="px-4 py-3 shrink-0">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Post title"
            className="border-0 text-xl font-semibold h-auto py-1 px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        {/* Editor */}
        <div className="flex-1 px-4 pb-4 flex flex-col min-h-0">
          <TipTapEditor
            key={postId}
            postId={postId}
            siteId={siteId}
            content={content}
            onChange={setContent}
            onEditorReady={handleEditorReady}
            onImageClick={handleImageClick}
            fontSize={editorFontSize}
          />
        </div>
      </div>

      {/* Right panel */}
      {rightPanelOpen && (
        <div className="w-[320px] border-l flex flex-col shrink-0 overflow-hidden">
          <PostMeta
            status={postStatus}
            scheduledDate={scheduledDate}
            onStatusChange={setPostStatus}
            onDateChange={setScheduledDate}
          />
          <Separator />
          <AcfMediaProvider value={{ siteId, postId, mediaItems: queue, refreshMedia: refreshQueue }}>
            <AcfPanel siteId={siteId} acfData={acf} onChange={handleAcfChange} />
          </AcfMediaProvider>
        </div>
      )}

      <ConflictDialog
        post={post}
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
        onResolve={handleResolveConflict}
      />

      {cropTarget && (
        <ImageCropDialog
          open={true}
          src={cropTarget.src}
          mediaId={cropTarget.mediaId}
          onApply={handleCropApply}
          onClose={() => setCropTarget(null)}
        />
      )}
    </div>
  )
}
