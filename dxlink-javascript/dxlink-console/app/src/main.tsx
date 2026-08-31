import '@fontsource-variable/inter'
import CssBaseline from '@mui/material/CssBaseline'
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'
import { ThemeProvider } from '@mui/material/styles'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import { App } from './App'
import { createAppChannels } from './channels'
import {
  readAppConsoleSources,
  resolveAppConsoleConfig,
  resolveDescriptorSettings,
} from './console-config'
import { theme } from './theme'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('Root element #root not found')
}

// Resolved once, before the first render: the profile is what the forms start from, so it
// must not change under a mounted console.
//
// Channels first, profile second. The profile's `channelKinds` is validated against the kinds
// that actually exist, and with an open vocabulary only the registered plugins know that — so
// the list has to be built before the profile can be resolved against it.
const sources = readAppConsoleSources()
const channels = createAppChannels(resolveDescriptorSettings(sources))
const config = resolveAppConsoleConfig(
  sources,
  channels.map((channel) => channel.kind)
)

createRoot(container).render(
  <StrictMode>
    <InitColorSchemeScript attribute="class" defaultMode="system" />
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <HashRouter>
        <App config={config} channels={channels} />
      </HashRouter>
    </ThemeProvider>
  </StrictMode>
)
