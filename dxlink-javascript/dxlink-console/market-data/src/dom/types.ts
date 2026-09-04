/** Config a DOM channel is opened with. */
export interface DomConfig {
  symbol: string
  source: string
  /** Feed qualification — omitted from the protocol when empty. */
  feed: string
  /** Feed space — omitted from the protocol when empty. */
  space: string
}

/**
 * DOM channel-request parameters — the values entered in the request form. Preserved
 * between dialog opens so the user can quickly open several channels of the same kind.
 */
export interface DomRequest {
  symbol: string
  source: string
  feed: string
  space: string
}
