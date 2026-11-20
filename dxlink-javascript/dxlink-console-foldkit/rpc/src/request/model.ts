import { Array, Option, Predicate, Schema, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Summary } from '../domain'

const REQUEST_TAG = 'RpcRequest'

export const Load = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Failed: { error: Schema.String },
})
export type Load = typeof Load.Type

/** The verdict on the request JSON as it currently reads. */
export const Validation = defineTaggedUnion({
  /** Not checked yet: nothing may be sent on an unchecked request. */
  Pending: {},
  Valid: {},
  Invalid: { error: Schema.String },
})
export type Validation = typeof Validation.Type

/** The request being written for the selected method. */
export const RequestDraft = Schema.Struct({
  /** ECMAScript name of the method. */
  methodName: Schema.String,
  /** The request message being edited, as protobuf-JSON. */
  json: Schema.String,
  validation: Validation,
})
export type RequestDraft = typeof RequestDraft.Type

export const Selection = Schema.Struct({
  /** Fully qualified name of the selected service. */
  serviceName: Schema.String,
  /** `None` while the service has no method selected, as when it declares none the wire can carry. */
  maybeRequest: Schema.Option(RequestDraft),
})
export type Selection = typeof Selection.Type

/**
 * One loaded descriptor set and what is selected in it. A selection exists only inside the
 * definitions it was made in, so replacing the definitions replaces the selection with them.
 */
export const Definitions = Schema.Struct({
  /** The identity the registry behind this summary is addressable by in `RpcRegistry`. */
  registryId: Schema.Finite,
  /** Where the descriptor set came from — a URL or a file name. */
  source: Schema.String,
  services: Schema.Array(Summary.ServiceSummary),
  /** `None` only when the descriptor set declares no services. */
  maybeSelection: Schema.Option(Selection),
})
export type Definitions = typeof Definitions.Type

/**
 * RPC channel-request form.
 *
 * The loaded definitions are held here rather than re-fetched per dialog open, so a
 * descriptor set is loaded once and several channels can be opened against it. `load` is
 * the state of the latest attempt to load a set; the definitions of the previous successful
 * one stay usable while it runs and after it fails.
 */
export const Model = Schema.Struct({
  _tag: Schema.Literal(REQUEST_TAG),
  /** Descriptor-set endpoint, kept between opens. */
  url: Schema.String,
  load: Load,
  maybeDefinitions: Schema.Option(Definitions),
})
export type Model = typeof Model.Type

export const isModel = (value: unknown): value is Model => Predicate.isTagged(value, REQUEST_TAG)

/** The form before anything is loaded, on the given descriptor-set endpoint. */
export const emptyModel = (url: string): Model => ({
  _tag: REQUEST_TAG,
  url,
  load: Load.Idle(),
  maybeDefinitions: Option.none(),
})

/** What a channel is opened with: the call, named, and what the card shows about it. */
export const Config = Schema.Struct({
  /** The registry the call's descriptors are resolved from. */
  registryId: Schema.Finite,
  serviceName: Schema.String,
  methodLocalName: Schema.String,
  methodName: Schema.String,
  modelLabel: Schema.String,
  isBidirectional: Schema.Boolean,
  inputTypeName: Schema.String,
  outputTypeName: Schema.String,
  /** The request to open the channel with; valid against the method's input when built. */
  requestJson: Schema.String,
  requestTemplate: Schema.String,
})
export type Config = typeof Config.Type

export const findService = (
  definitions: Definitions,
  typeName: string
): Option.Option<Summary.ServiceSummary> =>
  Array.findFirst(definitions.services, (service) => service.typeName === typeName)

export const selectedServiceOf = (
  definitions: Definitions
): Option.Option<Summary.ServiceSummary> =>
  Option.flatMap(definitions.maybeSelection, ({ serviceName }) =>
    findService(definitions, serviceName)
  )

/** The selected method with the request being written for it. */
export type SelectedCall = Readonly<{
  definitions: Definitions
  serviceName: string
  method: Summary.MethodSummary
  request: RequestDraft
}>

export const selectedCallOf = (definitions: Definitions): Option.Option<SelectedCall> =>
  Option.flatMap(definitions.maybeSelection, ({ serviceName, maybeRequest }) =>
    Option.flatMap(maybeRequest, (request) =>
      pipe(
        findService(definitions, serviceName),
        Option.flatMap((service) =>
          Array.findFirst(service.methods, (method) => method.localName === request.methodName)
        ),
        Option.map((method) => ({ definitions, serviceName, method, request }))
      )
    )
  )

export const selectedService = (model: Model): Option.Option<Summary.ServiceSummary> =>
  Option.flatMap(model.maybeDefinitions, selectedServiceOf)

export const selectedMethod = (model: Model): Option.Option<Summary.MethodSummary> =>
  pipe(
    model.maybeDefinitions,
    Option.flatMap(selectedCallOf),
    Option.map(({ method }) => method)
  )

/** The request being written, or `None` while no method is selected. */
export const selectedRequest = (model: Model): Option.Option<RequestDraft> =>
  pipe(
    model.maybeDefinitions,
    Option.flatMap(selectedCallOf),
    Option.map(({ request }) => request)
  )

/**
 * "Open channel" is enabled exactly when this is `Some`: a method the wire can carry is
 * selected and the request, as it currently reads, was checked against it and passed.
 */
export const toConfig = (model: Model): Option.Option<Config> =>
  pipe(
    model.maybeDefinitions,
    Option.flatMap(selectedCallOf),
    Option.filter(
      ({ method, request }) => method.isSupported && request.validation._tag === 'Valid'
    ),
    Option.map(({ definitions, serviceName, method, request }) => ({
      registryId: definitions.registryId,
      serviceName,
      methodLocalName: method.localName,
      methodName: method.name,
      modelLabel: method.modelLabel,
      isBidirectional: method.isBidirectional,
      inputTypeName: method.inputTypeName,
      outputTypeName: method.outputTypeName,
      requestJson: request.json,
      requestTemplate: method.requestTemplate,
    }))
  )

export type RequestOptions = Readonly<{
  descriptorSetUrl: string
  /**
   * Whether the deployment pinned the descriptor-set URL. A pinned URL is read-only rather
   * than hidden, and Load still works: in a debug console the definitions being called
   * against are worth seeing even when they cannot be pointed somewhere else.
   */
  isUrlLocked: boolean
}>
