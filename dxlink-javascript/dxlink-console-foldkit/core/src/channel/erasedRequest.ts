import { Schema } from 'effect'

/**
 * A plugin's channel request, as core holds it. Opaque for the same reason an open channel
 * is: only the plugin that produced it ever reads it.
 */
export const Model = Schema.Unknown
export type Model = typeof Model.Type

export const Message = Schema.Unknown
export type Message = typeof Message.Type
