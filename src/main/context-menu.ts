/**
 * Right-click menu for editable text.
 *
 * Chromium's spellchecker is on by default (`webPreferences.spellcheck`), so it
 * underlines misspellings on its own — but Electron ships no default context
 * menu, and the suggestions it computes are only ever delivered as
 * `ContextMenuParams.dictionarySuggestions`. Without a handler the underlines
 * are decorative: there is no way to reach a correction, and no cut/copy/paste
 * either.
 *
 * The template is built as data (roles, and click handlers bound to injected
 * collaborators) so it stays free of runtime Electron imports and can be tested
 * against stubs. `Menu.buildFromTemplate` lives at the call site.
 */

import type { ContextMenuParams, MenuItemConstructorOptions, WebContents } from 'electron'

/**
 * macOS's own text context menu shows a handful of guesses before it starts
 * crowding out the editing commands below it; Chromium rarely returns more.
 */
const MAX_SUGGESTIONS = 5

/** The slice of WebContents the menu drives — kept narrow so tests can stub it. */
export type SpellCheckTarget = Pick<WebContents, 'replaceMisspelling'> & {
  session: Pick<WebContents['session'], 'addWordToSpellCheckerDictionary'>
}

/** There is no `copyLinkAddress` menu role, so Copy Link writes it out itself. */
export type ClipboardWriter = { writeText: (text: string) => void }

/** Spelling suggestions for the word under the cursor, plus "Add to Dictionary". */
function spellingGroup(
  params: ContextMenuParams,
  contents: SpellCheckTarget
): MenuItemConstructorOptions[] {
  // A misspelled word is only reported for editable text, but guard anyway:
  // replaceMisspelling on a read-only node would silently do nothing.
  if (!params.isEditable || !params.misspelledWord) return []

  const suggestions = params.dictionarySuggestions.slice(0, MAX_SUGGESTIONS)

  const items: MenuItemConstructorOptions[] =
    suggestions.length > 0
      ? suggestions.map((suggestion) => ({
          label: suggestion,
          click: (): void => contents.replaceMisspelling(suggestion)
        }))
      : // Chromium flagged the word but had nothing to offer. Say so rather than
        // opening a menu whose spelling half is empty for no visible reason.
        [{ label: 'No Guesses Found', enabled: false }]

  items.push({
    label: 'Add to Dictionary',
    click: (): void => {
      contents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
    }
  })

  return items
}

/** Copy the target of a link, whether or not the surrounding text is editable. */
function linkGroup(
  params: ContextMenuParams,
  clipboard: ClipboardWriter
): MenuItemConstructorOptions[] {
  if (!params.linkURL) return []

  return [
    {
      label: 'Copy Link',
      click: (): void => clipboard.writeText(params.linkURL)
    }
  ]
}

/** Standard editing commands, enabled per Chromium's own edit flags. */
function editingGroup(params: ContextMenuParams): MenuItemConstructorOptions[] {
  const { editFlags } = params

  // Read-only text still gets Copy when there is a selection; anything else
  // would be inert, so the menu stays closed instead.
  if (!params.isEditable) {
    return editFlags.canCopy ? [{ role: 'copy' }] : []
  }

  return [
    { role: 'cut', enabled: editFlags.canCut },
    { role: 'copy', enabled: editFlags.canCopy },
    { role: 'paste', enabled: editFlags.canPaste },
    // Stripping formatting is only meaningful where formatting can exist — in a
    // plain input Chromium reports canEditRichly false and the item is dropped.
    ...(editFlags.canEditRichly
      ? [{ role: 'pasteAndMatchStyle', enabled: editFlags.canPaste } as MenuItemConstructorOptions]
      : []),
    { role: 'selectAll', enabled: editFlags.canSelectAll }
  ]
}

/**
 * Build the context menu for a right-click. Returns an empty template when
 * there is nothing useful to offer — the caller should then show no menu at
 * all rather than an empty one.
 */
export function buildContextMenuTemplate(
  params: ContextMenuParams,
  contents: SpellCheckTarget,
  clipboard: ClipboardWriter
): MenuItemConstructorOptions[] {
  const groups = [
    spellingGroup(params, contents),
    linkGroup(params, clipboard),
    editingGroup(params)
  ].filter((group) => group.length > 0)

  // Separators only ever sit *between* groups, so a missing group can't leave a
  // stray divider at the top or bottom of the menu.
  return groups.flatMap((group, index) =>
    index === 0 ? group : [{ type: 'separator' } as MenuItemConstructorOptions, ...group]
  )
}
