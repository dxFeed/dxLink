import { Effect, MutableHashMap, type Option } from 'effect'

/**
 * The live objects behind a plugin's open channels, as its Commands find them.
 *
 * A Model holds only what can be rendered and replayed, so the dxLink object of a channel —
 * a feed, a call — is kept here instead, addressed by the id of the channel's card. The
 * channel's `connect` Effect `put`s it once it is open and `take`s it in the finalizer that
 * closes it; a Command looks it up with `get` to act on it, and finds `None` when the channel
 * is not connected.
 *
 * A plugin builds one of these in an app-lifetime Layer (the runtime's `resources`), so
 * `connect` and every Command see the same instance.
 */
export type ChannelHandles<Handle> = Readonly<{
  put: (channelId: string, handle: Handle) => Effect.Effect<void>
  get: (channelId: string) => Effect.Effect<Option.Option<Handle>>
  /** Remove a handle and return it. `None` when it was already taken. */
  take: (channelId: string) => Effect.Effect<Option.Option<Handle>>
}>

export const makeChannelHandles = <Handle>(): Effect.Effect<ChannelHandles<Handle>> =>
  Effect.sync(() => {
    const handles = MutableHashMap.empty<string, Handle>()

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
    }
  })
