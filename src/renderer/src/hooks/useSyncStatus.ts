import { useState, useEffect, useCallback } from 'react'
import type { ToastFn } from '@renderer/lib/types'

interface UseSyncStatusParams {
  selectedSiteId: string | null
  toast: ToastFn
  refreshPosts: () => Promise<void>
}

interface UseSyncStatusReturn {
  syncing: boolean
  setSyncing: (v: boolean) => void
  pendingMediaCount: number
  unsyncedPostCount: number
  handleSync: () => Promise<void>
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
  const [pendingMediaCount, setPendingMediaCount] = useState(0)
  const [unsyncedPostCount, setUnsyncedPostCount] = useState(0)
  const [massPushPaused, setMassPushPaused] = useState<{ count: number } | null>(null)

  const refreshPendingMedia = useCallback(async () => {
    if (!selectedSiteId) {
      setPendingMediaCount(0)
      return
    }
    try {
      const queue = await window.electronAPI.getMediaQueue(selectedSiteId)
      setPendingMediaCount(queue.length)
    } catch {
      setPendingMediaCount(0)
    }
  }, [selectedSiteId])

  const refreshUnsyncedCount = useCallback(async () => {
    if (!selectedSiteId) {
      setUnsyncedPostCount(0)
      return
    }
    try {
      const count = await window.electronAPI.getUnsyncedPostCount(selectedSiteId)
      setUnsyncedPostCount(count)
    } catch {
      setUnsyncedPostCount(0)
    }
  }, [selectedSiteId])

  const refreshCounts = useCallback(async () => {
    await Promise.all([refreshPendingMedia(), refreshUnsyncedCount()])
  }, [refreshPendingMedia, refreshUnsyncedCount])

  useEffect(() => {
    refreshPendingMedia()
    refreshUnsyncedCount()
    const cleanup = window.electronAPI.onCountsChanged(() => {
      refreshPendingMedia()
      refreshUnsyncedCount()
    })
    return cleanup
  }, [refreshPendingMedia, refreshUnsyncedCount])

  const doSync = useCallback(async (options?: { force?: boolean }): Promise<void> => {
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
        if (result.pull.created > 0) parts.push(`pulled ${result.pull.created} new`)
        if (result.pull.updated > 0) parts.push(`${result.pull.updated} updated`)
        if (result.schemaPull.groupsUpdated > 0)
          parts.push(`${result.schemaPull.groupsUpdated} schema updated`)

        const allErrors = [...result.pushErrors, ...result.pull.errors, ...result.schemaPull.errors]

        if (allErrors.length > 0) {
          toast({
            title: 'Sync complete with warnings',
            description: allErrors[0],
            variant: 'destructive'
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
      refreshUnsyncedCount()
      refreshPosts()
    }
  }, [selectedSiteId, toast, refreshUnsyncedCount, refreshPosts])

  const handleSync = useCallback(() => doSync(), [doSync])

  const handleForceSync = useCallback(async () => {
    setMassPushPaused(null)
    await doSync({ force: true })
  }, [doSync])

  const clearMassPushPaused = useCallback(() => setMassPushPaused(null), [])

  return {
    syncing,
    setSyncing,
    pendingMediaCount,
    unsyncedPostCount,
    handleSync,
    refreshCounts,
    massPushPaused,
    handleForceSync,
    clearMassPushPaused
  }
}
