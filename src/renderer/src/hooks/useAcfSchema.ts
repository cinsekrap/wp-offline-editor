import { useState, useEffect, useCallback } from 'react'
import type { AcfSchema, AcfPullResult } from '@shared/types'

interface UseAcfSchemaReturn {
  schemas: AcfSchema[]
  loading: boolean
  pulling: boolean
  error: string | null
  refresh: () => Promise<void>
  pullSchema: () => Promise<AcfPullResult>
}

export function useAcfSchema(siteId: string | null): UseAcfSchemaReturn {
  const [schemas, setSchemas] = useState<AcfSchema[]>([])
  const [loading, setLoading] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!siteId) {
      setSchemas([])
      return
    }
    try {
      setLoading(true)
      setError(null)
      const result = await window.electronAPI.getAcfSchemas(siteId)
      setSchemas(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schemas')
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const pullSchema = useCallback(async (): Promise<AcfPullResult> => {
    if (!siteId) throw new Error('No site selected')
    try {
      setPulling(true)
      setError(null)
      const result = await window.electronAPI.pullAcfSchema(siteId)
      await refresh()
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Schema pull failed'
      setError(msg)
      throw err
    } finally {
      setPulling(false)
    }
  }, [siteId, refresh])

  return { schemas, loading, pulling, error, refresh, pullSchema }
}
