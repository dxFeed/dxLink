import { Array, Schema } from 'effect'

import type { RegisteredChannelPlugin } from './channel/plugin'
import { Message } from './message'
import { ChannelEntry, Model } from './model'
import { managedResources } from './resource'
import { makeSubscriptions } from './subscription'
import { makeUpdate } from './update'
import { makeView } from './view/view'

/**
 * The console's Model for a set of plugins.
 *
 * The Model the console's own code is typed against holds channels and requests as opaque
 * values, because that code never looks inside them. The Schema the runtime is given is
 * narrower: each opaque value is one of the registered plugins' own Models, so a Model that
 * is restored or inspected is checked all the way down.
 */
const makeModel = <Services>(
  plugins: ReadonlyArray<RegisteredChannelPlugin<Services>>
): Schema.Schema<Model> =>
  Schema.Struct({
    ...Model.fields,
    channels: Schema.Array(
      Schema.Struct({
        ...ChannelEntry.fields,
        model: Schema.Union(Array.map(plugins, (plugin) => plugin.channelModel)),
      })
    ),
    requests: Schema.Record(
      Schema.String,
      Schema.Union(Array.map(plugins, (plugin) => plugin.requestModel))
    ),
  })

/**
 * Build the console for a set of channel services.
 *
 * The plugin list is an argument, never a default: which services exist is a composition
 * decision, and a host that leaves a channel package out never imports its code. The result
 * is a Submodel — `init` takes the configuration profile, and the host lifts `update`, `view`,
 * `subscriptions` and `managedResources` into its own application, and builds its own Model
 * Schema around `Model`.
 */
export const makeConsole = <Services>(
  plugins: ReadonlyArray<RegisteredChannelPlugin<Services>>
) => {
  const { init, update } = makeUpdate(plugins)

  return {
    Model: makeModel(plugins),
    Message,
    init,
    update,
    view: makeView(plugins),
    subscriptions: makeSubscriptions(plugins),
    managedResources,
  }
}
