# dxlink-console — how to validate changes

Read this before verifying anything in this package by hand. It records which server does
what, which checks are worth running, and the traps that cost time on the way here.

Design is in [ARCHITECTURE.md](./ARCHITECTURE.md); what is still open is in
[README.md](./README.md).

---

## Endpoints — the service decides the server

There is no single endpoint that serves everything. The console holds **one**
`DXLinkWebSocketClient` for the whole page (`ConnectionProvider` in `core/src/console-page.tsx`),
so all open channels share whatever URL is in the connection form. To test the other
service, change the URL and reconnect.

| Service                 | URL                                  |
| ----------------------- | ------------------------------------ |
| FEED, DOM, candle chart | `wss://dxlink-md-ws-dev.dxkube.com`  |
| **INDICHART**           | `wss://dxlink-dxs-ws-dev.dxkube.com` |
| **RPC**                 | a dxLink server that hosts it        |

The RPC channel also needs service definitions, and those come over HTTP rather than the
socket: a dxLink server publishes a `FileDescriptorSet` at `/proto/docs`. That endpoint sends
no CORS headers and answers a preflight with 403, so it can only be fetched same-origin —
either the console is served by the same server, or something local puts them on one origin.
Failing that, load a descriptor set from a file instead.

The market-data relay answers an INDICHART channel request with
`BAD_ACTION — Unsupported service: 'INDICHART'`. That is the server declining, not a
console bug — the channel opens, is rejected, and closes, and the error lands on that
channel's own card. `core/src/lib/connection-url.ts` defaults to the market-data URL, so
IndiChart always needs the URL changed by hand.

## Running it

```bash
pnpm --filter @dxfeed/dxlink-debug-console dev
```

Serves <http://localhost:4280>. After a dependency change, run it once with `--force` or
Vite keeps serving the previous pre-bundle.

## Checks

The console is four packages now, so run the checks across all of them at once rather than
naming one:

```bash
pnpm turbo run build lint test typecheck --filter './dxlink-console/*'
```

Or one package at a time — `@dxfeed/dxlink-console-core`, `-market-data`, `-rpc`, and the app
`@dxfeed/dxlink-debug-console` (which has the only `build` and no tests of its own).

Test runs print sourcemap warnings pointing into `@dxscript/dxlink-dxscript-editor`. Its
published sourcemaps reference sources it does not ship; the warnings are noise.

---

## What to walk, and what each check is actually proving

Every item below is a behaviour that broke at least once during the rebuild and was walked
against a live server afterwards. They are the checks worth repeating.

### On the market-data URL

- **Order sources do not collapse.** Subscribe `Order` on `AAPL` twice under the
  Indexed tab, once per source (`NTV`, `DEX`). You must get **two rows**. One row means
  the grid key lost its `#source` suffix.
  The source field is a `freeSolo` Autocomplete — it accepts values off the list, and
  it does not upper-case them, so a typed `ntv` is subscribed as `ntv`.
- **Column order follows the negotiated config.** Columns must arrive in
  `FeedConfig.eventFields` order — for `Quote` that is `eventSymbol, eventType, eventTime,
sequence, timeNanoPart, bid*, ask*`. Alphabetical order means the negotiated order was
  dropped.
- **All 18 event types.** The event-type combobox must list 18, including
  `DailyCandle`, `TradeETH`, `Configuration`, `Message`.

### On the dxScript URL

Open an IndiChart channel. The editor seeds itself with its first bundled sample, which
compiles as-is.

There are two buttons, and each sits with what it acts on.

- **Apply** — in the Subscription block, with the symbol. Candles load and the chart draws.
- **Apply parameters** — **below the indicator panels**, with the inputs it acts on,
  and rendered only when some indicator declares inputs. The editor's default sample
  declares none, so with it the button is legitimately absent; paste the script below to
  see it. Indicators recompute with **no candle reload** — the chart must not blank or
  reset. If the loading overlay reappears, it re-subscribed instead of calling
  `updateIndicatorsParameters`.
