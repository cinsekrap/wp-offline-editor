import type { WpConnectionResult } from '@shared/types'

export async function testWpConnection(
  url: string,
  username: string,
  password: string
): Promise<WpConnectionResult> {
  const baseUrl = url.replace(/\/+$/, '')
  const apiBase = `${baseUrl}/wp-json`

  try {
    // Test basic WP REST API availability
    const rootRes = await fetch(apiBase, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
      }
    })

    if (!rootRes.ok) {
      if (rootRes.status === 401 || rootRes.status === 403) {
        return { success: false, error: 'Authentication failed. Check username and application password.' }
      }
      return { success: false, error: `WordPress REST API returned status ${rootRes.status}` }
    }

    const root = (await rootRes.json()) as {
      name?: string
      namespaces?: string[]
    }

    // Get WP version from the wp/v2 users/me endpoint (requires auth)
    let wpVersion = 'Unknown'
    try {
      const meRes = await fetch(`${apiBase}/wp/v2/users/me?context=edit`, {
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
        }
      })
      if (meRes.ok) {
        // The WP version is typically in the response headers
        wpVersion = meRes.headers.get('x-wp-version') || 'Unknown'
      }
    } catch {
      // Version check is non-critical
    }

    // If x-wp-version wasn't in headers, try root response headers
    if (wpVersion === 'Unknown') {
      wpVersion = rootRes.headers.get('x-wp-version') || 'Unknown'
    }

    // Check if ACF (or ACF PRO) namespace is registered
    const namespaces = root.namespaces || []
    const acfActive = namespaces.some(
      (ns: string) => ns === 'acf/v3' || ns.startsWith('acf/')
    )

    return {
      success: true,
      siteName: root.name || baseUrl,
      wpVersion,
      acfActive
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
      return { success: false, error: 'Could not resolve hostname. Check the URL.' }
    }
    if (message.includes('ECONNREFUSED')) {
      return { success: false, error: 'Connection refused. Is the site running?' }
    }
    if (message.includes('certificate') || message.includes('SSL')) {
      return { success: false, error: 'SSL/TLS error. Check if the site uses a valid certificate.' }
    }

    return { success: false, error: `Connection failed: ${message}` }
  }
}
