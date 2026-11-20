import { Array, Data, Effect, Option, Order, Predicate, pipe } from 'effect'

import {
  type DescField,
  type DescMessage,
  type DescMethod,
  type DescService,
  type FileRegistry,
  type JsonValue,
  type Message,
  ScalarType,
  createFileRegistry,
  fromBinary,
  fromJson,
  toJson,
} from '@bufbuild/protobuf'
import { protoCamelCase } from '@bufbuild/protobuf/reflect'
import { type FileDescriptorSet, FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt'

/**
 * Reading protobuf service definitions at runtime.
 *
 * The console is given a `FileDescriptorSet` — fetched from an endpoint, or picked from
 * disk — and builds a registry from it in the browser. The `DescService` descriptors that
 * come out are structurally what generated code produces, so `createDXLinkDynamicService`
 * consumes them directly.
 */

/** Interaction model of a method, as the dxLink protocol names it. */
export type MethodModel = Readonly<{
  label: string
  /** Whether the dxLink v1.0 wire can carry it. */
  isSupported: boolean
  description: string
}>

export const METHOD_MODELS: Readonly<Record<DescMethod['methodKind'], MethodModel>> = {
  unary: {
    label: 'REQUEST_RESPONSE',
    isSupported: true,
    description: 'One request, one response.',
  },
  server_streaming: {
    label: 'REQUEST_STREAM',
    isSupported: true,
    description: 'One request, a stream of responses.',
  },
  bidi_streaming: {
    label: 'STREAM_STREAM',
    isSupported: true,
    description: 'A stream of requests, a stream of responses.',
  },
  client_streaming: {
    label: 'STREAM_RESPONSE',
    isSupported: false,
    description:
      'Not supported — the dxLink v1.0 wire has no graceful request half-close, so the server is never told the requests ended.',
  },
}

export const methodModel = (method: DescMethod): MethodModel => METHOD_MODELS[method.methodKind]

export const isMethodSupported = (method: DescMethod): boolean => methodModel(method).isSupported

const isJsonValue = (value: unknown): value is JsonValue =>
  value === null ||
  Predicate.isString(value) ||
  Predicate.isNumber(value) ||
  Predicate.isBoolean(value) ||
  (Array.isArray(value)
    ? Array.every(value, isJsonValue)
    : Predicate.isObject(value) && Array.every(Object.values(value), isJsonValue))

const describeFailure = (error: unknown): string =>
  error instanceof Error ? error.message : globalThis.String(error)

const FIRST_PRINTABLE_BYTE = 0x21
const OPENING_BRACE = 0x7b

/**
 * Decode a descriptor set, accepting either the binary wire format (`buf build -o set.binpb`)
 * or protobuf-JSON. Which one an endpoint serves is its own choice, and a debug console
 * should not care.
 *
 * `{` opens protobuf-JSON, while a binary descriptor set starts with a field tag (0x0a for
 * `file`), so the first non-whitespace byte separates them without guessing.
 */
const decodeDescriptorSet = (bytes: Uint8Array): FileDescriptorSet => {
  const firstByte = bytes.find((byte) => byte >= FIRST_PRINTABLE_BYTE)

  if (firstByte === OPENING_BRACE) {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!isJsonValue(parsed)) {
      throw new Error('The descriptor set is not a JSON value')
    }

    return fromJson(FileDescriptorSetSchema, parsed)
  }

  return fromBinary(FileDescriptorSetSchema, bytes)
}

/**
 * Fill in the JSON name of every field whose descriptor omits it.
 *
 * `json_name` is optional on the wire and is meant to be deduced from the field name when
 * absent, but protobuf-es assigns it straight through, so a descriptor set without it leaves
 * every field reporting an empty JSON name. Encoding then puts each field of a message under
 * the same `""` key and all but the last is lost; decoding rejects the real names.
 *
 * dxLink's own `/proto/docs` serves such a set — only the bundled `google/protobuf/*` files
 * carry `json_name` — so this is repaired here rather than left to the server. The deduction is
 * protobuf's own, via the `protoCamelCase` protobuf-es uses for the same purpose elsewhere.
 *
 * Mutating descriptors is safe here and nowhere else: the registry was just built from these
 * bytes and nothing else has seen it yet. The descriptor types are readonly, which is right
 * for every other consumer, hence `Reflect.set`. Extension fields are left alone — their JSON
 * name is the bracketed type name, not a deduction.
 */
const deduceMissingJsonNames = (registry: FileRegistry): FileRegistry => {
  pipe(
    Array.fromIterable(registry),
    Array.flatMap((desc) => (desc.kind === 'message' ? desc.fields : [])),
    Array.filter((field) => field.jsonName === ''),
    Array.forEach((field) => {
      Reflect.set(field, 'jsonName', protoCamelCase(field.name))
    })
  )

  return registry
}

/** Build a registry from the bytes of a `FileDescriptorSet`. Throws on bytes that are not one. */
export const parseDescriptorSet = (bytes: Uint8Array): FileRegistry =>
  deduceMissingJsonNames(createFileRegistry(decodeDescriptorSet(bytes)))

/** A descriptor set that could not be loaded; `message` says why, in words for the user. */
export class DescriptorSetError extends Data.TaggedError('DescriptorSetError')<{
  message: string
  cause?: unknown
}> {}

