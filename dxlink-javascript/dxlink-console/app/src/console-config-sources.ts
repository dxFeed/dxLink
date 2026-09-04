import { isConsoleConfigLock } from '@dxfeed/dxlink-console-core'
import type {
  ConsoleConfigInput,
  ConsoleConfigLock,
  KeepaliveConfig,
} from '@dxfeed/dxlink-console-core'

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
 * Channel kinds from an untrusted list.
 *
 * Kept as written: with an open kind vocabulary, only the registered plugins know which
 * names mean anything, so validation happens where the plugin list is (see
 * {@link resolveAppConsoleConfig}) rather than here. Duplicates and blanks go, since neither
 * can have been meant.
 */
const readKindList = (values: readonly unknown[], field: string): readonly string[] => {
  const kinds = values.filter(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
  )
  if (kinds.length !== values.length) {
    warn(`\`${field}\` contains entries that are not channel-kind names`)
  }

  return [...new Set(kinds.map((kind) => kind.trim()))]
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
  const raw =
    typeof host === 'object' && host !== null
      ? (host as { __DXLINK_CONFIG__?: unknown }).__DXLINK_CONFIG__
      : undefined
  if (raw === undefined) return { core: {} }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warn('`window.__DXLINK_CONFIG__` must be an object')

    return { core: {} }
  }
  const record = raw as Record<string, unknown>
  const core: ConsoleConfigInput = {}
  const input: AppConsoleInput = { core }

  const wsUrl = readString(record.wsUrl, 'wsUrl')
  if (wsUrl !== undefined) core.wsUrl = wsUrl

  const descriptorSetUrl = readString(record.descriptorSetUrl, 'descriptorSetUrl')
  if (descriptorSetUrl !== undefined) input.descriptorSetUrl = descriptorSetUrl

  const keepalive = readKeepalive(record.keepalive)
  if (keepalive !== undefined) core.keepalive = keepalive

  if (record.channelKinds !== undefined) {
    if (Array.isArray(record.channelKinds)) {
      const kinds = readKindList(record.channelKinds, 'channelKinds')
      if (kinds.length > 0) core.channelKinds = kinds
    } else {
      warn('`channelKinds` must be an array')
    }
  }

  if (record.locked !== undefined) {
    if (Array.isArray(record.locked)) {
      const locks = readLocks(record.locked)
      core.locked = locks.core
      input.descriptorSetUrlLocked = locks.descriptorSetUrl
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
 * too, by design — only the injected config may pin a field.
 */
export const readSearchConfig = (search: string): AppConsoleInput => {
  const params = new URLSearchParams(search)
  const core: ConsoleConfigInput = {}
  const input: AppConsoleInput = { core }

  const wsUrl = params.get('ws')?.trim()
  if (wsUrl !== undefined && wsUrl !== '') core.wsUrl = wsUrl

  const descriptorSetUrl = params.get('descriptors')?.trim()
  if (descriptorSetUrl !== undefined && descriptorSetUrl !== '') {
    input.descriptorSetUrl = descriptorSetUrl
  }

  const channels = params.get('channels')
  if (channels !== null) {
    const kinds = readKindList(channels.split(','), 'channels')
    if (kinds.length > 0) core.channelKinds = kinds
  }

  return input
}
