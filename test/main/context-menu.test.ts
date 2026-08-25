import { describe, it, expect, vi } from 'vitest'
import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'
import {
  buildContextMenuTemplate,
  type ClipboardWriter,
  type SpellCheckTarget
} from '../../src/main/context-menu'

function makeParams(overrides: Partial<ContextMenuParams> = {}): ContextMenuParams {
  return {
    isEditable: true,
    linkURL: '',
    misspelledWord: '',
    dictionarySuggestions: [],
    editFlags: {
      canCut: true,
      canCopy: true,
      canPaste: true,
      canSelectAll: true,
      canDelete: true,
      canUndo: true,
      canRedo: true,
      canEditRichly: true
    },
    ...overrides
  } as ContextMenuParams
}

function makeContents(): SpellCheckTarget & {
  replaceMisspelling: ReturnType<typeof vi.fn>
  session: { addWordToSpellCheckerDictionary: ReturnType<typeof vi.fn> }
} {
  return {
    replaceMisspelling: vi.fn(),
    session: { addWordToSpellCheckerDictionary: vi.fn(() => true) }
  }
}

function makeClipboard(): ClipboardWriter & { writeText: ReturnType<typeof vi.fn> } {
  return { writeText: vi.fn() }
}

/** Most cases don't care about the clipboard; supply a throwaway stub. */
function build(
  params: ContextMenuParams,
  contents: SpellCheckTarget = makeContents(),
  clipboard: ClipboardWriter = makeClipboard()
): MenuItemConstructorOptions[] {
  return buildContextMenuTemplate(params, contents, clipboard)
}

const labels = (t: MenuItemConstructorOptions[]): (string | undefined)[] =>
  t.map((item) => (item.type === 'separator' ? '---' : (item.label ?? (item.role as string))))

/** Invoke a template item's click handler with the arguments Electron passes. */
function click(item: MenuItemConstructorOptions): void {
  ;(item.click as unknown as () => void)()
}

