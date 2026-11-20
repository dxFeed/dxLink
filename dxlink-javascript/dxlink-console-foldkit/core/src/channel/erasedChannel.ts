import { Schema } from 'effect'

/**
 * An open channel, as core holds it.
 *
 * Both are opaque: they were produced by the plugin the channel belongs to and are only ever
 * handed back to that same plugin, which narrows them with its own guards.
 */
export const Model = Schema.Unknown
export type Model = typeof Model.Type

export const Message = Schema.Unknown
export type Message = typeof Message.Type
