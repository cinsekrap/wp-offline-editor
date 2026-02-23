import { Settings } from 'lucide-react'

interface ToolbarProps {
  onSettingsClick: () => void
}

export function Toolbar({ onSettingsClick }: ToolbarProps): JSX.Element {
  return (
    <div className="h-12 border-b flex items-center justify-between px-4 drag-region bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* macOS traffic light spacing */}
      <div className="w-20" />

      <h1 className="text-sm font-semibold select-none">WP Offline Editor</h1>

      <div className="flex items-center gap-2">
        <button
          onClick={onSettingsClick}
          className="p-2 rounded-md hover:bg-accent transition-colors"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
