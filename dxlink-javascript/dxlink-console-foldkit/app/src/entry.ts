import { Array, Effect } from 'effect'
import { Runtime } from 'foldkit'

import { channelsLayer, createAppChannels } from './channels'
import { resolveAppConsoleConfig, resolveDescriptorSettings } from './consoleConfig'
import { readInjectedConfig, readSearchConfig } from './consoleConfigSources'
import { Flags, makeApp, makeFlags } from './main'

/**
 * Everything the page itself can tell the console, read once at boot. This is the only place
 * that touches globals or `import.meta.env`: the console packages take resolved values as
 * data, which is what lets a host with its own answers pass them in and reach for nothing.
 *
 * The sources decide two things. Which plugins exist, and with what options, is composition
 * and is settled here; the configuration profile is the first Model's outside data and
 * reaches `init` as Flags.
 */
const sources = {
  injected: readInjectedConfig(window),
  search: readSearchConfig(window.location.search),
}

const channels = createAppChannels(resolveDescriptorSettings(sources))

const app = makeApp(channels)

const flags = makeFlags(
  Effect.sync(() =>
    resolveAppConsoleConfig(
      sources,
      Array.map(channels, (plugin) => plugin.kind),
      window.location,
      import.meta.env.PROD
    )
  )
)

const application = Runtime.makeApplication({
  Model: app.Model,
  Flags,
  init: app.init,
  update: app.update,
  view: app.view,
  subscriptions: app.subscriptions,
  managedResources: app.managedResources,
  resources: channelsLayer,
  container: document.getElementById('root'),
  devTools: {
    Message: app.Message,
  },
})

Runtime.run(application, { flags })
