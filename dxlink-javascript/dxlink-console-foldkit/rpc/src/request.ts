import { Array, Effect, Option, Predicate, Schema, String, pipe } from 'effect'
import { Command, File, Submodel, type Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import type { FileRegistry } from '@bufbuild/protobuf'
import { Kit } from '@dxfeed/dxlink-console-foldkit-core'

import {
  DescriptorSetError,
  decodeRegistry,
  describeFailure,
  fetchDescriptorSet,
  parseRequest,
} from './descriptors'
import { RpcRegistry, resolveMethod } from './service'
import {
  type MethodSummary,
  RequestField,
  ServiceSummary,
  firstSupportedMethod,
  summarizeRegistry,
} from './summary'

// MODEL

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
  services: Schema.Array(ServiceSummary),
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

// MESSAGE

/** A request text together with the method it was checked against. */
const checkedRequestFields = {
  registryId: Schema.Finite,
  serviceName: Schema.String,
  methodName: Schema.String,
  json: Schema.String,
}

export const Message = defineMessageUnion({
  UpdatedUrl: { value: Schema.String },
  ClickedLoadUrl: {},
  ClickedLoadFile: {},
  SucceededLoadDescriptors: {
    registryId: Schema.Finite,
    source: Schema.String,
    services: Schema.Array(ServiceSummary),
  },
  FailedLoadDescriptors: { source: Schema.String, reason: Schema.String },
  CancelledLoadDescriptorFile: {},
  SelectedService: { typeName: Schema.String },
  SelectedMethod: { localName: Schema.String },
  UpdatedRequestJson: { value: Schema.String },
  SucceededValidateRequest: {
    ...checkedRequestFields,
    /** What is wrong with the request, or `None` when it fits the method's input message. */
    maybeError: Schema.Option(Schema.String),
  },
  FailedValidateRequest: { ...checkedRequestFields, reason: Schema.String },
})
export type Message = typeof Message.Type

export const isMessage = Schema.is(Message)

// COMMAND

/**
 * Retain a registry and hand its plain summary, with the identity it was retained under,
 * to the Model. The registry is retained before the summary is returned, so by the time
 * the form shows a service the registry can resolve it.
 */
const publishRegistry = (source: string, registry: FileRegistry) =>
  Effect.gen(function* () {
    const services = yield* Effect.try({
      try: () => summarizeRegistry(registry),
      catch: (cause) => new DescriptorSetError({ message: describeFailure(cause), cause }),
    })
    const store = yield* RpcRegistry
    const registryId = yield* store.add(registry)

    return Message.SucceededLoadDescriptors({ registryId, source, services })
  })

export const LoadDescriptorUrl = Command.define('LoadDescriptorUrl', {
  args: { url: Schema.String },
  messages: [Message.SucceededLoadDescriptors, Message.FailedLoadDescriptors],
  execute: ({ url }) =>
    fetchDescriptorSet(url).pipe(
      Effect.flatMap((registry) => publishRegistry(url, registry)),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedLoadDescriptors({ source: url, reason: error.message }))
      )
    ),
})

const DESCRIPTOR_FILE_TYPES = ['.binpb', '.bin', '.pb', '.json']

export const LoadDescriptorFile = Command.define('LoadDescriptorFile', {
  messages: [
    Message.SucceededLoadDescriptors,
    Message.FailedLoadDescriptors,
    Message.CancelledLoadDescriptorFile,
  ],
  execute: Effect.gen(function* () {
    const maybeFile = yield* File.select(DESCRIPTOR_FILE_TYPES)
    if (Option.isNone(maybeFile)) {
      return Message.CancelledLoadDescriptorFile()
    }
    const file = maybeFile.value
    const source = File.name(file)

    return yield* File.readAsArrayBuffer(file).pipe(
      Effect.mapError((error) => new DescriptorSetError({ message: error.reason })),
      Effect.flatMap((buffer) => decodeRegistry(new Uint8Array(buffer))),
      Effect.flatMap((registry) => publishRegistry(source, registry)),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedLoadDescriptors({ source, reason: error.message }))
      )
    )
  }),
})

