/** Config an INDICHART channel is opened with. */
export interface IndiChartConfig {
  /** Indicator scripts; the protocol names them 1..N by position. */
  indicators: string[]
}

/**
 * One indicator being drafted in the request form.
 *
 * The `id` is what React keys the editor card on. It cannot be the array index: the
 * dxScript editor is uncontrolled, so an index key lets React reuse a mounted editor for
 * a different entry after a removal, leaving the visible script and the request state
 * pointing at different indicators.
 */
export interface IndiChartRequestEntry {
  id: string
  code: string
}

/**
 * INDICHART channel-request parameters — the values entered in the request form.
 * Preserved between dialog opens so the user can quickly open several channels.
 */
export interface IndiChartRequest {
  indicators: IndiChartRequestEntry[]
}

let lastIndicatorId = 0

/** A draft indicator with an identity stable across reorders and removals. */
export const createIndicatorEntry = (code = ''): IndiChartRequestEntry => {
  lastIndicatorId += 1

  return { id: `indicator-${lastIndicatorId}`, code }
}

export const MAX_INDICATORS = 10
