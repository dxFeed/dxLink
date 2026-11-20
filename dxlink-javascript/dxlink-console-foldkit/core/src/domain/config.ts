import { Array, Option, Schema } from 'effect'

/** Connection keepalive timings, in seconds. */
export const KeepaliveConfig = Schema.Struct({
  interval: Schema.Finite,
  timeout: Schema.Finite,
  acceptTimeout: Schema.Finite,
})
export type KeepaliveConfig = typeof KeepaliveConfig.Type

/** A group of fields a host can pin, addressed as one. */
export const ConsoleConfigLock = Schema.Literals(['wsUrl', 'keepalive'])
export type ConsoleConfigLock = typeof ConsoleConfigLock.Type

/** Whether a value names a field group this console knows how to pin. */
export const isConsoleConfigLock = Schema.is(ConsoleConfigLock)

/**
 * What a host can decide about a console before anyone opens it.
 *
 * These are the values forms **start** with, not the values they hold: everything here seeds
 * the Model once and is never written back, so the user stays free to edit. The exception is
 * `locked`, which is how a host says a field is fixed rather than merely suggested.
 *
 * Deliberately small. Anything a single channel service needs — the RPC descriptor-set URL,
 * say — is that plugin's option rather than a field here, so core does not grow a vocabulary
 * for services it knows nothing about.
 */
export const ConsoleConfig = Schema.Struct({
  /** Seeds the connection form's WebSocket URL. Empty means the user supplies one. */
  wsUrl: Schema.String,
  keepalive: KeepaliveConfig,
  /**
   * Which channel kinds the add-channel row offers.
   *
   * A set rather than a sequence: button order follows the registered plugins. `None` means
   * every registered plugin, which is the default — with an open kind vocabulary there is no
   * fixed list to enumerate, so "unrestricted" has to be its own value rather than a list
   * that happens to name everything. An empty array means none.
   */
  maybeChannelKinds: Schema.Option(Schema.Array(Schema.String)),
  /**
   * Fields the host has pinned. They render read-only rather than hidden — this is a debug
   * console, so which endpoint you are talking to is worth seeing even when you cannot
   * change it.
   */
  locked: Schema.Array(ConsoleConfigLock),
})
export type ConsoleConfig = typeof ConsoleConfig.Type

/**
 * A partial profile, as each configuration source produces it.
 *
 * `channelKinds: null` says "unrestricted" out loud, which is different from leaving the key
 * out: an absent key keeps whatever the layer below decided.
 */
export type ConsoleConfigInput = Readonly<{
  wsUrl?: string
  keepalive?: Partial<KeepaliveConfig>
  channelKinds?: ReadonlyArray<string> | null
  locked?: ReadonlyArray<ConsoleConfigLock>
}>

/**
 * The profile a console falls back to when nothing is supplied.
 *
 * There is no WebSocket URL here, and that is the point: deriving one means knowing how this
 * console is deployed — whether it sits next to its endpoint, whether a development build
 * should reach for a shared relay — and core has no business knowing either. A host supplies
 * it as a source (see {@link resolveConsoleConfig}); until one does, the field starts empty
 * and the user types it.
 */
export const builtinConsoleConfig = (): ConsoleConfig => ({
  wsUrl: '',
  keepalive: { interval: 30, timeout: 60, acceptTimeout: 60 },
  maybeChannelKinds: Option.none(),
  locked: [],
})

/**
 * Apply one source on top of a profile. Absent fields leave the base alone; `keepalive` is
 * merged field by field so a source can set the interval without restating the timeouts.
 */
const applyInput = (base: ConsoleConfig, input: ConsoleConfigInput): ConsoleConfig => ({
  wsUrl: input.wsUrl ?? base.wsUrl,
  keepalive: {
    interval: input.keepalive?.interval ?? base.keepalive.interval,
    timeout: input.keepalive?.timeout ?? base.keepalive.timeout,
    acceptTimeout: input.keepalive?.acceptTimeout ?? base.keepalive.acceptTimeout,
  },
  maybeChannelKinds:
    input.channelKinds === undefined
      ? base.maybeChannelKinds
      : Option.fromNullishOr(input.channelKinds),
  locked: input.locked ?? base.locked,
})

/**
 * Reduce the query-string layer to what it is allowed to say.
 *
 * Both lock rules are structural here rather than left to whoever parsed the query string: a
 * field a lock covers is dropped so the pin holds, and `locked` itself is dropped so a link
 * cannot pin or unpin anything.
 */
const asSearchLayer = (
  input: ConsoleConfigInput,
  locked: ReadonlyArray<ConsoleConfigLock>
): ConsoleConfigInput => ({
  ...(input.wsUrl !== undefined && !Array.contains(locked, 'wsUrl') ? { wsUrl: input.wsUrl } : {}),
  ...(input.keepalive !== undefined && !Array.contains(locked, 'keepalive')
    ? { keepalive: input.keepalive }
    : {}),
  ...(input.channelKinds !== undefined ? { channelKinds: input.channelKinds } : {}),
})

export type ConsoleConfigSources = Readonly<{
  /**
   * Defaults the serving application itself carries — the one place a build-time choice
   * (say, a development relay) belongs, so nothing below has to know about bundlers.
   */
  app?: ConsoleConfigInput
  /** What the host injected into the page. The only source allowed to lock a field. */
  injected?: ConsoleConfigInput
  /** What the page URL carried, already parsed. */
  search?: ConsoleConfigInput
}>

/**
 * Resolve one profile from every source, later sources winning:
 *
 * ```
 * built-in defaults  ←  app defaults  ←  injected config  ←  query string
 * ```
 *
 * Two rules make locking mean something:
 *  - **only the injected config can lock a field.** A query parameter is written by
 *    whoever opened the link, so letting it pin a field would be pointless and letting it
 *    unpin one would make locking a lie.
 *  - **a locked field ignores its query parameter**, otherwise the pin would not hold.
 *
 * Locks deliberately do not gate the app layer: that is the same deployment speaking.
 *
 * Every source arrives already parsed. Reading an injected global or a query string is a
 * standalone-deployment concern and belongs to whoever owns the page; what lives here is the
 * merge order and the lock rules, which are the same wherever the values came from.
 */
export const resolveConsoleConfig = (sources: ConsoleConfigSources): ConsoleConfig => {
  const withApp = applyInput(builtinConsoleConfig(), sources.app ?? {})
  const withInjected = applyInput(withApp, sources.injected ?? {})

  return applyInput(withInjected, asSearchLayer(sources.search ?? {}, withInjected.locked))
}