/**
 * Check the request JSON against the input message of the method it names, in the registry
 * it names. Succeeds with a verdict; fails when that method cannot be resolved, which is
 * the case once its registry is not retained.
 *
 * Either result names what was checked, so one that arrives after the text or the selection
 * moved on can be told apart from one about the current request.
 */
export const ValidateRequest = Command.define('ValidateRequest', {
  args: checkedRequestFields,
  messages: [Message.SucceededValidateRequest, Message.FailedValidateRequest],
  execute: ({ registryId, serviceName, methodName, json }) =>
    resolveMethod({ registryId, serviceName, methodLocalName: methodName }).pipe(
      Effect.map(({ method }) => {
        const parsed = parseRequest(method.input, json)

        return Message.SucceededValidateRequest({
          registryId,
          serviceName,
          methodName,
          json,
          maybeError: 'error' in parsed ? Option.some(parsed.error) : Option.none(),
        })
      }),
      Effect.catch((error) =>
        Effect.succeed(
          Message.FailedValidateRequest({
            registryId,
            serviceName,
            methodName,
            json,
            reason: error.message,
          })
        )
      )
    ),
})

// UPDATE

const findService = (definitions: Definitions, typeName: string): Option.Option<ServiceSummary> =>
  Array.findFirst(definitions.services, (service) => service.typeName === typeName)

const selectedServiceOf = (definitions: Definitions): Option.Option<ServiceSummary> =>
  Option.flatMap(definitions.maybeSelection, ({ serviceName }) =>
    findService(definitions, serviceName)
  )

/** The selected method with the request being written for it. */
type SelectedCall = Readonly<{
  definitions: Definitions
  serviceName: string
  method: MethodSummary
  request: RequestDraft
}>

const selectedCallOf = (definitions: Definitions): Option.Option<SelectedCall> =>
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

export const selectedService = (model: Model): Option.Option<ServiceSummary> =>
  Option.flatMap(model.maybeDefinitions, selectedServiceOf)

export const selectedMethod = (model: Model): Option.Option<MethodSummary> =>
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

type UpdateReturn = Update.Return<Model, Message, RpcRegistry>

/** A service selected on a method, or on none, with the editor on the shape of its request. */
const selectionOf = (
  service: ServiceSummary,
  maybeMethod: Option.Option<MethodSummary>
): Selection => ({
  serviceName: service.typeName,
  maybeRequest: Option.map(maybeMethod, (method) => ({
    methodName: method.localName,
    json: method.requestTemplate,
    validation: Validation.Pending(),
  })),
})

/** Hold these definitions and, when a method is selected in them, ask for a verdict on its request. */
const withDefinitions = (model: Model, definitions: Definitions): UpdateReturn => ({
  model: modifyFields(model, {
    maybeDefinitions: () => Option.some(definitions),
  }),
  commands: pipe(
    definitions.maybeSelection,
    Option.flatMap(({ serviceName, maybeRequest }) =>
      Option.map(maybeRequest, ({ methodName, json }) =>
        ValidateRequest({
          registryId: definitions.registryId,
          serviceName,
          methodName,
          json,
        })
      )
    ),
    Option.toArray
  ),
})

const withSelection = (model: Model, definitions: Definitions, selection: Selection) =>
  withDefinitions(
    model,
    modifyFields(definitions, {
      maybeSelection: () => Option.some(selection),
    })
  )

/**
 * Record a verdict on the request it is about. A verdict about any other registry, method
 * or text than the Model currently holds changes nothing.
 */
const withVerdict = (
  model: Model,
  checked: Readonly<{ registryId: number; serviceName: string; methodName: string; json: string }>,
  validation: Validation
): UpdateReturn =>
  pipe(
    model.maybeDefinitions,
    Option.flatMap(selectedCallOf),
    Option.filter(
      ({ definitions, serviceName, request }) =>
        definitions.registryId === checked.registryId &&
        serviceName === checked.serviceName &&
        request.methodName === checked.methodName &&
        request.json === checked.json
    ),
    Option.match({
      onNone: () => ({ model }),
      onSome: ({ definitions, serviceName, request }) => ({
        model: modifyFields(model, {
          maybeDefinitions: () =>
            Option.some(
              modifyFields(definitions, {
                maybeSelection: () =>
                  Option.some({
                    serviceName,
                    maybeRequest: Option.some(
                      modifyFields(request, { validation: () => validation })
                    ),
                  }),
              })
            ),
        }),
      }),
    })
  )

