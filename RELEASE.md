# Release Checklist

Releases are automated. Bump the version, write the notes, merge to `main` — the
tag, the signed build, and publishing all follow from that. **Don't tag by hand.**

## How the automation fits together

| Workflow | Trigger | What it does |
|---|---|---|
| `auto-tag.yml` | push to `main` touching `package.json` | Creates the matching `vX.Y.Z` tag (no-op if it already exists) |
| `release.yml` | push of a `v*` tag | Gates on typecheck + build + tests, then signs, notarizes, uploads, and publishes |

`auto-tag.yml` tags with `RELEASE_TAG_PAT` rather than `GITHUB_TOKEN`, because tags
created with the workflow token deliberately don't trigger other workflows —
`release.yml` would never fire.

## 1. Bump the version

`package.json` only:

```json
"version": "X.Y.Z"
```

That committed value is what triggers the tag. `release.yml` also sets it from the
tag at build time, so the two can't drift.

The companion plugin version is **not** edited by hand. `release.yml` stamps both
the plugin header `Version:` and the `WPOE_VERSION` constant from the tag while
building, leaving the plugin source in git untouched by app-only releases. This
matters: the plugin's update checker derives the available version from the release
tag, so a shipped header that doesn't match the tag makes WordPress offer an update
that can never complete. Only bump the plugin version in git when you're changing
the plugin itself.

## 2. Write the release notes

**Required to publish.** Create `.github/release-notes/vX.Y.Z.md`:

- **First line** — the release title (becomes the release name; a leading `#` is stripped)
- **Blank line**
- **Body** — user-facing Markdown: what changed for the person using the app, not the internals

Without this file the build still runs and uploads assets, but the release stays an
unpublished draft and the publish step fails loudly.

## 3. Verify locally

```bash
pnpm test
npx tsc --noEmit -p tsconfig.node.json
npx tsc --noEmit -p tsconfig.web.json
pnpm build
```

CI runs all of these again, but failing here saves a round trip. Note that
`pnpm test` rebuilds the native SQLite module for Node and restores the Electron
build afterwards — see `scripts/run-tests.mjs`.

## 4. Commit, open a PR, merge

```bash
git checkout -b release/vX.Y.Z
git add package.json .github/release-notes/vX.Y.Z.md
git commit -m "Release X.Y.Z"
git push -u origin release/vX.Y.Z
gh pr create --base main
```

Merge once CI is green. **The merge is what starts the release** — nothing before it
tags or builds.

## 5. Watch the run

```bash
gh run list --limit 3
gh run watch <run-id> --interval 30
```

Budget roughly 5–10 minutes; Apple notarization dominates.

## 6. Confirm the result

```bash
gh release view vX.Y.Z --json name,isDraft,assets \
  --jq '{name, isDraft, assets: [.assets[].name]}'
```

Expect `isDraft: false` and all six assets: the DMG, its blockmap, the mac ZIP, its
blockmap, `latest-mac.yml`, and `wp-offline-editor-companion.zip`. The workflow
asserts this itself, so a green run means they're all there.

## If the release is left as a draft

Almost always a missing or malformed notes file. Notes are read from `main`'s HEAD
rather than from the tag, so the fix needs no new tag: commit
`.github/release-notes/vX.Y.Z.md` to `main`, then re-run the `build-mac` job and it
will publish.

```bash
gh run rerun <run-id> --job <build-mac-job-id>
```

## Updating your local app (optional)

```bash
npx electron-rebuild
pnpm build
npx electron-builder --mac --dir
cp -R dist/mac-arm64/NP\ Presspad.app /Applications/
```

## Known issues

- **Duplicate drafts.** electron-builder can create two draft releases for one
  tag and split the assets between them (hit in v1.1.6, v1.1.7). This is a race
  in electron-builder, not something we cause, and **every** v26 release has it —
  see the note below. The *Consolidate duplicate draft releases* step folds the
  drafts together, and *Verify release assets are complete* then fails the job if
  any of the six expected assets is missing. That pair is what actually protects
  a release; it works regardless of which electron-builder version we run.
- **Hand-tagging.** If you ever bypass `auto-tag.yml`, push the commit to `main`
  before the tag — otherwise the workflow checks out the wrong code.

## Held-back dependencies

These are deliberate. Re-check them, don't just bump them.

- **`electron-builder` pinned at `26.8.1`** (exact, no caret).

  **The original reason for this pin was wrong.** The pin was taken after the
  duplicate drafts in v1.1.6/v1.1.7, on the belief that 26.15.3 had introduced
  the bug and 26.8.1 was safe. It hadn't, and it isn't. Upstream
  [#10026](https://github.com/electron-userland/electron-builder/issues/10026)
  traced the cause to `PublishManager.getOrCreatePublisher()`, which `await`s
  `createPublisher()` *before* writing to its cache — so concurrent artifact
  uploads all see an empty cache, each builds its own `GitHubPublisher`, and each
  creates its own draft. The compiled `getOrCreatePublisher` is byte-identical in
  26.8.1 and 26.15.3. The race predates both (first reported in
  [#6676](https://github.com/electron-userland/electron-builder/issues/6676), 2022).
  It went quiet after the revert by luck, not because of it — it's a race, so it
  fires intermittently.

  So this pin buys us nothing against duplicate drafts. The consolidate + verify
  steps in `release.yml` are the real protection.

  The fix, [#10028](https://github.com/electron-userland/electron-builder/pull/10028),
  merged to `master` on 2026-07-22 — the v27 line. It shipped in
  `27.0.0-alpha.6` and is **not in any released v26**: latest is `26.15.7`, cut
  2026-07-18, four days before the merge, and no backport onto `release/v26` has
  landed or been opened. Don't wait for it; nothing is scheduled.

  **The pin now only survives because unpinning needs testing, not because of the
  draft bug.** 26.8.1 → 26.15.7 is seven releases of change to the macOS artifact
  pipeline: blockmap and icon generation rewritten from `app-builder-bin` into
  TypeScript (26.14.0), the macOS zip target switched to native `zip` to preserve
  `.framework` symlinks (26.15.2), mac signing behaviour changes (26.15.0),
  `MacPackager` refactored (26.12.1), dmg toolset decoupled from Homebrew
  (26.11.0). Blockmaps and the zip are exactly what `electron-updater` consumes,
  so a green `pnpm test` proves nothing here.

  **To unpin** (worth doing — 26.15.2 in particular looks like a fix we want): do
  it early in a cycle, never the week of a release. Take `^26.15.7`, run a real
  signed build, and test an actual update from the previously published version,
  not just that the build succeeds.
- **`@vitejs/plugin-react` held at `5.x`.** Version `6.x` requires `vite ^8`, and
  `electron-vite@5.0.0` — the latest stable — peers `vite ^5 || ^6 || ^7`. Only
  `electron-vite@6.0.0-beta.1` supports Vite 8. This is a whole-toolchain move
  (Vite 8 + an electron-vite beta), not a plugin bump. Revisit when
  electron-vite 6 is stable.
