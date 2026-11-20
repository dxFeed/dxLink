# Agent Development Notes

This is a Foldkit app. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing any code in this project. It covers the architecture, the APIs, and the conventions the project is built on.

Foldkit owns `FOLDKIT.md` and replaces it whole on upgrade. This file is yours. Anything you want an agent to know about this project goes below, where an upgrade won't touch it.

`FOLDKIT.md` reads the line below to decide whether it has already offered to vendor the Foldkit source. Leave it in place.

subtree_prompted: true

## Project Notes

This directory is the dxLink debug console on Foldkit: four packages — `core`, `market-data`,
`rpc` and `app` — each a Foldkit project with its own lint, test and TypeScript configuration.
[`ARCHITECTURE.md`](./ARCHITECTURE.md) has the design, [`README.md`](./README.md) how to run it.

- Formatting is the repository's Prettier (`pnpm run format` from `dxlink-javascript`), not
  Oxfmt.
- The packages are consumed as source. Tailwind class names must be literal strings in a file
  under a package's `src`, which `app/src/styles.css` names as a source.
- A Model or Message holds plain JSON-like data only: no `undefined` property values, no `NaN`,
  no class instances. A dxLink object belongs in a `ChannelHandles` service; what it reports is
  mapped to plain data in the Command or Stream that observes it.
- The React console in `../dxlink-console` is a separate product with its own conventions; do
  not share code between the two.
