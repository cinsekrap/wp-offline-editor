import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
  PanelRight,
  AlertTriangle,
  Trash2,
  Maximize2,
  Clock
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { TipTapEditor } from './TipTapEditor'
import { PostMeta } from './PostMeta'
import { AcfPanel } from './acf/AcfPanel'
import { AcfMediaProvider } from './acf/AcfMediaContext'
import { ScratchpadPanel } from './ScratchpadPanel'
import { RevisionHistory } from './RevisionHistory'
import { ConflictDialog } from './ConflictDialog'
import { DeletePostDialog } from './DeletePostDialog'
import { DuplicateToDialog } from './DuplicateToDialog'
import { ImageCropDialog } from './ImageCropDialog'
import { ImageContextMenu } from './ImageContextMenu'
import { MediaQueuePopover } from './MediaQueuePopover'
import { PostActionsMenu } from './PostActionsMenu'
import { useAutoSave, type SaveStatus } from '@renderer/hooks/useAutoSave'
import { useMediaQueue } from '@renderer/hooks/useMediaQueue'
import { useAcfSchema } from '@renderer/hooks/useAcfSchema'
import { useToast } from '@renderer/components/ui/use-toast'
import { cn } from '@renderer/lib/utils'
import type { Post, PostStatus, PostUpdate, Site } from '@shared/types'

interface PostEditorProps {
  postId: string
  siteId: string
  onBack: () => void
  onDelete: () => Promise<void>
  onPostUpdated: () => void
  editorFontSize?: number
  sites?: Site[]
  onDuplicate?: (newPostId: string, targetSiteId: string) => void
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
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: wpUrl })
    }
  })
  if (tr.docChanged) editor.view.dispatch(tr)
}

