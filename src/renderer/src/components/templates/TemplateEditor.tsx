import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { TipTapEditor } from '@renderer/components/editor/TipTapEditor'
import { useToast } from '@renderer/components/ui/use-toast'
import type { Template, TemplateUpdate } from '@shared/types'

interface TemplateEditorProps {
  template: Template
  onBack: () => void
  onSave: (update: TemplateUpdate) => Promise<void>
}

export function TemplateEditor({ template, onBack, onSave }: TemplateEditorProps): JSX.Element {
  const { toast } = useToast()
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description)
  const [titleTemplate, setTitleTemplate] = useState(template.title_template)
  const [content, setContent] = useState(template.content)
  const [excerpt, setExcerpt] = useState(template.excerpt)
  const [status, setStatus] = useState(template.status)
  const [categoryNames, setCategoryNames] = useState<string[]>(template.category_names)
  const [tagNames, setTagNames] = useState<string[]>(template.tag_names)
  const [catInput, setCatInput] = useState('')
  const [tagInput, setTagInput] = useState('')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset state when template changes
  useEffect(() => {
    setName(template.name)
    setDescription(template.description)
    setTitleTemplate(template.title_template)
    setContent(template.content)
    setExcerpt(template.excerpt)
    setStatus(template.status)
    setCategoryNames(template.category_names)
    setTagNames(template.tag_names)
  }, [template])

  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await onSave({
          id: template.id,
          name: name || 'Untitled Template',
          description,
          title_template: titleTemplate,
          content,
          excerpt,
          status,
          category_names: categoryNames,
          tag_names: tagNames
        })
      } catch {
        toast({ title: 'Error', description: 'Failed to save template.', variant: 'destructive' })
      }
    }, 800)
  }, [template.id, name, description, titleTemplate, content, excerpt, status, categoryNames, tagNames, onSave, toast])

  useEffect(() => {
    debouncedSave()
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
  }, [debouncedSave])

  const addCategoryName = useCallback(() => {
    const trimmed = catInput.trim()
    if (trimmed && !categoryNames.includes(trimmed)) {
      setCategoryNames((prev) => [...prev, trimmed])
    }
    setCatInput('')
  }, [catInput, categoryNames])

  const addTagName = useCallback(() => {
    const trimmed = tagInput.trim()
    if (trimmed && !tagNames.includes(trimmed)) {
      setTagNames((prev) => [...prev, trimmed])
    }
    setTagInput('')
  }, [tagInput, tagNames])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">Edit Template</span>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 space-y-3 shrink-0">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name"
              className="border-0 text-xl font-semibold h-auto py-1 px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="text-sm h-8"
            />
            <Input
              value={titleTemplate}
              onChange={(e) => setTitleTemplate(e.target.value)}
              placeholder="Title template (e.g. 'Weekly Update: ')"
              className="text-sm h-8"
            />
          </div>
          <div className="flex-1 px-4 pb-4 flex flex-col min-h-0">
            <TipTapEditor
              key={template.id}
              postId={template.id}
              siteId=""
              content={content}
              onChange={setContent}
            />
          </div>
        </div>

        {/* Right panel */}
        <div className="w-[280px] border-l p-4 space-y-4 overflow-y-auto shrink-0">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Default Status
            </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending">Pending Review</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="publish">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Excerpt
            </Label>
            <Textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Default excerpt..."
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Category Names
            </Label>
            {categoryNames.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {categoryNames.map((name) => (
                  <Badge key={name} variant="secondary" className="text-xs pl-2 pr-1 py-0 h-6 gap-1">
                    {name}
                    <button className="ml-0.5 hover:text-destructive" onClick={() => setCategoryNames((p) => p.filter((n) => n !== name))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Input
              value={catInput}
              onChange={(e) => setCatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategoryName() } }}
              placeholder="Type name + Enter"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Tag Names
            </Label>
            {tagNames.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tagNames.map((name) => (
                  <Badge key={name} variant="secondary" className="text-xs pl-2 pr-1 py-0 h-6 gap-1">
                    {name}
                    <button className="ml-0.5 hover:text-destructive" onClick={() => setTagNames((p) => p.filter((n) => n !== name))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTagName() } }}
              placeholder="Type name + Enter"
              className="h-8 text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
