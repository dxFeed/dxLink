import { Effect, Option, Schema } from 'effect'
import { Command, Mount } from 'foldkit'

import {
  type DXLinkChannel,
  type DXLinkError,
  DXLinkFeed,
  DXLinkLogLevel,
  FeedContract,
  FeedDataFormat,
} from '@dxfeed/dxlink-api'
import {
  DxLinkClient,
  describeChannelParameters,
  reportError,
} from '@dxfeed/dxlink-console-foldkit-core'

import { dropSink, sinkFor } from './candleChart'
import { DXLinkCandles } from './candles'
import {
  EventFieldRow,
  FeedSubscription,
  buildAcceptEventFields,
  toProtocolSubscription,
} from './domain'
import { type FeedHandle, FeedLive } from './live'
import { Message } from './message'
import { CandleSubscription, DataFormatChoice } from './model'

/** Feed and space are omitted from the protocol when empty; DEBUG puts the traffic in the log. */
const feedOptions = (feed: string, space: string) => ({
  ...(feed === '' ? {} : { feed }),
  ...(space === '' ? {} : { space }),
  logLevel: DXLinkLogLevel.DEBUG,
})

const opened = (channel: DXLinkChannel) =>
  Message.SucceededOpenChannel({
    channelState: channel.getState(),
    protocolChannelId: channel.id,
    parameters: describeChannelParameters(channel.parameters),
  })

const failedOpen = (message: string) =>
  Effect.map(reportError({ type: 'CONSOLE', message }), (error) =>
    Message.FailedOpenChannel({ error })
  )

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const OpenArgs = {
  channelId: Schema.String,
  feed: Schema.String,
  space: Schema.String,
}

/** Open an AUTO-contract feed, which accepts all three subscription shapes. */
export const OpenFeed = Command.define('OpenFeed', {
  args: OpenArgs,
  messages: [Message.SucceededOpenChannel, Message.FailedOpenChannel],
  execute: ({ channelId, feed, space }) =>
    Effect.gen(function* () {
      const client = yield* DxLinkClient.get
      const handles = yield* FeedLive
      const live = yield* Effect.try({
        try: () => {
          const dxFeed = new DXLinkFeed(client, FeedContract.AUTO, feedOptions(feed, space))
          dxFeed.addEventListener((events) => {
            handles.emit(channelId, { _tag: 'Events', events })
          })
          dxFeed.addConfigChangeListener((config) => {
            handles.emit(channelId, { _tag: 'Config', config })
          })
          dxFeed.addStateChangeListener((state) => {
            handles.emit(channelId, { _tag: 'State', state })
          })
          dxFeed.getChannel().addErrorListener((error: DXLinkError) => {
            handles.emit(channelId, {
              _tag: 'Error',
              type: error.type,
              message: error.message,
            })
          })

          return dxFeed
        },
        catch: describe,
      })
      yield* handles.put(channelId, { _tag: 'Feed', feed: live })

      return opened(live.getChannel())
    }).pipe(
      Effect.catchTag('ResourceNotAvailable', () =>
        failedOpen('Feed channel opened without an active connection')
      ),
      Effect.catch(failedOpen)
    ),
})

/** Open the candle aggregator behind the chart view. */
export const OpenCandles = Command.define('OpenCandles', {
  args: OpenArgs,
  messages: [Message.SucceededOpenChannel, Message.FailedOpenChannel],
  execute: ({ channelId, feed, space }) =>
    Effect.gen(function* () {
      const client = yield* DxLinkClient.get
      const handles = yield* FeedLive
      const sink = sinkFor(channelId)
      const candles = yield* Effect.try({
        try: () => {
          const live = new DXLinkCandles(client, feedOptions(feed, space))
          live.addListener((data) => {
            // NOTE: this runs synchronously inside the WebSocket frame dispatch, which does
            // not guard its listeners: an escaping throw would abort that frame for every
            // other channel. A drawing failure is contained and reported instead.
            try {
              sink.push(data.events, data.isSnapshot)
            } catch (error) {
              handles.emit(channelId, {
                _tag: 'ChartFailure',
                reason: describe(error),
              })
            }
            handles.emit(channelId, {
              _tag: 'Candles',
              count: data.events.length,
            })
          })
          const channel = live.getChannel()
          channel.addStateChangeListener((state) => {
            handles.emit(channelId, { _tag: 'State', state })
          })
          channel.addErrorListener((error: DXLinkError) => {
            handles.emit(channelId, {
              _tag: 'Error',
              type: error.type,
              message: error.message,
            })
          })

          return live
        },
        catch: describe,
      })
      yield* handles.put(channelId, { _tag: 'Candles', candles })

      return opened(candles.getChannel())
    }).pipe(
      Effect.catchTag('ResourceNotAvailable', () =>
        failedOpen('Feed chart channel opened without an active connection')
      ),
      Effect.catch(failedOpen)
    ),
})

/** Run an action against the channel's live handle, if it is still there. */
const withHandle = (
  channelId: string,
  act: (handle: FeedHandle) => void
): Effect.Effect<void, never, FeedLive> =>
  Effect.gen(function* () {
    const handles = yield* FeedLive
    const maybeHandle = yield* handles.get(channelId)
    yield* Effect.sync(() => {
      Option.map(maybeHandle, act)
    })
  })

