import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

interface AppShellProps {
  children: ReactNode
  /** The sidebar, or null where it folds away (the editor, settings). */
  sidebar: ReactNode | null
  /** Title-bar content for views that don't draw their own header. */
  header?: { title: string; actions?: ReactNode }
}

/**
 * Two panes: the sidebar and the current view. The window has no title bar
 * (hiddenInset), so whichever pane is at the top-left leaves room for the
 * traffic lights and something at the top must be draggable.
 */
export function AppShell({ children, sidebar, header }: AppShellProps): JSX.Element {
  return (
    <div className="h-screen flex">
      {sidebar}
      <main className="flex-1 min-w-0 flex flex-col bg-background overflow-hidden">
        {header && (
          <ViewHeader title={header.title} insetForTrafficLights={!sidebar}>
            {header.actions}
          </ViewHeader>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      </main>
    </div>
  )
}

/** A view's title bar: draggable, with its controls opted out of dragging. */
export function ViewHeader({
  title,
  children,
  insetForTrafficLights,
  className
}: {
  title?: ReactNode
  children?: ReactNode
  insetForTrafficLights?: boolean
  className?: string
}): JSX.Element {
  return (
    <div
      className={cn(
        'h-[52px] shrink-0 flex items-center gap-3 border-b px-6 drag-region',
        insetForTrafficLights && 'pl-[84px]',
        className
      )}
    >
      {title && <h1 className="text-[15px] font-semibold tracking-tight select-none">{title}</h1>}
      <div className="flex-1" />
      {children && <div className="flex items-center gap-1.5 no-drag">{children}</div>}
    </div>
  )
}
