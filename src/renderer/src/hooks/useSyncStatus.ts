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
}

export function useSyncStatus({
  selectedSiteId,
  toast,
  refreshPosts
}: UseSyncStatusParams): UseSyncStatusReturn {
  const [syncing, setSyncing] = useState(false)
  const [pendingMediaCount, setPendingMediaCount] = useState(0)
  const [unsyncedPostCount, setUnsyncedPostCount] = useState(0)

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

  const handleSync = useCallback(async (): Promise<void> => {
    if (!selectedSiteId) return
    try {
      setSyncing(true)
      const result = await window.electronAPI.syncSite(selectedSiteId)

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

  return {
    syncing,
    setSyncing,
    pendingMediaCount,
    unsyncedPostCount,
    handleSync,
    refreshCounts
  }
}