export const makeRequest = (options: RequestOptions) => {
  const init = (): UpdateReturn => ({
    model: {
      _tag: REQUEST_TAG,
      url: options.descriptorSetUrl,
      load: Load.Idle(),
      maybeDefinitions: Option.none(),
    },
  })

  const update = (model: Model, message: Message) =>
    Message.match<UpdateReturn>(message, {
      UpdatedUrl: ({ value }) =>
        options.isUrlLocked ? { model } : { model: modifyFields(model, { url: () => value }) },

      ClickedLoadUrl: () =>
        model.load._tag === 'Loading' || String.isEmpty(model.url.trim())
          ? { model }
          : {
              model: modifyFields(model, { load: () => Load.Loading() }),
              commands: [LoadDescriptorUrl({ url: model.url })],
            },

      ClickedLoadFile: () =>
        model.load._tag === 'Loading'
          ? { model }
          : {
              model: modifyFields(model, { load: () => Load.Loading() }),
              commands: [LoadDescriptorFile()],
            },

      // NOTE: a new descriptor set replaces the current selection with its own: its first
      // service and that service's first supported method, as in a fresh dialog.
      SucceededLoadDescriptors: ({ registryId, source, services }) =>
        withDefinitions(modifyFields(model, { load: () => Load.Idle() }), {
          registryId,
          source,
          services,
          maybeSelection: Option.map(Array.head(services), (service) =>
            selectionOf(service, firstSupportedMethod(service))
          ),
        }),

      FailedLoadDescriptors: ({ source, reason }) => ({
        model: modifyFields(model, {
          load: () =>
            Load.Failed({
              error: `Could not load definitions from ${source}: ${reason}`,
            }),
        }),
      }),

      CancelledLoadDescriptorFile: () => ({
        model: modifyFields(model, { load: () => Load.Idle() }),
      }),

      SelectedService: ({ typeName }) =>
        pipe(
          model.maybeDefinitions,
          Option.flatMap((definitions) =>
            Option.map(findService(definitions, typeName), (service) =>
              withSelection(model, definitions, selectionOf(service, firstSupportedMethod(service)))
            )
          ),
          Option.getOrElse(() => ({ model }))
        ),

      SelectedMethod: ({ localName }) =>
        pipe(
          model.maybeDefinitions,
          Option.flatMap((definitions) =>
            Option.flatMap(selectedServiceOf(definitions), (service) =>
              pipe(
                Array.findFirst(
                  service.methods,
                  (method) => method.localName === localName && method.isSupported
                ),
                Option.map((method) =>
                  withSelection(model, definitions, selectionOf(service, Option.some(method)))
                )
              )
            )
          ),
          Option.getOrElse(() => ({ model }))
        ),

      UpdatedRequestJson: ({ value }) =>
        pipe(
          model.maybeDefinitions,
          Option.flatMap(selectedCallOf),
          Option.match({
            onNone: () => ({ model }),
            onSome: ({ definitions, serviceName, request }) =>
              withSelection(model, definitions, {
                serviceName,
                maybeRequest: Option.some({
                  methodName: request.methodName,
                  json: value,
                  validation: Validation.Pending(),
                }),
              }),
          })
        ),

      SucceededValidateRequest: ({ maybeError, ...checked }) =>
        withVerdict(
          model,
          checked,
          Option.match(maybeError, {
            onNone: () => Validation.Valid(),
            onSome: (error) => Validation.Invalid({ error }),
          })
        ),

      // NOTE: a request that could not be checked is not sendable; the reason is shown where
      // a verdict would be, and loading the definitions again replaces it.
      FailedValidateRequest: ({ reason, ...checked }) =>
        withVerdict(model, checked, Validation.Invalid({ error: reason })),
    })

  const view = Submodel.defineView<Model, Message>((model, h) =>
    requestView(model, options.isUrlLocked, h)
  )

  return { init, update, view }
}

// VIEW

const parseJson = Option.liftThrowable((text: string): unknown => JSON.parse(text))

/** The request as a JSON object, or `None` while the text is not one. */
const parseJsonObject = (json: string): Option.Option<Readonly<Record<string, unknown>>> =>
  pipe(
    parseJson(json),
    Option.filter(Predicate.isObject),
    Option.filter((value) => !Array.isArray(value))
  )

