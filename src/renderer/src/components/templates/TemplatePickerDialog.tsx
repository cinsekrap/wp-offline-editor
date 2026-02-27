import { FileText, FilePlus2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { Template } from '@shared/types'

interface TemplatePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: Template[]
  onBlank: () => void
  onSelect: (template: Template) => void
}

export function TemplatePickerDialog({
  open,
  onOpenChange,
  templates,
  onBlank,
  onSelect
}: TemplatePickerDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          <button
            className="flex items-center gap-3 w-full text-left p-3 rounded-lg border hover:border-primary/50 transition-colors"
            onClick={() => { onOpenChange(false); onBlank() }}
          >
            <FilePlus2 className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">Blank post</p>
              <p className="text-xs text-muted-foreground">Start from scratch</p>
            </div>
          </button>

          {templates.map((t) => (
            <button
              key={t.id}
              className="flex items-center gap-3 w-full text-left p-3 rounded-lg border hover:border-primary/50 transition-colors"
              onClick={() => { onOpenChange(false); onSelect(t) }}
            >
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{t.name}</p>
                {t.description && (
                  <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
