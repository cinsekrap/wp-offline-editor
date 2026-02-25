import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'

export function ImageNodeView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const { src, alt, mediaId, caption } = node.attrs
  const [editing, setEditing] = useState(false)
  const captionRef = useRef<HTMLElement>(null)

  // Sync caption text from node attrs when not actively editing (handles undo/redo)
  useEffect(() => {
    if (!editing && captionRef.current) {
      const current = captionRef.current.textContent || ''
      const expected = caption || ''
      if (current !== expected) {
        captionRef.current.textContent = expected
      }
    }
  }, [caption, editing])

  const handleCaptionBlur = useCallback(() => {
    setEditing(false)
    const text = captionRef.current?.textContent?.trim() || ''
    updateAttributes({ caption: text || null })
  }, [updateAttributes])

  const handleCaptionFocus = useCallback(() => {
    setEditing(true)
  }, [])

  const handleCaptionKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        captionRef.current?.blur()
      }
    },
    []
  )

  return (
    <NodeViewWrapper as="figure" className="image-figure" data-drag-handle="">
      <img
        src={src}
        alt={alt || ''}
        data-media-id={mediaId || undefined}
        className={selected ? 'ProseMirror-selectednode' : undefined}
        draggable={false}
      />
      <figcaption
        ref={captionRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Add a caption..."
        onFocus={handleCaptionFocus}
        onBlur={handleCaptionBlur}
        onKeyDown={handleCaptionKeyDown}
      >
        {caption || ''}
      </figcaption>
    </NodeViewWrapper>
  )
}
