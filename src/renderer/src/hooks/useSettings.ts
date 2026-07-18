import { useState, useEffect, useCallback } from 'react'
import type { AppSettings } from '@shared/types'

const defaultSettings: AppSettings = {
  theme: 'system',
  editorFontSize: 16,
  forceOffline: false,
  autoSyncInterval: 5,
  writingChartMode: 'daily',
  autoDownloadUpdates: false
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      setSettings(s)
      setLoading(false)
    })
  }, [])

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const updated = await window.electronAPI.updateSettings(patch)
    setSettings(updated)
    return updated
  }, [])

  return { settings, loading, updateSettings }
}
