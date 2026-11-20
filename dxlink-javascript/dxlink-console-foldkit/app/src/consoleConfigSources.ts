import { Array, Option, Predicate, String, pipe } from 'effect'

import {
  type ConsoleConfigInput,
  type ConsoleConfigLock,
  type KeepaliveConfig,
  isConsoleConfigLock,
} from '@dxfeed/dxlink-console-foldkit-core'

/**
 * One configuration source, as this app reads it.
 *
 * Wider than {@link ConsoleConfigInput} because two of the things a deployment can set are
 * not core's business: the RPC descriptor-set URL, which belongs to that one plugin, and
 * whether the host pinned it.
 */
export type AppConsoleInput = Readonly<{
  /** The part of the profile the console core understands. */
  core: ConsoleConfigInput
  /** Seeds the RPC plugin's descriptor-set URL. */
  descriptorSetUrl?: string
  /** Whether the host pinned the descriptor-set URL. Only the injected config may. */
  descriptorSetUrlLocked?: boolean
}>

const DESCRIPTOR_SET_URL_LOCK = 'descriptorSetUrl'

/** The fields a present value contributes to an object literal; none when it is absent. */
const some = <Value, Fields extends object>(
  maybeValue: Option.Option<Value>,
  toFields: (value: Value) => Fields
): Fields | Record<string, never> =>
  Option.match(maybeValue, { onNone: () => ({}), onSome: toFields })

const warn = (detail: string): void => {
  console.warn(`Console configuration: ${detail}; falling back to the default.`)
}

const readString = (value: unknown, field: string): Option.Option<string> => {
  if (value === undefined) {
    return Option.none()
  }
  if (!Predicate.isString(value) || String.isEmpty(value.trim())) {
    warn(`\`${field}\` must be a non-empty string`)

    return Option.none()
  }

  return Option.some(value.trim())
}

/** Keepalive timings are whole seconds; anything else is a mistake worth reporting. */
const readSeconds = (value: unknown, field: string): Option.Option<number> => {
  if (value === undefined) {
    return Option.none()
  }
  if (!Predicate.isNumber(value) || !Number.isInteger(value) || value < 0) {
    warn(`\`${field}\` must be a whole number of seconds`)

    return Option.none()
  }

  return Option.some(value)
}

const readKeepalive = (value: unknown): Option.Option<Partial<KeepaliveConfig>> => {
  if (value === undefined) {
    return Option.none()
  }
  if (!Predicate.isObject(value)) {
    warn('`keepalive` must be an object')

    return Option.none()
  }
  const read = (key: keyof KeepaliveConfig) =>
    readSeconds(Predicate.hasProperty(value, key) ? value[key] : undefined, `keepalive.${key}`)
  const keepalive: Partial<KeepaliveConfig> = {
    ...some(read('interval'), (interval) => ({ interval })),
    ...some(read('timeout'), (timeout) => ({ timeout })),
    ...some(read('acceptTimeout'), (acceptTimeout) => ({ acceptTimeout })),
  }

  return Object.keys(keepalive).length === 0 ? Option.none() : Option.some(keepalive)
}

/**
 * Channel kinds from an untrusted list.
 *
 * Kept as written: with an open kind vocabulary, only the registered plugins know which
 * names mean anything, so validation happens where the plugin list is rather than here.
 * Duplicates and blanks go, since neither can have been meant.
 */
const readKindList = (values: ReadonlyArray<unknown>, field: string): ReadonlyArray<string> => {
  const kinds = pipe(
    values,
    Array.filter(Predicate.isString),
    Array.map(String.trim),
    Array.filter(String.isNonEmpty)
  )
  if (kinds.length !== values.length) {
    warn(`\`${field}\` contains entries that are not channel-kind names`)
  }

  return Array.dedupe(kinds)
}

/**
 * Split the `locked` list into the field groups core understands and the descriptor-set URL,
 * which is the RPC plugin's business.
 */
