import { CHANNEL_KINDS, isChannelKind } from './channel-kinds'
import type { ChannelKind } from './channel-kinds'
import { deriveWsUrlFromLocation } from './connection-url'
import type { LocationLike } from './connection-url'

/** Connection keepalive timings, in seconds. */
export interface KeepaliveConfig {
  interval: number
  timeout: number
  acceptTimeout: number
}

/** A group of fields a host can pin, addressed as one. */
export type ConsoleConfigLock = 'wsUrl' | 'keepalive' | 'descriptorSetUrl'

/**
 * What a host can decide about a console before anyone opens it.
 *
 * These are the values forms **start** with, not the values they hold: everything here
 * seeds local draft state once and is never written back, so the user stays free to edit.
 * The exception is {@link ConsoleConfig.locked}, which is how a host says a field is fixed
 * rather than merely suggested.
 */
export interface ConsoleConfig {
  /** Seeds the connection form's WebSocket URL. */
  wsUrl: string
  keepalive: KeepaliveConfig
  /** Seeds the RPC channel's descriptor-set URL. */
  descriptorSetUrl: string
  /** Channel kinds offered in the add-channel row, in the order given. */
  channelKinds: readonly ChannelKind[]
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
  descriptorSetUrl?: string
  channelKinds?: readonly ChannelKind[]
  locked?: readonly ConsoleConfigLock[]
}

const LOCKS: readonly ConsoleConfigLock[] = ['wsUrl', 'keepalive', 'descriptorSetUrl']

const isLock = (value: unknown): value is ConsoleConfigLock =>
  typeof value === 'string' && (LOCKS as readonly string[]).includes(value)

/**
 * The profile a console falls back to when nothing is supplied: every value is the one
 * that used to be hardcoded at its point of use, so an unconfigured console behaves
 * exactly as it did before configuration existed.
 *
 * The WebSocket URL is derived from the page location and nothing else — no environment
 * check. A build that wants a different development default supplies it as a source (see
 * {@link resolveConsoleConfig}), which keeps this function usable outside a bundler.
 */
export const builtinConsoleConfig = (location: LocationLike): ConsoleConfig => ({
  wsUrl: deriveWsUrlFromLocation(location),
  keepalive: { interval: 30, timeout: 60, acceptTimeout: 60 },
  descriptorSetUrl: '',
  channelKinds: CHANNEL_KINDS,
  locked: [],
})

/**
 * Apply one source on top of a profile. Absent fields leave the base alone; `keepalive` is
 * merged field by field so a source can set the interval without restating the timeouts.
 */
const applyInput = (base: ConsoleConfig, input: ConsoleConfigInput): ConsoleConfig => ({
  wsUrl: input.wsUrl ?? base.wsUrl,
  keepalive: { ...base.keepalive, ...input.keepalive },
  descriptorSetUrl: input.descriptorSetUrl ?? base.descriptorSetUrl,
  channelKinds: input.channelKinds ?? base.channelKinds,
  locked: input.locked ?? base.locked,
})

/** Strip the fields a lock covers, so a locked field survives a later source. */
const withoutLocked = (
  input: ConsoleConfigInput,
  locked: readonly ConsoleConfigLock[]
): ConsoleConfigInput => {
  const kept: ConsoleConfigInput = { ...input }
  if (locked.includes('wsUrl')) delete kept.wsUrl
  if (locked.includes('keepalive')) delete kept.keepalive
  if (locked.includes('descriptorSetUrl')) delete kept.descriptorSetUrl

  return kept
}

export interface ConsoleConfigSources {
  /** The page location, used for the built-in WebSocket URL derivation. */
  location: LocationLike
  /**
   * Defaults the serving application itself carries — the one place a build-time choice
   * (say, a development relay) belongs, so nothing below has to know about bundlers.
   */
  app?: ConsoleConfigInput
  /** What the host injected into the page. The only source allowed to lock a field. */
  injected?: ConsoleConfigInput
  /** The page URL's query string, as `location.search`. */
  search?: string
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
 */
export const resolveConsoleConfig = (sources: ConsoleConfigSources): ConsoleConfig => {
  const base = builtinConsoleConfig(sources.location)
  const withApp = applyInput(base, sources.app ?? {})
  const withInjected = applyInput(withApp, sources.injected ?? {})
  const fromSearch = readSearchConfig(sources.search ?? '')

  return applyInput(withInjected, withoutLocked(fromSearch, withInjected.locked))
}

const warn = (detail: string): void => {
  console.warn(`Console configuration: ${detail}; falling back to the default.`)
}

const readString = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') {
    warn(`\`${field}\` must be a non-empty string`)