- **Indicator states are sent once, at compile**, and are **not** repeated for a
  re-subscribe. Anything derived from them — `outputs` especially — must therefore survive
  `Apply`. Clearing it there once left the panel reading "0 outputs" while the chart drew
  those very series.

To exercise the parameter fields, there is no bundled sample with colour or session
inputs. Paste a script that declares them:

```js
const len = input.double('length', 14)
const on = input.bool('enabled', true)
const label = input.string('label', 'demo')
const col = input.color('lineColor', color.RED)
const sess = input.session('session', '0930-1600')
const src = input.source('price', close)

function onTick() {
  spline(ta.sma(src, len), { title: label, color: col })
}
```

That compiles to 6 inputs · 1 output and should render:

- **COLOR** — `lineColor` shows a **red** swatch and `#FF0000`. Black means the
  dxScript palette lookup in `market-data/src/indichart/colors.ts` failed.
- **SESSION** — a field with a trigger button, opening Interval/Raw modes, start and
  end pickers, weekday toggles, a read-only indicator timezone and a result preview. A
  plain text box means the rich field regressed.
- DOUBLE, BOOL, STRING and SOURCE render as number, switch, text and dropdown, each
  labelled with its type.

For **script errors**, open a channel whose script calls something undefined inside
`onTick`. Expect the category title (`Runtime error`, not a blanket "compilation error"),
the message, `In script '1' at line N, column N`, and a **stack trace**. The collapsed
summary line must name the same category as the alert below it.

### RPC channels

The RPC channel calls a method of a protobuf service. It has no built-in service list: it
is given a `FileDescriptorSet` and builds the registry in the browser, so it needs one to
walk at all. Any will do — `/proto/docs` from a server serving the console, or a local file
from `buf build -o descriptors.binpb`. Both the binary format and protobuf-JSON are accepted,
told apart by the first non-whitespace byte.

- **The fetch asks for binary.** `/proto/docs` negotiates on `Accept` and treats a wildcard
  as a vote for JSON, so a request that does not ask gets the larger representation — 243 KB
  against 114 KB when this was written. Check the network tab: the response must come back
  `Content-Type: application/protobuf`. Note that asking for a media type makes a
  cross-origin request preflighted, which is a second reason that endpoint has to be
  same-origin or CORS-enabled.

- **The pickers come from the descriptor set.** After Load, the dialog reports how many
  services it found, and the service and method pickers fill from it. Each method carries
  its dxLink interaction model — `REQUEST_RESPONSE`, `REQUEST_STREAM`, `STREAM_STREAM` —
  and a **client-streaming method is listed but not selectable**, tagged `STREAM_RESPONSE`.
  That is the wire's missing half-close, not a console bug; `@dxfeed/dxlink-protobuf-es`
  refuses those methods too.
- **The request form is generated, not written.** Picking a method rebuilds the fields from
  `method.input`. What the controls write is canonical protobuf-JSON, so a 64-bit field is
  a **string** (`"quantity": "10"`) and an enum is its **value name** (`"side": "BUY"`) —
  numbers there would mean the template was built from the ECMAScript shapes instead. The
  Request JSON box below edits the same value and is what is sent.
- **A bad request is caught before the channel opens.** Rename a field in the JSON box to
  something the message does not declare: an error names the field and `Open channel` goes
  disabled. A silently dropped typo is the failure this form exists to prevent.
- **Send another request** appears only for `STREAM_STREAM`, and is disabled once the call
  completes or fails — there is no channel left to send on.
- **Sent must show 1 for a unary call**, not 2. The card's message log is reset by
  `RpcViewModel.start()` for exactly this reason: StrictMode mounts, unmounts and remounts
  the view, and the store outlives that cycle.

