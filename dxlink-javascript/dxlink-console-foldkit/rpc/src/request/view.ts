import { Array, Option, Predicate, String } from 'effect'
import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Kit } from '@dxfeed/dxlink-console-foldkit-core'

import { Summary } from '../domain'
import { Message } from './message'
import {
  type Definitions,
  type EnumListbox,
  Load,
  type Model,
  NameListbox,
  type RequestDraft,
  type RequestOptions,
  Validation,
  controlId,
  parseRequestObject,
  selectedCallOf,
  selectedServiceOf,
  writeRequestField,
} from './model'

const withField = (
  request: Readonly<Record<string, unknown>>,
  jsonName: string,
  value: unknown
): Message => Message.UpdatedRequestJson({ value: writeRequestField(request, jsonName, value) })

const fieldControl = (
  field: Summary.RequestField,
  request: Readonly<Record<string, unknown>>,
  enumListboxes: ReadonlyArray<EnumListbox>,
  h: HtmlBuilder<Message>
): Html => {
  const current = request[field.jsonName]

  return Summary.RequestField.match(field, {
    Enum: ({ key, name, typeName, valueNames }) =>
      Option.match(
        Array.findFirst(enumListboxes, (entry) => entry.fieldId === key),
        {
          onNone: () => h.empty,
          onSome: ({ fieldId, listbox }) =>
            Kit.listboxField(
              {
                id: listbox.id,
                label: name,
                options: Array.map(valueNames, (valueName) => ({
                  value: valueName,
                  label: valueName,
                })),
                maybeValue: Option.liftPredicate(current, Predicate.isString),
                helperText: typeName,
                toSubmodel: (viewInputs) =>
                  h.submodel({
                    slotId: listbox.id,
                    model: listbox,
                    view: NameListbox.view,
                    viewInputs,
                    toParentMessage: (message) =>
                      Message.GotEnumListboxMessage({ fieldId, message }),
                  }),
              },
              h
            ),
        }
      ),
    Bool: ({ key, name, jsonName }) =>
      h.div(
        [h.Class('flex items-end pb-2')],
        [
          Kit.checkbox(
            {
              id: controlId(key),
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
          id: controlId(key),
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
          id: controlId(key),
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
const requestFields = (
  method: Summary.MethodSummary,
  request: RequestDraft,
  h: HtmlBuilder<Message>
): Html =>
  Array.match(method.fields, {
    onEmpty: () => h.empty,
    onNonEmpty: (fields) =>
      Option.match(parseRequestObject(request.json), {
        onNone: () =>
          h.p(
            [h.Class(`text-sm ${Kit.MUTED_TEXT_CLASS}`)],
            ['Fields are editable again once the request below is a JSON object.']
          ),
        onSome: (requestObject) =>
          h.div(
            [h.Class('grid grid-cols-1 gap-4 sm:grid-cols-2')],
            Array.map(fields, (field) =>
              h.keyed('div')(
                field.key,
                [h.Class('min-w-0')],
                [fieldControl(field, requestObject, request.enumListboxes, h)]
              )
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

const methodView = (
  method: Summary.MethodSummary,
  request: RequestDraft,
  h: HtmlBuilder<Message>
): Html =>
  h.div(
    [h.Class('flex flex-col gap-3')],
    [
      Kit.sectionLabel(`Request · ${method.inputTypeName}`, h),
      requestFields(method, request, h),
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

const pickersView = (
  model: Model,
  definitions: Definitions,
  h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
  const maybeService = selectedServiceOf(definitions)
  const maybeCall = selectedCallOf(definitions)

  return [
    Kit.listboxField(
      {
        id: model.serviceListbox.id,
        label: 'Service',
        options: Array.map(definitions.services, (service) => ({
          value: service.typeName,
          label: service.typeName,
        })),
        maybeValue: Option.map(maybeService, (service) => service.typeName),
        isDisabled: Array.isReadonlyArrayEmpty(definitions.services),
        ...(Array.isReadonlyArrayEmpty(definitions.services)
          ? { helperText: 'The descriptor set declares no services.' }
          : {}),
        toSubmodel: (viewInputs) =>
          h.submodel({
            slotId: model.serviceListbox.id,
            model: model.serviceListbox,
            view: NameListbox.view,
            viewInputs,
            toParentMessage: (message) => Message.GotServiceListboxMessage({ message }),
          }),
      },
      h
    ),
    Option.match(maybeService, {
      onNone: () => h.empty,
      onSome: (service) =>
        Kit.listboxField(
          {
            id: model.methodListbox.id,
            label: 'Method',
            options: Array.map(service.methods, (method) => ({
              value: method.localName,
              label: `${method.name} — ${method.modelLabel}`,
              isDisabled: !method.isSupported,
            })),
            maybeValue: Option.map(maybeCall, ({ method }) => method.localName),
            ...Option.match(maybeCall, {
              onNone: () => ({}),
              onSome: ({ method }) => ({ helperText: method.modelDescription }),
            }),
            toSubmodel: (viewInputs) =>
              h.submodel({
                slotId: model.methodListbox.id,
                model: model.methodListbox,
                view: NameListbox.view,
                viewInputs,
                toParentMessage: (message) => Message.GotMethodListboxMessage({ message }),
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
export const makeView = (options: RequestOptions) =>
  Submodel.defineView<Model, Message>((model, h) =>
    h.div(
      [h.Class('flex flex-col gap-5')],
      [
        definitionsView(model, options.isUrlLocked, h),
        ...Option.match(model.maybeDefinitions, {
          onNone: () => [],
          onSome: (definitions) => pickersView(model, definitions, h),
        }),
      ]
    )
  )