const readLocks = (
  values: ReadonlyArray<unknown>
): Readonly<{ core: ReadonlyArray<ConsoleConfigLock>; descriptorSetUrl: boolean }> => {
  const dropped = Array.filter(
    values,
    (value) => !isConsoleConfigLock(value) && value !== DESCRIPTOR_SET_URL_LOCK
  )
  if (Array.isArrayNonEmpty(dropped)) {
    warn(
      `\`locked\` names unknown fields (${Array.join(Array.map(dropped, globalThis.String), ', ')})`
    )
  }

  return {
    core: Array.dedupe(Array.filter(values, isConsoleConfigLock)),
    descriptorSetUrl: Array.contains(values, DESCRIPTOR_SET_URL_LOCK),
  }
}

const readProperty = (record: object, key: string): unknown =>
  Predicate.hasProperty(record, key) ? record[key] : undefined

const readArray = (value: unknown, field: string): Option.Option<ReadonlyArray<unknown>> => {
  if (value === undefined) {
    return Option.none()
  }
  if (!Array.isArray(value)) {
    warn(`\`${field}\` must be an array`)

    return Option.none()
  }

  return Option.some(value)
}

/**
 * Read the profile a host injected into the page as `window.__DXLINK_CONFIG__` — the seam a
 * gateway substitutes at serve time so one static build covers many deployments.
 *
 * Everything is validated: unknown keys are ignored, and a bad value falls back to the layer
 * below with a warning rather than taking the console down. The parameter is `unknown`
 * because the argument is normally `window`, whose type knows nothing about a property a
 * host adds at serve time.
 */
export const readInjectedConfig = (host: unknown): AppConsoleInput => {
  const raw = Predicate.isObject(host) ? readProperty(host, '__DXLINK_CONFIG__') : undefined
  if (raw === undefined) {
    return { core: {} }
  }
  if (!Predicate.isObject(raw) || Array.isArray(raw)) {
    warn('`window.__DXLINK_CONFIG__` must be an object')

    return { core: {} }
  }
  const maybeLocks = Option.map(readArray(readProperty(raw, 'locked'), 'locked'), readLocks)
  const maybeKinds = pipe(
    readArray(readProperty(raw, 'channelKinds'), 'channelKinds'),
    Option.map((values) => readKindList(values, 'channelKinds')),
    Option.filter(Array.isReadonlyArrayNonEmpty)
  )

  return {
    core: {
      ...some(readString(readProperty(raw, 'wsUrl'), 'wsUrl'), (wsUrl) => ({ wsUrl })),
      ...some(readKeepalive(readProperty(raw, 'keepalive')), (keepalive) => ({ keepalive })),
      ...some(maybeKinds, (channelKinds) => ({ channelKinds })),
      ...some(maybeLocks, (locks) => ({ locked: locks.core })),
    },
    ...some(
      readString(readProperty(raw, 'descriptorSetUrl'), 'descriptorSetUrl'),
      (descriptorSetUrl) => ({ descriptorSetUrl })
    ),
    ...some(maybeLocks, (locks) => ({ descriptorSetUrlLocked: locks.descriptorSetUrl })),
  }
}

const readParam = (params: URLSearchParams, name: string): Option.Option<string> =>
  pipe(
    Option.fromNullishOr(params.get(name)),
    Option.map(String.trim),
    Option.filter(String.isNonEmpty)
  )

/**
 * Read the profile from the page URL's query string, so a link can carry a whole debugging
 * setup: `?ws=wss://host&descriptors=/proto/docs&channels=rpc`.
 *
 * Keepalive is deliberately absent: it is a deployment tuning knob rather than something
 * worth putting in a link, and the connection form already exposes it. Locking is absent
 * too, by design — only the injected config may pin a field.
 */
export const readSearchConfig = (search: string): AppConsoleInput => {
  const params = new URLSearchParams(search)
  const maybeKinds = pipe(
    Option.fromNullishOr(params.get('channels')),
    Option.map((channels) => readKindList(channels.split(','), 'channels')),
    Option.filter(Array.isReadonlyArrayNonEmpty)
  )

  return {
    core: {
      ...some(readParam(params, 'ws'), (wsUrl) => ({ wsUrl })),
      ...some(maybeKinds, (channelKinds) => ({ channelKinds })),
    },
    ...some(readParam(params, 'descriptors'), (descriptorSetUrl) => ({ descriptorSetUrl })),
  }
}
