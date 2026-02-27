import { useState } from 'react'
import { Pencil, Trash2, Plus, Globe, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { AcfSchemaViewer } from '@renderer/components/posts/AcfSchemaViewer'
import type { Site } from '@shared/types'

interface SiteListProps {
  sites: Site[]
  onAdd: () => void
  onEdit: (site: Site) => void
  onDelete: (site: Site) => void
  onSelect: (site: Site) => void
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-teal-500'
]

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function SiteFavicon({ site }: { site: Site }): JSX.Element {
  const [error, setError] = useState(false)
  const letter = (site.label || site.url)[0]?.toUpperCase() || '?'
  const colorClass = AVATAR_COLORS[hashCode(site.id) % AVATAR_COLORS.length]

  if (!site.site_icon_url || error) {
    return (
      <div
        className={`h-10 w-10 rounded-lg ${colorClass} flex items-center justify-center text-white font-semibold text-lg shrink-0`}
      >
        {letter}
      </div>
    )
  }

  // Serve local icon file via media:// protocol
  const iconSrc = `media://file${site.site_icon_url}`

  return (
    <img
      src={iconSrc}
      alt=""
      className="h-10 w-10 rounded-lg object-contain shrink-0 bg-muted"
      onError={() => setError(true)}
    />
  )
}

export function SiteList({ sites, onAdd, onEdit, onDelete, onSelect }: SiteListProps): JSX.Element {
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SiteCard({
  site,
  onSelect,
  onEdit,
  onDelete
}: {
  site: Site
  onSelect: (site: Site) => void
  onEdit: (site: Site) => void
  onDelete: (site: Site) => void
}): JSX.Element {
  const [schemaOpen, setSchemaOpen] = useState(false)

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="p-4 hover:bg-accent/30 transition-colors cursor-pointer group"
        onClick={() => onSelect(site)}
      >
        <div className="flex items-start gap-3">
          <SiteFavicon site={site} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{site.label}</span>
              {site.auto_sync && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Auto-sync
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{site.url}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(site)
            }}
            title="Edit site"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(site)
            }}
            title="Delete site"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="border-t">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setSchemaOpen(!schemaOpen)
          }}
          className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-accent/30 transition-colors text-xs text-muted-foreground"
        >
          {schemaOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          ACF Schema
        </button>
        {schemaOpen && (
          <div className="px-4 pb-3">
            <AcfSchemaViewer siteId={site.id} />
          </div>
        )}
      </div>
    </div>
  )
}
