import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@renderer/components/ui/popover'
import type { WritingStats as WritingStatsType, WpAuthor, SiteUpdate } from '@shared/types'

interface WritingStatsProps {
  siteId: string
  compact?: boolean
  chartMode?: 'daily' | 'weekly'
}

function formatDay(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

type ChartMode = 'daily' | 'weekly'

interface ChartPoint {
  date: string
  wordCount: number
}

/** Aggregate daily counts into Monday-start calendar weeks. */
function aggregateWeeks(days: ChartPoint[]): ChartPoint[] {
  const map = new Map<string, number>()
  for (const d of days) {
    const dt = new Date(d.date)
    const dow = dt.getDay()
    dt.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1))
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    map.set(key, (map.get(key) ?? 0) + d.wordCount)
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, wordCount]) => ({ date, wordCount }))
}

/** Word counts as bars: today (or this week) in the site colour, empty days as stubs. */
function Bars({
  series,
  pointLabel,
  startLabel,
  centerLabel,
  endLabel
}: {
  series: ChartPoint[]
  pointLabel: (date: string) => string
  startLabel: string
  centerLabel: string
  endLabel: string
}): JSX.Element {
  const max = Math.max(...series.map((d) => d.wordCount), 1)
  return (
    <div className="min-w-0">
      <div className="flex h-14 items-end gap-[3px]">
        {series.map((d, i) => {
          const last = i === series.length - 1
          const h = d.wordCount === 0 ? 3 : Math.max(4, Math.round((d.wordCount / max) * 56))
          return (
            <span
              key={d.date}
              title={`${pointLabel(d.date)}: ${d.wordCount.toLocaleString()} words`}
              style={{ height: h }}
              className={
                'flex-1 rounded-t-[2px] ' +
                (last ? 'bg-primary' : d.wordCount === 0 ? 'bg-border' : 'bg-primary/30 hover:bg-primary/50')
              }
            />
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-muted-foreground">
        <span>{startLabel}</span>
        <span>{centerLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  )
}

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function WritingStats({ siteId, compact, chartMode = 'daily' }: WritingStatsProps): JSX.Element | null {
  const [stats, setStats] = useState<WritingStatsType | null>(null)
  const [authors, setAuthors] = useState<WpAuthor[] | null>(null)
  const [selectedAuthor, setSelectedAuthor] = useState<{ id: number; name: string } | null>(null)
  const [authorPopoverOpen, setAuthorPopoverOpen] = useState(false)

  const loadStats = useCallback(async () => {
    try {
      const s = await window.electronAPI.getWritingStats(siteId)
      setStats(s)
    } catch (err) {
      console.error('[WritingStats] Failed to load stats:', err)
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

  const series = useMemo(() => {
    if (!stats) return []
    return chartMode === 'weekly'
      ? aggregateWeeks(stats.dailyCounts)
      : stats.dailyCounts.slice(-30)
  }, [stats, chartMode])

  if (!stats) return null

  const authorLabel = selectedAuthor?.name || 'All authors'
  const lastWeek = stats.dailyCounts.slice(-7)

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13px] font-semibold">Writing</h2>
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

      <div
        className={`grid items-end gap-x-7 gap-y-4 rounded-xl border bg-card px-5 grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_auto] ${compact ? 'py-3' : 'py-4'}`}
      >
        <div>
          <p className="text-[32px] font-semibold leading-none tracking-tight tabular-nums">
            {stats.todayWords.toLocaleString()}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            words today · <strong className="font-semibold text-foreground">{stats.weekWords.toLocaleString()}</strong> this week
          </p>
        </div>
        <Bars
          series={series}
          pointLabel={(date) => (chartMode === 'weekly' ? `Week of ${formatDay(date)}` : formatDay(date))}
          startLabel={series[0] ? formatDay(series[0].date) : ''}
          centerLabel={chartMode === 'weekly' ? 'Last 12 weeks' : 'Last 30 days'}
          endLabel={chartMode === 'weekly' ? 'This week' : 'Today'}
        />
        <div className="hidden lg:block">
          <div className="flex gap-1.5">
            {lastWeek.map((d, i) => {
              const today = i === lastWeek.length - 1
              const wrote = d.wordCount > 0
              return (
                <span
                  key={d.date}
                  title={`${formatDay(d.date)}: ${d.wordCount.toLocaleString()} words`}
                  className={
                    'size-[22px] rounded-full grid place-items-center text-[10px] font-semibold ' +
                    (today && wrote
                      ? 'bg-primary text-primary-foreground'
                      : wrote
                        ? 'bg-primary/15 text-primary'
                        : today
                          ? 'border border-dashed border-primary/50 text-primary'
                          : 'bg-muted text-muted-foreground')
                  }
                >
                  {DAY_INITIALS[new Date(d.date).getDay()]}
                </span>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {stats.streak > 0 ? (
              <>
                <strong className="font-semibold text-foreground">{stats.streak}-day</strong> writing streak
              </>
            ) : (
              'Write today to start a streak'
            )}
          </p>
        </div>
      </div>
    </section>
  )
}
