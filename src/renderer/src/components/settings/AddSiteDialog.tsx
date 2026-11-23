import { useState, useEffect } from 'react'
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
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Badge } from '@renderer/components/ui/badge'
import { AlertTriangle, CheckCircle, Download, Loader2, XCircle } from 'lucide-react'
import type { SiteInput, WpConnectionResult } from '@shared/types'
import { isPluginVersionMismatch, pluginMismatchMessage } from '@shared/version-utils'
import { ipcErrorMessage } from '@renderer/lib/utils'

interface AddSiteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: SiteInput) => Promise<void>
  onTestConnection: (
    url: string,
    username: string,
    password: string,
    allowPlaintext?: boolean
  ) => Promise<WpConnectionResult>
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
  const [autoSync, setAutoSync] = useState(true)
  const [pullPublished, setPullPublished] = useState(50)
  const [mediaLibraryLimit, setMediaLibraryLimit] = useState(100)
  const [allowPlaintext, setAllowPlaintext] = useState(false)
  const [testResult, setTestResult] = useState<WpConnectionResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    if (open) window.electronAPI.getVersion().then(setAppVersion)
  }, [open])

  const pluginMismatch = !!(
    testResult?.wpoePluginActive &&
    testResult.wpoePluginVersion &&
    appVersion &&
    isPluginVersionMismatch(testResult.wpoePluginVersion, appVersion)
  )

  function reset(): void {
    setStep('credentials')
    setUrl('')
    setUsername('')
    setPassword('')
    setLabel('')
    setAutoSync(true)
    setPullPublished(50)
    setMediaLibraryLimit(100)
    setAllowPlaintext(false)
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
      const result = await onTestConnection(url, username, password, allowPlaintext)
      setTestResult(result)
      if (result.success) {
        setLabel(result.siteName || new URL(url).hostname)
        setStep('settings')
      }
    } catch (err) {
      setError(ipcErrorMessage(err, 'Connection test failed'))
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
        pull_published: pullPublished,
        media_library_limit: mediaLibraryLimit,
        allow_plaintext: allowPlaintext
      })
      handleOpenChange(false)
    } catch (err) {
      setError(ipcErrorMessage(err, 'Failed to save site'))
    } finally {
      setSaving(false)
    }
  }

  // Transport policy lives in the main process — it refuses the URL and says why.
  const canTest = url.trim() && username.trim() && password.trim()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px] gap-5">
        <DialogHeader>
          <p className="text-xs font-medium text-muted-foreground">
            Step {step === 'settings' ? 2 : 1} of 2
          </p>
          <DialogTitle>{step === 'settings' ? 'Set up your site' : 'Add a WordPress site'}</DialogTitle>
          <DialogDescription>
            {step === 'settings'
              ? 'Choose what to keep on this Mac. You can change these later.'
              : 'Connect with your WordPress username and an application password.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'credentials' && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="site-url">Site URL</Label>
              <Input
                id="site-url"
                placeholder="https://your-site.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-x-6">
              <div className="space-y-2">
                <Label htmlFor="site-username">Username</Label>
                <Input
                  id="site-username"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-password">Application password</Label>
                <Input
                  id="site-password"
                  type="password"
                  placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="rounded-lg bg-muted/60 px-3.5 py-3 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground/80">Where do I get an application password?</p>
              In WordPress, go to <span className="text-foreground/80">Users &rarr; Profile</span>, scroll
              to Application Passwords, enter a name such as &ldquo;NP Presspad&rdquo; and click Add New Application Password.
              Copy the password it shows. It isn&rsquo;t your normal login password.
            </div>

            <div className="flex items-start gap-2.5 border-t pt-5">
              <Checkbox
                id="site-allow-plaintext"
                checked={allowPlaintext}
                onCheckedChange={(checked) => setAllowPlaintext(checked === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="site-allow-plaintext" className="cursor-pointer">
                  Allow unencrypted connection
                </Label>
                <p className="text-xs text-muted-foreground">
                  Only for sites on your own network (http:// with a .local or .test address). The
                  password and post content will cross the network unencrypted. Public sites always
                  require https://.
                </p>
              </div>
            </div>

            {testResult && !testResult.success && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{testResult.error}</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {step === 'settings' && testResult?.success && (
          <div className="space-y-5">
            <div className="flex items-center gap-2.5 rounded-lg border border-success/25 bg-success-soft px-3.5 py-2.5 text-sm">
              <CheckCircle className="h-4 w-4 shrink-0 text-success" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">Connected to {testResult.siteName}</span>
                <span className="text-foreground/70"> &middot; WordPress {testResult.wpVersion}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-foreground/70">
                ACF
                {testResult.acfActive ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Active
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">not detected</span>
                )}
              </span>
            </div>

            {testResult.acfActive && !testResult.wpoePluginActive && (
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1 space-y-1 text-xs text-foreground/75">
                  <p className="text-sm font-medium text-foreground">Companion plugin not detected</p>
                  <p>
                    Code-registered ACF field groups need the NP Presspad Companion plugin for
                    schema discovery. Posts will sync fine without it.
                  </p>
                  <p>
                    Install via WP Admin &rarr; Plugins &rarr; Add New &rarr; Upload Plugin, then
                    re-test the connection.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 bg-background"
                  onClick={() => window.electronAPI.saveCompanionPlugin()}
                >
                  <Download className="mr-2 h-3 w-3" />
                  Download plugin
                </Button>
              </div>
            )}

            {pluginMismatch && (
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1 space-y-1 text-xs text-foreground/75">
                  <p className="text-sm font-medium text-foreground">Companion plugin version mismatch</p>
                  <p>{pluginMismatchMessage(appVersion)}</p>
                  <p>
                    Replace the existing plugin ZIP via WP Admin &rarr; Plugins &rarr; Add New &rarr;
                    Upload Plugin, then re-test the connection.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 bg-background"
                  onClick={() => window.electronAPI.saveCompanionPlugin()}
                >
                  <Download className="mr-2 h-3 w-3" />
                  Download latest
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 items-end gap-x-6">
              <div className="space-y-2">
                <Label htmlFor="site-label">Label</Label>
                <Input
                  id="site-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="flex h-9 items-center justify-between gap-4">
                <div>
                  <Label htmlFor="auto-sync">Auto-sync</Label>
                  <p className="text-xs text-muted-foreground">Sync changes when online</p>
                </div>
                <Switch
                  id="auto-sync"
                  checked={autoSync}
                  onCheckedChange={setAutoSync}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-5">
              <div className="space-y-2">
                <Label htmlFor="pull-published">Published posts to pull</Label>
                <Input
                  id="pull-published"
                  type="number"
                  min={1}
                  max={500}
                  value={pullPublished}
                  onChange={(e) => setPullPublished(Number(e.target.value))}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="media-library-limit">Media library images to sync</Label>
                <Input
                  id="media-library-limit"
                  type="number"
                  min={0}
                  max={500}
                  value={mediaLibraryLimit}
                  onChange={(e) => setMediaLibraryLimit(Number(e.target.value))}
                  className="h-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Newest first. Drafts and scheduled posts always come too.
              </p>
              <p className="text-xs text-muted-foreground">
                Thumbnails cached for offline browsing (0 to disable)
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
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
                Test connection
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
                Add site
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
