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
  type ReportedError,
  describeChannelParameters,
  reportError,
} from '@dxfeed/dxlink-console-foldkit-core'

import { type AppliedConfig, DomEvent, type DomHandle, DomHandles, type DomOrder } from './handles'
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
 * Turn the failure of a Command into its `Failed*` Message, stamped with the time it was
 * observed at.
 */
const toFailure =
  <FailedMessage>(toMessage: (payload: Readonly<{ error: ReportedError }>) => FailedMessage) =>
  (message: string): Effect.Effect<FailedMessage> =>
    Effect.map(reportError({ type: 'UNKNOWN', message }), (error) => toMessage({ error }))

/**
 * Stop listening to a live channel and close it. The channel is closed even when removing a
 * listener throws.
 */
const release = ({ dom, detach }: DomHandle): Effect.Effect<void, string> =>
  Effect.try({
    try: () => {
      try {
        detach()
      } finally {
        dom.close()
      }
    },
    catch: errorMessage,
  })

/**
 * Open the protocol channel and start listening to it.
 *
 * Everything the channel reports afterwards goes out through the handles as a
 * {@link DomEvent}, addressed to the card. The log level is DEBUG because a debug console
 * wants the protocol traffic in the browser log.
 *
 * The live channel is either stored in the handles, with `SucceededOpenDomChannel` as the
 * result, or released: one that was constructed but could not be listened to or read is closed
 * before the Command fails.
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

      const dom = yield* Effect.try({
        try: () =>
          new DXLinkDepthOfMarket(
            client,
            { symbol, sources: Array.fromIterable(sources) },
            {
              ...(feed === '' ? {} : { feed }),
              ...(space === '' ? {} : { space }),
              logLevel: DXLinkLogLevel.DEBUG,
            }
          ),
        catch: errorMessage,
      })

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
      const handle: DomHandle = {
        dom,
        detach: () => {
          dom.removeSnapshotListener(handleSnapshot)
          dom.removeConfigChangeListener(handleConfig)
          dom.removeStateChangeListener(handleState)
          dom.getChannel().removeErrorListener(handleError)
        },
      }

      const succeeded = yield* Effect.try({
        try: () => {
          dom.addSnapshotListener(handleSnapshot)
          dom.addConfigChangeListener(handleConfig)
          dom.addStateChangeListener(handleState)
          dom.getChannel().addErrorListener(handleError)

          return Message.SucceededOpenDomChannel({
            protocolChannelId: dom.id,
            parameters: describeChannelParameters(dom.getChannel().parameters),
            channelState: dom.getState(),
            applied: toAppliedConfig(dom.getConfig()),
          })
        },
        catch: errorMessage,
      }).pipe(Effect.tapError(() => Effect.ignore(release(handle))))

      yield* handles.put(channelId, handle)

      return succeeded
    }).pipe(
      Effect.catchTag('ResourceNotAvailable', () =>
        Effect.fail('DOM channel opened without an active connection')
      ),
      Effect.catch(toFailure(Message.FailedOpenDomChannel))
    ),
})

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
    }).pipe(Effect.catch(toFailure(Message.FailedConfigureDomChannel))),
})

/**
 * Stop listening and close the protocol channel.
 *
 * The handle is taken before anything can throw, so the card holds no live channel afterwards
 * whatever the result. A card with no live channel has nothing to release, which is a success:
 * closing twice is harmless.
 */
export const CloseDomChannel = Command.define('CloseDomChannel', {
  args: { channelId: Schema.String },
  messages: [Message.SucceededCloseDomChannel, Message.FailedCloseDomChannel],
  execute: ({ channelId }) =>
    Effect.gen(function* () {
      const handles = yield* DomHandles
      const maybeHandle = yield* handles.take(channelId)

      yield* Option.match(maybeHandle, {
        onNone: () => Effect.void,
        onSome: release,
      })

      return Message.SucceededCloseDomChannel()
    }).pipe(Effect.catch(toFailure(Message.FailedCloseDomChannel))),
})
