import { MoreHorizontal, FileUp, FileDown, Copy, CopyPlus } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@renderer/components/ui/popover'
import { Separator } from '@renderer/components/ui/separator'
import type { Site } from '@shared/types'

interface PostActionsMenuProps {
  onImportMarkdown: () => void
  onExportMarkdown: () => void
  onDuplicate?: () => void
  onDuplicateTo?: () => void
  duplicating: boolean
  sites: Site[]
}

export function PostActionsMenu({
  onImportMarkdown,
  onExportMarkdown,
  onDuplicate,
  onDuplicateTo,
  duplicating,
  sites
}: PostActionsMenuProps): JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="More actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        <button
          className="flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground"
          onClick={onImportMarkdown}
        >
          <FileUp className="h-3.5 w-3.5" />
          Import Markdown
        </button>
        <button
          className="flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground"
          onClick={onExportMarkdown}
        >
          <FileDown className="h-3.5 w-3.5" />
          Export as Markdown
        </button>
        {onDuplicate && (
          <>
            <Separator className="my-1" />
            <button
              className="flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground"
              onClick={onDuplicate}
              disabled={duplicating}
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </button>
            {sites.length > 1 && onDuplicateTo && (
              <button
                className="flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground"
                onClick={onDuplicateTo}
                disabled={duplicating}
              >
                <CopyPlus className="h-3.5 w-3.5" />
                Duplicate to...
              </button>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
