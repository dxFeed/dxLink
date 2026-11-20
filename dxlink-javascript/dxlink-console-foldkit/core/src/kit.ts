import { Array, Match, Option } from 'effect'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'

import { Button, Checkbox, Input, Select, Textarea } from '@foldkit/ui'

import type { Tone } from './channel/plugin'

/**
 * The console's look, as view helpers.
 *
 * Core and every channel package render through these, so the console reads as one surface
 * and its palette lives in one file. Each helper takes the caller's builder, which keeps the
 * Messages it wires in the caller's own Message universe.
 *
 * Colours come in light and dark pairs selected by a `dark` class on an ancestor: the page
 * that hosts the console decides the mode, and the console only follows it.
 */

export const CARD_CLASS =
  'rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900'

export const MUTED_TEXT_CLASS = 'text-zinc-500 dark:text-zinc-400'

export const DIVIDER_CLASS = 'border-zinc-200 dark:border-zinc-800'

const FIELD_CLASS =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 data-[disabled]:cursor-not-allowed data-[disabled]:bg-zinc-100 data-[disabled]:text-zinc-500 data-[invalid]:border-red-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:data-[disabled]:bg-zinc-800 dark:data-[disabled]:text-zinc-500'

const LABEL_CLASS = 'text-xs font-medium text-zinc-600 dark:text-zinc-400'

const HELPER_CLASS = 'text-xs text-zinc-500 dark:text-zinc-400'

export type ButtonVariant = 'Primary' | 'Outline' | 'Ghost' | 'Danger'

const BUTTON_BASE_CLASS =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50'

const buttonVariantClass = (variant: ButtonVariant): string =>
  Match.value(variant).pipe(
    Match.when(
      'Primary',
      () =>
        'bg-sky-600 text-white hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-zinc-950'
    ),
    Match.when(
      'Outline',
      () =>
        'border border-zinc-300 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800'
    ),
    Match.when(
      'Ghost',
      () => 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800'
    ),
    Match.when(
      'Danger',
      () =>
        'border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950'
    ),
    Match.exhaustive
  )

const buttonSizeClass = (size: 'Small' | 'Medium'): string =>
  size === 'Small' ? 'h-8 px-2.5 text-xs' : 'h-10 px-4 text-sm'

/** The classes of a button, for elements that have to look like one without being one. */
export const buttonClass = (variant: ButtonVariant, size: 'Small' | 'Medium' = 'Medium'): string =>
  `${BUTTON_BASE_CLASS} ${buttonVariantClass(variant)} ${buttonSizeClass(size)}`

/** A 24×24 outline icon from SVG path data, sized by the surrounding text. */
export const icon = <Message>(path: string, h: HtmlBuilder<Message>, className = 'size-4'): Html =>
  h.svg(
    [
      h.Class(`${className} shrink-0`),
      h.Xmlns('http://www.w3.org/2000/svg'),
      h.ViewBox('0 0 24 24'),
      h.Fill('none'),
      h.Stroke('currentColor'),
      h.StrokeWidth('1.5'),
      h.AriaHidden(true),
    ],
    [h.path([h.StrokeLinecap('round'), h.StrokeLinejoin('round'), h.D(path)])]
  )

export const ICON_CHEVRON_DOWN = 'm19.5 8.25-7.5 7.5-7.5-7.5'
export const ICON_CLOSE = 'M6 18 18 6M6 6l12 12'
export const ICON_ERROR =
  'M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z'

export const button = <Message>(
  config: Readonly<{
    label: string
    onClick?: Message
    variant?: ButtonVariant
    size?: 'Small' | 'Medium'
    type?: 'button' | 'submit'
    isDisabled?: boolean
    iconPath?: string
    attributes?: ReadonlyArray<Attribute<Message>>
  }>,
  h: HtmlBuilder<Message>
): Html =>
  Button.view(
    {
      ...(config.onClick === undefined ? {} : { onClick: config.onClick }),
      type: config.type ?? 'button',
      isDisabled: config.isDisabled ?? false,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            ...(config.attributes ?? []),
            h.Class(buttonClass(config.variant ?? 'Outline', config.size ?? 'Medium')),
          ],
          [
            ...Option.match(Option.fromNullishOr(config.iconPath), {
              onNone: () => [],
              onSome: (path) => [icon(path, h)],
            }),
            config.label,
          ]
        ),
    },
    h
  )

