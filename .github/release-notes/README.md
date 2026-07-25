# Release notes

User-facing notes for release `vX.Y.Z` live in `vX.Y.Z.md` in this directory.

Format:

- **First line**: the release title, e.g. `NP Presspad 1.2.0 — Some theme`
- Blank line
- **Rest**: the Markdown body shown on the GitHub release

The Release workflow publishes the draft release automatically after a green,
notarized, asset-complete build **only if** this file exists on `main`.
Otherwise the release stays a draft and the publish step fails until the notes
are committed and the job re-run. Every release ships with real notes covering
everything on `main` since the previous release.
