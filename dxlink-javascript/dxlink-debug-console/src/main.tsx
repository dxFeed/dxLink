import '@fontsource-variable/inter'
import CssBaseline from '@mui/material/CssBaseline'
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'
import { ThemeProvider } from '@mui/material/styles'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import { App } from './app/App'
import { resolveAppConsoleConfig } from './app/console-config'
import { theme } from './app/theme'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('Root element #root not found')
}

// Resolved once, before the first render: the profile is what the forms start from, so it
// must not change under a mounted console.
const config = resolveAppConsoleConfig()

createRoot(container).render(
  <StrictMode>
    <InitColorSchemeScript attribute="class" defaultMode="system" />
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <HashRouter>
        <App config={config} />
      </HashRouter>
    </ThemeProvider>
  </StrictMode>
)
