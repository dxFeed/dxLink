import { Array, Effect, Option, Predicate, Schema, String, pipe } from 'effect'
import { Command, File, Submodel, type Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import type { FileRegistry } from '@bufbuild/protobuf'
import { Kit } from '@dxfeed/dxlink-console-foldkit-core'

import { DescriptorSetError, decodeRegistry, fetchDescriptorSet, parseRequest } from './descriptors'
import { RpcRegistry } from './service'
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

export const Definitions = Schema.Struct({
  /** Where the descriptor set came from — a URL or a file name. */
  source: Schema.String,
  services: Schema.Array(ServiceSummary),
})
export type Definitions = typeof Definitions.Type

/**
 * RPC channel-request form.
 *
 * The loaded definitions are held here rather than re-fetched per dialog open, so a
 * descriptor set is loaded once and several channels can be opened against it.
 */
export const Model = Schema.Struct({
  _tag: Schema.Literal(REQUEST_TAG),
  /** Descriptor-set endpoint, kept between opens. */
  url: Schema.String,
  load: Load,
  maybeDefinitions: Schema.Option(Definitions),
  /** Fully qualified name of the selected service; empty when none is. */
  serviceName: Schema.String,
  /** ECMAScript name of the selected method; empty when none is. */
  methodName: Schema.String,
  /** The request message being edited, as protobuf-JSON. */
  json: Schema.String,
  validation: Validation,
})
export type Model = typeof Model.Type

export const isModel = (value: unknown): value is Model => Predicate.isTagged(value, REQUEST_TAG)

/** What a channel is opened with: the call, named, and what the card shows about it. */
export const Config = Schema.Struct({
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

export const Message = defineMessageUnion({
  UpdatedUrl: { value: Schema.String },
  ClickedLoadUrl: {},
  ClickedLoadFile: {},
  SucceededLoadDescriptors: {
    source: Schema.String,
    services: Schema.Array(ServiceSummary),
  },
  FailedLoadDescriptors: { source: Schema.String, reason: Schema.String },
  CancelledLoadDescriptorFile: {},
  SelectedService: { typeName: Schema.String },
  SelectedMethod: { localName: Schema.String },
  UpdatedRequestJson: { value: Schema.String },
  CompletedValidateRequest: {
    serviceName: Schema.String,
    methodName: Schema.String,
    json: Schema.String,
    maybeError: Schema.Option(Schema.String),
  },
})
export type Message = typeof Message.Type

export const isMessage = Schema.is(Message)

// COMMAND

/**
 * Make a registry the one calls are resolved from, and hand its plain summary to the Model.
 * The registry is replaced before the summary is returned, so by the time the form shows a
 * service the registry can resolve it.
 */
const publishRegistry = (source: string, registry: FileRegistry) =>
  Effect.gen(function* () {
    const store = yield* RpcRegistry
    yield* store.set(registry)

    return Message.SucceededLoadDescriptors({
      source,
      services: summarizeRegistry(registry),
    })
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

const DEFINITIONS_NOT_LOADED = 'The service definitions are not loaded.'

/**
 * Check the request JSON against the selected method's input message.
 *
 * The result names what was checked, so a verdict that arrives after the text or the
 * selection moved on can be told apart from one about the current request.
 */
export const ValidateRequest = Command.define('ValidateRequest', {
  args: {
    serviceName: Schema.String,
    methodName: Schema.String,
    json: Schema.String,
  },
  messages: [Message.CompletedValidateRequest],
  execute: ({ serviceName, methodName, json }) =>
    Effect.gen(function* () {
      const store = yield* RpcRegistry
      const maybeRegistry = yield* store.get
      const maybeError = pipe(
        maybeRegistry,
        Option.flatMapNullishOr((registry) => registry.getService(serviceName)?.method[methodName]),
        Option.match({
          onNone: () => Option.some(DEFINITIONS_NOT_LOADED),
          onSome: (method) => {
            const parsed = parseRequest(method.input, json)

            return 'error' in parsed ? Option.some(parsed.error) : Option.none()
          },
        })
      )

      return Message.CompletedValidateRequest({
        serviceName,
        methodName,
        json,
        maybeError,
      })
    }),
})

// UPDATE

const EMPTY_REQUEST = '{}'

const findService = (model: Model, typeName: string): Option.Option<ServiceSummary> =>
  pipe(
    model.maybeDefinitions,
    Option.flatMap((definitions) =>
      Array.findFirst(definitions.services, (service) => service.typeName === typeName)
    )
  )

export const selectedService = (model: Model): Option.Option<ServiceSummary> =>
  findService(model, model.serviceName)

export const selectedMethod = (model: Model): Option.Option<MethodSummary> =>
  pipe(
    selectedService(model),
    Option.flatMap((service) =>
      Array.findFirst(service.methods, (method) => method.localName === model.methodName)
    )
  )

/**
 * "Open channel" is enabled exactly when this is `Some`: a method the wire can carry is
 * selected and the request, as it currently reads, was checked against it and passed.
 */
export const toConfig = (model: Model): Option.Option<Config> =>
  pipe(
    selectedMethod(model),
    Option.filter((method) => method.isSupported && model.validation._tag === 'Valid'),
    Option.map((method) => ({
      serviceName: model.serviceName,
      methodLocalName: method.localName,
      methodName: method.name,
      modelLabel: method.modelLabel,
      isBidirectional: method.isBidirectional,
      inputTypeName: method.inputTypeName,
      outputTypeName: method.outputTypeName,
      requestJson: model.json,
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

/** Mark the request unchecked and, when a method is selected, ask for a verdict on it. */
const revalidate = (model: Model): UpdateReturn => {
  const pending = modifyFields(model, {
    validation: () => Validation.Pending(),
  })

  return String.isEmpty(pending.methodName)
    ? { model: pending }
    : {
        model: pending,
        commands: [
          ValidateRequest({
            serviceName: pending.serviceName,
            methodName: pending.methodName,
            json: pending.json,
          }),
        ],
      }
}

/** Select a method, or none, and open the editor on the shape of its request message. */
const withMethod = (
  model: Model,
  serviceName: string,
  maybeMethod: Option.Option<MethodSummary>
): UpdateReturn =>
  revalidate(
    modifyFields(model, {
      serviceName: () => serviceName,
      methodName: () =>
        Option.match(maybeMethod, {
          onNone: () => '',
          onSome: (method) => method.localName,
        }),
      json: () =>
        Option.match(maybeMethod, {
          onNone: () => EMPTY_REQUEST,
          onSome: (method) => method.requestTemplate,
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
      serviceName: '',
      methodName: '',
      json: EMPTY_REQUEST,
      validation: Validation.Pending(),
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

      // NOTE: a new descriptor set invalidates the current selection, so its first service
      // and that service's first supported method are preselected, as in a fresh dialog.
      SucceededLoadDescriptors: ({ source, services }) => {
        const maybeService = Array.head(services)

        return withMethod(
          modifyFields(model, {
            load: () => Load.Idle(),
            maybeDefinitions: () => Option.some({ source, services }),
          }),
          Option.match(maybeService, {
            onNone: () => '',
            onSome: (service) => service.typeName,
          }),
          Option.flatMap(maybeService, firstSupportedMethod)
        )
      },

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
        Option.match(findService(model, typeName), {
          onNone: () => ({ model }),
          onSome: (service) => withMethod(model, service.typeName, firstSupportedMethod(service)),
        }),

      SelectedMethod: ({ localName }) =>
        pipe(
          selectedService(model),
          Option.flatMap((service) =>
            Array.findFirst(
              service.methods,
              (method) => method.localName === localName && method.isSupported
            )
          ),
          Option.match({
            onNone: () => ({ model }),
            onSome: (method) => withMethod(model, model.serviceName, Option.some(method)),
          })
        ),

      UpdatedRequestJson: ({ value }) => revalidate(modifyFields(model, { json: () => value })),

      CompletedValidateRequest: ({ serviceName, methodName, json, maybeError }) =>
        serviceName === model.serviceName && methodName === model.methodName && json === model.json
          ? {
              model: modifyFields(model, {
                validation: () =>
                  Option.match(maybeError, {
                    onNone: () => Validation.Valid(),
                    onSome: (error) => Validation.Invalid({ error }),
                  }),
              }),
            }
          : { model },
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

const methodView = (model: Model, method: MethodSummary, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex flex-col gap-3')],
    [
      Kit.sectionLabel(`Request · ${method.inputTypeName}`, h),
      requestFields(method, model.json, h),
      Kit.textArea(
        {
          id: 'dxlink-rpc-request-json',
          label: 'Request JSON',
          value: model.json,
          onInput: (value) => Message.UpdatedRequestJson({ value }),
          helperText: 'Canonical protobuf-JSON — exactly what is sent on the channel.',
        },
        h
      ),
      Validation.match(model.validation, {
        Pending: () => h.empty,
        Valid: () => h.empty,
        Invalid: ({ error }) => Kit.notice(error, 'Danger', h),
      }),
    ]
  )

const pickersView = (
  model: Model,
  definitions: Definitions,
  h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
  const maybeService = selectedService(model)
  const maybeMethod = selectedMethod(model)

  return [
    Kit.selectField(
      {
        id: 'dxlink-rpc-service',
        label: 'Service',
        value: model.serviceName,
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
            value: model.methodName,
            options: [
              ...(Option.isNone(maybeMethod) ? [{ value: '', label: '', isDisabled: true }] : []),
              ...Array.map(service.methods, (method) => ({
                value: method.localName,
                label: `${method.name} — ${method.modelLabel}`,
                isDisabled: !method.isSupported,
              })),
            ],
            onChange: (localName) => Message.SelectedMethod({ localName }),
            ...Option.match(maybeMethod, {
              onNone: () => ({}),
              onSome: (method) => ({ helperText: method.modelDescription }),
            }),
          },
          h
        ),
    }),
    Option.match(maybeMethod, {
      onNone: () => h.empty,
      onSome: (method) => methodView(model, method, h),
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
        onSome: (definitions) => pickersView(model, definitions, h),
      }),
    ]
  )
