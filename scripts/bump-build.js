#!/usr/bin/env node

/**
 * Auto-increment build number and stamp into package.json version.
 *
 * Keeps the base semver (e.g. "0.3.0") and appends "+build.N".
 * The build counter is stored in .buildnum (gitignored).
 *
 * Usage: node scripts/bump-build.js
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
const buildNumPath = path.join(root, '.buildnum')

// Read current build number
let buildNum = 0
try {
  buildNum = parseInt(fs.readFileSync(buildNumPath, 'utf-8').trim(), 10) || 0
} catch {
  // First build
}

// Increment
buildNum++

// Read package.json
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

// Strip any existing build metadata
const baseVersion = pkg.version.split('+')[0]

// Stamp new version
pkg.version = `${baseVersion}+build.${buildNum}`

// Write back
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
fs.writeFileSync(buildNumPath, String(buildNum) + '\n')

console.log(`Version: ${pkg.version}`)
