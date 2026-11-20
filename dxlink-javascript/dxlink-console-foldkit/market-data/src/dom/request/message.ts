import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const Message = defineMessageUnion({
  UpdatedSymbol: { value: Schema.String },
  UpdatedSource: { value: Schema.String },
  UpdatedFeed: { value: Schema.String },
  UpdatedSpace: { value: Schema.String },
  ToggledFeedSection: { isOpen: Schema.Boolean },
})
export type Message = typeof Message.Type
