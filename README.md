# NP Presspad

A macOS desktop app for writing and managing WordPress posts offline. Edit posts locally with a rich text editor, sync when you're ready, and never lose work to a flaky connection.

## Features

- **Offline-first editing** — Write and edit posts without an internet connection. Changes sync to WordPress when you're back online.
- **Rich text editor** — TipTap-based editor with tables, code blocks (syntax highlighted), images, and focus mode.
- **Multi-site support** — Connect multiple WordPress sites. Duplicate posts across sites.
- **Full-text search** — Instantly find posts by title, content, or excerpt.
- **Revision history** — Automatic snapshots of your edits with word-level diffs and one-click restore.
- **Bulk operations** — Multi-select posts to change status or delete in batch.
- **ACF support** — Edit Advanced Custom Fields data alongside post content via the companion plugin.
- **Scratchpads** — Linked notes per post with a pop-out editor window.
- **Media handling** — Drag-and-drop images, local media queue, automatic upload to WordPress on sync.
- **Conflict resolution** — Detects remote changes and offers keep-mine, keep-theirs, or fork strategies.
- **Templates** — Reusable post templates with category/tag presets.
- **Writing stats** — Daily word counts, streaks, and a 30-day sparkline on your dashboard.
- **Markdown import/export** — Bring content in and out as Markdown files.

## Requirements

- macOS (Apple Silicon or Intel)
- WordPress 6.0+ with REST API enabled
- Application passwords enabled on the WordPress site

## Getting started

### Install the companion plugin

The companion plugin (`NP Presspad Companion`) is bundled with each release. Download `wp-offline-editor-companion.zip` from the [latest release](https://github.com/cinsekrap/wp-offline-editor/releases/latest) and install it on your WordPress site. It provides ACF field group endpoints, scratchpad sync, and version checking.

The plugin auto-updates from GitHub releases.

### Connect a site

1. Open NP Presspad
2. Click **Add Site**
3. Enter your WordPress URL, username, and an application password
4. The app will test the connection and pull your posts

## Development

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 10+

### Setup

```bash
pnpm install
npx electron-rebuild   # required for better-sqlite3 on Apple Silicon
```

### Dev server

```bash
pnpm dev
```

`dev` and `preview` run `install-electron` first. Electron dropped its `postinstall`
hook after 41.x — from 43.x the binary is fetched only by that explicit bin — so
`pnpm install` alone leaves no runnable Electron and `electron-vite dev` fails with
`Error: Electron uninstall`. It is a sub-second no-op once the binary is present.

Deliberately not in `postinstall`: the cloud automation's sandbox cannot reach
Electron's download servers, and putting it there would turn `pnpm install` itself
into a hard failure. Nothing else needs the binary — electron-builder fetches its
own copy to package with, `install-app-deps` and `electron-rebuild` only read the
version, and the tests run under Node.

### Build

```bash
pnpm build                              # compile only
npx electron-builder --mac --dir        # package as .app (unpacked)
```

### Project structure

```
src/
  main/           # Electron main process (SQLite, services, IPC handlers)
  preload/        # Context bridge (IPC API surface)
  renderer/       # React UI (TipTap editor, components, hooks)
  shared/         # Types shared between main and renderer
companion-plugin/ # WordPress companion plugin (PHP)
```

## Releasing

See [RELEASE.md](RELEASE.md) for the step-by-step release checklist.

## License

GPLv2 — see [LICENSE](LICENSE) for details.
