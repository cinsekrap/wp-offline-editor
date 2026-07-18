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

function Sparkline({
  series,
  compact,
  centerLabel,
  endLabel,
  pointLabel,
  futureSlots
}: {
  series: ChartPoint[]
  compact?: boolean
  centerLabel: string
  endLabel: string
  pointLabel: (date: string) => string
  futureSlots: number
}): JSX.Element {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const height = compact ? 36 : 56
  if (series.length === 0) return <div style={{ height }} />
  const pad = 4
  const n = series.length
  const max = Math.max(...series.map((d) => d.wordCount), 1)

  // Runway after the last point so the line doesn't end hard against the
  // right edge
  const slots = n + futureSlots

  // x in viewBox percent (stretched to container), y in fixed pixels
  const points = series.map((d, i) => ({
    x: slots > 1 ? (i / (slots - 1)) * 100 : 50,
    y: pad + (1 - d.wordCount / max) * (height - pad * 2)
  }))
  const todayX = points[n - 1].x

  // Catmull-Rom smoothing, control points clamped to the plot band so
  // spikes never overshoot below the baseline
  const clampY = (y: number): number => Math.min(height - pad, Math.max(pad, y))
  let linePath = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = clampY(p1.y + (p2.y - p0.y) / 6)
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = clampY(p2.y - (p3.y - p1.y) / 6)
    linePath += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }

  const hover = hoverIdx != null ? { point: points[hoverIdx], day: series[hoverIdx] } : null

  return (
    <div>
      <div
        className="relative"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const idx = Math.round(((e.clientX - rect.left) / rect.width) * (slots - 1))
          setHoverIdx(Math.min(n - 1, Math.max(0, idx)))
        }}
      >
        <svg
          viewBox={`0 0 100 ${height}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          className="block"
        >
          {/* Baseline */}
          <line
            x1={0}
            x2={100}
            y1={height - pad}
            y2={height - pad}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {/* The ECG line */}
          <path
            d={linePath}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {hover && (
          <>
            {/* Crosshair */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-border"
              style={{ left: `${hover.point.x}%` }}
            />
            {/* Marker dot with surface ring */}
            <div
              className="pointer-events-none absolute h-2 w-2 rounded-full bg-primary ring-2 ring-background"
              style={{
                left: `calc(${hover.point.x}% - 4px)`,
                top: hover.point.y - 4
              }}
            />
            {/* Tooltip */}
            <div
              className="pointer-events-none absolute -top-1 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-popover text-popover-foreground shadow-md px-2 py-1 text-[11px] z-10"
              style={{ left: `${Math.min(88, Math.max(12, hover.point.x))}%` }}
            >
              {pointLabel(hover.day.date)} &middot;{' '}
              <strong>{hover.day.wordCount.toLocaleString()}</strong> words
            </div>
          </>
        )}
      </div>

      {/* Time axis: label the window; the end label sits under the line's end */}
      <div className="relative mt-1 h-4 text-[10px] text-muted-foreground/70">
        <span className="absolute left-0">{formatDay(series[0].date)}</span>
        <span className="absolute left-1/2 -translate-x-1/2">{centerLabel}</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${todayX}%` }}>
          {endLabel}
        </span>
      </div>
    </div>
  )
}

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
        <Sparkline
          series={series}
          compact={compact}
          centerLabel={chartMode === 'weekly' ? 'Last 12 weeks' : 'Last 30 days'}
          endLabel={chartMode === 'weekly' ? 'This week' : 'Today'}
          pointLabel={(date) => (chartMode === 'weekly' ? `Week of ${formatDay(date)}` : formatDay(date))}
          futureSlots={chartMode === 'weekly' ? 1 : 3}
        />
        <div className={`flex items-center gap-4 ${compact ? 'mt-1.5' : 'mt-2'} text-sm text-muted-foreground`}>
          <span>Today: <strong className="text-foreground">{stats.todayWords.toLocaleString()}</strong> words</span>
          <span>This week: <strong className="text-foreground">{stats.weekWords.toLocaleString()}</strong></span>
          <span>Streak: <strong className="text-foreground">{stats.streak}</strong> {stats.streak === 1 ? 'day' : 'days'}</span>
        </div>
      </div>
    </section>
  )
}
