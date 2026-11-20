import { Schema } from 'effect'

import { Feed } from '../domain'

const REQUEST_KIND = 'FeedRequest'

/**
 * FEED channel-request parameters — the values entered in the request form. Kept between
 * dialog opens so several channels of the same kind are quick to open.
 */
export const Model = Schema.Struct({
  kind: Schema.Literal(REQUEST_KIND),
  view: Feed.FeedView,
  feed: Schema.String,
  space: Schema.String,
  /** Whether the section holding the optional feed parameters is expanded. */
  isFeedSectionOpen: Schema.Boolean,
})
export type Model = typeof Model.Type

export const initialModel = (): Model => ({
  kind: REQUEST_KIND,
  view: 'Subscriptions',
  feed: '',
  space: '',
  isFeedSectionOpen: false,
})
