/**
 * The services the console can open a channel to, in the order they are offered.
 *
 * Lives in `shared` rather than with the channel types because the console configuration
 * profile needs the same vocabulary, and `shared` is the only layer both it and
 * `features/channels` can reach. `features/channels/types.ts` re-exports the type, so the
 * channel slices keep importing it from where they always have.
 *
 * The tuple, not just the union, because a supplied configuration carries channel kinds as
 * plain strings and they have to be validated at runtime.
 */
export const CHANNEL_KINDS = ['feed', 'dom', 'indichart', 'rpc'] as const

export type ChannelKind = (typeof CHANNEL_KINDS)[number]

/** Whether an arbitrary value names a channel kind. */
export const isChannelKind = (value: unknown): value is ChannelKind =>
  typeof value === 'string' && (CHANNEL_KINDS as readonly string[]).includes(value)
