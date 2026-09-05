/**
 * Version of the dxlink-websocket-client package.
 * `__DXLINK_VERSION__` is replaced with the package version at build time via
 * tsup's `define` (see tsup.config.ts), so it is inlined into the bundle as a
 * string literal. In dev/test runs the constant is undefined and we fall back
 * to 'local-unknown'; `typeof` keeps that safe even though the global is only
 * declared, not defined.
 * @internal
 */
declare const __DXLINK_VERSION__: string | undefined

export const VERSION =
  typeof __DXLINK_VERSION__ === 'undefined' ? 'local-unknown' : __DXLINK_VERSION__
