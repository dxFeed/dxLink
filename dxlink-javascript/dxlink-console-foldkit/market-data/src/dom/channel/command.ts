import { Array, Effect, Option, Schema } from 'effect'
import { Command } from 'foldkit'

import { errorMessage, reportFailure } from '../failure'
import { DomHandles } from '../service'
import { Message } from './message'

/**
 * Ask the server for a configuration. An absent value means "server default"; the server
 * decides what it honours, and answers through the config listener.
 *
 * Fails when the card has no live channel, or when the client rejects the request.
 */
export const ConfigureDomChannel = Command.define('ConfigureDomChannel', {
  args: {
    channelId: Schema.String,
    maybeAggregationPeriod: Schema.Option(Schema.Finite),
    maybeDepthLimit: Schema.Option(Schema.Finite),
    maybeOrderFields: Schema.Option(Schema.Array(Schema.String)),
  },
  messages: [Message.SucceededConfigureDomChannel, Message.FailedConfigureDomChannel],
  execute: ({ channelId, maybeAggregationPeriod, maybeDepthLimit, maybeOrderFields }) =>
    Effect.gen(function* () {
      const handles = yield* DomHandles
      const maybeHandle = yield* handles.get(channelId)

      yield* Option.match(maybeHandle, {
        onNone: () => Effect.fail('DOM channel is not open, so it cannot be configured'),
        onSome: ({ dom }) =>
          Effect.try({
            try: () => {
              dom.configure({
                ...Option.match(maybeAggregationPeriod, {
                  onNone: () => ({}),
                  onSome: (acceptAggregationPeriod) => ({ acceptAggregationPeriod }),
                }),
                ...Option.match(maybeDepthLimit, {
                  onNone: () => ({}),
                  onSome: (acceptDepthLimit) => ({ acceptDepthLimit }),
                }),
                ...Option.match(maybeOrderFields, {
                  onNone: () => ({}),
                  onSome: (orderFields) => ({
                    acceptOrderFields: Array.fromIterable(orderFields),
                  }),
                }),
              })
            },
            catch: errorMessage,
          }),
      })

      return Message.SucceededConfigureDomChannel()
    }).pipe(
      Effect.catch((message) =>
        Effect.map(reportFailure(message), (error) => Message.FailedConfigureDomChannel({ error }))
      )
    ),
})
