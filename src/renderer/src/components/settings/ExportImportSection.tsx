import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Loader2 } from 'lucide-react'
import { useToast } from '@renderer/components/ui/use-toast'
import type { ExportMetadata } from '@shared/types'

export function ExportImportSection(): JSX.Element {
  const { toast } = useToast()

  // ── Export state ──
  const [showExport, setShowExport] = useState(false)
  const [exportPassword, setExportPassword] = useState('')
  const [exportConfirm, setExportConfirm] = useState('')
  const [exporting, setExporting] = useState(false)

  // ── Import state ──
  const [importPath, setImportPath] = useState<string | null>(null)
  const [importMeta, setImportMeta] = useState<ExportMetadata | null>(null)
  const [importPassword, setImportPassword] = useState('')
  const [importing, setImporting] = useState(false)

  async function handleExport(): Promise<void> {
    if (exportPassword.length < 1) {
      toast({ title: 'Password required', variant: 'destructive' })
      return
    }
    if (exportPassword !== exportConfirm) {
      toast({ title: 'Passwords do not match', variant: 'destructive' })
      return
    }

    const destPath = await window.electronAPI.showSaveExportDialog()
    if (!destPath) return

    setExporting(true)
    try {
      await window.electronAPI.exportData(exportPassword, destPath)
      toast({ title: 'Export complete', description: 'Your data has been exported.' })
      setShowExport(false)
      setExportPassword('')
      setExportConfirm('')
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setExporting(false)
    }
  }

  async function handleSelectImport(): Promise<void> {
    const path = await window.electronAPI.showOpenImportDialog()
    if (!path) return

    try {
      const meta = await window.electronAPI.importReadMetadata(path)
      setImportPath(path)
      setImportMeta(meta)
      setImportPassword('')
    } catch (err) {
      toast({
        title: 'Invalid export file',
        description: err instanceof Error ? err.message : 'Could not read metadata',
        variant: 'destructive'
      })
    }
  }

  async function handleImport(): Promise<void> {
    if (!importPath || !importMeta) return
    if (importPassword.length < 1) {
      toast({ title: 'Password required', variant: 'destructive' })
      return
    }

    setImporting(true)
    try {
      await window.electronAPI.importData(importPassword, importPath)
      localStorage.setItem('npp-post-import', '1')
      toast({ title: 'Import complete', description: 'Reloading...' })
      // Full app state reset
      setTimeout(() => window.location.reload(), 500)
    } catch (err) {
      toast({
        title: 'Import failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive'
      })
      setImporting(false)
    }
  }

  function cancelImport(): void {
    setImportPath(null)
    setImportMeta(null)
    setImportPassword('')
  }

  return (
    <>
      {/* Export */}
      <div className="mb-8">
        <div className="space-y-0.5 mb-3">
          <Label>Export data</Label>
          <p className="text-xs text-muted-foreground">
            Create a password-protected backup of all your data.
          </p>
        </div>
        {!showExport ? (
          <Button size="sm" variant="outline" onClick={() => setShowExport(true)}>
            Export Data
          </Button>
        ) : (
          <div className="space-y-2 max-w-xs">
            <Input
              type="password"
              placeholder="Password"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              className="h-8 text-sm"
            />
            <Input
              type="password"
              placeholder="Confirm password"
              value={exportConfirm}
              onChange={(e) => setExportConfirm(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleExport} disabled={exporting}>
                {exporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Export
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowExport(false)
                  setExportPassword('')
                  setExportConfirm('')
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Import */}
      <div>
        <div className="space-y-0.5 mb-3">
          <Label>Import data</Label>
          <p className="text-xs text-muted-foreground">
            Restore from a previous export. This will replace all existing data.
          </p>
        </div>
        {!importMeta ? (
          <Button size="sm" variant="outline" onClick={handleSelectImport}>
            Import Data
          </Button>
        ) : (
          <div className="space-y-3 max-w-sm">
            <div className="rounded-md border p-3 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Exported:</span>{' '}
                {new Date(importMeta.exportedAt).toLocaleDateString()}
              </p>
              <p>
                <span className="text-muted-foreground">Version:</span> {importMeta.version}
              </p>
              {importMeta.sites.length > 0 && (
                <p>
                  <span className="text-muted-foreground">Sites:</span>{' '}
                  {importMeta.sites.map((s) => s.label).join(', ')}
                </p>
              )}
            </div>
            <p className="text-xs text-destructive">
              This will replace all existing data. All sites will need re-authentication.
            </p>
            <Input
              type="password"
              placeholder="Export password"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleImport} disabled={importing}>
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import
              </Button>
              <Button size="sm" variant="outline" onClick={cancelImport}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
