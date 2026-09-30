// Import utilities for finding createRequestHandler
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

let cachedCreateRequestHandler = null

async function getCreateRequestHandler() {
  if (cachedCreateRequestHandler) return cachedCreateRequestHandler
  
  try {
    // Try method 1: Direct dynamic import
    try {
      const { createRequestHandler } = await import('react-router')
      cachedCreateRequestHandler = createRequestHandler
      console.log('[createRequestHandler] Loaded via import()')
      return createRequestHandler
    } catch (err1) {
      console.log('[createRequestHandler] import() failed:', err1.message)
      
      // Try method 2: Use createRequire from node_modules
      try {
        const require = createRequire(import.meta.url)
        const { createRequestHandler } = require('react-router')
        cachedCreateRequestHandler = createRequestHandler
        console.log('[createRequestHandler] Loaded via createRequire()')
        return createRequestHandler
      } catch (err2) {
        console.log('[createRequestHandler] createRequire() failed:', err2.message)
        throw err2
      }
    }
  } catch (error) {
    console.error('[createRequestHandler] All import methods failed:', error.message)
    console.error('Will use fallback implementation')
    
    // Fallback: Implement a minimal createRequestHandler
    return (build, mode) => {
      return async (request, loadContext = {}) => {
        try {
          const handler = build.entry?.module?.default
          if (typeof handler !== 'function') {
            throw new Error('Handler not found in build module')
          }
          
          // Create minimal router context
          // This attempts to provide what ServerRouter expects
          const routerContext = {
            routes: build.routes || {},
            assets: build.assets || {},
            basename: build.basename || '/',
            isSpaMode: build.isSpaMode || false,
            future: build.future || {},
            // Create manifest from routes
            manifest: { routes: build.routes || {} },
            // Create routeModules from route objects
            routeModules: Object.entries(build.routes || {}).reduce((acc, [id, route]) => {
              if (route && route.module) {
                acc[id] = route.module
              }
              return acc
            }, {}),
            // Create empty staticHandlerContext
            staticHandlerContext: {
              loaderData: {},
              actionData: null,
              errors: null,
              matches: [],
            },
            criticalCss: '',
            serverHandoffString: '',
          }
          
          const responseHeaders = new Headers()
          responseHeaders.set('Content-Type', 'text/html; charset=utf-8')
          
          return await handler(
            request,
            200,
            responseHeaders,
            routerContext,
            loadContext
          )
        } catch (error) {
          console.error('[createRequestHandler fallback] Error:', error.message)
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