const withField = (
  request: Readonly<Record<string, unknown>>,
  jsonName: string,
  value: unknown
): Message =>
  Message.UpdatedRequestJson({
    value: JSON.stringify({ ...request, [jsonName]: value }, null, 2),
  })

const fieldId = (key: string): string => `dxlink-rpc-request-field-${key}`

const fieldControl = (
  field: RequestField,
  request: Readonly<Record<string, unknown>>,
  h: HtmlBuilder<Message>
): Html => {
  const current = request[field.jsonName]

  return RequestField.match(field, {
    Enum: ({ key, name, jsonName, typeName, valueNames }) =>
      Kit.selectField(
        {
          id: fieldId(key),
          label: name,
          value: Predicate.isString(current) ? current : '',
          options: Array.map(valueNames, (valueName) => ({
            value: valueName,
            label: valueName,
          })),
          onChange: (value) => withField(request, jsonName, value),
          helperText: typeName,
        },
        h
      ),
    Bool: ({ key, name, jsonName }) =>
      h.div(
        [h.Class('flex items-end pb-2')],
        [
          Kit.checkbox(
            {
              id: fieldId(key),
              label: name,
              isChecked: current === true,
              onToggle: (isChecked) => withField(request, jsonName, isChecked),
            },
            h
          ),
        ]
      ),
    Text: ({ key, name, jsonName, maybeHelp }) =>
      Kit.textField(
        {
          id: fieldId(key),
          label: name,
          value: Predicate.isString(current) ? current : '',
          onInput: (value) => withField(request, jsonName, value),
          ...Option.match(maybeHelp, {
            onNone: () => ({}),
            onSome: (helperText) => ({ helperText }),
          }),
        },
        h
      ),
    Number: ({ key, name, jsonName }) =>
      Kit.textField(
        {
          id: fieldId(key),
          label: name,
          type: 'number',
          value: Predicate.isNumber(current) ? globalThis.String(current) : '',
          onInput: (value) =>
            withField(request, jsonName, String.isEmpty(value) ? 0 : globalThis.Number(value)),
        },
        h
      ),
  })
}

/**
 * Controls generated from the request message.
 *
 * The protobuf-JSON text is the single source of truth: each control reads its value out of
 * the parsed object and writes a new object back. While the text is not a JSON object the
 * controls stand down — the raw editor is then the only sane way to fix it.
 */
const requestFields = (method: MethodSummary, json: string, h: HtmlBuilder<Message>): Html =>
  Array.match(method.fields, {
    onEmpty: () => h.empty,
    onNonEmpty: (fields) =>
      Option.match(parseJsonObject(json), {
        onNone: () =>
          h.p(
            [h.Class(`text-sm ${Kit.MUTED_TEXT_CLASS}`)],
            ['Fields are editable again once the request below is a JSON object.']
          ),
        onSome: (request) =>
          h.div(
            [h.Class('grid grid-cols-1 gap-4 sm:grid-cols-2')],
            Array.map(fields, (field) =>
              h.keyed('div')(field.key, [h.Class('min-w-0')], [fieldControl(field, request, h)])
            )
          ),
      }),
  })

const definitionsView = (model: Model, isUrlLocked: boolean, h: HtmlBuilder<Message>): Html => {
  const isLoading = model.load._tag === 'Loading'

  return h.div(
    [h.Class('flex flex-col gap-3')],
    [
      Kit.sectionLabel('Service definitions', h),
      h.div(
        [h.Class('flex items-start gap-2')],
        [
          h.div(
            [h.Class('min-w-0 grow')],
            [
              Kit.textField(
                {
                  id: 'dxlink-rpc-descriptor-set-url',
                  label: 'Descriptor set URL',
                  value: model.url,
                  onInput: (value) => Message.UpdatedUrl({ value }),
                  isDisabled: isUrlLocked,
                  helperText: isUrlLocked
                    ? 'Fixed by this deployment.'
                    : 'An endpoint serving a FileDescriptorSet, binary or protobuf-JSON.',
                },
                h
              ),
            ]
          ),
          h.div(
            [h.Class('pt-5')],
            [
              Kit.button(
                {
                  label: 'Load',
                  onClick: Message.ClickedLoadUrl(),
                  isDisabled: isLoading || String.isEmpty(model.url.trim()),
                },
                h
              ),
            ]
          ),
        ]
      ),
      h.div(
        [],
        [
          Kit.button(
            {
              label: 'Load from file',
              onClick: Message.ClickedLoadFile(),
              variant: 'Ghost',
              size: 'Small',
              isDisabled: isLoading,
            },
            h
          ),
        ]
      ),
      Load.match(model.load, {
        Idle: () =>
          Option.match(model.maybeDefinitions, {
            onNone: () => h.empty,
            onSome: ({ source, services }) =>
              h.p(
                [h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)],
                [`${services.length} service${services.length === 1 ? '' : 's'} from ${source}`]
              ),
          }),
        Loading: () => h.empty,
        Failed: ({ error }) => Kit.notice(error, 'Danger', h),
      }),
    ]
  )
}

