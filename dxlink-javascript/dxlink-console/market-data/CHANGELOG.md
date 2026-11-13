# @dxfeed/dxlink-console-market-data

## 0.10.0

### Minor Changes

- cfc5bcf: Move the INDICHART channel out of `@dxfeed/dxlink-console-market-data` and into a new
  `@dxfeed/dxlink-console-dxscript`. It was the only channel needing the dxScript editor and the
  dxScript-aware build of dxcharts-lite — the heaviest dependencies the console can pull — and a
  host registering only FEED and DOM had to install them anyway. Both are **peer** dependencies
  of the new package, so registering `indiChartChannelPlugin` is what opts a host into them.

  `@dxfeed/dxlink-console-market-data/indichart` is gone; import `indiChartChannelPlugin` from
  `@dxfeed/dxlink-console-dxscript` instead. The plugin, its config and its request types are
  unchanged.

  The FEED candle chart now draws on vanilla `@devexperts/dxcharts-lite` rather than the
  `@dxscript` build, which is what leaves market-data free of `@dxscript` altogether. Two things
  follow. It no longer imports a stylesheet, so the package declares `sideEffects: false` instead
  of omitting the field. And the chart takes its colours as configuration mapped from the MUI
  theme, rather than reading `--dx-chart-*` custom properties off the document root — so
  embedding market-data needs no global `CssBaseline`, and the chart now follows a light/dark
  switch immediately instead of holding its palette until the next re-subscribe.

  Core is unchanged. Where both channel packages need the same small helper — `DocLink`, and a
  `useResolvedColorScheme()` that reads the light/dark actually on screen, which
  `useTheme().palette.mode` cannot answer under `cssVariables` + `colorSchemes` — each carries
  its own copy. A channel package depends on core's published surface and nothing else, so
  registering one plugin never installs another's dependency tree.

- a769503: Publish the dxLink console as libraries. `@dxfeed/dxlink-console-core` carries the connection,
  auth, the channel-plugin registry and the configuration profile; `-market-data` adds the FEED
  and DOM channels behind subpath exports (`/feed`, `/dom`); `-dxscript` adds the INDICHART
  channel; `-rpc` adds the RPC channel over `@dxfeed/dxlink-protobuf-es`. Each ships dual
  ESM/CJS builds through a conditional `exports` map, matching the rest of the workspace.

  `ConsolePage` renders inside a page it does not own: the MUI reset is scoped to its own
  subtree, the theme inherits the host's font, and a console given a `theme` writes nothing to
  `<html>` and reads nothing from `localStorage`, following whatever light/dark class the host
  sets. React, MUI and emotion are peer dependencies, since each has to be a single instance
  shared with the host.

### Patch Changes

- Updated dependencies [a769503]
- Updated dependencies [a4e9244]
- Updated dependencies [7caca72]
- Updated dependencies [2aa0f0c]
- Updated dependencies [29774d4]
- Updated dependencies [04ce473]
  - @dxfeed/dxlink-console-core@0.10.0
  - @dxfeed/dxlink-api@0.10.0
