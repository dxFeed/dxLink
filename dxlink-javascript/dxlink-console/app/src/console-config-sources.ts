import { isConsoleConfigLock } from '@dxfeed/dxlink-console-core'
import type {
  ConsoleConfigInput,
  ConsoleConfigLock,
  KeepaliveConfig,
} from '@dxfeed/dxlink-console-core'
import { Option, Predicate, Schema } from 'effect'

/**
 * One configuration source, as this app reads it.
 *
 * Wider than {@link ConsoleConfigInput} because two of the things a deployment can set are
 * not core's business: the RPC descriptor-set URL, which belongs to that one plugin, and
 * whether the host pinned it. Both are carried here so the shipped `?descriptors=` parameter
 * and `locked: ['descriptorSetUrl']` keep working after they left the core profile.
 */
export interface AppConsoleInput {
  /** The part of the profile the console core understands. */
  core: ConsoleConfigInput
  /** Seeds the RPC plugin's descriptor-set URL. */
  descriptorSetUrl?: string
  /** Whether the host pinned the descriptor-set URL. Only the injected config may. */
  descriptorSetUrlLocked?: boolean
}

const warn = (detail: string): void => {
  console.warn(`Console configuration: ${detail}; falling back to the default.`)
}

/** A string a host or a link supplies: trimmed, and blank means absent. */
const Text = Schema.Trim.check(Schema.isNonEmpty())

/** Keepalive timings are whole seconds; anything else is a mistake worth reporting. */
const Seconds = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/** An object read field by field — not an array, not null. */
const Fields = Schema.Record(Schema.String, Schema.Unknown)

const Entries = Schema.Array(Schema.Unknown)

/**
 * Decode one field of an untrusted source.
 *
 * Absent stays absent. A value that does not decode is dropped with a warning, so the layer
 * below supplies that field instead — one bad value never costs the rest of the profile.
 */
const decodeField = <A>(
  schema: Schema.Decoder<A>,
  value: unknown,
  problem: string
): A | undefined => {
  if (value === undefined) return undefined
  const decoded = Schema.decodeUnknownOption(schema)(value)
  if (Option.isNone(decoded)) {
    warn(problem)

    return undefined
  }

  return decoded.value
}

const readKeepalive = (value: unknown): Partial<KeepaliveConfig> | undefined => {
  const source = decodeField(Fields, value, '`keepalive` must be an object')
  if (source === undefined) return undefined
  const keepalive: Partial<KeepaliveConfig> = {}
  for (const field of ['interval', 'timeout', 'acceptTimeout'] as const) {
    const seconds = decodeField(
      Seconds,
      source[field],
      `\`keepalive.${field}\` must be a whole number of seconds`
    )
    if (seconds !== undefined) keepalive[field] = seconds
  }

  return Object.keys(keepalive).length === 0 ? undefined : keepalive
}

/**
 * Channel kinds from an untrusted list.
 *
 * Kept as written: with an open kind vocabulary, only the registered plugins know which
 * names mean anything, so validation happens where the plugin list is (see
 * {@link resolveAppConsoleConfig}) rather than here. Duplicates and blanks go, since neither
 * can have been meant.
 */
const readKindList = (values: readonly unknown[], field: string): readonly string[] => {
  const kinds = values.flatMap((value) => Option.toArray(Schema.decodeUnknownOption(Text)(value)))
  if (kinds.length !== values.length) {
    warn(`\`${field}\` contains entries that are not channel-kind names`)
  }

  return [...new Set(kinds)]
}

/**
 * Split the `locked` list into the field groups core understands and the descriptor-set URL,
 * which is now the RPC plugin's business.
 */
const readLocks = (
  values: readonly unknown[]
): { core: readonly ConsoleConfigLock[]; descriptorSetUrl: boolean } => {
  const core: readonly ConsoleConfigLock[] = [...new Set(values.filter(isConsoleConfigLock))]
  const descriptorSetUrl = values.includes('descriptorSetUrl')
  const dropped = values.filter(
    (value) => !isConsoleConfigLock(value) && value !== 'descriptorSetUrl'
  )
  if (dropped.length > 0) {
    warn(`\`locked\` names unknown fields (${dropped.map(String).join(', ')})`)
  }

  return { core, descriptorSetUrl }
}

/**
 * Read the profile a host injected into the page as `window.__DXLINK_CONFIG__` — the seam
 * a gateway substitutes at serve time so one static build covers many deployments.
 *
 * Everything is validated: unknown keys are ignored, and a bad value falls back to the
 * layer below with a warning rather than taking the console down. The parameter is
 * `unknown` because the argument is normally `window`, whose type knows nothing about a
 * property a host adds at serve time.
 */
export const readInjectedConfig = (host: unknown): AppConsoleInput => {
  const raw = Predicate.hasProperty(host, '__DXLINK_CONFIG__') ? host.__DXLINK_CONFIG__ : undefined
  const record = decodeField(Fields, raw, '`window.__DXLINK_CONFIG__` must be an object')
  if (record === undefined) return { core: {} }
  const core: ConsoleConfigInput = {}
  const input: AppConsoleInput = { core }

  const wsUrl = decodeField(Text, record.wsUrl, '`wsUrl` must be a non-empty string')
  if (wsUrl !== undefined) core.wsUrl = wsUrl

  const descriptorSetUrl = decodeField(
    Text,
    record.descriptorSetUrl,
    '`descriptorSetUrl` must be a non-empty string'
  )
  if (descriptorSetUrl !== undefined) input.descriptorSetUrl = descriptorSetUrl

  const keepalive = readKeepalive(record.keepalive)
  if (keepalive !== undefined) core.keepalive = keepalive

  const channelKinds = decodeField(Entries, record.channelKinds, '`channelKinds` must be an array')
  if (channelKinds !== undefined) {
    const kinds = readKindList(channelKinds, 'channelKinds')
    if (kinds.length > 0) core.channelKinds = kinds
  }

  const locked = decodeField(Entries, record.locked, '`locked` must be an array')
  if (locked !== undefined) {
    const locks = readLocks(locked)
    core.locked = locks.core
    input.descriptorSetUrlLocked = locks.descriptorSetUrl
  }

  return input
}

/**
 * Read the profile from the page URL's query string, so a link can carry a whole debugging
 * setup: `?ws=wss://host&descriptors=/proto/docs&channels=rpc`.
 *
 * Read from `location.search`, i.e. the query **before** the hash — the console is
 * hash-routed, so the fragment belongs to the router.
 *
 * Keepalive is deliberately absent: it is a deployment tuning knob rather than something
 * worth putting in a link, and the connection form already exposes it. Locking is absent
 * too, by design — only the injected config may pin a field.
 */
export const readSearchConfig = (search: string): AppConsoleInput => {
  const params = new URLSearchParams(search)
  const core: ConsoleConfigInput = {}
  const input: AppConsoleInput = { core }

  // A blank parameter is how a link leaves a field alone, so it is not worth a warning.
  const text = (name: string) =>
    Option.getOrUndefined(Schema.decodeUnknownOption(Text)(params.get(name)))

  const wsUrl = text('ws')
  if (wsUrl !== undefined) core.wsUrl = wsUrl

  const descriptorSetUrl = text('descriptors')
  if (descriptorSetUrl !== undefined) input.descriptorSetUrl = descriptorSetUrl

  const channels = params.get('channels')
  if (channels !== null) {
    const kinds = readKindList(channels.split(','), 'channels')
    if (kinds.length > 0) core.channelKinds = kinds
  }

  return input
}