const methodView = (method: MethodSummary, request: RequestDraft, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex flex-col gap-3')],
    [
      Kit.sectionLabel(`Request · ${method.inputTypeName}`, h),
      requestFields(method, request.json, h),
      Kit.textArea(
        {
          id: 'dxlink-rpc-request-json',
          label: 'Request JSON',
          value: request.json,
          onInput: (value) => Message.UpdatedRequestJson({ value }),
          helperText: 'Canonical protobuf-JSON — exactly what is sent on the channel.',
        },
        h
      ),
      Validation.match(request.validation, {
        Pending: () => h.empty,
        Valid: () => h.empty,
        Invalid: ({ error }) => Kit.notice(error, 'Danger', h),
      }),
    ]
  )

const NO_METHOD_VALUE = ''

const pickersView = (definitions: Definitions, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const maybeService = selectedServiceOf(definitions)
  const maybeCall = selectedCallOf(definitions)

  return [
    Kit.selectField(
      {
        id: 'dxlink-rpc-service',
        label: 'Service',
        value: Option.match(maybeService, {
          onNone: () => '',
          onSome: (service) => service.typeName,
        }),
        options: Array.map(definitions.services, (service) => ({
          value: service.typeName,
          label: service.typeName,
        })),
        onChange: (typeName) => Message.SelectedService({ typeName }),
        isDisabled: Array.isReadonlyArrayEmpty(definitions.services),
        ...(Array.isReadonlyArrayEmpty(definitions.services)
          ? { helperText: 'The descriptor set declares no services.' }
          : {}),
      },
      h
    ),
    Option.match(maybeService, {
      onNone: () => h.empty,
      onSome: (service) =>
        Kit.selectField(
          {
            id: 'dxlink-rpc-method',
            label: 'Method',
            value: Option.match(maybeCall, {
              onNone: () => NO_METHOD_VALUE,
              onSome: ({ method }) => method.localName,
            }),
            options: [
              ...(Option.isNone(maybeCall)
                ? [{ value: NO_METHOD_VALUE, label: '', isDisabled: true }]
                : []),
              ...Array.map(service.methods, (method) => ({
                value: method.localName,
                label: `${method.name} — ${method.modelLabel}`,
                isDisabled: !method.isSupported,
              })),
            ],
            onChange: (localName) => Message.SelectedMethod({ localName }),
            ...Option.match(maybeCall, {
              onNone: () => ({}),
              onSome: ({ method }) => ({ helperText: method.modelDescription }),
            }),
          },
          h
        ),
    }),
    Option.match(maybeCall, {
      onNone: () => h.empty,
      onSome: ({ method, request }) => methodView(method, request, h),
    }),
  ]
}

/**
 * RPC channel request form: load a descriptor set, pick a service and a method, fill in the
 * request.
 *
 * There is no built-in service list on purpose — the console is pointed at whatever
 * definitions the server (or a local `buf build -o set.binpb`) provides, so it is not tied
 * to any one API's release cycle.
 */
const requestView = (model: Model, isUrlLocked: boolean, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex flex-col gap-5')],
    [
      definitionsView(model, isUrlLocked, h),
      ...Option.match(model.maybeDefinitions, {
        onNone: () => [],
        onSome: (definitions) => pickersView(definitions, h),
      }),
    ]
  )
