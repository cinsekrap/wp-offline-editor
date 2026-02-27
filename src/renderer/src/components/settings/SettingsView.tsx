import { useState, useEffect, useCallback } from 'react'
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
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription
} from '@renderer/components/ui/dialog'
import { SiteList } from './SiteList'
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
          <SyncSection sites={sites} settings={settings} onUpdate={onUpdateSettings} />
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

      <div>
        <Label className="mb-3 block">About</Label>
        <UpdateChecker />
      </div>
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
  sites,
  settings,
  onUpdate
}: {
  sites: Site[]
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => void
}): JSX.Element {
  const [clearDialogOpen, setClearDialogOpen] = useState(false)

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

      {/* TODO: revisit clear-data feature */}
    </div>
  )
}

function ClearDataDialog({
  open,
  onOpenChange,
  sites
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sites: Site[]
}): JSX.Element {
  const [scope, setScope] = useState<string>('all')
  const [unsyncedCount, setUnsyncedCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)

  const fetchUnsyncedCount = useCallback(async (selectedScope: string) => {
    setLoading(true)
    try {
      if (selectedScope === 'all') {
        const count = await window.electronAPI.getTotalUnsyncedCount()
        setUnsyncedCount(count)
      } else {
        const count = await window.electronAPI.getUnsyncedPostCount(selectedScope)
        setUnsyncedCount(count)
      }
    } catch {
      setUnsyncedCount(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setScope('all')
      setClearing(false)
      fetchUnsyncedCount('all')
    }
  }, [open, fetchUnsyncedCount])

  const handleScopeChange = (value: string): void => {
    setScope(value)
    fetchUnsyncedCount(value)
  }

  const scopeLabel = scope === 'all'
    ? 'all sites'
    : sites.find((s) => s.id === scope)?.label ?? 'the selected site'

  const handleClear = async (): Promise<void> => {
    setClearing(true)
    try {
      if (scope === 'all') {
        await window.electronAPI.clearAllData()
        window.location.reload()
      } else {
        await window.electronAPI.clearSiteData(scope)
        onOpenChange(false)
        // The parent will re-fetch sites automatically since the site was deleted
      }
    } catch {
      setClearing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={clearing ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Clear local data</DialogTitle>
          <DialogDescription>
            Choose which data to remove. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <RadioGroup value={scope} onValueChange={handleScopeChange}>
            <div className="flex items-center space-x-2 py-1.5">
              <RadioGroupItem value="all" id="scope-all" />
              <Label htmlFor="scope-all" className="font-normal cursor-pointer">All sites</Label>
            </div>
            {sites.map((site) => (
              <div key={site.id} className="flex items-center space-x-2 py-1.5">
                <RadioGroupItem value={site.id} id={`scope-${site.id}`} />
                <Label htmlFor={`scope-${site.id}`} className="font-normal cursor-pointer">
                  {site.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {!loading && unsyncedCount !== null && (
          <p className={`text-sm ${unsyncedCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {unsyncedCount > 0
              ? `You have ${unsyncedCount} unsynced post${unsyncedCount === 1 ? '' : 's'} that haven\u2019t been pushed to WordPress. They will be permanently lost.`
              : `This will remove all local data for ${scopeLabel}. You can re-sync from WordPress afterward.`}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={clearing}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleClear}
            disabled={loading || clearing}
          >
            {clearing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Clear data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
