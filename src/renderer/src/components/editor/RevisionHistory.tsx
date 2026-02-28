import { useState, useEffect, useCallback } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { diffWords } from 'diff'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import type { Revision } from '@shared/types'

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatRevisionDate(dateStr: string): string {
  const date = new Date(dateStr + 'Z')
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

interface RevisionHistoryProps {
  postId: string
  onRestore: (post: { title: string; content: string; excerpt: string }) => void
}

export function RevisionHistory({ postId, onRestore }: RevisionHistoryProps): JSX.Element {
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  const loadRevisions = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.getRevisions(postId)
      setRevisions(result)
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    loadRevisions()
  }, [loadRevisions])

  const selectedRevision = revisions.find((r) => r.id === selectedId) ?? null
  const selectedIndex = selectedRevision ? revisions.indexOf(selectedRevision) : -1
  const previousRevision = selectedIndex >= 0 && selectedIndex < revisions.length - 1
    ? revisions[selectedIndex + 1]
    : null

  async function handleRestore(): Promise<void> {
    if (!selectedRevision) return
    setRestoring(true)
    try {
      const post = await window.electronAPI.restoreRevision(selectedRevision.id)
      if (post) {
        onRestore({ title: post.title, content: post.content, excerpt: post.excerpt })
      }
      await loadRevisions()
      setSelectedId(null)
    } finally {
      setRestoring(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (revisions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No revisions yet</p>
        <p className="text-xs mt-1">Revisions are captured automatically as you edit.</p>
      </div>
    )
  }

  // Diff view
  if (selectedRevision) {
    const oldText = previousRevision ? stripHtml(previousRevision.content) : ''
    const newText = stripHtml(selectedRevision.content)
    const diffs = diffWords(oldText, newText)

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
          <button
            onClick={() => setSelectedId(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            &larr; Back
          </button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            onClick={handleRestore}
            disabled={restoring}
            className="h-7 text-xs"
          >
            {restoring ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-3 w-3" />
            )}
            Restore
          </Button>
        </div>
        <div className="px-4 py-2 border-b shrink-0">
          <p className="text-xs font-medium">{selectedRevision.title || '(Untitled)'}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatRevisionDate(selectedRevision.created_at)}
            {' \u00B7 '}
            {selectedRevision.word_count} words
          </p>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-4 py-3 text-sm leading-relaxed font-mono text-[13px]">
            {!previousRevision ? (
              <span>{newText}</span>
            ) : (
              diffs.map((part, i) => {
                if (part.added) {
                  return <span key={i} className="bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-300">{part.value}</span>
                }
                if (part.removed) {
                  return <span key={i} className="bg-red-100 text-red-900 line-through dark:bg-red-900/40 dark:text-red-300">{part.value}</span>
                }
                return <span key={i}>{part.value}</span>
              })
            )}
          </div>
        </ScrollArea>
      </div>
    )
  }

  // Revision list
  return (
    <ScrollArea className="flex-1">
      <div className="py-2">
        {revisions.map((rev, i) => {
          const prevRev = i < revisions.length - 1 ? revisions[i + 1] : null
          const wcDelta = prevRev ? rev.word_count - prevRev.word_count : rev.word_count

          return (
            <button
              key={rev.id}
              onClick={() => setSelectedId(rev.id)}
              className="w-full text-left px-4 py-2.5 transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate flex-1">
                  {rev.title || '(Untitled)'}
                </p>
                <span className={
                  wcDelta > 0
                    ? 'text-[11px] text-green-600'
                    : wcDelta < 0
                      ? 'text-[11px] text-red-600'
                      : 'text-[11px] text-muted-foreground'
                }>
                  {wcDelta > 0 ? '+' : ''}{wcDelta}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-muted-foreground">
                  {formatRevisionDate(rev.created_at)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {rev.word_count} words
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}
