import { useState, useEffect } from 'react'
import { Button } from '@renderer/components/ui/button'
import { RefreshCw, Download, RotateCcw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready' | 'error'

const api = window.electronAPI

export function UpdateChecker(): JSX.Element {
  const [version, setVersion] = useState('')
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [availableVersion, setAvailableVersion] = useState('')
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    api.getVersion().then(setVersion)

    const cleanup = api.onUpdaterEvent((eventStatus, data) => {
      // Background (sync-triggered) checks shouldn't flip this UI's idle
      // state — only their positive outcomes matter here
      if (data?.auto && (eventStatus === 'checking' || eventStatus === 'up-to-date' || eventStatus === 'error')) {
        return
      }
      switch (eventStatus) {
        case 'checking':
          setStatus('checking')
          break
        case 'available':
          setStatus('available')
          setAvailableVersion((data?.version as string) ?? '')
          break
        case 'up-to-date':
          setStatus('up-to-date')
          break
        case 'downloading':
          setStatus('downloading')
          setDownloadPercent((data?.percent as number) ?? 0)
          break
        case 'ready':
          setStatus('ready')
          break
        case 'error':
          setStatus('error')
          setErrorMessage((data?.message as string) ?? 'Unknown error')
          break
      }
    })

    return cleanup
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          Version <span className="font-mono font-medium text-foreground">{version}</span>
        </span>

        {status === 'idle' && (
          <Button variant="outline" size="sm" onClick={() => api.checkForUpdates()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Check for Updates
          </Button>
        )}

        {status === 'checking' && (
          <Button variant="outline" size="sm" disabled className="gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking…
          </Button>
        )}

        {status === 'up-to-date' && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            Up to date
          </span>
        )}

        {status === 'available' && (
          <Button variant="outline" size="sm" onClick={() => api.downloadUpdate()} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Download v{availableVersion}
          </Button>
        )}

        {status === 'downloading' && (
          <Button variant="outline" size="sm" disabled className="gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Downloading… {downloadPercent}%
          </Button>
        )}

        {status === 'ready' && (
          <Button variant="default" size="sm" onClick={() => api.installUpdate()} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Install & Restart
          </Button>
        )}

        {status === 'error' && (
          <span className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {errorMessage}
          </span>
        )}
      </div>
    </div>
  )
}
