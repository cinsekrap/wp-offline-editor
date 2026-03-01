import { getDb } from './database'
import { getSiteById } from './site-service'
import type { WritingStats, DailyWordCount } from '@shared/types'

export function getWritingStats(siteId: string): WritingStats {
  const db = getDb()
  const site = getSiteById(siteId)

  const today = new Date()
  const todayStr = toDateStr(today)

  // Monday of this week
  const monday = new Date(today)
  const day = monday.getDay()
  const diff = day === 0 ? 6 : day - 1
  monday.setDate(monday.getDate() - diff)
  const mondayStr = toDateStr(monday)

  // 30 days ago
  const thirtyAgo = new Date(today)
  thirtyAgo.setDate(thirtyAgo.getDate() - 29)
  const thirtyAgoStr = toDateStr(thirtyAgo)

  // Build author filter
  const authorFilter = site?.wp_author_id
    ? ' AND post_id IN (SELECT id FROM posts WHERE author_id = ?)'
    : ''
  const authorParam = site?.wp_author_id ? [site.wp_author_id] : []

  // Today's words: sum of max word count per post for today
  const todayRow = db.prepare(`
    SELECT COALESCE(SUM(word_count), 0) AS total
    FROM writing_snapshots
    WHERE site_id = ? AND date = ?${authorFilter}
  `).get(siteId, todayStr, ...authorParam) as { total: number }
  const todayWords = todayRow.total

  // Week's words: sum of max word count per post for this week
  const weekRow = db.prepare(`
    SELECT COALESCE(SUM(max_wc), 0) AS total
    FROM (
      SELECT MAX(word_count) AS max_wc
      FROM writing_snapshots
      WHERE site_id = ? AND date >= ?${authorFilter}
      GROUP BY post_id
    )
  `).get(siteId, mondayStr, ...authorParam) as { total: number }
  const weekWords = weekRow.total

  // Daily counts for last 30 days
  const dailyRows = db.prepare(`
    SELECT date, SUM(word_count) AS total
    FROM writing_snapshots
    WHERE site_id = ? AND date >= ?${authorFilter}
    GROUP BY date
    ORDER BY date ASC
  `).all(siteId, thirtyAgoStr, ...authorParam) as { date: string; total: number }[]

  const dailyMap = new Map(dailyRows.map((r) => [r.date, r.total]))
  const dailyCounts: DailyWordCount[] = []
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyAgo)
    d.setDate(d.getDate() + i)
    const ds = toDateStr(d)
    dailyCounts.push({ date: ds, wordCount: dailyMap.get(ds) ?? 0 })
  }

  // Streak: consecutive days with any snapshot walking back from today
  const allDates = db.prepare(`
    SELECT DISTINCT date FROM writing_snapshots
    WHERE site_id = ? AND word_count > 0${authorFilter}
    ORDER BY date DESC
  `).all(siteId, ...authorParam) as { date: string }[]

  const dateSet = new Set(allDates.map((r) => r.date))
  let streak = 0
  const cursor = new Date(today)
  while (true) {
    if (dateSet.has(toDateStr(cursor))) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }

  return { todayWords, weekWords, streak, dailyCounts }
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