    return undefined
  }

  return value.trim()
}

/** Keepalive timings are whole seconds; anything else is a mistake worth reporting. */
const readSeconds = (value: unknown, field: string): number | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    warn(`\`${field}\` must be a whole number of seconds`)

    return undefined
  }

  return value
}

const readKeepalive = (value: unknown): Partial<KeepaliveConfig> | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) {
    warn('`keepalive` must be an object')

    return undefined
  }
  const source = value as Record<string, unknown>
  const keepalive: Partial<KeepaliveConfig> = {}
  const interval = readSeconds(source.interval, 'keepalive.interval')
  const timeout = readSeconds(source.timeout, 'keepalive.timeout')
  const acceptTimeout = readSeconds(source.acceptTimeout, 'keepalive.acceptTimeout')
  if (interval !== undefined) keepalive.interval = interval
  if (timeout !== undefined) keepalive.timeout = timeout
  if (acceptTimeout !== undefined) keepalive.acceptTimeout = acceptTimeout

  return Object.keys(keepalive).length === 0 ? undefined : keepalive
}

/**
 * Channel kinds from an untrusted list. Unknown names are dropped rather than fatal — a
 * host configured against a newer console should still get the kinds it named right.
 * A list that leaves nothing is ignored altogether, since a console offering no channels
 * at all is never what anyone meant.
 */
const readChannelKinds = (values: readonly unknown[], field: string): readonly ChannelKind[] => {
  const kinds = values.filter(isChannelKind)
  const dropped = values.filter((value) => !isChannelKind(value))
  if (dropped.length > 0) {
    warn(`\`${field}\` names unknown channel kinds (${dropped.map(String).join(', ')})`)
  }
  if (kinds.length === 0 && values.length > 0) {
    warn(`\`${field}\` leaves no channel kinds`)
  }

  return [...new Set(kinds)]
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
export const readInjectedConfig = (host: unknown): ConsoleConfigInput => {
  const raw =
    typeof host === 'object' && host !== null
      ? (host as { __DXLINK_CONFIG__?: unknown }).__DXLINK_CONFIG__
      : undefined
  if (raw === undefined) return {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warn('`window.__DXLINK_CONFIG__` must be an object')

    return {}
  }
  const record = raw as Record<string, unknown>
  const input: ConsoleConfigInput = {}

  const wsUrl = readString(record.wsUrl, 'wsUrl')
  if (wsUrl !== undefined) input.wsUrl = wsUrl

  const descriptorSetUrl = readString(record.descriptorSetUrl, 'descriptorSetUrl')
  if (descriptorSetUrl !== undefined) input.descriptorSetUrl = descriptorSetUrl

  const keepalive = readKeepalive(record.keepalive)
  if (keepalive !== undefined) input.keepalive = keepalive

  if (record.channelKinds !== undefined) {
    if (Array.isArray(record.channelKinds)) {
      const kinds = readChannelKinds(record.channelKinds, 'channelKinds')
      if (kinds.length > 0) input.channelKinds = kinds
    } else {
      warn('`channelKinds` must be an array')
    }
  }

  if (record.locked !== undefined) {
    if (Array.isArray(record.locked)) {
      const locked = record.locked.filter(isLock)
      const dropped = record.locked.filter((value) => !isLock(value))
      if (dropped.length > 0) {
        warn(`\`locked\` names unknown fields (${dropped.map(String).join(', ')})`)
      }
      input.locked = [...new Set(locked)]
    } else {
      warn('`locked` must be an array')
    }
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
 * too, by design — see {@link resolveConsoleConfig}.
 */
export const readSearchConfig = (search: string): ConsoleConfigInput => {
  const params = new URLSearchParams(search)
  const input: ConsoleConfigInput = {}

  const wsUrl = params.get('ws')?.trim()
  if (wsUrl !== undefined && wsUrl !== '') input.wsUrl = wsUrl

  const descriptorSetUrl = params.get('descriptors')?.trim()
  if (descriptorSetUrl !== undefined && descriptorSetUrl !== '') {
    input.descriptorSetUrl = descriptorSetUrl
  }

  const channels = params.get('channels')
  if (channels !== null) {
    const kinds = readChannelKinds(
      channels
        .split(',')
        .map((kind) => kind.trim())
        .filter((kind) => kind !== ''),
      'channels'
    )
    if (kinds.length > 0) input.channelKinds = kinds
  }

  return input
}
