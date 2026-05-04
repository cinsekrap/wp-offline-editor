import { useState, useCallback } from 'react'
import type { Template, TemplateInput, TemplateUpdate, TaxonomyTerm, Post, PostInput } from '@shared/types'
import type { ToastFn } from '@renderer/lib/types'

interface UseTemplateActionsParams {
  templates: Template[]
  createTemplate: (input: TemplateInput) => Promise<Template>
  updateTemplate: (update: TemplateUpdate) => Promise<Template>
  removeTemplate: (id: string) => Promise<void>
  refreshTemplates: () => Promise<void>
  selectedSiteId: string | null
  createPost: (input?: Partial<PostInput>) => Promise<Post>
  toast: ToastFn
  onPostCreated: (postId: string) => void
}

interface UseTemplateActionsReturn {
  editingTemplate: Template | null
  setEditingTemplate: (t: Template | null) => void
  templatePickerOpen: boolean
  setTemplatePickerOpen: (open: boolean) => void
  handleNewTemplate: () => Promise<void>
  handleTemplateBack: () => Promise<void>
  handleSaveTemplate: (upd: TemplateUpdate) => Promise<void>
  handleDeleteTemplate: (id: string) => Promise<void>
  handleNewPostFromTemplate: (template: Template) => Promise<void>
  handleBlankPost: () => Promise<void>
  handleNewPost: () => Promise<void>
}

export function useTemplateActions({
  templates,
  createTemplate,
  updateTemplate,
  removeTemplate,
  refreshTemplates,
  selectedSiteId,
  createPost,
  toast,
  onPostCreated
}: UseTemplateActionsParams): UseTemplateActionsReturn {
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)

  const handleNewTemplate = useCallback(async () => {
    const t = await createTemplate({ name: 'Untitled Template' })
    setEditingTemplate(t)
  }, [createTemplate])

  const handleTemplateBack = useCallback(async () => {
    if (editingTemplate) {
      const fresh = await window.electronAPI.getTemplate(editingTemplate.id)
      if (
        fresh &&
        fresh.name === 'Untitled Template' &&
        !fresh.title_template &&
        !fresh.content &&
        !fresh.excerpt &&
        !fresh.description
      ) {
        await removeTemplate(fresh.id)
      }
    }
    setEditingTemplate(null)
    refreshTemplates()
  }, [editingTemplate, removeTemplate, refreshTemplates])

  const handleSaveTemplate = useCallback(
    async (upd: TemplateUpdate) => {
      const t = await updateTemplate(upd)
      setEditingTemplate(t)
    },
    [updateTemplate]
  )

  const handleDeleteTemplate = useCallback(
    async (id: string) => {
      await removeTemplate(id)
      if (editingTemplate?.id === id) setEditingTemplate(null)
    },
    [removeTemplate, editingTemplate]
  )

  const handleNewPostFromTemplate = useCallback(
    async (template: Template) => {
      if (!selectedSiteId) return

      // Resolve category/tag names → IDs against current site's terms
      let resolvedCategories: number[] = []
      let resolvedTags: number[] = []
      try {
        if (template.category_names.length > 0) {
          const catTerms = (await window.electronAPI.getTaxonomyTerms(
            selectedSiteId,
            'category'
          )) as TaxonomyTerm[]
          const nameMap = new Map(catTerms.map((t) => [t.name.toLowerCase(), t.id]))
          resolvedCategories = template.category_names
            .map((n) => nameMap.get(n.toLowerCase()))
            .filter((id): id is number => id !== undefined)
          const skipped = template.category_names.length - resolvedCategories.length
          if (skipped > 0) {
            toast({
              title: 'Note',
              description: `${skipped} category name(s) not found on this site — skipped.`
            })
          }
        }
        if (template.tag_names.length > 0) {
          const tagTerms = (await window.electronAPI.getTaxonomyTerms(
            selectedSiteId,
            'post_tag'
          )) as TaxonomyTerm[]
          const nameMap = new Map(tagTerms.map((t) => [t.name.toLowerCase(), t.id]))
          resolvedTags = template.tag_names
            .map((n) => nameMap.get(n.toLowerCase()))
            .filter((id): id is number => id !== undefined)
          const skipped = template.tag_names.length - resolvedTags.length
          if (skipped > 0) {
            toast({
              title: 'Note',
              description: `${skipped} tag name(s) not found on this site — skipped.`
            })
          }
        }
      } catch {
        // non-critical: proceed without resolved terms
      }

      const post = await window.electronAPI.createPost({
        site_id: selectedSiteId,
        title: template.title_template,
        content: template.content,
        status: template.status as 'draft',
        excerpt: template.excerpt
      })

      if (resolvedCategories.length > 0 || resolvedTags.length > 0) {
        await window.electronAPI.updatePost({
          id: post.id,
          categories: resolvedCategories,
          tags: resolvedTags
        })
      }

      onPostCreated(post.id)
    },
    [selectedSiteId, toast, onPostCreated]
  )

  const handleBlankPost = useCallback(async () => {
    const post = await createPost()
    onPostCreated(post.id)
  }, [createPost, onPostCreated])

  const handleNewPost = useCallback(async () => {
    if (templates.length > 0) {
      setTemplatePickerOpen(true)
      return
    }
    const post = await createPost()
    onPostCreated(post.id)
  }, [createPost, templates, onPostCreated])

  return {
    editingTemplate,
    setEditingTemplate,
    templatePickerOpen,
    setTemplatePickerOpen,
    handleNewTemplate,
    handleTemplateBack,
    handleSaveTemplate,
    handleDeleteTemplate,
    handleNewPostFromTemplate,
    handleBlankPost,
    handleNewPost
  }
}
