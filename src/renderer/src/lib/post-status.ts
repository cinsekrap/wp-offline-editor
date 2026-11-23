import type { PostStatus } from '@shared/types'

/** Single source of truth for post status pills across the app. */
export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  publish: 'Published',
  pending: 'Pending',
  private: 'Private',
  future: 'Scheduled',
  trash: 'Trash'
}

/**
 * Each status has its own shape as well as its own hue, so the marks read
 * without colour: hollow (draft), half (pending), ringed (scheduled), solid
 * (published), square (private), diamond (trash). Rendered by StatusGlyph.
 */
export const STATUS_GLYPH: Record<string, string> = {
  draft: 'rounded-full border-[1.5px] border-status-draft',
  pending:
    'rounded-full border-[1.5px] border-status-pending bg-[linear-gradient(90deg,hsl(var(--status-pending))_50%,transparent_50%)]',
  future:
    'rounded-full border-[1.5px] border-status-scheduled bg-[radial-gradient(circle,hsl(var(--status-scheduled))_32%,transparent_36%)]',
  publish: 'rounded-full bg-status-published',
  private: 'rounded-[2px] bg-status-private',
  trash: 'rotate-45 rounded-[1px] bg-status-trash'
}

/** Statuses offered in list filters — every user-facing status except trash. */
export const FILTER_STATUSES: { value: PostStatus; label: string }[] = [
  { value: 'draft', label: STATUS_LABELS.draft },
  { value: 'pending', label: STATUS_LABELS.pending },
  { value: 'publish', label: STATUS_LABELS.publish },
  { value: 'future', label: STATUS_LABELS.future },
  { value: 'private', label: STATUS_LABELS.private }
]
