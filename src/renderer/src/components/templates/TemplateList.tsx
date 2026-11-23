import { Plus, FileText, Trash2, ArrowLeft } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import type { Template } from '@shared/types'

interface TemplateListProps {
  templates: Template[]
  loading: boolean
  onNew: () => void
  onSelect: (template: Template) => void
  onDelete: (id: string) => void
  onBack?: () => void
}

export function TemplateList({ templates, loading, onNew, onSelect, onDelete, onBack }: TemplateListProps): JSX.Element {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading templates...
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto"><div className="p-6 max-w-4xl mx-auto">
      <p className="text-sm text-muted-foreground mb-5">
        Reusable starting points for new posts: structure, categories, tags and custom fields.
      </p>

      {templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No templates yet</p>
          <p className="text-xs mt-1">Create a template to reuse post structures</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="group relative border rounded-lg p-4 hover:border-primary/50 cursor-pointer transition-colors"
              onClick={() => onSelect(t)}
            >
              <h3 className="font-medium text-sm truncate">{t.name}</h3>
              {t.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                {t.status !== 'draft' && <span className="capitalize">{t.status}</span>}
                {t.category_names.length > 0 && <span>{t.category_names.length} categories</span>}
                {t.tag_names.length > 0 && <span>{t.tag_names.length} tags</span>}
              </div>
              <button
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                onClick={(e) => { e.stopPropagation(); onDelete(t.id) }}
                title="Delete template"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div></div>
  )
}