**A descriptor set can arrive without `json_name`, and dxLink's own does.** Only the bundled
`google/protobuf/*` files in `/proto/docs` carry it; the API's own fields are missing it (474
of 895 fields when this was written). `json_name` is optional on the wire and meant to be
deduced from the field name when absent, but protobuf-es assigns it straight through, so the
fields come back reporting an empty JSON name — which would put every field of a message
under one `""` key on the wire, losing all but the last, and reject the real names on the way
back. `parseDescriptorSet` deduces the missing ones with protobuf-es's own `protoCamelCase`.

The check: load `/proto/docs`, pick `AccountMetricsService.GetAccountMetrics`, and read the
request template. It must be `{"accountId": "", "descriptors": []}` — canonical camelCase,
one entry per field. A single `""` key means the deduction was dropped, and every request
built here is malformed.

**The end-to-end walk.** Point the connection form at a dxLink server that hosts RPC
services; it publishes its own definitions on `/proto/docs`. Such a server generally
**requires authorization**, and closes the socket 30 seconds after connect if none arrives —
`TIMEOUT — The timeout for AUTH has been reached`. So authorize promptly: a socket left
sitting is the usual reason the Channels area disappears mid-session.

Authorized, load `/proto/docs`, pick `AccountService` · `GetAccounts` — its request has no
fields, so the template is `{}` — and open the channel. Expect the card to reach **completed**
with `Sent 1` / `Received 1`, and the response to decode as protobuf-JSON:

```json
{ "accounts": [ { "id": "…", "status": "ACCOUNT_STATUS_ACTIVE",
                  "cashType": "ACCOUNT_CASH_TYPE_CASH", "instrumentTypes": ["INSTRUMENT_TYPE_STOCK", …] } ] }
```

Three things in that payload are the ones worth reading: keys are **camelCase**, `id` is a
**string** because it is an int64, and enums are their **value names**. Keys under a single
`""` mean the `json_name` deduction regressed, and the request would never have been read.

Against a server that does not implement the service — the market-data relay, say — the same
walk ends in `BAD_ACTION — Unsupported service: '<name>'` on the channel's own card, which
still exercises everything up to the wire.

### Theme and width

- Both light and dark. The editor takes its own `colorScheme` prop — it does not read the
  MUI palette — so it can render light inside a dark app if that prop is dropped.
- 375px wide. The app bar must stay on one row with no horizontal page scroll, and the
  theme switcher must remain on screen. It previously measured 587px against a 375px
  viewport, pushing the switcher out of reach.

---

## Traps

- **`useTheme().palette.mode` is not the mode on screen.** The theme is built with
  `cssVariables` + `colorSchemes`, so the palette is emitted once as CSS custom properties
  and `palette.mode` stays at its default. Use `useResolvedColorScheme()` from
  `market-data/src/indichart/color-scheme.ts`, which resolves `'system'` through `systemMode`.
- **The dxScript editor is controlled, via `script`** — not `value`, and it is not
  uncontrolled. It is passed `entry.code || undefined`: `''` would mount it empty and
  suppress the bundled sample.
- **Driving the editor from a test or a browser console**: it is Ace, so `Cmd+A` through
  the hidden textarea does not select the buffer. Use the Ace API —
  `window.ace.edit(document.querySelector('.ace_editor')).setValue(src, -1)` — which fires
  the change handler and updates React state.
- **Ace renders nothing measurable in jsdom.** `.ace_content` is empty there, so unit
  tests cannot assert on displayed text; identify editors by DOM node identity instead.
  See `indichart-channel-request.test.tsx`.
- **`@dxfeed/ui-kit` is unpublished.** It is gone from npmjs, nexus and jFrog. Nothing here
  depends on it any more — do not reintroduce it.
- **Do not relax the pnpm supply-chain policy** to make an install succeed, and do not add
  ambient `declare module` blocks for `@dxscript/*` — those packages ship their own types,
  and a stub would hide a real mismatch.
