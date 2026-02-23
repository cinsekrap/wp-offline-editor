import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Badge } from '@renderer/components/ui/badge'
import { AlertTriangle, CheckCircle, Loader2, XCircle } from 'lucide-react'
import type { SiteInput, WpConnectionResult } from '@shared/types'

interface AddSiteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: SiteInput) => Promise<void>
  onTestConnection: (url: string, username: string, password: string) => Promise<WpConnectionResult>
}

type Step = 'credentials' | 'testing' | 'settings'

export function AddSiteDialog({
  open,
  onOpenChange,
  onSave,
  onTestConnection
}: AddSiteDialogProps): JSX.Element {
  const [step, setStep] = useState<Step>('credentials')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [label, setLabel] = useState('')
  const [autoSync, setAutoSync] = useState(false)
  const [pullPublished, setPullPublished] = useState(50)
  const [testResult, setTestResult] = useState<WpConnectionResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLocalDomain = url.toLowerCase().includes('.local')
  const isHttpWarning = url.startsWith('http://') && !isLocalDomain

  function reset(): void {
    setStep('credentials')
    setUrl('')
    setUsername('')
    setPassword('')
    setLabel('')
    setAutoSync(false)
    setPullPublished(50)
    setTestResult(null)
    setTesting(false)
    setSaving(false)
    setError(null)
  }

  function handleOpenChange(open: boolean): void {
    if (!open) reset()
    onOpenChange(open)
  }

  async function handleTestConnection(): Promise<void> {
    setTesting(true)
    setError(null)
    setTestResult(null)
    try {
      const result = await onTestConnection(url, username, password)
      setTestResult(result)
      if (result.success) {
        setLabel(result.siteName || new URL(url).hostname)
        setStep('settings')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await onSave({
        url,
        username,
        password,
        label,
        auto_sync: autoSync,
        pull_published: pullPublished
      })
      handleOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save site')
    } finally {
      setSaving(false)
    }
  }

  const canTest = url.trim() && username.trim() && password.trim() && !isHttpWarning

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add WordPress Site</DialogTitle>
          <DialogDescription>
            {step === 'credentials'
              ? 'Enter your site URL and application password credentials.'
              : 'Configure site settings.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'credentials' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="site-url">Site URL</Label>
              <Input
                id="site-url"
                placeholder="https://your-site.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              {isLocalDomain && url.startsWith('http://') && (
                <div className="flex items-center gap-1.5 text-xs text-yellow-600">
                  <AlertTriangle className="h-3 w-3" />
                  <span>HTTP allowed for .local domains (development only)</span>
                </div>
              )}
              {isHttpWarning && (
                <div className="flex items-center gap-1.5 text-xs text-destructive">
                  <XCircle className="h-3 w-3" />
                  <span>Production sites must use HTTPS</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="site-username">Username</Label>
              <Input
                id="site-username"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="site-password">Application Password</Label>
              <Input
                id="site-password"
                type="password"
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Generate an application password in WordPress under Users → Profile.
              </p>
            </div>

            {testResult && !testResult.success && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{testResult.error}</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {step === 'settings' && testResult?.success && (
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium mb-2">
                <CheckCircle className="h-4 w-4" />
                Connection successful
              </div>
              <div className="space-y-1 text-xs text-green-600 dark:text-green-500">
                <p>Site: {testResult.siteName}</p>
                <p>WordPress: {testResult.wpVersion}</p>
                <p className="flex items-center gap-1">
                  ACF:{' '}
                  {testResult.acfActive ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Active
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Not detected</span>
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="site-label">Label</Label>
              <Input
                id="site-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto-sync">Auto-sync</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically sync changes when online
                </p>
              </div>
              <Switch
                id="auto-sync"
                checked={autoSync}
                onCheckedChange={setAutoSync}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pull-published">Published posts to pull</Label>
              <Input
                id="pull-published"
                type="number"
                min={1}
                max={500}
                value={pullPublished}
                onChange={(e) => setPullPublished(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Number of published posts to download for offline access
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'credentials' && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleTestConnection} disabled={!canTest || testing}>
                {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Test Connection
              </Button>
            </>
          )}
          {step === 'settings' && (
            <>
              <Button variant="outline" onClick={() => setStep('credentials')}>
                Back
              </Button>
              <Button onClick={handleSave} disabled={!label.trim() || saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Site
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
