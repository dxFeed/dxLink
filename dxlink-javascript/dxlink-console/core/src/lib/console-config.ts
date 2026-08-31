/** Connection keepalive timings, in seconds. */
export interface KeepaliveConfig {
  interval: number
  timeout: number
  acceptTimeout: number
}

/** A group of fields a host can pin, addressed as one. */
export type ConsoleConfigLock = 'wsUrl' | 'keepalive'

const LOCKS: readonly ConsoleConfigLock[] = ['wsUrl', 'keepalive']

/** Whether a value names a field group this console knows how to pin. */
export const isConsoleConfigLock = (value: unknown): value is ConsoleConfigLock =>
  typeof value === 'string' && (LOCKS as readonly string[]).includes(value)

/**
 * What a host can decide about a console before anyone opens it.
 *
 * These are the values forms **start** with, not the values they hold: everything here
 * seeds local draft state once and is never written back, so the user stays free to edit.
 * The exception is {@link ConsoleConfig.locked}, which is how a host says a field is fixed
 * rather than merely suggested.
 *
 * Deliberately small. Anything a single channel service needs — the RPC descriptor-set URL,
 * say — is that plugin's option rather than a field here, so core does not grow a vocabulary
 * for services it knows nothing about.
 */
export interface ConsoleConfig {
  /** Seeds the connection form's WebSocket URL. Empty means the user supplies one. */
  wsUrl: string
  keepalive: KeepaliveConfig
  /**
   * Which channel kinds the add-channel row offers.
   *
   * A set rather than a sequence: button order follows the registered plugins — the list
   * `ChannelsArea` filters — so ordering this list has no effect on the buttons.
   *
   * `null` means every registered plugin, which is the default — with an open kind
   * vocabulary there is no fixed list to enumerate, so "unrestricted" has to be its own
   * value rather than a list that happens to name everything. An empty array means none.
   */
  channelKinds: readonly string[] | null
  /**
   * Fields the host has pinned. They render read-only rather than hidden — this is a debug
   * console, so which endpoint you are talking to is worth seeing even when you cannot
   * change it.
   */
  locked: readonly ConsoleConfigLock[]
}

/** A partial profile, as each configuration source produces it. */
export interface ConsoleConfigInput {
  wsUrl?: string
  keepalive?: Partial<KeepaliveConfig>
  channelKinds?: readonly string[] | null
  locked?: readonly ConsoleConfigLock[]
}

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
  channelKinds: null,
  locked: [],
})

/**
 * Apply one source on top of a profile. Absent fields leave the base alone; `keepalive` is
 * merged field by field so a source can set the interval without restating the timeouts.
 */
const applyInput = (base: ConsoleConfig, input: ConsoleConfigInput): ConsoleConfig => ({
  wsUrl: input.wsUrl ?? base.wsUrl,
  keepalive: { ...base.keepalive, ...input.keepalive },
  channelKinds: input.channelKinds !== undefined ? input.channelKinds : base.channelKinds,
  locked: input.locked ?? base.locked,
})

/**
 * Reduce the query-string layer to what it is allowed to say.
 *
 * Two things happen here, and both are the lock rules made structural rather than left to
 * whoever parsed the query string: a field a lock covers is dropped so the pin holds, and
 * `locked` itself is dropped so a link cannot pin or unpin anything. The second used to be
 * guaranteed by the parser simply never reading a `locked` parameter; now that sources arrive
 * pre-parsed, the guarantee has to live where the rule is documented.
 */
const asSearchLayer = (
  input: ConsoleConfigInput,
  locked: readonly ConsoleConfigLock[]
): ConsoleConfigInput => {
  const kept: ConsoleConfigInput = { ...input }
  delete kept.locked
  if (locked.includes('wsUrl')) delete kept.wsUrl
  if (locked.includes('keepalive')) delete kept.keepalive

  return kept
}

export interface ConsoleConfigSources {
  /**
   * Defaults the serving application itself carries — the one place a build-time choice
   * (say, a development relay) belongs, so nothing below has to know about bundlers.
   */
  app?: ConsoleConfigInput
  /** What the host injected into the page. The only source allowed to lock a field. */
  injected?: ConsoleConfigInput
  /** What the page URL carried, already parsed. */
  search?: ConsoleConfigInput
}

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
  const base = builtinConsoleConfig()
  const withApp = applyInput(base, sources.app ?? {})
  const withInjected = applyInput(withApp, sources.injected ?? {})

  return applyInput(withInjected, asSearchLayer(sources.search ?? {}, withInjected.locked))
}