export function PostEditor({
  postId,
  siteId,
  onBack,
  onDelete,
  onPostUpdated,
  editorFontSize,
  sites = [],
  onDuplicate
}: PostEditorProps): JSX.Element {
  const { toast } = useToast()
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [duplicateToOpen, setDuplicateToOpen] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [cropTarget, setCropTarget] = useState<{ mediaId: string; src: string } | null>(null)
  const [imageMenu, setImageMenu] = useState<{
    mediaId: string
    src: string
    alt: string
    x: number
    y: number
  } | null>(null)
  const [altText, setAltText] = useState('')

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [postStatus, setPostStatus] = useState<PostStatus>('draft')
  const [acf, setAcf] = useState<Record<string, unknown>>({})
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>()
  const [featuredImage, setFeaturedImage] = useState<string | null>(null)
  const [excerpt, setExcerpt] = useState('')
  const [slug, setSlug] = useState('')
  const [categories, setCategories] = useState<number[]>([])
  const [tags, setTags] = useState<number[]>([])


  const editorRef = useRef<Editor | null>(null)

  // Track whether we've initialized from the loaded post
  const initializedRef = useRef(false)

  const { queue, pending, refresh: refreshQueue, uploadItem, uploadAll } = useMediaQueue(siteId, postId)
  const { schemas: acfSchemas } = useAcfSchema(siteId)
  const hasAcf = acfSchemas.some((s) => s.fields.length > 0)
  const [sidebarTab, setSidebarTab] = useState<'post' | 'acf' | 'scratchpad' | 'history'>('post')

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
        setFeaturedImage(p.featured_image)
        setExcerpt(p.excerpt ?? '')
        setSlug(p.slug ?? '')
        setCategories(p.categories ?? [])
        setTags(p.tags ?? [])
        initializedRef.current = true
      }
      setLoading(false)
    })
  }, [postId])

  const update = useMemo<PostUpdate | null>(() => {
    if (!initializedRef.current || !post) return null
    const date = scheduledDate ? scheduledDate.toISOString() : post.date
    return { id: postId, title, content, status: postStatus, acf, date, featured_image: featuredImage, excerpt, slug, categories, tags }
  }, [postId, title, content, postStatus, acf, scheduledDate, featuredImage, excerpt, slug, categories, tags, post])

  const { status: saveStatus, flush } = useAutoSave(update)

  // Flush on unmount or post switch, then checkpoint a revision
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => {
    const id = postId
    return () => {
      // Chain captureRevision after flush completes so the save lands first
      flushRef.current().then(() => window.electronAPI.captureRevision(id))
    }
  }, [postId])

  // Notify parent when save completes
  useEffect(() => {
    if (saveStatus === 'saved') {
      onPostUpdated()
    }
  }, [saveStatus, onPostUpdated])

  // Refresh media queue and clean up orphaned media (debounced to avoid
  // running on every keystroke — only fires 2s after content stops changing)
  useEffect(() => {
    if (!initializedRef.current) return

    const timer = setTimeout(() => {
      refreshQueue().then(async () => {
        const idRegex = /data-media-id="([^"]+)"/g
        const activeIds = new Set<string>()
        let match: RegExpExecArray | null
        while ((match = idRegex.exec(content)) !== null) {
          activeIds.add(match[1])
        }

        if (featuredImage) {
          activeIds.add(featuredImage)
        }

        const currentQueue = await window.electronAPI.getMediaForPost(postId)
        const orphans = currentQueue.filter((m) => !activeIds.has(m.id))
        if (orphans.length > 0) {
          await Promise.all(orphans.map((m) => window.electronAPI.deleteMedia(m.id)))
          refreshQueue()
        }
      })
    }, 2000)

    return () => clearTimeout(timer)
  }, [content, featuredImage, refreshQueue, postId])

  // Focus mode keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        setFocusMode((prev) => !prev)
      }
      if (e.key === 'Escape' && focusMode) {
        setFocusMode(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusMode])

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
      setFeaturedImage(p.featured_image)
      setExcerpt(p.excerpt ?? '')
      setSlug(p.slug ?? '')
      setCategories(p.categories ?? [])
      setTags(p.tags ?? [])
    }
  }, [postId])

  const handleResolveConflict = useCallback(
    async (strategy: 'keep-mine' | 'keep-theirs' | 'fork') => {
      await window.electronAPI.resolveConflict(postId, strategy)
      await reloadPost()
      onPostUpdated()
      toast({ title: 'Conflict resolved', description: `Strategy: ${strategy.replace(/-/g, ' ')}` })
    },
    [postId, reloadPost, onPostUpdated, toast]
  )

  const handleImportMarkdown = useCallback(async () => {
    const html = await window.electronAPI.importMarkdown()
    if (html && editorRef.current) {
      editorRef.current.commands.setContent(html)
      setContent(html)
      toast({ title: 'Imported', description: 'Markdown content loaded into editor.' })
    }
  }, [toast])

  const handleExportMarkdown = useCallback(async () => {
    const saved = await window.electronAPI.exportMarkdown(content, title || 'post')
    if (saved) {
      toast({ title: 'Exported', description: 'Post saved as Markdown.' })
    }
  }, [content, title, toast])

  const handleDuplicate = useCallback(async (targetSiteId?: string) => {
    if (!onDuplicate) return
    setDuplicating(true)
    try {
      flush()
      const newPost = await window.electronAPI.createPost({
        site_id: targetSiteId ?? siteId,
        title: (title || 'Untitled') + ' (copy)',
        content,
        status: 'draft',
        acf: Object.keys(acf).length > 0 ? acf : undefined,
        excerpt,
        slug
      })
      onDuplicate(newPost.id, targetSiteId ?? siteId)
      setDuplicateToOpen(false)
      toast({ title: 'Duplicated', description: `Post duplicated as "${newPost.title || 'Untitled'}"` })
    } catch {
      toast({ title: 'Duplication failed', variant: 'destructive' })
    } finally {
      setDuplicating(false)
    }
  }, [onDuplicate, siteId, title, content, acf, excerpt, slug, flush, toast])

  const handleRevisionRestore = useCallback((restored: { title: string; content: string; excerpt: string }) => {
    setTitle(restored.title)
    setContent(restored.content)
    setExcerpt(restored.excerpt)
    if (editorRef.current) {
      editorRef.current.commands.setContent(restored.content)
    }
    onPostUpdated()
    toast({ title: 'Revision restored' })
  }, [onPostUpdated, toast])

  const handleBack = useCallback(async () => {
    // Ensure pending save completes before navigating away
    await flush()
    // If the post is blank (no title, no content), delete it silently
    if (!title.trim() && !content.trim()) {
      await onDelete()
    }
    onBack()
  }, [title, content, onDelete, onBack, flush])

  const handleDelete = useCallback(async () => {
    await onDelete()
    onBack()
  }, [onDelete, onBack])

  const handleImageClick = useCallback(
    (mediaId: string, src: string, alt: string, position: { x: number; y: number }) => {
      setImageMenu({ mediaId, src, alt, x: position.x, y: position.y })
      setAltText(alt)
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
    // Collect positions first, then delete in reverse to keep offsets stable
    const editor = editorRef.current
    const { doc, tr } = editor.state
    const positions: { pos: number; size: number }[] = []
    doc.descendants((node, pos) => {
      if (node.type.name === 'image' && node.attrs.mediaId === mediaId) {
        positions.push({ pos, size: node.nodeSize })
      }
    })
    for (const { pos, size } of positions.reverse()) {
      tr.delete(pos, pos + size)
    }
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
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: newSrc })
          }
        })
        if (tr.docChanged) editorRef.current.view.dispatch(tr)
      }
      await refreshQueue()
      setCropTarget(null)
    },
    [refreshQueue]
  )

  const handleAltSave = useCallback(
    (mediaId: string, newAlt: string) => {
      if (!editorRef.current) return
      const { doc, tr } = editorRef.current.state
      doc.descendants((node, pos) => {
        if (node.type.name === 'image' && node.attrs.mediaId === mediaId) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, alt: newAlt })
        }
      })
      if (tr.docChanged) editorRef.current.view.dispatch(tr)
    },
    []
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

  if (focusMode) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex-1 flex flex-col min-h-0 px-4 pb-4">
          <div className="shrink-0 py-3">
            <div className="flex items-center gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Post title"
                className="border-0 text-xl font-semibold h-auto py-1 px-0 focus-visible:ring-0 focus-visible:ring-offset-0 flex-1"
              />
              <SaveIndicator status={saveStatus} />
            </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <TipTapEditor
              key={postId}
              postId={postId}
              siteId={siteId}
              content={content}
              onChange={setContent}
              onEditorReady={handleEditorReady}
              onImageClick={handleImageClick}
              fontSize={editorFontSize}
              focusMode
              onExitFocusMode={() => setFocusMode(false)}
            />
          </div>
        </div>

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

  return (
    <div className="flex h-full" onClick={() => imageMenu && setImageMenu(null)}>
      {imageMenu && (
        <ImageContextMenu
          x={imageMenu.x}
          y={imageMenu.y}
          mediaId={imageMenu.mediaId}
          src={imageMenu.src}
          alt={imageMenu.alt}
          altText={altText}
          onAltTextChange={setAltText}
          onAltSave={() => handleAltSave(imageMenu.mediaId, altText)}
          onEdit={handleImageEdit}
          onDelete={handleImageDelete}
          onClose={() => setImageMenu(null)}
        />
      )}

      {/* Main editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBack} title="Back to post list">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <SaveIndicator status={saveStatus} />

          {/* Conflict button */}
          {post.conflict && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-orange-400 text-orange-600 hover:bg-orange-50"
              onClick={() => setConflictDialogOpen(true)}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              Conflict
            </Button>
          )}

          <div className="flex-1" />

          <MediaQueuePopover
            queue={queue}
            pending={pending}
            uploading={uploading}
            onUploadItem={handleUploadItem}
            onUploadAll={handleUploadAll}
          />

          <PostActionsMenu
            onImportMarkdown={handleImportMarkdown}
            onExportMarkdown={handleExportMarkdown}
            onDuplicate={onDuplicate ? () => handleDuplicate() : undefined}
            onDuplicateTo={sites.length > 1 ? () => setDuplicateToOpen(true) : undefined}
            duplicating={duplicating}
            sites={sites}
          />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setFocusMode(true)}
            title="Focus mode (Cmd+Shift+F)"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', sidebarTab === 'history' && 'bg-accent')}
            onClick={() => {
              if (sidebarTab === 'history') {
                setSidebarTab('post')
              } else {
                setSidebarTab('history')
                setRightPanelOpen(true)
              }
            }}
            title="Revision history"
          >
            <Clock className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
            title="Delete post"
          >
            <Trash2 className="h-4 w-4" />
          </Button>

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
            focusMode={false}
          />
        </div>
      </div>

      {/* Right panel */}
      {rightPanelOpen && (
        <div className="w-[320px] border-l flex flex-col shrink-0 overflow-hidden">
          <div className="flex border-b shrink-0">
            <button
              className={cn(
                'flex-1 text-xs font-medium h-12 transition-colors',
                sidebarTab === 'post'
                  ? 'text-foreground border-b-2 border-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setSidebarTab('post')}
            >
              Post
            </button>
            {hasAcf && (
              <button
                className={cn(
                  'flex-1 text-xs font-medium h-12 transition-colors',
                  sidebarTab === 'acf'
                    ? 'text-foreground border-b-2 border-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setSidebarTab('acf')}
              >
                Custom Fields
              </button>
            )}
            <button
              className={cn(
                'flex-1 text-xs font-medium h-12 transition-colors',
                sidebarTab === 'scratchpad'
                  ? 'text-foreground border-b-2 border-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setSidebarTab('scratchpad')}
            >
              Scratchpad
            </button>
          </div>
          {sidebarTab === 'post' && (
            <PostMeta
              status={postStatus}
              scheduledDate={scheduledDate}
              onStatusChange={setPostStatus}
              onDateChange={setScheduledDate}
              featuredImage={featuredImage}
              onFeaturedImageChange={setFeaturedImage}
              excerpt={excerpt}
              slug={slug}
              onExcerptChange={setExcerpt}
              onSlugChange={setSlug}
              categories={categories}
              tags={tags}
              onCategoriesChange={setCategories}
              onTagsChange={setTags}
              siteId={siteId}
              postId={postId}
              mediaItems={queue}
            />
          )}
          {sidebarTab === 'acf' && (
            <AcfMediaProvider value={{ siteId, postId, mediaItems: queue, refreshMedia: refreshQueue }}>
              <AcfPanel siteId={siteId} acfData={acf} onChange={handleAcfChange} />
            </AcfMediaProvider>
          )}
          {sidebarTab === 'scratchpad' && (
            <ScratchpadPanel siteId={siteId} postId={postId} />
          )}
          {sidebarTab === 'history' && (
            <RevisionHistory postId={postId} onRestore={handleRevisionRestore} />
          )}
        </div>
      )}

      <ConflictDialog
        post={post}
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
        onResolve={handleResolveConflict}
      />

      <DeletePostDialog
        postTitle={title}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
      />

      <DuplicateToDialog
        open={duplicateToOpen}
        onOpenChange={setDuplicateToOpen}
        sites={sites}
        currentSiteId={siteId}
        onSelect={(targetSiteId) => handleDuplicate(targetSiteId)}
        duplicating={duplicating}
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
