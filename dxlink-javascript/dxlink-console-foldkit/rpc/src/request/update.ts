import { Array, Option, String, pipe } from 'effect'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { Listbox } from '@foldkit/ui'

import { Summary } from '../domain'
import type { RpcRegistry } from '../service'
import { LoadDescriptorFile, LoadDescriptorUrl, ValidateRequest } from './command'
import { Message } from './message'
import {
  type Definitions,
  Load,
  type Model,
  NameListbox,
  type RequestDraft,
  type RequestOptions,
  type Selection,
  Validation,
  draftOf,
  emptyModel,
  findService,
  parseRequestObject,
  selectedCallOf,
  selectedServiceOf,
  writeRequestField,
} from './model'

type UpdateReturn = Update.Return<Model, Message, RpcRegistry>
type UpdateStep = Update.Step<Model, Message, RpcRegistry>

/** A service selected on a method, or on none, with the editor on the shape of its request. */
const selectionOf = (
  service: Summary.ServiceSummary,
  maybeMethod: Option.Option<Summary.MethodSummary>
): Selection => ({
  serviceName: service.typeName,
  maybeRequest: Option.map(maybeMethod, draftOf),
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

/** Select a service and start on its first method the wire can carry. */
const selectService =
  (typeName: string): UpdateStep =>
  (model) =>
    pipe(
      model.maybeDefinitions,
      Option.flatMap((definitions) =>
        Option.map(findService(definitions, typeName), (service) =>
          withSelection(
            model,
            definitions,
            selectionOf(service, Summary.firstSupportedMethod(service))
          )
        )
      ),
      Option.getOrElse(() => ({ model }))
    )

/**
 * Select a method of the selected service and start a request for it. A method the wire
 * cannot carry is not selectable, whatever asked for it.
 */
const selectMethod =
  (localName: string): UpdateStep =>
  (model) =>
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
    )

/** Replace the request text and ask for a verdict on it. */
const writeRequestJson =
  (json: string): UpdateStep =>
  (model) =>
    pipe(
      model.maybeDefinitions,
      Option.flatMap(selectedCallOf),
      Option.match({
        onNone: () => ({ model }),
        onSome: ({ definitions, serviceName, request }) =>
          withSelection(model, definitions, {
            serviceName,
            maybeRequest: Option.some(
              modifyFields(request, {
                json: () => json,
                validation: () => Validation.Pending(),
              })
            ),
          }),
      })
    )

/**
 * Write a value name into the enum field with this key. Nothing changes while the request
 * text is not a JSON object, or when the selected method has no such enum field.
 */
const selectEnumValue =
  (fieldId: string, valueName: string): UpdateStep =>
  (model) =>
    pipe(
      model.maybeDefinitions,
      Option.flatMap(selectedCallOf),
      Option.flatMap(({ method, request }) =>
        Option.flatMap(
          Array.findFirst(method.fields, (field) => field._tag === 'Enum' && field.key === fieldId),
          (field) =>
            Option.map(parseRequestObject(request.json), (requestObject) =>
              writeRequestField(requestObject, field.jsonName, valueName)
            )
        )
      ),
      Option.match({
        onNone: () => ({ model }),
        onSome: (json) => writeRequestJson(json)(model),
      })
    )

const modifyRequest = (model: Model, modify: (request: RequestDraft) => RequestDraft): Model =>
  modifyFields(model, {
    maybeDefinitions: Option.map((definitions) =>
      modifyFields(definitions, {
        maybeSelection: Option.map((selection) =>
          modifyFields(selection, { maybeRequest: Option.map(modify) })
        ),
      })
    ),
  })

const foldServiceListbox = Update.foldChild({
  update: NameListbox.update,
  read: (model: Model) => Option.some(model.serviceListbox),
  write: (model, nextListbox) => modifyFields(model, { serviceListbox: () => nextListbox }),
  toParentMessage: (message) => Message.GotServiceListboxMessage({ message }),
  foldOutMessage: Listbox.OutMessage.match<UpdateStep, Listbox.OutMessage>({
    Selected: ({ value }) => selectService(value),
  }),
})

const foldMethodListbox = Update.foldChild({
  update: NameListbox.update,
  read: (model: Model) => Option.some(model.methodListbox),
  write: (model, nextListbox) => modifyFields(model, { methodListbox: () => nextListbox }),
  toParentMessage: (message) => Message.GotMethodListboxMessage({ message }),
  foldOutMessage: Listbox.OutMessage.match<UpdateStep, Listbox.OutMessage>({
    Selected: ({ value }) => selectMethod(value),
  }),
})

/**
 * The pickers of the enum fields of the request being written, addressed by field key. A
 * Message for a field the selected method does not have changes nothing.
 */
const foldEnumListbox = Update.foldChildAt({
  update: NameListbox.update,
  readAt: (model: Model, fieldId: string) =>
    pipe(
      model.maybeDefinitions,
      Option.flatMap(selectedCallOf),
      Option.flatMap(({ request }) =>
        Array.findFirst(request.enumListboxes, (entry) => entry.fieldId === fieldId)
      ),
      Option.map((entry) => entry.listbox)
    ),
  writeAt: (model, fieldId, nextListbox) =>
    modifyRequest(model, (request) =>
      modifyFields(request, {
        enumListboxes: Array.map((entry) =>
          entry.fieldId === fieldId ? modifyFields(entry, { listbox: () => nextListbox }) : entry
        ),
      })
    ),
  toParentMessage: (fieldId, message) => Message.GotEnumListboxMessage({ fieldId, message }),
  foldOutMessage: (fieldId) =>
    Listbox.OutMessage.match<UpdateStep, Listbox.OutMessage>({
      Selected: ({ value }) => selectEnumValue(fieldId, value),
    }),
})

export const makeInit = (options: RequestOptions) => (): UpdateReturn => ({
  model: emptyModel(options.descriptorSetUrl),
})

export const makeUpdate = (options: RequestOptions) => (model: Model, message: Message) =>
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
          selectionOf(service, Summary.firstSupportedMethod(service))
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

    GotServiceListboxMessage: ({ message: listboxMessage }) =>
      foldServiceListbox(model, listboxMessage),

    GotMethodListboxMessage: ({ message: listboxMessage }) =>
      foldMethodListbox(model, listboxMessage),

    GotEnumListboxMessage: ({ fieldId, message: listboxMessage }) =>
      foldEnumListbox(model, fieldId, listboxMessage),

    UpdatedRequestJson: ({ value }) => writeRequestJson(value)(model),

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
