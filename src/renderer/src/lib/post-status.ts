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

export const STATUS_COLORS: Record<string, string> = {
  publish:
    'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-900',
  draft:
    'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-400 dark:border-yellow-900',
  pending:
    'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-900',
  private:
    'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-900',
  future:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-900',
  trash:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900'
}

/** Dashboard "Unsynced" pseudo-status pill (not a WP status). */
export const UNSYNCED_PILL_COLOR =
  'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-900'

/** Statuses offered in list filters — every user-facing status except trash. */
export const FILTER_STATUSES: { value: PostStatus; label: string }[] = [
  { value: 'draft', label: STATUS_LABELS.draft },
  { value: 'pending', label: STATUS_LABELS.pending },
  { value: 'publish', label: STATUS_LABELS.publish },
  { value: 'future', label: STATUS_LABELS.future },
  { value: 'private', label: STATUS_LABELS.private }
]
