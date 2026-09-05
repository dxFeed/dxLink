import {
  createFileRegistry,
  type DescField,
  type DescMessage,
  type DescMethod,
  type DescService,
  type FileRegistry,
  fromBinary,
  fromJson,
  type JsonValue,
  type Message,
  ScalarType,
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
export interface MethodModel {
  label: string
  /** Whether the dxLink v1.0 wire can carry it. */
  supported: boolean
  description: string
}

export const METHOD_MODELS: Record<DescMethod['methodKind'], MethodModel> = {
  unary: {
    label: 'REQUEST_RESPONSE',
    supported: true,
    description: 'One request, one response.',
  },
  server_streaming: {
    label: 'REQUEST_STREAM',
    supported: true,
    description: 'One request, a stream of responses.',
  },
  bidi_streaming: {
    label: 'STREAM_STREAM',
    supported: true,
    description: 'A stream of requests, a stream of responses.',
  },
  client_streaming: {
    label: 'STREAM_RESPONSE',
    supported: false,
    description:
      'Not supported — the dxLink v1.0 wire has no graceful request half-close, so the server is never told the requests ended.',
  },
}

export const methodModel = (method: DescMethod): MethodModel => METHOD_MODELS[method.methodKind]

export const isMethodSupported = (method: DescMethod): boolean => methodModel(method).supported

/**
 * Decode a descriptor set, accepting either the binary wire format (`buf build -o set.binpb`)
 * or protobuf-JSON. Which one an endpoint serves is its own choice, and a debug console
 * should not care.
 */
const decodeDescriptorSet = (bytes: Uint8Array): FileDescriptorSet => {
  const firstByte = bytes.find((byte) => byte > 0x20)

  // '{' — protobuf-JSON. Binary descriptor sets start with a field tag (0x0a for `file`),
  // so sniffing the first non-whitespace byte separates them without guessing.
  if (firstByte === 0x7b) {
    return fromJson(FileDescriptorSetSchema, JSON.parse(new TextDecoder().decode(bytes)))
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
 * bytes and nothing else has seen it yet. Extension fields are left alone — their JSON name is
 * the bracketed type name, not a deduction.
 */
const deduceMissingJsonNames = (registry: FileRegistry): FileRegistry => {
  for (const desc of registry) {
    if (desc.kind !== 'message') continue
    for (const field of desc.fields) {
      if (field.jsonName === '') {
        // The descriptor types are readonly, which is right for every other consumer.
        ;(field as { jsonName: string }).jsonName = protoCamelCase(field.name)
      }
    }
  }

  return registry
}

/** Build a registry from the bytes of a `FileDescriptorSet`. */
export const parseDescriptorSet = (bytes: Uint8Array): FileRegistry =>
  deduceMissingJsonNames(createFileRegistry(decodeDescriptorSet(bytes)))

/**
 * Media types that ask a schema endpoint for the binary representation.
 *
 * dxLink's `/proto/docs` negotiates on `Accept` and serves protobuf-JSON to everything else —
 * including the wildcard a fetch sends by default, which matches JSON. Asking explicitly
 * roughly halves the payload. There is deliberately no wildcard in the list: the server takes
 * the first media type that matches, and a wildcard would match JSON first.
 */
const BINARY_ACCEPT = 'application/protobuf, application/x-protobuf, application/octet-stream'

/** Fetch a `FileDescriptorSet` from an endpoint and build a registry from it. */
export const fetchDescriptorSet = async (url: string): Promise<FileRegistry> => {
  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: BINARY_ACCEPT } })
  } catch (error) {
    // Browsers report every blocked cross-origin request as an opaque network error. Naming
    // the likely cause saves the next person a session in the network tab — and note that
    // asking for a media type makes the request preflighted, so an endpoint on another origin
    // has to allow the `Accept` header as well as the origin itself.
    throw new Error(
      'the endpoint must be reachable, and one on another origin must allow cross-origin ' +
        'requests including the Accept header',
      { cause: error }
    )
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }

  return parseDescriptorSet(new Uint8Array(await response.arrayBuffer()))
}

/** Build a registry from a descriptor set the user picked from disk. */
export const readDescriptorSet = async (file: File): Promise<FileRegistry> =>
  parseDescriptorSet(new Uint8Array(await file.arrayBuffer()))

/** Every service in a registry, ordered by fully qualified name. */
export const listServices = (registry: FileRegistry): DescService[] => {
  const services: DescService[] = []
  for (const desc of registry) {
    if (desc.kind === 'service') {
      services.push(desc)
    }
  }

  return services.sort((a, b) => a.typeName.localeCompare(b.typeName))
}

/**
 * A protobuf-JSON placeholder for a field, so the request editor opens on the shape of the
 * message rather than on `{}`. Canonical protobuf-JSON is what goes on the wire, so what the
 * user edits is what is sent — 64-bit integers as strings, bytes as base64, enums by name.
 */
const fieldTemplate = (field: DescField): JsonValue => {
  switch (field.fieldKind) {
    case 'list':
      return []
    case 'map':
      return {}
    case 'message':
      return {}
    case 'enum':
      return field.enum.values[0]?.name ?? 0
    case 'scalar':
      switch (field.scalar) {
        case ScalarType.BOOL:
          return false
        case ScalarType.STRING:
        case ScalarType.BYTES:
          return ''
        case ScalarType.INT64:
        case ScalarType.UINT64:
        case ScalarType.FIXED64:
        case ScalarType.SFIXED64:
        case ScalarType.SINT64:
          return '0'
        default:
          return 0
      }
  }
}

/** A protobuf-JSON skeleton of a request message, one entry per declared field. */
export const createRequestTemplate = (message: DescMessage): Record<string, JsonValue> =>
  Object.fromEntries(message.fields.map((field) => [field.jsonName, fieldTemplate(field)]))

/**
 * Parse a request message from the protobuf-JSON in the editor.
 *
 * `fromJson` is the validation: it rejects unknown fields and wrong types, which is exactly
 * what a request form needs to report before a channel is opened.
 */
export const parseRequest = (
  message: DescMessage,
  json: string
): { message: Message } | { error: string } => {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    return { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` }
  }

  try {
    return { message: fromJson(message, parsed as JsonValue) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/** Canonical protobuf-JSON of a message — what the binding puts on the wire. */
export const formatMessage = (schema: DescMessage, message: Message): JsonValue =>
  toJson(schema, message)
