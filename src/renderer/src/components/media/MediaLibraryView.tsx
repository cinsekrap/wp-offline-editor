import { useState, useEffect, useRef, useCallback } from 'react'
import { Images, Upload, RefreshCw, Loader2, X, WifiOff, ArrowUp, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { useToast } from '@renderer/components/ui/use-toast'
import type { MediaLibraryItem } from '@shared/types'

interface MediaLibraryViewProps {
  siteId: string
  online: boolean
}

const OFFLINE_TOOLTIP = 'Requires connection'

/** Local thumbnail served via the custom media:// protocol. */
function thumbSrc(item: MediaLibraryItem): string {
  return `media://file${encodeURI(item.thumbnail_path)}`
}

/** Detail preview: full-size remote image when online, local thumbnail otherwise. */
function DetailPreview({ item, online }: { item: MediaLibraryItem; online: boolean }): JSX.Element {
  const [error, setError] = useState(false)
  useEffect(() => setError(false), [item.id])
  const useRemote = online && !error && !!item.source_url
  return (
    <div className="w-full aspect-square rounded-md border bg-muted/40 flex items-center justify-center overflow-hidden">
      <img
        src={useRemote ? item.source_url : thumbSrc(item)}
        alt={item.alt_text || item.title}
        className="max-w-full max-h-full object-contain"
        onError={() => setError(true)}
      />
    </div>
  )
}

function formatDate(iso: string): string {
  if (!iso) return 'Unknown'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function MediaLibraryView({ siteId, online }: MediaLibraryViewProps): JSX.Element {
  const { toast } = useToast()
  const [items, setItems] = useState<MediaLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [altDraft, setAltDraft] = useState('')
  const [savingAlt, setSavingAlt] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selected = items.find((i) => i.id === selectedId) ?? null

  const load = useCallback(async () => {
    setLoading(true)
    const data = await window.electronAPI.getMediaLibrary(siteId)
    setItems(data)
    setLoading(false)
  }, [siteId])

  useEffect(() => {
    setSelectedId(null)
    load()
  }, [load])

  // Reset the alt-text draft whenever the selected item changes
  useEffect(() => {
    setAltDraft(selected?.alt_text ?? '')
  }, [selectedId, selected?.alt_text])

  const handleRefresh = useCallback(async () => {
    if (!online) return
    setRefreshing(true)
    try {
      const result = await window.electronAPI.pullMediaLibrary(siteId)
      const data = await window.electronAPI.getMediaLibrary(siteId)
      setItems(data)
      toast({
        title: 'Media library refreshed',
        description: `${result.total} items — ${result.created} new, ${result.updated} updated${
          result.removed ? `, ${result.removed} removed` : ''
        }.`
      })
    } catch (err) {
      toast({
        title: 'Refresh failed',
        description: err instanceof Error ? err.message : 'Could not reach WordPress.',
        variant: 'destructive'
      })
    } finally {
      setRefreshing(false)
    }
  }, [online, siteId, toast])

  const handleFilesChosen = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (files.length === 0) return

      setUploading(true)
      let success = 0
      let firstNewId: number | null = null
      for (const file of files) {
        try {
          const buffer = await file.arrayBuffer()
          const item = await window.electronAPI.uploadToMediaLibrary(siteId, file.name, buffer)
          setItems((prev) => [item, ...prev.filter((i) => i.id !== item.id)])
          if (firstNewId === null) firstNewId = item.id
          success++
        } catch (err) {
          toast({
            title: `Upload failed: ${file.name}`,
            description: err instanceof Error ? err.message : 'Unknown error.',
            variant: 'destructive'
          })
        }
      }
      setUploading(false)
      // Reload for consistency (an online upload may have replaced a staged
      // item with its real WP counterpart)
      const data = await window.electronAPI.getMediaLibrary(siteId)
      setItems(data)
      if (success > 0) {
        if (firstNewId !== null) setSelectedId(firstNewId)
        const anyPending = firstNewId !== null && firstNewId < 0
        toast({
          title: 'Added to library',
          description: anyPending
            ? `${success} file${success > 1 ? 's' : ''} saved locally — will upload on next sync.`
            : `${success} file${success > 1 ? 's' : ''} uploaded to WordPress.`
        })
      }
    },
    [siteId, toast]
  )

  const handleDeletePending = useCallback(async () => {
    if (!selected || selected.id >= 0) return
    await window.electronAPI.deletePendingMediaLibraryItem(siteId, selected.id)
    setSelectedId(null)
    const data = await window.electronAPI.getMediaLibrary(siteId)
    setItems(data)
    toast({ title: 'Removed', description: 'Staged file removed before upload.' })
  }, [selected, siteId, toast])

  const handleSaveAlt = useCallback(async () => {
    if (!selected) return
    const next = altDraft
    if (next === selected.alt_text) return
    setSavingAlt(true)
    try {
      // Local-first: always saves; applies to WordPress now or on next sync
      const updated = await window.electronAPI.updateMediaLibraryAlt(siteId, selected.id, next)
      setItems((prev) => prev.map((i) => (i.id === selected.id ? updated : i)))
      const queued = selected.id < 0 || updated.pending_alt_text != null
      toast({
        title: 'Alt text saved',
        description: queued ? 'Will apply to WordPress on next sync.' : undefined
      })
    } catch (err) {
      toast({
        title: 'Could not save alt text',
        description: err instanceof Error ? err.message : 'Unknown error.',
        variant: 'destructive'
      })
    } finally {
      setSavingAlt(false)
    }
  }, [selected, altDraft, siteId, toast])

  const altDirty = !!selected && altDraft !== selected.alt_text

  return (
    <div className="h-full flex">
      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b">
          <div>
            <h1 className="text-xl font-semibold">Media Library</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? 'Loading…' : `${items.length} item${items.length === 1 ? '' : 's'}`}
              {!online && (
                <span className="inline-flex items-center gap-1 ml-2 text-muted-foreground">
                  <WifiOff className="h-3.5 w-3.5" /> Offline
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={!online || refreshing || uploading}
              title={online ? 'Pull latest from WordPress' : OFFLINE_TOOLTIP}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Add files to the library — they sync to WordPress"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              Add
            </Button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFilesChosen}
        />

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Loading media…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center text-muted-foreground">
              <Images className="h-10 w-10 opacity-50" />
              <p className="text-sm">No media synced yet</p>
              <p className="text-xs">
                {online
                  ? 'Refresh to cache your WordPress library, or upload a new file.'
                  : 'Add files now — they upload next time you sync.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`relative aspect-square rounded-md overflow-hidden bg-muted border-2 transition-colors ${
                    item.id === selectedId
                      ? 'border-primary'
                      : 'border-transparent hover:border-muted-foreground/30'
                  }`}
                  title={item.title || item.filename}
                >
                  <img
                    src={thumbSrc(item)}
                    alt={item.alt_text || item.title}
                    className="w-full h-full object-cover"
                  />
                  {item.id < 0 && (
                    <span
                      title="Awaiting sync"
                      className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-blue-500 ring-2 ring-background flex items-center justify-center"
                    >
                      <ArrowUp className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-80 shrink-0 border-l flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="text-sm font-semibold">Details</h2>
            <button
              onClick={() => setSelectedId(null)}
              className="p-1 rounded hover:bg-accent transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <DetailPreview item={selected} online={online} />

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Title</p>
                <p className="break-words">{selected.title || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Filename</p>
                <p className="break-all">{selected.filename}</p>
              </div>
              <div className="flex gap-6">
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p>{selected.mime_type || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Dimensions</p>
                  <p>
                    {selected.width && selected.height
                      ? `${selected.width} × ${selected.height}`
                      : '—'}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {selected.id < 0 ? 'Added' : 'Uploaded'}
                </p>
                <p>{formatDate(selected.uploaded_at)}</p>
              </div>
              {selected.id < 0 && (
                <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                  <span className="h-3.5 w-3.5 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                    <ArrowUp className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                  </span>
                  Awaiting sync — uploads to WordPress next time you sync
                </div>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label htmlFor="alt-text" className="text-xs text-muted-foreground">
                Alt text
              </Label>
              <Input
                id="alt-text"
                value={altDraft}
                onChange={(e) => setAltDraft(e.target.value)}
                placeholder="Describe this image…"
                disabled={savingAlt}
              />
              <Button
                size="sm"
                className="w-full"
                onClick={handleSaveAlt}
                disabled={savingAlt || !altDirty}
              >
                {savingAlt ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save alt text'
                )}
              </Button>
              {selected.pending_alt_text != null && selected.id >= 0 && (
                <p className="text-xs text-muted-foreground">
                  Alt text change queued — applies on next sync.
                </p>
              )}
            </div>

            {selected.id < 0 && (
              <div className="pt-2 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={handleDeletePending}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
