import { useState, useEffect, useCallback } from 'react'
import type { PendingChanges } from '@shared/types'
import type { ToastFn } from '@renderer/lib/types'

interface UseSyncStatusParams {
  selectedSiteId: string | null
  toast: ToastFn
  refreshPosts: () => Promise<void>
}

const NO_PENDING_CHANGES: PendingChanges = { posts: 0, scratchpads: 0, media: 0, total: 0 }

interface UseSyncStatusReturn {
  syncing: boolean
  setSyncing: (v: boolean) => void
  pendingChanges: PendingChanges
  handleSync: () => Promise<void>
  handleAutoSync: () => Promise<void>
  refreshCounts: () => Promise<void>
  massPushPaused: { count: number } | null
  handleForceSync: () => Promise<void>
  clearMassPushPaused: () => void
}

export function useSyncStatus({
  selectedSiteId,
  toast,
  refreshPosts
}: UseSyncStatusParams): UseSyncStatusReturn {
  const [syncing, setSyncing] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<PendingChanges>(NO_PENDING_CHANGES)
  const [massPushPaused, setMassPushPaused] = useState<{ count: number } | null>(null)

  const refreshCounts = useCallback(async () => {
    if (!selectedSiteId) {
      setPendingChanges(NO_PENDING_CHANGES)
      return
    }
    try {
      const changes = await window.electronAPI.getPendingChanges(selectedSiteId)
      setPendingChanges(changes)
    } catch {
      setPendingChanges(NO_PENDING_CHANGES)
    }
  }, [selectedSiteId])

  useEffect(() => {
    refreshCounts()
    const cleanup = window.electronAPI.onCountsChanged(() => {
      refreshCounts()
    })
    return cleanup
  }, [refreshCounts])

  const doSync = useCallback(async (options?: { force?: boolean; manual?: boolean }): Promise<void> => {
    if (!selectedSiteId) return
    try {
      setSyncing(true)
      const result = await window.electronAPI.syncSite(selectedSiteId, options)

      if (result.massPushPaused) {
        setMassPushPaused(result.massPushPaused)
        toast({
          title: 'Sync paused',
          description: `${result.massPushPaused.count} posts have unsynced changes. Review before pushing.`,
          variant: 'warning'
        })
      } else {
        const parts: string[] = []
        if (result.pushed > 0) parts.push(`pushed ${result.pushed}`)
        if (result.recreated > 0)
          parts.push(`recreated ${result.recreated} deleted on WordPress`)
        if (result.deleted > 0) parts.push(`deleted ${result.deleted} from WordPress`)
        if (result.pull.created > 0) parts.push(`pulled ${result.pull.created} new`)
        if (result.pull.updated > 0) parts.push(`${result.pull.updated} updated`)
        if (result.pull.removed > 0)
          parts.push(`${result.pull.removed} removed (deleted on WordPress)`)
        if (result.schemaPull.groupsUpdated > 0)
          parts.push(`${result.schemaPull.groupsUpdated} schema updated`)

        const allErrors = [...result.pushErrors, ...result.pull.errors, ...result.schemaPull.errors]

        if (allErrors.length > 0) {
          toast({
            title: 'Sync complete with warnings',
            description: allErrors[0],
            variant: 'destructive'
          })
        } else if (result.conflicts > 0) {
          // Conflicted posts/scratchpads are never auto-pushed — without this the
          // sync would claim "Everything up to date" while the badge still counts them
          toast({
            title: 'Sync complete — conflicts need review',
            description: `${result.conflicts} item${result.conflicts > 1 ? 's' : ''} changed both here and on WordPress. Open ${result.conflicts > 1 ? 'them' : 'it'} to choose which version to keep.`,
            variant: 'warning'
          })
        } else {
          toast({
            title: 'Sync complete',
            description: parts.length > 0 ? parts.join(', ') : 'Everything up to date'
          })
        }
      }

      if (result.pluginVersionWarning) {
        toast({
          title: 'Plugin update available',
          description: result.pluginVersionWarning,
          variant: 'warning'
        })
      }
    } catch {
      toast({
        title: 'Sync failed',
        description: 'Could not sync with WordPress.',
        variant: 'destructive'
      })
    } finally {
      setSyncing(false)
      refreshCounts()
      refreshPosts()
    }
  }, [selectedSiteId, toast, refreshCounts, refreshPosts])

  // User-initiated syncs bypass the background update-check throttle;
  // the interval-driven auto-sync does not.
  const handleSync = useCallback(() => doSync({ manual: true }), [doSync])

  const handleAutoSync = useCallback(() => doSync(), [doSync])

  const handleForceSync = useCallback(async () => {
    setMassPushPaused(null)
    await doSync({ force: true, manual: true })
  }, [doSync])

  const clearMassPushPaused = useCallback(() => setMassPushPaused(null), [])

  return {
    syncing,
    setSyncing,
    pendingChanges,
    handleSync,
    handleAutoSync,
    refreshCounts,
    massPushPaused,
    handleForceSync,
    clearMassPushPaused
  }
}
