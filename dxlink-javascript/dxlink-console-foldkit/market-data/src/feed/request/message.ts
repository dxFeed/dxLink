import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Feed } from '../domain'

export const Message = defineMessageUnion({
  SelectedView: { view: Feed.FeedView },
  UpdatedFeed: { value: Schema.String },
  UpdatedSpace: { value: Schema.String },
  ToggledFeedSection: { isOpen: Schema.Boolean },
})
export type Message = typeof Message.Type
