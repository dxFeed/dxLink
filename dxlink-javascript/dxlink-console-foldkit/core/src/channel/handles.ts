import { Effect, MutableHashMap, Option, PubSub, Stream } from 'effect'

import type { ChannelEvent } from './plugin'

/**
 * The live objects behind a plugin's open channels, and the Messages they produce.
 *
 * A Model holds only what can be rendered and replayed, so the dxLink object of a channel —
 * a feed, a call — lives here instead, addressed by the id of the channel's card. Commands
 * `put` it when the channel opens, look it up to act on it, and `take` it to close; its
 * listeners `emit` whatever happens in between, and `events` is the plugin's event Stream.
 *
 * A plugin builds one of these in an app-lifetime Layer (the runtime's `resources`), so every
 * Command and the event Stream see the same instance.
 */
export type ChannelHandles<Handle, Message> = Readonly<{
  put: (channelId: string, handle: Handle) => Effect.Effect<void>
  get: (channelId: string) => Effect.Effect<Option.Option<Handle>>
  /** Remove a handle and return it. `None` when it was already taken — closing is idempotent. */
  take: (channelId: string) => Effect.Effect<Option.Option<Handle>>
  /** Synchronous on purpose: dxLink listeners are plain callbacks. */
  emit: (channelId: string, message: Message) => void
  /** Messages emitted after the Stream is opened; earlier ones are not replayed. */
  events: Stream.Stream<ChannelEvent<Message>>
}>

export const makeChannelHandles = <Handle, Message>(): Effect.Effect<
  ChannelHandles<Handle, Message>
> =>
  Effect.gen(function* () {
    const handles = MutableHashMap.empty<string, Handle>()
    const pubsub = yield* PubSub.unbounded<ChannelEvent<Message>>()

    return {
      put: (channelId, handle) =>
        Effect.sync(() => {
          MutableHashMap.set(handles, channelId, handle)
        }),
      get: (channelId) => Effect.sync(() => MutableHashMap.get(handles, channelId)),
      take: (channelId) =>
        Effect.sync(() => {
          const maybeHandle = MutableHashMap.get(handles, channelId)
          MutableHashMap.remove(handles, channelId)

          return maybeHandle
        }),
      emit: (channelId, message) => {
        PubSub.publishUnsafe(pubsub, { channelId, message })
      },
      events: Stream.fromPubSub(pubsub),
    }
  })
