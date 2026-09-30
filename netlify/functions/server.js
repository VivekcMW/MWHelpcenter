// Import React Router's createRequestHandler dynamically
// (This avoids bundler issues and ensures it's resolved at runtime)
let cachedCreateRequestHandler = null

async function getCreateRequestHandler() {
  if (cachedCreateRequestHandler) return cachedCreateRequestHandler
  try {
    // Try dynamic import from react-router
    const { createRequestHandler } = await import('react-router')
    cachedCreateRequestHandler = createRequestHandler
    return createRequestHandler
  } catch (err) {
    console.warn('Cannot import createRequestHandler from react-router:', err.message)
    
    // Fallback: Implement createRequestHandler locally
    // This is a simplified implementation that handles the common SSR case
    return (build, mode) => {
      return async (request, loadContext = {}) => {
        try {
          // Get the handler function from the build module
          const handler = build.entry?.module?.default
          if (typeof handler !== 'function') {
            throw new Error('Handler not found in build module')
          }
          
          // Create the router context from build exports
          // React Router expects a specific structure that createServerRoutes will process
          const routerContext = {
            routes: build.routes,
            assets: build.assets,
            basename: build.basename || '/',
            isSpaMode: build.isSpaMode || false,
            future: build.future || {},
            manifest: build.routes ? { routes: build.routes } : {},
            routeModules: Object.values(build.routes || {}).reduce((acc, route) => {
              if (route.id && route.module) {
                acc[route.id] = route.module
              }
              return acc
            }, {}),
            staticHandlerContext: {
              loaderData: {},
              matches: [],
              actionData: null,
              errors: null,
            },
            criticalCss: '',
            serverHandoffString: '',
          }
          
          const responseHeaders = new Headers()
          responseHeaders.set('Content-Type', 'text/html; charset=utf-8')
          
          // Call the handler with proper React Router SSR parameters
          return await handler(
            request,
            200,
            responseHeaders,
            routerContext,
            loadContext
          )
        } catch (error) {
          console.error('Error in createRequestHandler fallback:', error.message)
          throw error
        }
      }
    }
  }
}

// Lazy load the React Router build to avoid bundler issues
let cachedBuild = null
let cachedHandler = null

async function loadBuild() {
  if (cachedBuild) return cachedBuild
  
  try {
    // On Netlify, the server build is copied to netlify/functions/build-server/
    // by the build command. Try that path first.
    
    const cwd = process.cwd()
    console.log(`[${new Date().toISOString()}] CWD: ${cwd}`)
    
    // Get the directory where this script is located
    const scriptDir = new URL('.', import.meta.url).href
    console.log(`[${new Date().toISOString()}] Script dir: ${scriptDir}`)
    
    // Try different possible paths for the build
    const possiblePaths = [
      // Production: build-server copied into same directory as script
      new URL('./build-server/index.js', import.meta.url).href,
      // Production: build-server in parent directory
      new URL('../netlify/functions/build-server/index.js', import.meta.url).href,
      // Development: path from monorepo root
      `file://${cwd}/apps/web/build/server/index.js`,
      // Fallback: try finding based on current location
      `file://${new URL('../../apps/web/build/server/index.js', scriptDir).href.replace('file://', '')}`,
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
    const errorMsg = `Unable to load React Router build from any path:\n${possiblePaths.map(p => `  - ${p}`).join('\n')}\n\nLast error: ${lastError?.message}\n\nCWD: ${cwd}\nScript: ${scriptDir}`
    console.error(`[${new Date().toISOString()}] ${errorMsg}`)
    throw new Error(errorMsg)
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Build load error:`, error.message)
    throw error
  }
}

async function getRequestHandler() {
  if (cachedHandler) return cachedHandler
  
  const build = await loadBuild()
  const createRequestHandler = await getCreateRequestHandler()
  cachedHandler = createRequestHandler(build, process.env.NODE_ENV || 'production')
  return cachedHandler
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

    // Get the React Router request handler (uses createRequestHandler internally)
    const handler = await getRequestHandler()
    
    // Prepare load context for React Router
    const loadContext = {
      event,
      context,
    }
    
    console.log(`[${new Date().toISOString()}] Calling React Router handler`)
    
    // Call the handler and return the response
    const response = await handler(request, loadContext)

    if (!response) {
      console.error('No response from handler')
      return new Response('Internal Server Error: No response from handler', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    console.log(`[${new Date().toISOString()}] Response status: ${response.status}`)

    // Return the Response object directly
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
