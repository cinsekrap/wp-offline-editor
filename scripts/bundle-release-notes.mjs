/**
 * Copy this version's release notes into resources/ so the app can show them
 * offline, without asking GitHub what it just installed.
 *
 * The notes file is committed in the same change as the version bump (that is
 * what the release pipeline publishes from), so it is always present by the
 * time a release is built. Local builds between releases are the exception, and
 * they get a placeholder rather than a failure — extraResources treats a missing
 * file as a hard error, and a dev build should not be blocked by the absence of
 * notes for a version that was never released.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const source = join(root, '.github', 'release-notes', `v${version}.md`)
const target = join(root, 'resources', 'release-notes.md')

mkdirSync(dirname(target), { recursive: true })

if (existsSync(source)) {
  writeFileSync(target, readFileSync(source, 'utf8'))
  console.log(`[release-notes] bundled v${version}`)
} else {
  // First line is the title, matching the published notes format.
  writeFileSync(target, `NP Presspad ${version}\n\nNo release notes for this build.\n`)
  console.log(`[release-notes] no notes for v${version} — wrote placeholder`)
}
