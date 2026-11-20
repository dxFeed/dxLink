import { Schema } from 'effect'

/** What a DOM channel is opened with. */
export const DomConfig = Schema.Struct({
  symbol: Schema.String,
  /** Price-level sources as typed: a comma- or space-separated list. */
  source: Schema.String,
  /** Feed qualification — left out of the protocol request when empty. */
  feed: Schema.String,
  /** Feed space — left out of the protocol request when empty. */
  space: Schema.String,
})
export type DomConfig = typeof DomConfig.Type
