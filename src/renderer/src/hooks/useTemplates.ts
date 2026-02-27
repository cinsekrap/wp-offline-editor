import { useState, useEffect, useCallback } from 'react'
import type { Template, TemplateInput, TemplateUpdate } from '@shared/types'

interface UseTemplatesResult {
  templates: Template[]
  loading: boolean
  refresh: () => Promise<void>
  create: (input: TemplateInput) => Promise<Template>
  update: (update: TemplateUpdate) => Promise<Template>
  remove: (id: string) => Promise<void>
}

export function useTemplates(): UseTemplatesResult {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const list = await window.electronAPI.getTemplates()
      setTemplates(list)
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = useCallback(async (input: TemplateInput) => {
    const t = await window.electronAPI.createTemplate(input)
    await refresh()
    return t
  }, [refresh])

  const update = useCallback(async (upd: TemplateUpdate) => {
    const t = await window.electronAPI.updateTemplate(upd)
    await refresh()
    return t
  }, [refresh])

  const remove = useCallback(async (id: string) => {
    await window.electronAPI.deleteTemplate(id)
    await refresh()
  }, [refresh])

  return { templates, loading, refresh, create, update, remove }
}
