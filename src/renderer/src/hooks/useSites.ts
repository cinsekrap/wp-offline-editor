import { useState, useEffect, useCallback } from 'react'
import type { Site, SiteInput, SiteUpdate, WpConnectionResult } from '@shared/types'

interface UseSitesReturn {
  sites: Site[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  addSite: (input: SiteInput) => Promise<Site>
  updateSite: (update: SiteUpdate) => Promise<Site>
  deleteSite: (id: string) => Promise<void>
  testConnection: (url: string, username: string, password: string) => Promise<WpConnectionResult>
}

export function useSites(): UseSitesReturn {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await window.electronAPI.getSites()
      setSites(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sites')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addSite = useCallback(
    async (input: SiteInput): Promise<Site> => {
      const site = await window.electronAPI.addSite(input)
      await refresh()
      return site
    },
    [refresh]
  )

  const updateSite = useCallback(
    async (update: SiteUpdate): Promise<Site> => {
      const site = await window.electronAPI.updateSite(update)
      await refresh()
      return site
    },
    [refresh]
  )

  const deleteSite = useCallback(
    async (id: string): Promise<void> => {
      await window.electronAPI.deleteSite(id)
      await refresh()
    },
    [refresh]
  )

  const testConnection = useCallback(
    async (url: string, username: string, password: string): Promise<WpConnectionResult> => {
      return window.electronAPI.testConnection(url, username, password)
    },
    []
  )

  return { sites, loading, error, refresh, addSite, updateSite, deleteSite, testConnection }
}
