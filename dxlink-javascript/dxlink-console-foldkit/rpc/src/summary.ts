import { Array, Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import {
  type DescField,
  type DescMethod,
  type DescService,
  type FileRegistry,
  ScalarType,
} from '@bufbuild/protobuf'

import {
  createRequestTemplate,
  isSixtyFourBitScalar,
  listServices,
  methodModel,
  stringifyJson,
} from './descriptors'

/**
 * What a Model keeps of a loaded descriptor set.
 *
 * The registry itself is a graph of live descriptor objects and stays in a service; this is
 * the plain data the pickers and the generated request form are rendered from.
 */

const fieldBase = {
  /** The field number, which is the field's identity within its message. */
  key: Schema.String,
  name: Schema.String,
  /** The key the field is written under in protobuf-JSON. */
  jsonName: Schema.String,
}

/**
 * A request field a generated control can edit. Fields of any other shape — messages, lists,
 * maps, oneof members — are edited in the request JSON only.
 */
export const RequestField = defineTaggedUnion({
  Enum: {
    ...fieldBase,
    typeName: Schema.String,
    valueNames: Schema.Array(Schema.String),
  },
  Bool: fieldBase,
  /** A scalar protobuf-JSON carries as a string: strings, bytes and 64-bit integers. */
  Text: { ...fieldBase, maybeHelp: Schema.Option(Schema.String) },
  Number: fieldBase,
})
export type RequestField = typeof RequestField.Type

export const MethodSummary = Schema.Struct({
  /** ECMAScript name of the method, as `DescService.method` keys it. */
  localName: Schema.String,
  /** The protobuf name, as it goes on the wire. */
  name: Schema.String,
  /** The dxLink interaction model, such as `REQUEST_STREAM`. */
  modelLabel: Schema.String,
  modelDescription: Schema.String,
  /** Whether the dxLink wire can carry the method. An unsupported one is listed, not selectable. */
  isSupported: Schema.Boolean,
  /** Whether the client keeps sending requests after the channel is open. */
  isBidirectional: Schema.Boolean,
  inputTypeName: Schema.String,
  outputTypeName: Schema.String,
  /** The request message as a protobuf-JSON skeleton, one entry per declared field. */
  requestTemplate: Schema.String,
  fields: Schema.Array(RequestField),
})
export type MethodSummary = typeof MethodSummary.Type

export const ServiceSummary = Schema.Struct({
  /** Fully qualified name of the service. */
  typeName: Schema.String,
  methods: Schema.Array(MethodSummary),
})
export type ServiceSummary = typeof ServiceSummary.Type

const scalarHelp = (scalar: ScalarType): Option.Option<string> => {
  if (scalar === ScalarType.BYTES) {
    return Option.some('bytes — base64')
  }

  return isSixtyFourBitScalar(scalar) ? Option.some('64-bit — sent as a string') : Option.none()
}

const summarizeField = (field: DescField): Option.Option<RequestField> => {
  if (field.oneof !== undefined) {
    return Option.none()
  }
  const base = {
    key: globalThis.String(field.number),
    name: field.name,
    jsonName: field.jsonName,
  }
  if (field.fieldKind === 'enum') {
    return Option.some(
      RequestField.Enum({
        ...base,
        typeName: field.enum.typeName,
        valueNames: Array.map(field.enum.values, (value) => value.name),
      })
    )
  }
  if (field.fieldKind !== 'scalar') {
    return Option.none()
  }
  if (field.scalar === ScalarType.BOOL) {
    return Option.some(RequestField.Bool(base))
  }
  if (
    field.scalar === ScalarType.STRING ||
    field.scalar === ScalarType.BYTES ||
    isSixtyFourBitScalar(field.scalar)
  ) {
    return Option.some(RequestField.Text({ ...base, maybeHelp: scalarHelp(field.scalar) }))
  }

  return Option.some(RequestField.Number(base))
}

const summarizeMethod = (method: DescMethod): MethodSummary => {
  const model = methodModel(method)

  return {
    localName: method.localName,
    name: method.name,
    modelLabel: model.label,
    modelDescription: model.description,
    isSupported: model.isSupported,
    isBidirectional: method.methodKind === 'bidi_streaming',
    inputTypeName: method.input.typeName,
    outputTypeName: method.output.typeName,
    requestTemplate: stringifyJson(createRequestTemplate(method.input)),
    fields: Array.getSomes(Array.map(method.input.fields, summarizeField)),
  }
}

const summarizeService = (service: DescService): ServiceSummary => ({
  typeName: service.typeName,
  methods: Array.map(service.methods, summarizeMethod),
})

/** Every service of a registry, ordered by fully qualified name. */
export const summarizeRegistry = (registry: FileRegistry): ReadonlyArray<ServiceSummary> =>
  Array.map(listServices(registry), summarizeService)

/** The method a freshly selected service starts on: its first one the wire can carry. */
export const firstSupportedMethod = (service: ServiceSummary): Option.Option<MethodSummary> =>
  Array.findFirst(service.methods, (method) => method.isSupported)
