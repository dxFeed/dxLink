import { Array, Match, Option, Schema } from 'effect'

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
 * The console's Messages for a set of plugins.
 *
 * As with the Model, the console's own code treats a plugin's Message as opaque, and the
 * Schema handed to the runtime does not: a Message addressed to a channel has to be one some
 * registered plugin declares, and one addressed to a request has to be that plugin's own.
 */
const makeMessage = <Services>(
  plugins: ReadonlyArray<RegisteredChannelPlugin<Services>>
): Schema.Schema<Message> => {
  const isChannelMessage = Schema.is(
    Schema.Union(Array.map(plugins, (plugin) => plugin.channelMessage))
  )
  const isRequestMessageOf = (pluginId: string, value: unknown): boolean =>
    Option.exists(
      Array.findFirst(plugins, (plugin) => plugin.kind === pluginId),
      (plugin) => Schema.is(plugin.requestMessage)(value)
    )

  return Message.pipe(
    Schema.check(
      Schema.makeFilter(
        (message) =>
          Match.value(message).pipe(
            Match.tag('GotChannelMessage', ({ message: channelMessage }) =>
              isChannelMessage(channelMessage)
            ),
            Match.tag('GotRequestMessage', ({ pluginId, message: requestMessage }) =>
              isRequestMessageOf(pluginId, requestMessage)
            ),
            Match.orElse(() => true)
          ),
        { description: 'a Message whose plugin payload a registered plugin declares' }
      )
    )
  )
}

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
    Message: makeMessage(plugins),
    init,
    update,
    view: makeView(plugins),
    subscriptions: makeSubscriptions(plugins),
    managedResources,
  }
}
