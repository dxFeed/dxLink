import {
  create,
  createFileRegistry,
  createRegistry,
  type DescMessage,
  type Registry,
} from '@bufbuild/protobuf'
import { FileDescriptorProtoSchema } from '@bufbuild/protobuf/wkt'

/**
 * `fromJson` decodes a `google.protobuf.Any` by looking its type up in the registry and fails the
 * whole message when the type is not there: the payload's JSON fields cannot be packed into
 * bytes without the type's descriptor. A server adding a payload type the client has not been
 * regenerated for would then make an entire response unreadable.
 *
 * {@link withUnresolvedAny} answers every type name instead: a type missing from the registry
 * resolves to a placeholder message with that name and no fields. With `ignoreUnknownFields`,
 * `fromJson` reads the payload into the placeholder, skipping its fields, and packs it, so the
 * `Any` keeps its type URL with an empty `value`. This happens inside `fromJson` itself, so it
 * holds at any depth, inside the payload of a resolved `Any` too.
 *
 * The registry is for decoding only. Unpacking with it would turn an unresolved `Any` into an
 * empty placeholder message; unpacking with the caller's own registry returns `undefined`.
 */

const EMPTY_REGISTRY = createRegistry()

// One placeholder per type name. Descriptors never change, and `fromJson` caches its reader per
// descriptor, so reusing them keeps decoding as cheap as for any other type.
const placeholders = new Map<string, DescMessage | undefined>()

const createPlaceholder = (typeName: string): DescMessage | undefined => {
  const dot = typeName.lastIndexOf('.')
  const file = create(FileDescriptorProtoSchema, {
    name: `dxlink/unresolved/${typeName}.proto`,
    package: dot === -1 ? '' : typeName.slice(0, dot),
    syntax: 'proto3',
    messageType: [{ name: typeName.slice(dot + 1) }],
  })
  try {
    return createFileRegistry(file, () => undefined).getMessage(typeName)
  } catch {
    // Not a valid message name: let `fromJson` report the type as unknown.
    return undefined
  }
}

const getPlaceholder = (typeName: string): DescMessage | undefined => {
  if (!placeholders.has(typeName)) {
    placeholders.set(typeName, createPlaceholder(typeName))
  }
  return placeholders.get(typeName)
}

/**
 * Wrap a registry for decoding so that a message type it lacks resolves to an empty placeholder.
 * Decode with `ignoreUnknownFields`, or the placeholder rejects the payload's fields.
 */
export const withUnresolvedAny = (registry: Registry | undefined): Registry => {
  const base = registry ?? EMPTY_REGISTRY
  return {
    kind: 'registry',
    [Symbol.iterator]: () => base[Symbol.iterator](),
    get: (typeName) => base.get(typeName),
    getMessage: (typeName) => base.getMessage(typeName) ?? getPlaceholder(typeName),
    getEnum: (typeName) => base.getEnum(typeName),
    getExtension: (typeName) => base.getExtension(typeName),
    getExtensionFor: (extendee, no) => base.getExtensionFor(extendee, no),
    getService: (typeName) => base.getService(typeName),
  }
}
