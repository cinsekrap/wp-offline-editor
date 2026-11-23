import { useLayoutEffect, useRef } from 'react'
import { cn } from '@renderer/lib/utils'

interface PageTitleProps {
  value: string
  onChange: (value: string) => void
  /** Called on Enter — the title is one line of text, so Enter moves into the body. */
  onEnter?: () => void
  placeholder?: string
  className?: string
}

/**
 * The post title, set as part of the page rather than as a form field: the
 * writing typeface, wrapping onto as many lines as it needs, and sized from
 * the editor font size so the two scale together.
 */
export function PageTitle({
  value,
  onChange,
  onEnter,
  placeholder = 'Title',
  className
}: PageTitleProps): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Grow to fit the text; a textarea doesn't do this on its own.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      aria-label="Post title"
      spellCheck
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          onEnter?.()
        }
      }}
      className={cn(
        'block w-full resize-none overflow-hidden bg-transparent outline-none',
        'font-editor font-bold tracking-[-0.015em] leading-[1.15] text-foreground',
        'text-[calc(var(--editor-font-size,18px)*1.9)] text-balance',
        'placeholder:text-muted-foreground/50',
        className
      )}
    />
  )
}
