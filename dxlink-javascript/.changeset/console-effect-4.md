---
'@dxfeed/dxlink-console-core': minor
'@dxfeed/dxlink-console-market-data': minor
'@dxfeed/dxlink-console-dxscript': minor
'@dxfeed/dxlink-console-rpc': minor
---

Rebuild the console's state on Effect 4. The Zustand ViewModels are gone: each dxLink object is
wrapped in a model of atoms (`effect/reactivity`), and held open by a session — a scoped Effect
that acquires the object, registers its listeners and forks the fibers that drain them, all
released together when the session ends. Views bind with `@effect/atom-react`. `ConsolePage`
renders its own atom registry, so a host needs no Effect setup of its own, and everything the
console holds is released with the page.

`effect` and `@effect/atom-react` (`^4.0.0`) are new **peer** dependencies of all four
packages, for the reason React is one: the console and its channel packages must share a single
registry context. `zustand` is no longer a dependency.

Breaking for code that builds a channel plugin on core's host API:

- `useConnectionVM()`, `ConnectionViewModel`, `useVM`, `useOwnedViewModel`,
  `createViewModelContext` and the `ViewModel` type are removed. Use `useConnection()` for the
  page's `ConnectionModel`, or `useConnectionClient()` for the live client a channel opens its
  channel on, and read atoms with `useAtomValue`.
- `ChannelErrorTracker`, `initialChannelErrorState` and `ChannelErrorState` are removed.
  `makeChannelAtoms()` and `trackChannel()` replace them, and `useChannelCard()` fills a
  `ChannelWidget` header from them.
- A channel model is built from `channelSession` — which holds a dxLink channel object open
  until the channel is closed, follows its protocol channel and keeps the card's atoms alive —
  or the plain `session` beneath it, with `on`, `listen` and `command`, exported from core
  together with `FLUSH_INTERVAL`.
- `ChannelWidget` no longer keeps its own closed state: it shows the `closed` prop
  (`useChannelCard` passes the model's), and offers the close button only when given
  `onClose`.

Plugins themselves, `ConsolePage`'s props, the configuration profile and the theming contract
are unchanged.