/** A square button that shows only an icon; `label` is what assistive technology reads. */
export const iconButton = <Message>(
  config: Readonly<{
    label: string
    iconPath: string
    onClick: Message
    iconClass?: string
  }>,
  h: HtmlBuilder<Message>
): Html =>
  Button.view(
    {
      onClick: config.onClick,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel(config.label),
            h.Title(config.label),
            h.Class(
              'inline-flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 dark:text-zinc-300 dark:hover:bg-zinc-800'
            ),
          ],
          [icon(config.iconPath, h, config.iconClass ?? 'size-5')]
        ),
    },
    h
  )

const fieldShell = <Message>(
  label: Html,
  control: Html,
  maybeHelper: Option.Option<Html>,
  h: HtmlBuilder<Message>
): Html =>
  h.div([h.Class('flex min-w-0 flex-col gap-1')], [label, control, ...Option.toArray(maybeHelper)])

export type TextFieldConfig<Message> = Readonly<{
  id: string
  label: string
  value: string
  onInput?: (value: string) => Message
  type?: string
  placeholder?: string
  helperText?: string
  isDisabled?: boolean
  isInvalid?: boolean
  isMonospace?: boolean
  /** The id of a `datalist` offering suggestions; the field stays free text. */
  listId?: string
}>

export const textField = <Message>(
  config: TextFieldConfig<Message>,
  h: HtmlBuilder<Message>
): Html =>
  Input.view(
    {
      id: config.id,
      value: config.value,
      type: config.type ?? 'text',
      isDisabled: config.isDisabled ?? false,
      isInvalid: config.isInvalid ?? false,
      hasDescription: config.helperText !== undefined,
      ...(config.onInput === undefined ? {} : { onInput: config.onInput }),
      ...(config.placeholder === undefined ? {} : { placeholder: config.placeholder }),
      toView: (attributes) =>
        fieldShell(
          h.label([...attributes.label, h.Class(LABEL_CLASS)], [config.label]),
          h.input([
            ...attributes.input,
            ...(config.listId === undefined ? [] : [h.List(config.listId)]),
            h.Autocomplete('off'),
            h.Class(config.isMonospace === true ? `${FIELD_CLASS} font-mono` : FIELD_CLASS),
          ]),
          Option.map(Option.fromNullishOr(config.helperText), (helperText) =>
            h.p(
              [
                ...attributes.description,
                h.Class(
                  config.isInvalid === true
                    ? 'text-xs text-red-600 dark:text-red-400'
                    : HELPER_CLASS
                ),
              ],
              [helperText]
            )
          ),
          h
        ),
    },
    h
  )

export const textArea = <Message>(
  config: Readonly<{
    id: string
    label: string
    value: string
    onInput?: (value: string) => Message
    rows?: number
    helperText?: string
    isDisabled?: boolean
    isReadOnly?: boolean
    isInvalid?: boolean
  }>,
  h: HtmlBuilder<Message>
): Html =>
  Textarea.view(
    {
      id: config.id,
      value: config.value,
      rows: config.rows ?? 6,
      isDisabled: config.isDisabled ?? false,
      isReadOnly: config.isReadOnly ?? false,
      isInvalid: config.isInvalid ?? false,
      hasDescription: config.helperText !== undefined,
      ...(config.onInput === undefined ? {} : { onInput: config.onInput }),
      toView: (attributes) =>
        fieldShell(
          h.label([...attributes.label, h.Class(LABEL_CLASS)], [config.label]),
          h.textarea([
            ...attributes.textarea,
            h.Spellcheck(false),
            h.Class(`${FIELD_CLASS} font-mono text-xs leading-relaxed`),
          ]),
          Option.map(Option.fromNullishOr(config.helperText), (helperText) =>
            h.p(
              [
                ...attributes.description,
                h.Class(
                  config.isInvalid === true
                    ? 'text-xs text-red-600 dark:text-red-400'
                    : HELPER_CLASS
                ),
              ],
              [helperText]
            )
          ),
          h
        ),
    },
    h
  )

export type SelectOption = Readonly<{
  value: string
  label: string
  isDisabled?: boolean
}>

