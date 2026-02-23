import { Globe, Pencil, Trash2, Plus } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import type { Site } from '@shared/types'

interface SiteListProps {
  sites: Site[]
  onAdd: () => void
  onEdit: (site: Site) => void
  onDelete: (site: Site) => void
}

export function SiteList({ sites, onAdd, onEdit, onDelete }: SiteListProps): JSX.Element {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Sites</h2>
          <p className="text-sm text-muted-foreground">
            Manage your WordPress site connections
          </p>
        </div>
        <Button onClick={onAdd} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Site
        </Button>
      </div>

      {sites.length === 0 ? (
        <div className="border rounded-lg p-8 text-center">
          <Globe className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-medium mb-1">No sites configured</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add a WordPress site to get started with offline editing.
          </p>
          <Button onClick={onAdd} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Your First Site
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {sites.map((site) => (
            <div
              key={site.id}
              className="border rounded-lg p-4 flex items-center justify-between hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Globe className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{site.label}</span>
                    {site.auto_sync && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Auto-sync
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{site.url}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(site)}
                  title="Edit site"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(site)}
                  title="Delete site"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
