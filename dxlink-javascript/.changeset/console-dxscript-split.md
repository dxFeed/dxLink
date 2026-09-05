---
'@dxfeed/dxlink-console-dxscript': minor
'@dxfeed/dxlink-console-market-data': minor
---

Move the INDICHART channel out of `@dxfeed/dxlink-console-market-data` and into a new
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
