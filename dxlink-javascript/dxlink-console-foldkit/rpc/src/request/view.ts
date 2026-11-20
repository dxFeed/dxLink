import { Array, Option, Predicate, String, pipe } from 'effect'
import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Kit } from '@dxfeed/dxlink-console-foldkit-core'

import { Summary } from '../domain'
import { Message } from './message'
import {
  type Definitions,
  Load,
  type Model,
  type RequestDraft,
  type RequestOptions,
  Validation,
  selectedCallOf,
  selectedServiceOf,
} from './model'

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
  field: Summary.RequestField,
  request: Readonly<Record<string, unknown>>,
  h: HtmlBuilder<Message>
): Html => {
  const current = request[field.jsonName]

  return Summary.RequestField.match(field, {
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
const requestFields = (
  method: Summary.MethodSummary,
  json: string,
  h: HtmlBuilder<Message>
): Html =>
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

const methodView = (
  method: Summary.MethodSummary,
  request: RequestDraft,
  h: HtmlBuilder<Message>
): Html =>
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
export const makeView = (options: RequestOptions) =>
  Submodel.defineView<Model, Message>((model, h) =>
    h.div(
      [h.Class('flex flex-col gap-5')],
      [
        definitionsView(model, options.isUrlLocked, h),
        ...Option.match(model.maybeDefinitions, {
          onNone: () => [],
          onSome: (definitions) => pickersView(definitions, h),
        }),
      ]
    )
  )
