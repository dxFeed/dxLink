/**
 * Autocomplete props for a field that offers a list *and* accepts anything.
 *
 * `freeSolo` alone gives only the second half, because four MUI defaults are keyed off it and
 * every one of them assumes free text means "no list worth browsing":
 *
 * - the popup indicator is hidden — `hasPopupIcon` is
 *   `(!freeSolo || forcePopupIcon === true) && forcePopupIcon !== false`, so with the default
 *   `forcePopupIcon="auto"` a free-text field has no arrow, and the options are reachable only
 *   by typing a prefix that happens to match one;
 * - `selectOnFocus` defaults to `!freeSolo`, so focusing does not select what is already
 *   there and the next keystroke *appends* — typing `Order` into a field reading `Quote`
 *   leaves `QuoteOrder`, which matches nothing and silently subscribes to a bogus type;
 * - `handleHomeEndKeys` defaults to `!freeSolo`, so Home/End do not reach the list;
 * - `openOnFocus` defaults to `false`, so clicking the field shows nothing.
 *
 * Setting all four gives the behaviour these fields were always documented to have: click to
 * browse every known value, or type your own over the top of the current one.
 */
export const BROWSABLE_FREE_TEXT = {
  freeSolo: true,
  forcePopupIcon: true,
  openOnFocus: true,
  selectOnFocus: true,
  handleHomeEndKeys: true,
} as const