export const selectField = <Message>(
  config: Readonly<{
    id: string
    label: string
    value: string
    options: ReadonlyArray<SelectOption>
    onChange: (value: string) => Message
    helperText?: string
    isDisabled?: boolean
  }>,
  h: HtmlBuilder<Message>
): Html =>
  Select.view(
    {
      id: config.id,
      value: config.value,
      onChange: config.onChange,
      isDisabled: config.isDisabled ?? false,
      hasDescription: config.helperText !== undefined,
      toView: (attributes) =>
        fieldShell(
          h.label([...attributes.label, h.Class(LABEL_CLASS)], [config.label]),
          h.select(
            [...attributes.select, h.Class(FIELD_CLASS)],
            Array.map(config.options, (option) =>
              h.keyed('option')(
                option.value,
                [
                  h.Value(option.value),
                  h.Selected(option.value === config.value),
                  h.Disabled(option.isDisabled ?? false),
                ],
                [option.label]
              )
            )
          ),
          Option.map(Option.fromNullishOr(config.helperText), (helperText) =>
            h.p([...attributes.description, h.Class(HELPER_CLASS)], [helperText])
          ),
          h
        ),
    },
    h
  )

export const checkbox = <Message>(
  config: Readonly<{
    id: string
    label: string
    isChecked: boolean
    onToggle: (isChecked: boolean) => Message
    isDisabled?: boolean
  }>,
  h: HtmlBuilder<Message>
): Html =>
  Checkbox.view(
    {
      id: config.id,
      isChecked: config.isChecked,
      onToggle: config.onToggle,
      isDisabled: config.isDisabled ?? false,
      toView: (attributes) =>
        h.div(
          [h.Class('inline-flex items-center gap-2')],
          [
            h.button(
              [
                ...attributes.checkbox,
                h.Class(
                  'flex size-4 shrink-0 items-center justify-center rounded border border-zinc-400 text-white data-[checked]:border-sky-600 data-[checked]:bg-sky-600 data-[disabled]:opacity-50 dark:border-zinc-600'
                ),
              ],
              config.isChecked ? [icon('m4.5 12.75 6 6 9-13.5', h, 'size-3')] : []
            ),
            h.label(
              [...attributes.label, h.Class('cursor-pointer text-sm select-none')],
              [config.label]
            ),
          ]
        ),
    },
    h
  )

/** A list of suggestions for a free-text field; pair it with `textField`'s `listId`. */
export const suggestions = <Message>(
  id: string,
  values: ReadonlyArray<string>,
  h: HtmlBuilder<Message>
): Html =>
  h.datalist(
    [h.Id(id)],
    Array.map(values, (value) => h.keyed('option')(value, [h.Value(value)]))
  )

const toneClass = (tone: Tone): string =>
  Match.value(tone).pipe(
    Match.when(
      'Neutral',
      () => 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'
    ),
    Match.when(
      'Success',
      () =>
        'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-zinc-950'
    ),
    Match.when(
      'Warning',
      () => 'border-amber-500 text-amber-700 dark:border-amber-500 dark:text-amber-300'
    ),
    Match.when('Danger', () => 'border-red-500 text-red-700 dark:border-red-500 dark:text-red-300'),
    Match.exhaustive
  )

export const chip = <Message>(label: string, tone: Tone, h: HtmlBuilder<Message>): Html =>
  h.span(
    [
      h.Class(
        `inline-flex h-6 max-w-full items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap ${toneClass(tone)}`
      ),
    ],
    [h.span([h.Class('truncate')], [label])]
  )

/** An inline message: `Danger` for something that failed, `Neutral` for a note. */
export const notice = <Message>(
  text: string,
  tone: 'Neutral' | 'Danger' | 'Warning',
  h: HtmlBuilder<Message>
): Html =>
  h.div(
    [
      h.Role(tone === 'Neutral' ? 'note' : 'alert'),
      h.Class(
        Match.value(tone).pipe(
          Match.when(
            'Neutral',
            () =>
              'rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300'
          ),
          Match.when(
            'Warning',
            () =>
              'rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
          ),
          Match.when(
            'Danger',
            () =>
              'rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
          ),
          Match.exhaustive
        )
      ),
    ],
    [text]
  )

/** A small uppercase heading over a group of controls. */
export const sectionLabel = <Message>(text: string, h: HtmlBuilder<Message>): Html =>
  h.h3(
    [h.Class('text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400')],
    [text]
  )

/** A value shown as preformatted, wrapped JSON. */
export const jsonBlock = <Message>(text: string, h: HtmlBuilder<Message>): Html =>
  h.pre(
    [
      h.Class(
        'max-h-96 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200'
      ),
    ],
    [text]
  )
