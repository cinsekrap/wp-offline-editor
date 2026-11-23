import { useState } from 'react'
import type { Site } from '@shared/types'
import { cn } from '@renderer/lib/utils'
import { siteColor, siteSwatch } from '@renderer/lib/site-colors'

/**
 * The site's WordPress icon when it has one, otherwise its initial on the site
 * colour. Size comes from className (defaults to 24px).
 */
export function SiteAvatar({ site, className }: { site: Site; className?: string }): JSX.Element {
  const [error, setError] = useState(false)
  const letter = (site.label || site.url)[0]?.toUpperCase() || '?'

  if (site.site_icon_url && !error) {
    return (
      <img
        src={`media://file${site.site_icon_url}`}
        alt=""
        className={cn('size-6 rounded-md object-contain shrink-0 bg-muted', className)}
        onError={() => setError(true)}
      />
    )
  }

  const swatch = siteSwatch(siteColor(site))
  return (
    <span
      aria-hidden
      style={swatch.style}
      className={cn(
        'size-6 rounded-md flex items-center justify-center text-[11px] font-semibold shrink-0',
        swatch.className,
        className
      )}
    >
      {letter}
    </span>
  )
}
