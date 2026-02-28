/** Extract major.minor from a semver-like string (e.g. "0.7.5-build.4" → "0.7") */
export function getMinorVersion(version: string): string {
  const match = version.match(/^(\d+\.\d+)/)
  return match ? match[1] : version
}

/** Returns true when the plugin's major.minor differs from the app's major.minor */
export function isPluginVersionMismatch(pluginVersion: string, appVersion: string): boolean {
  return getMinorVersion(pluginVersion) !== getMinorVersion(appVersion)
}

export function pluginMismatchMessage(appVersion: string): string {
  return `Plugin version doesn't match the app (expected v${getMinorVersion(appVersion)}). Update the companion plugin or some elements may not sync with your WordPress site.`
}
