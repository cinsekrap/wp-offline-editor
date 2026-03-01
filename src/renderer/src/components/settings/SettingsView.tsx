import { useState } from 'react'
import {
  Globe,
  Palette,
  SlidersHorizontal,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  X,
  Loader2
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { SiteList } from './SiteList'
import { ClearSiteContentDialog } from './ClearSiteContentDialog'
import { ExportImportSection } from './ExportImportSection'
import { UpdateChecker } from './UpdateChecker'
import type { Site, AppSettings } from '@shared/types'

type Section = 'general' | 'sync' | 'appearance' | 'sites'

const NAV_ITEMS: { id: Section; label: string; icon: typeof Globe }[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'sync', label: 'Sync', icon: RefreshCw },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'sites', label: 'Sites', icon: Globe }
]

interface SettingsViewProps {
  sites: Site[]
  onAddSite: () => void
  onEditSite: (site: Site) => void
  onDeleteSite: (site: Site) => void
  onSelectSite: (site: Site) => void
  settings: AppSettings
  onUpdateSettings: (patch: Partial<AppSettings>) => void
  onClose?: () => void
  initialSection?: Section
}

export function SettingsView({
  sites,
  onAddSite,
  onEditSite,
  onDeleteSite,
  onSelectSite,
  settings,
  onUpdateSettings,
  onClose,
  initialSection = 'general'
}: SettingsViewProps): JSX.Element {
  const [activeSection, setActiveSection] = useState<Section>(initialSection)

  return (
    <div className="flex h-full">
      {/* Sidebar nav */}
      <nav className="w-[200px] border-r p-3 shrink-0 flex flex-col">
        {onClose && (
          <button
            onClick={onClose}
            className="mb-3 flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground transition-colors"
            title="Close settings"
          >
            <X className="h-4 w-4" />
            Close
          </button>
        )}
        <div className="space-y-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                activeSection === id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeSection === 'general' && (
          <GeneralSection />
        )}

        {activeSection === 'sync' && (
          <SyncSection settings={settings} onUpdate={onUpdateSettings} sites={sites} />
        )}

        {activeSection === 'appearance' && (
          <AppearanceSection settings={settings} onUpdate={onUpdateSettings} />
        )}

        {activeSection === 'sites' && (
          <SiteList
            sites={sites}
            onAdd={onAddSite}
            onEdit={onEditSite}
            onDelete={onDeleteSite}
            onSelect={onSelectSite}
          />
        )}
      </div>
    </div>
  )
}

function AppearanceSection({
  settings,
  onUpdate
}: {
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => void
}): JSX.Element {
  const themeOptions: { value: AppSettings['theme']; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor }
  ]

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Appearance</h2>
      <p className="text-sm text-muted-foreground mb-6">Customize the look and feel of the editor.</p>

      {/* Theme */}
      <div className="space-y-3 mb-8">
        <Label>Theme</Label>
        <div className="flex gap-2">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant={settings.theme === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => onUpdate({ theme: value })}
              className="gap-1.5"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Editor font size */}
      <div className="space-y-3">
        <Label>Editor font size</Label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={12}
            max={24}
            step={1}
            value={settings.editorFontSize}
            onChange={(e) => onUpdate({ editorFontSize: Number(e.target.value) })}
            className="w-48 accent-primary"
          />
          <span className="text-sm font-mono w-8 text-right">{settings.editorFontSize}</span>
        </div>
        <p
          className="text-muted-foreground border rounded-md p-3 mt-2"
          style={{ fontSize: `${settings.editorFontSize}px` }}
        >
          The quick brown fox jumps over the lazy dog.
        </p>
      </div>
    </div>
  )
}

function GeneralSection(): JSX.Element {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">General</h2>
      <p className="text-sm text-muted-foreground mb-6">About this application.</p>

      <div className="mb-8">
        <Label className="mb-3 block">About</Label>
        <UpdateChecker />
      </div>

      <ExportImportSection />
    </div>
  )
}

const SYNC_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: '1 min' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' }
]

function SyncSection({
  settings,
  onUpdate,
  sites
}: {
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => void
  sites: Site[]
}): JSX.Element {
  const [clearSiteId, setClearSiteId] = useState<string | null>(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  const clearSite = sites.find((s) => s.id === clearSiteId) ?? null

  async function handleClearContent(siteId: string): Promise<void> {
    await window.electronAPI.clearSiteContent(siteId)
  }

  async function handleReset(): Promise<void> {
    setResetting(true)
    try {
      await window.electronAPI.clearAllData()
      window.location.reload()
    } finally {
      setResetting(false)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Sync</h2>
      <p className="text-sm text-muted-foreground mb-6">Control how data syncs with WordPress.</p>

      {/* Auto-sync interval */}
      <div className="max-w-md mb-8">
        <div className="space-y-0.5 mb-3">
          <Label>Auto-sync frequency</Label>
          <p className="text-xs text-muted-foreground">
            How often to automatically sync with WordPress when online. Per-site auto-sync must also be enabled.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {SYNC_OPTIONS.map(({ value, label }) => (
            <Button
              key={value}
              variant={settings.autoSyncInterval === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => onUpdate({ autoSyncInterval: value })}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Force offline */}
      <div className="flex items-center justify-between max-w-md mb-8">
        <div className="space-y-0.5">
          <Label>Force offline mode</Label>
          <p className="text-xs text-muted-foreground">
            Pretend the network is unavailable. Disables all sync and push operations.
          </p>
        </div>
        <Switch
          checked={settings.forceOffline}
          onCheckedChange={(checked) => onUpdate({ forceOffline: checked })}
        />
      </div>

      {/* Clear site content */}
      {sites.length > 0 && (
        <div className="max-w-md mb-8">
          <div className="space-y-0.5 mb-3">
            <Label>Clear site content</Label>
            <p className="text-xs text-muted-foreground">
              Remove all posts, media, scratchpads, and cached data for a site. The site connection and credentials will be kept.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={clearSiteId ?? ''} onValueChange={setClearSiteId}>
              <SelectTrigger className="h-8 text-sm w-48">
                <SelectValue placeholder="Select a site..." />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="destructive"
              size="sm"
              disabled={!clearSiteId}
              onClick={() => setClearDialogOpen(true)}
            >
              Clear Content
            </Button>
          </div>
        </div>
      )}

      {/* Reset app */}
      <div className="max-w-md">
        <div className="space-y-0.5 mb-3">
          <Label>Reset app</Label>
          <p className="text-xs text-muted-foreground">
            Remove all sites, posts, media, and credentials. App settings will be kept.
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setResetDialogOpen(true)}>
          Reset App
        </Button>
      </div>

      <ClearSiteContentDialog
        site={clearSite}
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        onConfirm={handleClearContent}
      />

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Reset App</DialogTitle>
            <DialogDescription>
              Reset the app? This removes all sites, posts, media, and credentials. App settings
              will be kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReset} disabled={resetting}>
              {resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

