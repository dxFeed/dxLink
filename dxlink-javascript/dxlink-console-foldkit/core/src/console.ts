import type { RegisteredChannelPlugin } from './channel/plugin'
import { Message } from './message'
import { Model } from './model'
import { managedResources } from './resource'
import { makeSubscriptions } from './subscription'
import { makeUpdate } from './update'
import { makeView } from './view/view'

/**
 * Build the console for a set of channel services.
 *
 * The plugin list is an argument, never a default: which services exist is a composition
 * decision, and a host that leaves a channel package out never imports its code. The result
 * is a Submodel — `init` takes the configuration profile, and the host lifts `update`, `view`,
 * `subscriptions` and `managedResources` into its own application.
 */
export const makeConsole = <Services>(
  plugins: ReadonlyArray<RegisteredChannelPlugin<Services>>
) => {
  const { init, update } = makeUpdate(plugins)

  return {
    Model,
    Message,
    init,
    update,
    view: makeView(plugins),
    subscriptions: makeSubscriptions(plugins),
    managedResources,
  }
}
