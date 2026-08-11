# Handoff — finishing the dxlink-docs → dxlink-debug-console migration

For an agent working on a machine **with access to dxFeed's internal npm registry**.
Everything here needs that access; it is the only reason these items are open.

- Branch: `claude/dxlink-docs-migration-plan-efwasa`
- PR: [#40](https://github.com/dxFeed/dxLink/pull/40), based on `chore/modernize-tooling`
  (not `main` — `main` has none of the debug-console history)
- Parity status and remaining work: [MIGRATION.md](./MIGRATION.md)

## Why anything is left

The branch was authored in a sandbox that cannot reach `dxfeed.jfrog.io`. Four packages
resolve only from there — `@dxfeed/ui-kit` and all three `@dxscript/*` — so `pnpm install`
could not complete at all. The code was typechecked, linted, tested (86 tests) and built
against local stubs reproducing the surface the console uses; those stubs live outside the
repo and are **not** in the diff.

That means: everything not touching `@dxscript/*` is genuinely verified. The editor and
chart integrations are compile-checked against a reconstruction, not the real packages.

**Do not** commit stubs, add ambient `declare module` blocks for `@dxscript/*` (those
packages ship their own types — an ambient block would shadow and hide real mismatches),
or relax `minimumReleaseAge` / the tarball-URL policy in `pnpm-workspace.yaml`.

---

## Task 1 — Regenerate the lockfile (blocking; do this first)

`package.json` gained `@asyncapi/react-component` and `@dxscript/dxlink-dxscript-editor`
and lost `@dxscript/js-samples`, but `pnpm-lock.yaml` was left untouched on purpose: this
sandbox's registry differs from yours, so a regenerated lockfile would have rewritten every
internal `@dxfeed/*` and `@dxscript/*` resolution to public npm URLs. Nothing else on the
branch can be verified until this is done — `pnpm install --frozen-lockfile` currently
fails with `ERR_PNPM_OUTDATED_LOCKFILE`, so CI cannot run either.

```sh
cd dxlink-javascript
pnpm install                       # updates pnpm-lock.yaml
git diff --stat pnpm-lock.yaml
```

Expected in the diff: the `dxlink-debug-console` importer gains the two packages and drops
`js-samples`, plus their transitive entries. **Check before committing** that internal
resolutions still point at `dxfeed.jfrog.io` and that no unrelated package was bumped —
if the whole file churns, stop and investigate rather than committing it.

Then confirm the lockfile is actually honoured:

```sh
pnpm install --frozen-lockfile
```

## Task 2 — Verify the dxScript editor for real

Pinned at `@dxscript/dxlink-dxscript-editor@1.12.0-SNAPSHOT` — the version already in the
lockfile, which declares `react >=18`. Only file involved:
`src/features/indichart/indichart-channel-request.tsx`.

```sh
pnpm --filter @dxfeed/dxlink-debug-console typecheck
pnpm console      # then: connect → authorize → Channels → IndiChart
```

Check, in the New IndiChart channel dialog:

1. The editor renders with dxScript highlighting and the samples button works.
2. Picking a sample, then **Open channel**, opens a channel running that script.
3. Add three indicators, type distinct code in each, remove the middle one — the two
   remaining editors must still show their own code, and the opened channel must use
   exactly those two scripts. _(This is the bug fixed in `9f26fe8`; see Task 4.)_
4. Align the version: check whether a snapshot matching
   `@dxscript/dxlink-dxcharts-lite@1.13.0-SNAPSHOT-2` exists and prefer it if so.

### If it does not compile or behave

The integration assumes the editor is **uncontrolled** — `onChange` only, no way to push
text in — which is how `dxlink-docs` used it. Three deliberate compromises follow from that
assumption, and **all three should be undone if the package turns out to accept a
`value` / `defaultValue` / `initialValue` prop**:

| Compromise                                                        | Where                               | Undo if the editor can be pre-filled                                                                           |
| ----------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Editors start empty instead of pre-filled with a sample           | `indichart-channel-request.tsx`     | Seed `createIndicatorEntry(DEFAULT_SAMPLE)` and pass the value in                                              |
| The IndiChart request resets every time the dialog opens          | `channels-area.tsx` → `openRequest` | Drop the reset; let it persist like the Feed and DOM requests                                                  |
| Our samples dropdown was removed in favour of the editor's button | `indichart-channel-request.tsx`     | Only reconsider if the editor has no samples button; it depends on `@dxscript/js-samples` itself, so it should |

Only the props `dxlink-docs` passes are used (`onChange`, `placeholder`, `height`,
`enableSamplesButton`, `showLangLogo`); none were invented. If a prop name is wrong,
compare against `dxlink-docs/src/debug-console/script-candles-subscription.tsx`.

## Task 3 — Verify the chart paths

`@dxscript/dxlink-dxcharts-lite` was also stubbed. Behaviour is unchanged from before this
branch, but the surface was never compiled against the real types here.

- `src/features/feed/feed-chart-channel.tsx` — Feed channel, "Candle chart" view
- `src/features/indichart/indichart-channel.tsx` — IndiChart channel

Both now wrap `pushData` in `try/catch`; confirm that still typechecks and that charts
render and update live. Also exercise **Apply parameters** (should recompute indicators
without refetching candles) and **Reset** (should stop the stream and clear the chart — it
closes and reopens the channel, so the channel id in the card header changes).

## Task 4 — Add the test that could not be written here

Finding #1 from review (`9f26fe8`) — indicator cards keyed by array index while the editor
is uncontrolled — is fixed but **untested**: asserting it requires rendering
`DxScriptEditor`, and a test written against the sandbox stub would have failed against the
real package. With the real package installed, add it to
`src/features/indichart/` alongside the existing tests.

What to assert: with three indicators holding distinct code, removing the middle one leaves
the remaining two editors showing their own code and `IndiChartRequest.indicators` matching
what is displayed. The fix is the `entry.id` React key plus `createIndicatorEntry`
(`src/features/channels/types.ts`), which has its own unit test in `types.test.ts`.

## Task 5 — Parity sign-off against a live server

Walk the matrix in [MIGRATION.md §2](./MIGRATION.md) against a real endpoint. Highest-value
checks, being the behaviours restored on this branch:

- A multi-source `Order` subscription (same symbol, `NTV` and `DEX`) produces **two** grid
  rows, not one.
- Feed grid columns follow the order the server negotiated in `FeedConfig.eventFields`.
- A deliberately invalid subscription surfaces its error on that channel's card only, and
  nowhere else.
- A SESSION indicator parameter round-trips through the dialog (interval, raw, presets) and
  sends the string the Result field shows.
- A COLOR parameter delivered as a dxScript name (e.g. `RED`) shows the right swatch.
- `/protocol` renders the spec, Download works, and it is readable in dark mode.

Then dark-mode and responsive QA, and the E2E work in MIGRATION.md §4 item 3.

## Task 6 — Decisions to settle with the team

Recorded in [MIGRATION.md §6](./MIGRATION.md); none are code-blocked.

- **D2** — the dev default WebSocket URL is now `wss://dxlink-md-ws-dev.dxkube.com`
  (`src/shared/lib/connection-url.ts`), where `dxlink-docs` used `ws://localhost:9959`.
  Friendlier, but it points a dev build at a shared server by default.
- **D3** — DOM "Accept order fields" is still the disabled stub both consoles shipped.
- **D4** — where is `dxlink-docs` deployed from? No CI config exists anywhere in this
  repository, so MIGRATION.md §4 item 6 (retiring `dxlink-docs`) cannot start without it.

---

## Verification commands

From `dxlink-javascript`:

```sh
pnpm install
pnpm --filter @dxfeed/dxlink-debug-console lint
pnpm --filter @dxfeed/dxlink-debug-console typecheck
pnpm --filter @dxfeed/dxlink-debug-console test        # 86 tests at time of handoff
pnpm --filter @dxfeed/dxlink-debug-console build
pnpm console                                          # dev server on :4280
```

Workspace-wide: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

Two things worth knowing about the build:

- `/protocol` is lazy-loaded and should stay its own chunk (~2.4 MB, versus ~1.1 MB
  initial). If it collapses into the entry chunk, the lazy boundary in `app/routes.tsx`
  regressed.
- `dxlink-specification/asyncapi.yml` must appear in `build/assets/` — the viewer fetches
  it and the Download button serves it.

Delete this file once the tasks are done.
