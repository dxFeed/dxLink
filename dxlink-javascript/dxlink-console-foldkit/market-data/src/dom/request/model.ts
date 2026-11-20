import { Predicate, Schema } from 'effect'

const TAG = 'DomRequest'

/**
 * The values entered in the DOM request form, and which of its sections are disclosed. Kept
 * between dialog opens, so several channels of the same kind are quick to open.
 */
export const Model = Schema.TaggedStruct(TAG, {
  symbol: Schema.String,
  source: Schema.String,
  feed: Schema.String,
  space: Schema.String,
  isFeedSectionOpen: Schema.Boolean,
})
export type Model = typeof Model.Type

/** Only this module builds a value carrying the tag, so the tag identifies the Model. */
export const isModel = (value: unknown): value is Model => Predicate.isTagged(value, TAG)
