import { Array, Option, String, pipe } from 'effect'
import type { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { Summary } from '../domain'
import type { RpcRegistry } from '../service'
import { LoadDescriptorFile, LoadDescriptorUrl, ValidateRequest } from './command'
import { Message } from './message'
import {
  type Definitions,
  Load,
  type Model,
  type RequestOptions,
  type Selection,
  Validation,
  emptyModel,
  findService,
  selectedCallOf,
  selectedServiceOf,
} from './model'

type UpdateReturn = Update.Return<Model, Message, RpcRegistry>

/** A service selected on a method, or on none, with the editor on the shape of its request. */
const selectionOf = (
  service: Summary.ServiceSummary,
  maybeMethod: Option.Option<Summary.MethodSummary>
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

    SelectedService: ({ typeName }) =>
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