/** {@link parseDescriptorSet} with the failure in the error channel. */
export const decodeRegistry = (
  bytes: Uint8Array
): Effect.Effect<FileRegistry, DescriptorSetError> =>
  Effect.try({
    try: () => parseDescriptorSet(bytes),
    catch: (cause) => new DescriptorSetError({ message: describeFailure(cause), cause }),
  })

/**
 * Media types that ask a schema endpoint for the binary representation.
 *
 * dxLink's `/proto/docs` negotiates on `Accept` and serves protobuf-JSON to everything else —
 * including the wildcard a fetch sends by default, which matches JSON. Asking explicitly
 * roughly halves the payload. There is deliberately no wildcard in the list: the server takes
 * the first media type that matches, and a wildcard would match JSON first.
 */
const BINARY_ACCEPT = 'application/protobuf, application/x-protobuf, application/octet-stream'

/**
 * Fetch a `FileDescriptorSet` from an endpoint and build a registry from it.
 *
 * Browsers report every blocked cross-origin request as an opaque network error, so that
 * failure names the likely cause. Asking for a media type makes the request preflighted, so
 * an endpoint on another origin has to allow the `Accept` header as well as the origin itself.
 */
export const fetchDescriptorSet = (url: string): Effect.Effect<FileRegistry, DescriptorSetError> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) => fetch(url, { headers: { Accept: BINARY_ACCEPT }, signal }),
      catch: (cause) =>
        new DescriptorSetError({
          message:
            'the endpoint must be reachable, and one on another origin must allow cross-origin ' +
            'requests including the Accept header',
          cause,
        }),
    })

    if (!response.ok) {
      return yield* new DescriptorSetError({
        message: `${response.status} ${response.statusText}`,
      })
    }

    const buffer = yield* Effect.tryPromise({
      try: () => response.arrayBuffer(),
      catch: (cause) => new DescriptorSetError({ message: describeFailure(cause), cause }),
    })

    return yield* decodeRegistry(new Uint8Array(buffer))
  })

/** Every service in a registry, ordered by fully qualified name. */
export const listServices = (registry: FileRegistry): ReadonlyArray<DescService> =>
  pipe(
    Array.fromIterable(registry),
    Array.flatMap((desc) => (desc.kind === 'service' ? [desc] : [])),
    Array.sort(Order.mapInput(Order.String, (service: DescService) => service.typeName))
  )

const SIXTY_FOUR_BIT_SCALARS: ReadonlyArray<ScalarType> = [
  ScalarType.INT64,
  ScalarType.UINT64,
  ScalarType.FIXED64,
  ScalarType.SFIXED64,
  ScalarType.SINT64,
]

/** Whether protobuf-JSON carries a scalar of this type as a string because it is 64 bits wide. */
export const isSixtyFourBitScalar = (scalar: ScalarType): boolean =>
  Array.contains(SIXTY_FOUR_BIT_SCALARS, scalar)

const scalarTemplate = (scalar: ScalarType): JsonValue => {
  if (scalar === ScalarType.BOOL) {
    return false
  }
  if (scalar === ScalarType.STRING || scalar === ScalarType.BYTES) {
    return ''
  }

  return isSixtyFourBitScalar(scalar) ? '0' : 0
}

/**
 * A protobuf-JSON placeholder for a field, so the request editor opens on the shape of the
 * message rather than on `{}`. Canonical protobuf-JSON is what goes on the wire, so what the
 * user edits is what is sent — 64-bit integers as strings, bytes as base64, enums by name.
 */
const fieldTemplate = (field: DescField): JsonValue => {
  if (field.fieldKind === 'list') {
    return []
  }
  if (field.fieldKind === 'map' || field.fieldKind === 'message') {
    return {}
  }
  if (field.fieldKind === 'enum') {
    return pipe(
      Array.head(field.enum.values),
      Option.match({ onNone: () => 0, onSome: (value) => value.name })
    )
  }

  return scalarTemplate(field.scalar)
}

/** A protobuf-JSON skeleton of a request message, one entry per declared field. */
export const createRequestTemplate = (message: DescMessage): Record<string, JsonValue> =>
  Object.fromEntries(Array.map(message.fields, (field) => [field.jsonName, fieldTemplate(field)]))

export type ParsedRequest = Readonly<{ message: Message }> | Readonly<{ error: string }>

/**
 * Parse a request message from the protobuf-JSON in the editor.
 *
 * `fromJson` is the validation: it rejects unknown fields and wrong types, which is exactly
 * what a request form needs to report before a channel is opened.
 */
export const parseRequest = (message: DescMessage, json: string): ParsedRequest => {
  try {
    const parsed: unknown = JSON.parse(json)
    if (!isJsonValue(parsed)) {
      return { error: 'Invalid JSON: not a JSON value' }
    }
    try {
      return { message: fromJson(message, parsed) }
    } catch (error) {
      return { error: describeFailure(error) }
    }
  } catch (error) {
    return { error: `Invalid JSON: ${describeFailure(error)}` }
  }
}

/** Canonical protobuf-JSON of a message — what the binding puts on the wire. */
export const formatMessage = (schema: DescMessage, message: Message): JsonValue =>
  toJson(schema, message)

/** A JSON value as the console shows and edits it. */
export const stringifyJson = (json: JsonValue): string => JSON.stringify(json, null, 2)
