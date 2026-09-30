const { createRequire } = require('module')
const { fileURLToPath } = require('url')
const { dirname, resolve } = require('path')
const fs = require('fs')

let cachedBuild = null
let cachedHandler = null

async function loadBuild() {
  if (cachedBuild) return cachedBuild
  
  try {
    const cwd = process.cwd()
    console.log(`[${new Date().toISOString()}] CWD: ${cwd}`)
    
    // List what actually exists in the filesystem for debugging
    try {
      console.log(`[${new Date().toISOString()}] Contents of /var/task (first 10):`, fs.readdirSync('/var/task').slice(0, 10))
    } catch (err) {
      console.log(`[${new Date().toISOString()}] Could not list /var/task:`, err.message)
    }
    
    try {
      const functionsDir = '/var/task/netlify/functions'
      if (fs.existsSync(functionsDir)) {
        console.log(`[${new Date().toISOString()}] Contents of ${functionsDir}:`, fs.readdirSync(functionsDir))
      } else {
        console.log(`[${new Date().toISOString()}] ${functionsDir} does not exist`)
      }
    } catch (err) {
      console.log(`[${new Date().toISOString()}] Error listing functions:`, err.message)
    }
    
    // Try different possible paths for the build
    const possiblePaths = [
      // Path 1: build-server folder copied by build command
      resolve('/var/task', 'netlify', 'functions', 'build-server', 'index.js'),
      // Path 2: from apps/web/build/server
      resolve('/var/task', 'apps', 'web', 'build', 'server', 'index.js'),
      // Path 3: from cwd
      resolve(cwd, 'apps', 'web', 'build', 'server', 'index.js'),
    ]
    
    let buildModule = null
    let lastError = null
    
    for (const path of possiblePaths) {
      try {
        console.log(`[${new Date().toISOString()}] Attempting to load build from: ${path}`)
        
        // Use require to load the build module
        // Clear require cache first to ensure fresh load
        delete require.cache[require.resolve(path)]
        buildModule = require(path)
        
        console.log(`[${new Date().toISOString()}] Successfully loaded build from: ${path}`)
        cachedBuild = buildModule
        return buildModule
      } catch (err) {
        lastError = err
        console.log(`[${new Date().toISOString()}] Failed to load ${path}: ${err.message}`)
        continue
      }
    }
    
    // If we get here, none worked - provide helpful error info
    const errorMsg = `Unable to load React Router build from any path:\n${possiblePaths.map(p => `  - ${p}`).join('\n')}\n\nLast error: ${lastError?.message}\n\nCWD: ${cwd}`
    console.error(`[${new Date().toISOString()}] ${errorMsg}`)
    throw new Error(errorMsg)
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Build load error:`, error.message)
    throw error
  }
}

async function getRequestHandler() {
  if (cachedHandler) return cachedHandler
  
  try {
    const build = await loadBuild()
    
    // Get createRequestHandler from react-router
    let createRequestHandler = null
    try {
      const { createRequestHandler: crh } = await import('react-router')
      createRequestHandler = crh
      console.log('[Handler] Loaded createRequestHandler via import()')
    } catch (err1) {
      try {
        const require_rt = createRequire(import.meta.url)
        createRequestHandler = require_rt('react-router').createRequestHandler
        console.log('[Handler] Loaded createRequestHandler via require')
      } catch (err2) {
        console.error('[Handler] Could not load createRequestHandler, using fallback')
        // Fallback: just return the entry handler directly
        createRequestHandler = (build, mode) => {
          return async (request, loadContext = {}) => {
            const handler = build.entry?.module?.default
            if (typeof handler !== 'function') {
              throw new Error('Handler not found in build module')
            }
            
            const responseHeaders = new Headers()
            responseHeaders.set('Content-Type', 'text/html; charset=utf-8')
            
            // Create basic router context for React Router
            const routerContext = {
              routes: build.routes || {},
              assets: build.assets || {},
              basename: build.basename || '/',
              isSpaMode: build.isSpaMode || false,
              future: build.future || {},
            }
            
            return await handler(request, 200, responseHeaders, routerContext, loadContext)
          }
        }
      }
    }
    
    cachedHandler = createRequestHandler(build, process.env.NODE_ENV || 'production')
    return cachedHandler
  } catch (error) {
    console.error('[Handler] Error getting request handler:', error.message)
    throw error
  }
}

exports.handler = async (event, context) => {
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

    // Get the React Router request handler
    const handler = await getRequestHandler()
    
    // Prepare load context for React Router
    const loadContext = {
      event,
      context,
    }

    // Call the handler and get the response
    const response = await handler(request, loadContext)
    
    // Convert Web API Response to Netlify Function response format
    const responseBody = await response.text()
    
    const netlifyResponse = {
      statusCode: response.status || 200,
      statusText: response.statusText || 'OK',
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
      isBase64Encoded: false,
    }
    
    console.log(`[${new Date().toISOString()}] Returning response with status ${netlifyResponse.statusCode}`)
    return netlifyResponse
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Handler error:`, error.message)
    console.error(error.stack)
    
    // Return error response
    return {
      statusCode: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `<html><head><title>Server Error</title><style>body { font-family: sans-serif; padding: 20px; background: #f5f5f5; } .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); } h1 { color: #d32f2f; } pre { background: #f5f5f5; padding: 12px; border-left: 4px solid #d32f2f; overflow-x: auto; }</style></head><body><div class="container"><h1>Server Error</h1><p>The server encountered an error processing your request.</p><pre>${error.message}\n\n${error.stack}</pre></div></body></html>`,
      isBase64Encoded: false,
    }
  }
}
