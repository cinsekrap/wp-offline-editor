# Release Checklist

Follow these steps in order when cutting a new release.

## 1. Update version numbers

Three places must match:

| File | Location | Example |
|---|---|---|
| `package.json` | `"version"` field | `"0.8.0"` |
| `companion-plugin/wp-offline-editor-companion.php` | Plugin header `Version:` | `* Version: 0.8.0` |
| `companion-plugin/wp-offline-editor-companion.php` | `WPOE_VERSION` constant | `define( 'WPOE_VERSION', '0.8.0' );` |

The release workflow auto-sets `package.json` from the git tag, but it's cleaner to have it correct in the commit too. The companion plugin versions are **not** auto-set — they must be updated manually.

## 2. Build and verify

```bash
pnpm build
```

Ensure a clean build with no errors.

## 3. Commit

```bash
git add package.json companion-plugin/wp-offline-editor-companion.php
git commit -m "Bump version to X.Y.Z"
```

## 4. Tag and push

```bash
git tag -a vX.Y.Z -m "vX.Y.Z — Release title"
git push origin main vX.Y.Z
```

Push the commit and tag together to avoid triggering the release workflow twice.

## 5. Wait for release workflow

```bash
gh run list --limit 1
gh run watch <run-id>
```

The workflow builds the macOS app, creates a **draft** GitHub release, uploads app assets (DMG, ZIP, blockmap, latest-mac.yml) and the companion plugin ZIP.

## 6. Publish the release

```bash
gh release edit vX.Y.Z --draft=false --latest
```

## 7. Update local app (optional)

```bash
npx electron-rebuild
pnpm build
npx electron-builder --mac --dir
cp -R dist/mac-arm64/NP\ Presspad.app /Applications/
```

## Known issues

- **Signing/notarization disabled**: `identity: null`, `notarize: false` in `electron-builder.yml`. Restore for v1.0.
- **Double workflow trigger**: If you push the commit and tag separately, two workflow runs fire for the same tag. The second will fail because assets already exist. Push both together or delete the draft release and re-run.