const withFeed = (channelId: string, act: (feed: DXLinkFeed<FeedContract.AUTO>) => void) =>
  withHandle(channelId, (handle) => {
    if (handle._tag === 'Feed') {
      act(handle.feed)
    }
  })

export const AddSubscription = Command.define('AddSubscription', {
  args: { channelId: Schema.String, subscription: FeedSubscription },
  messages: [Message.CompletedAddSubscription],
  execute: ({ channelId, subscription }) =>
    withFeed(channelId, (feed) => {
      feed.addSubscriptions([toProtocolSubscription(subscription)])
    }).pipe(Effect.as(Message.CompletedAddSubscription())),
})

export const RemoveSubscription = Command.define('RemoveSubscription', {
  args: { channelId: Schema.String, subscription: FeedSubscription },
  messages: [Message.CompletedRemoveSubscription],
  execute: ({ channelId, subscription }) =>
    withFeed(channelId, (feed) => {
      feed.removeSubscriptions([toProtocolSubscription(subscription)])
    }).pipe(Effect.as(Message.CompletedRemoveSubscription())),
})

export const ClearSubscriptions = Command.define('ClearSubscriptions', {
  args: { channelId: Schema.String },
  messages: [Message.CompletedClearSubscriptions],
  execute: ({ channelId }) =>
    withFeed(channelId, (feed) => {
      feed.clearSubscriptions()
    }).pipe(Effect.as(Message.CompletedClearSubscriptions())),
})

const toDataFormat = (choice: DataFormatChoice): Option.Option<FeedDataFormat> => {
  if (choice === 'FULL') {
    return Option.some(FeedDataFormat.FULL)
  }

  return choice === 'COMPACT' ? Option.some(FeedDataFormat.COMPACT) : Option.none()
}

/** Send the requested configuration; every empty part is left to the server's default. */
export const ConfigureFeed = Command.define('ConfigureFeed', {
  args: {
    channelId: Schema.String,
    aggregationPeriod: Schema.String,
    dataFormat: DataFormatChoice,
    rows: Schema.Array(EventFieldRow),
  },
  messages: [Message.CompletedConfigureFeed],
  execute: ({ channelId, aggregationPeriod, dataFormat, rows }) =>
    withFeed(channelId, (feed) => {
      feed.configure({
        ...(aggregationPeriod.trim() === ''
          ? {}
          : { acceptAggregationPeriod: Number(aggregationPeriod) }),
        ...Option.match(toDataFormat(dataFormat), {
          onNone: () => ({}),
          onSome: (acceptDataFormat) => ({ acceptDataFormat }),
        }),
        ...Option.match(buildAcceptEventFields(rows), {
          onNone: () => ({}),
          onSome: (acceptEventFields) => ({ acceptEventFields }),
        }),
      })
    }).pipe(Effect.as(Message.CompletedConfigureFeed())),
})

/** Replace the candle subscription; what the chart drew for the previous one is dropped. */
export const SetCandleSubscription = Command.define('SetCandleSubscription', {
  args: { channelId: Schema.String, subscription: CandleSubscription },
  messages: [Message.CompletedSetCandleSubscription],
  execute: ({ channelId, subscription }) =>
    Effect.gen(function* () {
      yield* Effect.sync(() => {
        sinkFor(channelId).reset()
      })
      yield* withHandle(channelId, (handle) => {
        if (handle._tag === 'Candles') {
          handle.candles.setSubscription(subscription)
        }
      })

      return Message.CompletedSetCandleSubscription()
    }),
})

export const CopyEvents = Command.define('CopyEvents', {
  args: { text: Schema.String },
  messages: [Message.CompletedCopyEvents],
  execute: ({ text }) =>
    Effect.tryPromise(() => navigator.clipboard.writeText(text)).pipe(
      Effect.as(Message.CompletedCopyEvents()),
      Effect.orElseSucceed(() => Message.CompletedCopyEvents())
    ),
})

/** Closing is terminal: the feed sends CHANNEL_CANCEL and its handle is gone. */
export const CloseChannel = Command.define('CloseChannel', {
  args: { channelId: Schema.String },
  messages: [Message.CompletedCloseChannel],
  execute: ({ channelId }) =>
    Effect.gen(function* () {
      const handles = yield* FeedLive
      const maybeHandle = yield* handles.take(channelId)
      yield* Effect.sync(() => {
        dropSink(channelId)
        Option.map(maybeHandle, (handle) => {
          if (handle._tag === 'Feed') {
            handle.feed.close()
          } else {
            handle.candles.close()
          }
        })
      })

      return Message.CompletedCloseChannel()
    }),
})

/**
 * Build the candle chart in its container. The chart lives as long as the element; the
 * candles it shows live in the channel's sink, so a rebuilt chart starts where the last one
 * left off.
 */
export const MountChart = Mount.define('MountChart', {
  args: { channelId: Schema.String },
  messages: [Message.CompletedMountChart, Message.FailedDrawCandles],
  execute: ({ element, channelId }) =>
    Effect.gen(function* () {
      if (!(element instanceof HTMLElement)) {
        return Message.FailedDrawCandles({
          reason: 'The chart container is not an HTML element',
        })
      }
      yield* Effect.acquireRelease(
        Effect.try({
          try: () => sinkFor(channelId).attach(element),
          catch: describe,
        }),
        (detach) => Effect.sync(detach)
      )

      return Message.CompletedMountChart()
    }).pipe(Effect.catch((reason) => Effect.succeed(Message.FailedDrawCandles({ reason })))),
})
