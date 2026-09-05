/**
 * Documentation links used in this channel's form helper text.
 *
 * The FEED channel in `@dxfeed/dxlink-console-market-data` links the same two references from
 * its own copy, for the same reason its `DocLink` is its own: a plugin package is
 * self-contained. Sharing these would mean either a dependency on that package — pulling the
 * data grid and both its channels in behind it — or core holding market-data vocabulary.
 */

/** Candle symbol format reference, linked from the indicator subscription form. */
export const CANDLE_SYMBOLS_DOC_URL =
  'https://kb.dxfeed.com/en/data-access/rest-api.html#candle-symbols'

/** Unix-milliseconds helper, linked from the `fromTime` field. */
export const EPOCH_MILLIS_DOC_URL = 'https://currentmillis.com/'
