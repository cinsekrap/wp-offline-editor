import type { ReactNode } from 'react'
import type { Post } from '@shared/types'
import { cn } from '@renderer/lib/utils'
import { postSnippet } from '@renderer/lib/post-text'
import { StatusMark } from './StatusMark'

interface PostCardProps {
  post: Post
  imageUrl?: string
  /** Right-hand meta (date, category…) after the status */
  meta?: ReactNode
  onClick: () => void
  selected?: boolean
  /** Leading control, e.g. a checkbox in select mode */
  leading?: ReactNode
  /** Keep the image band even without an image, so cards in a grid line up */
  uniform?: boolean
  className?: string
}

/**
 * A post as a card: featured image when it has one, the title and opening in
 * the writing face, and one line of status and meta.
 */
export function PostCard({
  post,
  imageUrl,
  meta,
  onClick,
  selected,
  leading,
  uniform = true,
  className
}: PostCardProps): JSX.Element {
  const snippet = postSnippet(post, 160)
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-[border-color,box-shadow]',
        'hover:border-foreground/15 hover:shadow-[0_6px_20px_-12px_hsl(var(--foreground)/0.35)]',
        selected && 'ring-2 ring-primary/60 border-primary/40',
        className
      )}
    >
      {imageUrl ? (
        <div className="h-24 w-full shrink-0 overflow-hidden bg-muted">
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      ) : (
        uniform && (
          // No featured image: the title's initial, set like a drop cap
          <div
            aria-hidden
            className="relative h-24 w-full shrink-0 overflow-hidden bg-[linear-gradient(135deg,hsl(var(--primary)/0.10),hsl(var(--primary)/0.03))]"
          >
            <span className="absolute -bottom-6 right-3 font-editor text-[96px] font-semibold leading-none text-primary/15 select-none">
              {(post.title || 'U').trim()[0]?.toUpperCase()}
            </span>
          </div>
        )
      )}
      <div className="flex flex-1 flex-col gap-1.5 px-3.5 pt-3 pb-3">
        <div className="flex items-start gap-2">
          {leading}
          <p className="font-editor text-[15.5px] font-semibold leading-snug line-clamp-2 text-foreground">
            {post.title || 'Untitled'}
          </p>
        </div>
        {snippet && (
          <p className="font-editor text-[12.5px] leading-relaxed text-foreground/65 line-clamp-2">{snippet}</p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-1 min-w-0 text-[11.5px] text-muted-foreground">
          <StatusMark
            status={post.status}
            synced={post.synced}
            conflict={post.conflict}
            hasRemote={post.wp_id != null}
          />
          {meta && <span className="truncate">{meta}</span>}
        </div>
      </div>
    </button>
  )
}
