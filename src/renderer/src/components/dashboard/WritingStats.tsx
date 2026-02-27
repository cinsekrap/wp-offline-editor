import { useState, useEffect, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@renderer/components/ui/popover'
import type { WritingStats as WritingStatsType, WpAuthor, SiteUpdate } from '@shared/types'

interface WritingStatsProps {
  siteId: string
  compact?: boolean
}

function Sparkline({ dailyCounts, compact }: { dailyCounts: { date: string; wordCount: number }[]; compact?: boolean }): JSX.Element {
  const max = Math.max(...dailyCounts.map((d) => d.wordCount), 1)
  const barWidth = compact ? 6 : 8
  const gap = 2
  const height = compact ? 32 : 48
  const totalWidth = dailyCounts.length * (barWidth + gap) - gap

  return (
    <svg width={totalWidth} height={height} className="block">
      {dailyCounts.map((d, i) => {
        const barHeight = Math.max((d.wordCount / max) * (height - 4), d.wordCount > 0 ? 2 : 0)
        const opacity = d.wordCount > 0 ? 0.3 + 0.7 * (d.wordCount / max) : 0.08
        return (
          <rect
            key={d.date}
            x={i * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight || 1}
            rx={2}
            className="fill-primary"
            style={{ opacity }}
          >
            <title>{`${d.date}: ${d.wordCount.toLocaleString()} words`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

export function WritingStats({ siteId, compact }: WritingStatsProps): JSX.Element | null {
  const [stats, setStats] = useState<WritingStatsType | null>(null)
  const [authors, setAuthors] = useState<WpAuthor[] | null>(null)
  const [selectedAuthor, setSelectedAuthor] = useState<{ id: number; name: string } | null>(null)
  const [authorPopoverOpen, setAuthorPopoverOpen] = useState(false)

  const loadStats = useCallback(async () => {
    try {
      const s = await window.electronAPI.getWritingStats(siteId)
      setStats(s)
    } catch {
      // Stats are non-critical
    }
  }, [siteId])

  // Load stats on mount and when siteId changes
  useEffect(() => {
    loadStats()

    // Load current site to get wp_author_id
    window.electronAPI.getSite(siteId).then((site) => {
      if (site?.wp_author_id) {
        // We'll resolve the name when authors are loaded
        setSelectedAuthor({ id: site.wp_author_id, name: '' })
      } else {
        setSelectedAuthor(null)
      }
    })
  }, [siteId, loadStats])

  const handleLoadAuthors = useCallback(async () => {
    if (authors) return // already loaded
    try {
      const a = await window.electronAPI.getWpAuthors(siteId)
      setAuthors(a)
      // Resolve selected author name
      if (selectedAuthor) {
        const match = a.find((au) => au.id === selectedAuthor.id)
        if (match) setSelectedAuthor(match)
      }
    } catch {
      setAuthors([])
    }
  }, [siteId, authors, selectedAuthor])

  const handleSelectAuthor = useCallback(async (author: WpAuthor | null) => {
    setSelectedAuthor(author)
    setAuthorPopoverOpen(false)
    const update: SiteUpdate = { id: siteId, wp_author_id: author?.id ?? null }
    await window.electronAPI.updateSite(update)
    loadStats()
  }, [siteId, loadStats])

  if (!stats) return null

  const authorLabel = selectedAuthor?.name || 'All authors'

  return (
    <section className={compact ? 'mb-3' : 'mb-5'}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-muted-foreground">Writing activity</h2>
        <Popover open={authorPopoverOpen} onOpenChange={(open) => { setAuthorPopoverOpen(open); if (open) handleLoadAuthors() }}>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {authorLabel}
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-1">
            <button
              className="flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground"
              onClick={() => handleSelectAuthor(null)}
            >
              All authors
            </button>
            {authors?.map((a) => (
              <button
                key={a.id}
                className="flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground"
                onClick={() => handleSelectAuthor(a)}
              >
                {a.name}
              </button>
            ))}
            {authors === null && (
              <p className="text-xs text-muted-foreground px-2 py-1.5">Loading...</p>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <div className={compact ? 'border rounded-lg p-2' : 'border rounded-lg p-3'}>
        <Sparkline dailyCounts={stats.dailyCounts} compact={compact} />
        <div className={`flex items-center gap-4 ${compact ? 'mt-1.5' : 'mt-2'} text-sm text-muted-foreground`}>
          <span>Today: <strong className="text-foreground">{stats.todayWords.toLocaleString()}</strong> words</span>
          <span>This week: <strong className="text-foreground">{stats.weekWords.toLocaleString()}</strong></span>
          <span>Streak: <strong className="text-foreground">{stats.streak}</strong> {stats.streak === 1 ? 'day' : 'days'}</span>
        </div>
      </div>
    </section>
  )
}
