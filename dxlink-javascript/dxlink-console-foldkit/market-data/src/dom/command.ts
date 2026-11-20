import { Array, Effect, Option, Schema, pipe } from 'effect'
import { Command } from 'foldkit'

import {
  type DXLinkChannelState,
  DXLinkDepthOfMarket,
  type DXLinkError,
  DXLinkLogLevel,
  type DepthOfMarketConfig,
  type DepthOfMarketOrder,
} from '@dxfeed/dxlink-api'
import {
  DxLinkClient,
  describeChannelParameters,
  reportError,
} from '@dxfeed/dxlink-console-foldkit-core'

import { type AppliedConfig, DomEvent, DomHandles, type DomOrder } from './handles'
import { Message } from './message'

/** NaN is how the client says "the server has not told me yet". */
const toMaybeNumber = (value: number): Option.Option<number> =>
  Option.liftPredicate(value, Number.isFinite)

export const toAppliedConfig = (config: DepthOfMarketConfig): AppliedConfig => ({
  maybeAggregationPeriod: toMaybeNumber(config.aggregationPeriod),
  maybeDepthLimit: toMaybeNumber(config.depthLimit),
  dataFormat: config.dataFormat,
  orderFields: config.orderFields,
})

/** A level without a finite price cannot be placed in the ladder, so it is left out. */
export const toOrders = (orders: ReadonlyArray<DepthOfMarketOrder>): ReadonlyArray<DomOrder> =>
  pipe(
    orders,
    Array.filter((order) => Number.isFinite(order.price)),
    Array.map((order) => ({ price: order.price, maybeSize: toMaybeNumber(order.size) }))
  )

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : globalThis.String(error)

/**
 * Open the protocol channel and start listening to it.
 *
 * Everything the channel reports afterwards goes out through the handles as a
 * {@link DomEvent}, addressed to the card. The log level is DEBUG because a debug console
 * wants the protocol traffic in the browser log.
 */
export const OpenDomChannel = Command.define('OpenDomChannel', {
  args: {
    channelId: Schema.String,
    symbol: Schema.String,
    sources: Schema.Array(Schema.String),
    feed: Schema.String,
    space: Schema.String,
  },
  messages: [Message.SucceededOpenDomChannel, Message.FailedOpenDomChannel],
  execute: ({ channelId, symbol, sources, feed, space }) =>
    Effect.gen(function* () {
      const client = yield* DxLinkClient.get
      const handles = yield* DomHandles

      const handle = yield* Effect.try({
        try: () => {
          const dom = new DXLinkDepthOfMarket(
            client,
            { symbol, sources: Array.fromIterable(sources) },
            {
              ...(feed === '' ? {} : { feed }),
              ...(space === '' ? {} : { space }),
              logLevel: DXLinkLogLevel.DEBUG,
            }
          )
          const handleSnapshot = (
            time: number,
            bids: ReadonlyArray<DepthOfMarketOrder>,
            asks: ReadonlyArray<DepthOfMarketOrder>
          ) => {
            handles.emit(
              channelId,
              DomEvent.Snapshot({
                snapshot: {
                  time,
                  bids: toOrders(bids),
                  asks: toOrders(asks),
                },
              })
            )
          }
          const handleConfig = (config: DepthOfMarketConfig) => {
            handles.emit(channelId, DomEvent.ChangedConfig({ applied: toAppliedConfig(config) }))
          }
          const handleState = (channelState: DXLinkChannelState) => {
            handles.emit(channelId, DomEvent.ChangedState({ channelState }))
          }
          const handleError = (error: DXLinkError) => {
            handles.emit(channelId, DomEvent.Failed({ type: error.type, message: error.message }))
          }

          dom.addSnapshotListener(handleSnapshot)
          dom.addConfigChangeListener(handleConfig)
          dom.addStateChangeListener(handleState)
          dom.getChannel().addErrorListener(handleError)

          return {
            dom,
            detach: () => {
              dom.removeSnapshotListener(handleSnapshot)
              dom.removeConfigChangeListener(handleConfig)
              dom.removeStateChangeListener(handleState)
              dom.getChannel().removeErrorListener(handleError)
            },
          }
        },
        catch: errorMessage,
      })
      yield* handles.put(channelId, handle)

      return Message.SucceededOpenDomChannel({
        protocolChannelId: handle.dom.id,
        parameters: describeChannelParameters(handle.dom.getChannel().parameters),
        channelState: handle.dom.getState(),
        applied: toAppliedConfig(handle.dom.getConfig()),
      })
    }).pipe(
      Effect.catchTag('ResourceNotAvailable', () =>
        Effect.fail('DOM channel opened without an active connection')
      ),
      Effect.catch((message) =>
        Effect.map(reportError({ type: 'UNKNOWN', message }), (error) =>
          Message.FailedOpenDomChannel({ error })
        )
      )
    ),
})

/**
 * Ask the server for a configuration. An absent value means "server default"; the server
 * decides what it honours, and answers through the config listener.
 */
export const ConfigureDomChannel = Command.define('ConfigureDomChannel', {
  args: {
    channelId: Schema.String,
    maybeAggregationPeriod: Schema.Option(Schema.Finite),
    maybeDepthLimit: Schema.Option(Schema.Finite),
    maybeOrderFields: Schema.Option(Schema.Array(Schema.String)),
  },
  messages: [Message.CompletedConfigureDomChannel],
  execute: ({ channelId, maybeAggregationPeriod, maybeDepthLimit, maybeOrderFields }) =>
    Effect.gen(function* () {
      const handles = yield* DomHandles
      const maybeHandle = yield* handles.get(channelId)

      yield* Effect.sync(() => {
        Option.map(maybeHandle, ({ dom }) =>
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
        )
      })

      return Message.CompletedConfigureDomChannel()
    }),
})

/** Stop listening and close the protocol channel. Closing twice is harmless. */
export const CloseDomChannel = Command.define('CloseDomChannel', {
  args: { channelId: Schema.String },
  messages: [Message.CompletedCloseDomChannel],
  execute: ({ channelId }) =>
    Effect.gen(function* () {
      const handles = yield* DomHandles
      const maybeHandle = yield* handles.take(channelId)

      yield* Effect.sync(() => {
        Option.map(maybeHandle, ({ dom, detach }) => {
          detach()
          dom.close()
        })
      })

      return Message.CompletedCloseDomChannel()
    }),
})
