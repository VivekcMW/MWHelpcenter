// Lazy load the React Router build to avoid bundler issues
let cachedBuild = null

async function loadBuild() {
  if (cachedBuild) return cachedBuild
  
  try {
    // On Netlify, the server build is copied to netlify/functions/build-server/
    // by the build command. Try that path first.
    
    const cwd = process.cwd()
    console.log(`[${new Date().toISOString()}] CWD: ${cwd}`)
    
    // Try different possible paths for the build
    const possiblePaths = [
      // Production: build-server copied into functions directory
      new URL('./build-server/index.js', import.meta.url).href,
      // Development: relative path
      new URL('../../../apps/web/build/server/index.js', import.meta.url).href,
      // Absolute file paths
      `file://${cwd}/netlify/functions/build-server/index.js`,
      `file://${cwd}/apps/web/build/server/index.js`,
    ]
    
    let buildModule = null
    let lastError = null
    
    for (const path of possiblePaths) {
      try {
        console.log(`[${new Date().toISOString()}] Attempting to load build from: ${path}`)
        buildModule = await import(path)
        console.log(`[${new Date().toISOString()}] Successfully loaded build from: ${path}`)
        cachedBuild = buildModule
        return buildModule
      } catch (err) {
        lastError = err
        console.log(`[${new Date().toISOString()}] Failed: ${err.message}`)
        continue
      }
    }
    
    // If we get here, none worked - provide helpful error info
    const errorMsg = `Unable to load React Router build from any path:\n${possiblePaths.map(p => `  - ${p}`).join('\n')}\n\nLast error: ${lastError?.message}\n\nCWD: ${cwd}\nENV: ${process.env.NODE_ENV}`
    console.error(`[${new Date().toISOString()}] ${errorMsg}`)
    throw new Error(errorMsg)
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Build load error:`, error.message)
    throw error
  }
}

export default async (event, context) => {
  try {
    // Log incoming request for debugging
    console.log(`[${new Date().toISOString()}] ${event.httpMethod} ${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)

    // Load the build at runtime
    const build = await loadBuild()
    
    // DIAGNOSTIC: Check what exports are actually available
    const buildExports = Object.keys(build)
    const hasRoutes = 'routes' in build
    const hasBuildRoutes = build.routes ? Object.keys(build.routes).length : 0
    
    if (!hasRoutes || hasBuildRoutes === 0) {
      console.error(`[${new Date().toISOString()}] WARNING: routes not found in build!`, {
        hasRoutesProperty: hasRoutes,
        routeCount: hasBuildRoutes,
        availableExports: buildExports.slice(0, 20),
      })
      
      // Return diagnostic error page
      return new Response(`<html><body>
        <h1>Diagnostic: Build Module Issue</h1>
        <p>The build module does not have routes.</p>
        <pre>
Available Exports: ${JSON.stringify(buildExports, null, 2)}
Has routes property: ${hasRoutes}
Routes count: ${hasBuildRoutes}
build.entry exists: ${!!build.entry}
build.entry.module exists: ${!!build.entry?.module}
build.entry.module.default exists: ${!!build.entry?.module?.default}
        </pre>
      </body></html>`, {
        status: 500,
        headers: { 'Content-Type': 'text/html' }
      })
    }

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
    // The React Router build exports entry.module.default which is the handleRequest function
    const handler = build.entry?.module?.default
    
    if (typeof handler !== 'function') {
      console.error('Handler not found in build exports. Available exports:', Object.keys(build))
      throw new Error(`Invalid build structure: handler not found`)
    }
    
    // Log what we have from the build
    console.log(`[${new Date().toISOString()}] Build exports available:`, {
      hasRoutes: !!build.routes,
      hasAssets: !!build.assets,
      hasisSpaMode: !!build.isSpaMode,
      hasEntry: !!build.entry,
      exportKeys: Object.keys(build).slice(0, 10),
    })
    
    // Prepare the router context with routes and other configuration from the build
    // React Router v7 expects specific structure for routes
    const routerContext = {
      routes: build.routes,
      basename: build.basename || '',
      isSpaMode: build.isSpaMode || false,
    }
    
    // Prepare load context for React Router handlers
    const loadContext = {
      // Netlify specific context
      event,
      context,
    }
    
    console.log(`[${new Date().toISOString()}] RouterContext prepared:`, {
      hasRoutes: !!routerContext.routes,
      routeCount: Object.keys(routerContext.routes || {}).length,
      hasBasename: !!routerContext.basename,
    })
    
    const responseHeaders = new Headers()
    responseHeaders.set('Content-Type', 'text/html; charset=utf-8')
    
    const response = await handler(
      request,
      200,
      responseHeaders,
      routerContext,
      loadContext
    )

    if (!response) {
      console.error('No response from handleRequest')
      return new Response('Internal Server Error: No response from handler', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    console.log(`[${new Date().toISOString()}] Response status: ${response.status}`)

    // Return the Response object directly - Netlify's new runtime expects Web API Response
    return response
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Server error:`, error)
    
    const errorHtml = `<html>
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
</html>`
    
    return new Response(errorHtml, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
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