describe('buildContextMenuTemplate', () => {
  describe('spelling suggestions', () => {
    it('offers each suggestion for a misspelled word', () => {
      const template = build(
        makeParams({ misspelledWord: 'teh', dictionarySuggestions: ['the', 'ten'] }),
        makeContents()
      )

      expect(labels(template).slice(0, 2)).toEqual(['the', 'ten'])
    })

    it('replaces the misspelling when a suggestion is clicked', () => {
      const contents = makeContents()
      const template = build(
        makeParams({ misspelledWord: 'teh', dictionarySuggestions: ['the', 'ten'] }),
        contents
      )

      click(template[1])

      expect(contents.replaceMisspelling).toHaveBeenCalledWith('ten')
    })

    it('caps the suggestion list so it cannot crowd out the editing commands', () => {
      const suggestions = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      const template = build(
        makeParams({ misspelledWord: 'x', dictionarySuggestions: suggestions }),
        makeContents()
      )

      expect(labels(template).slice(0, 5)).toEqual(['a', 'b', 'c', 'd', 'e'])
      expect(labels(template)).not.toContain('f')
    })

    it('says so when Chromium flags a word but has no guesses', () => {
      const template = build(
        makeParams({ misspelledWord: 'qwertyx', dictionarySuggestions: [] }),
        makeContents()
      )

      expect(template[0]).toMatchObject({ label: 'No Guesses Found', enabled: false })
    })

    it('adds the word to the dictionary on request', () => {
      const contents = makeContents()
      const template = build(
        makeParams({ misspelledWord: 'presspad', dictionarySuggestions: ['pressed'] }),
        contents
      )

      click(template.find((item) => item.label === 'Add to Dictionary')!)

      expect(contents.session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith('presspad')
    })

    it('omits the spelling group when nothing is misspelled', () => {
      const template = build(makeParams())

      expect(labels(template)).toEqual([
        'cut',
        'copy',
        'paste',
        'pasteAndMatchStyle',
        'selectAll'
      ])
    })

    it('ignores a misspelling reported on non-editable text', () => {
      const template = build(
        makeParams({
          isEditable: false,
          misspelledWord: 'teh',
          dictionarySuggestions: ['the']
        }),
        makeContents()
      )

      expect(labels(template)).not.toContain('the')
    })
  })

  describe('editing commands', () => {
    it('mirrors Chromium edit flags onto the items', () => {
      const template = build(
        makeParams({
          editFlags: {
            canCut: false,
            canCopy: false,
            canPaste: true,
            canSelectAll: true
          } as ContextMenuParams['editFlags']
        }),
        makeContents()
      )

      expect(template).toMatchObject([
        { role: 'cut', enabled: false },
        { role: 'copy', enabled: false },
        { role: 'paste', enabled: true },
        { role: 'selectAll', enabled: true }
      ])
    })

    it('offers only Copy on read-only text with a selection', () => {
      const template = build(
        makeParams({ isEditable: false }),
        makeContents()
      )

      expect(labels(template)).toEqual(['copy'])
    })

    it('returns an empty template when there is nothing to offer', () => {
      const template = build(
        makeParams({
          isEditable: false,
          editFlags: { canCopy: false } as ContextMenuParams['editFlags']
        }),
        makeContents()
      )

      expect(template).toEqual([])
    })
  })

  describe('links', () => {
    it('offers Copy Link on a link', () => {
      const template = build(makeParams({ linkURL: 'https://example.com/post' }))

      expect(labels(template)).toContain('Copy Link')
    })

    it('writes the link target to the clipboard', () => {
      const clipboard = makeClipboard()
      const template = build(
        makeParams({ linkURL: 'https://example.com/post' }),
        makeContents(),
        clipboard
      )

      click(template.find((item) => item.label === 'Copy Link')!)

      expect(clipboard.writeText).toHaveBeenCalledWith('https://example.com/post')
    })

    it('offers Copy Link on read-only text too', () => {
      const template = build(
        makeParams({ isEditable: false, linkURL: 'https://example.com', editFlags: {
          canCopy: false
        } as ContextMenuParams['editFlags'] })
      )

      expect(labels(template)).toEqual(['Copy Link'])
    })

    it('omits Copy Link when the click was not on a link', () => {
      const template = build(makeParams())

      expect(labels(template)).not.toContain('Copy Link')
    })

    it('sits between the spelling and editing groups', () => {
      const template = build(
        makeParams({
          linkURL: 'https://example.com',
          misspelledWord: 'teh',
          dictionarySuggestions: ['the']
        })
      )

      expect(labels(template)).toEqual([
        'the',
        'Add to Dictionary',
        '---',
        'Copy Link',
        '---',
        'cut',
        'copy',
        'paste',
        'pasteAndMatchStyle',
        'selectAll'
      ])
    })
  })

  describe('paste and match style', () => {
    it('is dropped where rich formatting cannot exist', () => {
      const template = build(
        makeParams({
          editFlags: {
            canCut: true,
            canCopy: true,
            canPaste: true,
            canSelectAll: true,
            canEditRichly: false
          } as ContextMenuParams['editFlags']
        })
      )

      expect(labels(template)).not.toContain('pasteAndMatchStyle')
    })

    it('follows canPaste like the plain Paste item', () => {
      const template = build(
        makeParams({
          editFlags: {
            canPaste: false,
            canEditRichly: true
          } as ContextMenuParams['editFlags']
        })
      )

      expect(template.find((item) => item.role === 'pasteAndMatchStyle')).toMatchObject({
        enabled: false
      })
    })
  })

  describe('separators', () => {
    it('divides the spelling and editing groups exactly once', () => {
      const template = build(
        makeParams({ misspelledWord: 'teh', dictionarySuggestions: ['the'] }),
        makeContents()
      )

      expect(labels(template)).toEqual([
        'the',
        'Add to Dictionary',
        '---',
        'cut',
        'copy',
        'paste',
        'pasteAndMatchStyle',
        'selectAll'
      ])
    })

    it('never leads or trails with a separator', () => {
      const cases = [
        makeParams(),
        makeParams({ misspelledWord: 'teh', dictionarySuggestions: ['the'] }),
        makeParams({ isEditable: false }),
        makeParams({ linkURL: 'https://example.com' })
      ]

      for (const params of cases) {
        const template = build(params)
        expect(template.at(0)?.type).not.toBe('separator')
        expect(template.at(-1)?.type).not.toBe('separator')
      }
    })
  })
})
