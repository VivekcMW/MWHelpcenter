import {StrictMode, startTransition} from 'react'
import {hydrateRoot} from 'react-dom/client'
import {HydratedRouter} from 'react-router/dom'

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode><HydratedRouter /></StrictMode>,
    {
      onRecoverableError(error, info) {
        // React 19's production error code omits the component tree. Keep the
        // component stack in the browser console so adapter-specific hydration
        // regressions can be diagnosed from the deployed page.
        console.error('React hydration recovery:', error, info.componentStack)
      },
    },
  )
})
