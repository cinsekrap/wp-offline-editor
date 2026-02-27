import { useState, useEffect } from 'react'
import type { Editor } from '@tiptap/react'

interface WordCountResult {
  words: number
  characters: number
  readingTime: string
}

const WPM = 225

export function useWordCount(editor: Editor | null): WordCountResult {
  const [result, setResult] = useState<WordCountResult>({ words: 0, characters: 0, readingTime: '< 1 min read' })

  useEffect(() => {
    if (!editor) return

    function compute(): void {
      const text = editor!.state.doc.textContent
      const chars = text.length
      const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
      const minutes = Math.max(1, Math.ceil(words / WPM))
      setResult({
        words,
        characters: chars,
        readingTime: `${minutes} min read`
      })
    }

    compute()
    editor.on('update', compute)
    return () => {
      editor.off('update', compute)
    }
  }, [editor])

  return result
}
