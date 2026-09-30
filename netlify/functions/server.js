import { handleRequest, routes, assets, assetsBuildDirectory, basename, entry, future, isSpaMode, prerender, publicPath, routeDiscovery, ssr, allowedActionOrigins } from '../../../apps/web/build/server/index.js'

// Build object for React Router
const build = {
  handleRequest,
  routes,
  assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  ssr,
  allowedActionOrigins,
}

export default async (event, context) => {
  try {
    // Log incoming request for debugging
    console.log(`[${new Date().toISOString()}] ${event.httpMethod} ${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)

    // Parse the request
    const rawPath = event.path || '/'
    const rawQuery = event.rawQuery || ''
    const host = event.headers?.host || 'mwhelpcenter.netlify.app'
    const protocol = event.headers?.['x-forwarded-proto'] || 'https'
    
    // Construct full URL
    const fullUrl = `${protocol}://${host}${rawPath}${rawQuery ? '?' + rawQuery : ''}`
    console.log(`[${new Date().toISOString()}] Full URL: ${fullUrl}`)
    
    const url = new URL(fullUrl)

    // Create headers object, preserving case-sensitive header names
    const headers = new Headers(event.headers || {})
    
    // Create a proper fetch Request
    const request = new Request(url, {
      method: event.httpMethod || 'GET',
      headers,
      // Only include body for methods that can have one
      ...(event.body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes((event.httpMethod || 'GET').toUpperCase())
        ? {
            body: event.isBase64Encoded 
              ? Buffer.from(event.body, 'base64').toString()
              : event.body,
          }
        : {}),
    })

    // Call the React Router handler
    const response = await build.handleRequest(
      request,
      200,
      {},
      {},
      {}
    )

    if (!response) {
      console.error('No response from handleRequest')
      return {
        statusCode: 500,
        body: 'Internal Server Error: No response from handler',
        headers: { 'Content-Type': 'text/plain' },
      }
    }

    // Convert Response to Netlify format
    const body = await response.text()
    const responseHeaders = Object.fromEntries(response.headers)
    
    console.log(`[${new Date().toISOString()}] Response status: ${response.status}`)

    return {
      statusCode: response.status || 200,
      body,
      headers: responseHeaders,
      isBase64Encoded: false,
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Server error:`, error)
    return {
      statusCode: 500,
      body: `<html>
<head>
  <title>Server Error</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #d32f2f; }
    pre { background: #f5f5f5; padding: 12px; border-left: 4px solid #d32f2f; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Server Error</h1>
    <p>The server encountered an error processing your request.</p>
    <pre>${escapeHtml(error.message)}\n${escapeHtml(error.stack || 'No stack trace')}</pre>
    <p><a href="/">Back to home</a></p>
  </div>
</body>
</html>`,
      headers: { 'Content-Type': 'text/html' },
    }
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}
