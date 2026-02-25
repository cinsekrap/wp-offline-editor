import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageNodeView } from '@renderer/components/editor/ImageNodeView'

export const MediaImage = Image.extend({
  name: 'image',

  addAttributes() {
    const imgFromFigure = (el: HTMLElement): HTMLImageElement | null =>
      el.tagName === 'FIGURE' ? el.querySelector('img') : null

    return {
      ...this.parent?.(),
      // Override base attrs so they resolve through <figure> → <img>
      src: {
        default: null,
        parseHTML: (el: HTMLElement) => imgFromFigure(el)?.getAttribute('src') ?? el.getAttribute('src'),
      },
      alt: {
        default: null,
        parseHTML: (el: HTMLElement) => imgFromFigure(el)?.getAttribute('alt') ?? el.getAttribute('alt'),
      },
      title: {
        default: null,
        parseHTML: (el: HTMLElement) => imgFromFigure(el)?.getAttribute('title') ?? el.getAttribute('title'),
      },
      mediaId: {
        default: null,
        parseHTML: (el: HTMLElement) => (imgFromFigure(el) ?? el).getAttribute('data-media-id'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.mediaId) return {}
          return { 'data-media-id': attributes.mediaId }
        }
      },
      caption: {
        default: null,
        parseHTML: (el: HTMLElement) => el.querySelector?.('figcaption')?.textContent?.trim() || null,
        renderHTML: () => ({}) // caption is rendered structurally, not as an attribute
      }
    }
  },

  parseHTML() {
    return [
      {
        // Match <figure> wrapping an <img> (WordPress format)
        tag: 'figure',
        getAttrs: (node: HTMLElement) => {
          const img = node.querySelector('img')
          if (!img) return false
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            title: img.getAttribute('title'),
            mediaId: img.getAttribute('data-media-id'),
            caption: node.querySelector('figcaption')?.textContent?.trim() || null
          }
        }
      },
      {
        // Bare <img> — existing behavior
        tag: 'img[src]:not([src^="data:"])'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { caption, ...imgAttrs } = HTMLAttributes
    const mergedImgAttrs = { ...this.options.HTMLAttributes, ...imgAttrs }

    if (caption) {
      return [
        'figure',
        { class: 'wp-block-image' },
        ['img', mergedImgAttrs],
        ['figcaption', {}, caption]
      ]
    }
    return ['img', mergedImgAttrs]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  }
})
