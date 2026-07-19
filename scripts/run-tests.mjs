// Runs the vitest suite locally, working around the native-ABI split.
//
// `better-sqlite3-multiple-ciphers` is compiled for Electron's ABI by the
// postinstall hook, so it cannot be loaded by vitest (plain Node) — it throws
// ERR_DLOPEN. This wrapper rebuilds it for the local Node ABI, runs the tests,
// then ALWAYS restores the Electron build (even on failure) so `pnpm build`
// and `pnpm dev` keep working afterwards.
//
// CI does not use this script: its test job installs with --ignore-scripts and
// builds the module for Node once, with no Electron build to restore.
import { spawnSync } from 'node:child_process'

const isWin = process.platform === 'win32'

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin })
  return r.status ?? 1
}

console.log('\n[test] Rebuilding better-sqlite3-multiple-ciphers for Node...')
const rebuilt = run('pnpm', ['rebuild', 'better-sqlite3-multiple-ciphers'])
if (rebuilt !== 0) process.exit(rebuilt)

console.log('\n[test] Running vitest...')
const status = run('npx', ['vitest', 'run', ...process.argv.slice(2)])

console.log('\n[test] Restoring Electron ABI build...')
run('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3-multiple-ciphers'])

process.exit(status)
