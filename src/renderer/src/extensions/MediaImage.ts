import Image from '@tiptap/extension-image'

export const MediaImage = Image.extend({
  name: 'image',

  addAttributes() {
    return {
      ...this.parent?.(),
      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-media-id'),
        renderHTML: (attributes) => {
          if (!attributes.mediaId) return {}
          return { 'data-media-id': attributes.mediaId }
        }
      }
    }
  }
})
