import { Array, Match, Option, String } from 'effect'
import { type Attribute, type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'
import { modifyFields } from 'foldkit/struct'

import { Button, Checkbox, Combobox, Disclosure, Input, Listbox, Textarea } from '@foldkit/ui'

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

/**
 * The surface of a panel that floats over the page: a Popover panel, or the option list of a
 * Listbox or Combobox.
 *
 * Such a panel is portaled out of the element it is rendered in — into the enclosing `<dialog>`
 * when there is one, otherwise into a child of `<body>` — so it inherits nothing from the
 * console's root. Everything it needs to read as part of the console is here: its own text
 * colour and size, and a `z-index` above the page's sticky chrome. Outside a dialog it takes
 * the dark palette only when the `dark` class is on `<body>` or `<html>`.
 */
export const FLOATING_PANEL_CLASS =
  'z-50 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 shadow-lg focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'

/**
 * The invisible layer under an open floating panel that turns a click anywhere else into
 * "close". It must be rendered inside a positioned wrapper that also holds the trigger, so
 * the trigger stays above it.
 */
export const FLOATING_BACKDROP_CLASS = 'fixed inset-0 z-0'

/** Below the trigger, left edges aligned, flipping above when there is no room below. */
const FLOATING_LIST_ANCHOR: Listbox.AnchorConfig = {
  placement: 'bottom-start',
  gap: 4,
  padding: 8,
}

const FLOATING_LIST_CLASS = `w-(--button-width) min-w-40 overflow-hidden ${FLOATING_PANEL_CLASS}`

const FLOATING_LIST_SCROLL_CLASS = 'max-h-60 overflow-y-auto py-1'

const FLOATING_OPTION_CLASS =
  'group flex cursor-pointer items-center gap-2 px-3 py-1.5 select-none data-[active]:bg-zinc-100 data-[selected]:font-semibold data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 dark:data-[active]:bg-zinc-800'

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
export const ICON_CHECK = 'm4.5 12.75 6 6 9-13.5'
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

/** One option of a floating list: a check mark that shows only on the selected one, and its label. */
const floatingOption = <Message>(label: string, h: HtmlBuilder<Message>): Html =>
  h.span(
    [h.Class('flex min-w-0 items-center gap-2')],
    [
      icon(
        ICON_CHECK,
        h,
        'invisible size-4 text-sky-600 group-data-[selected]:visible dark:text-sky-400'
      ),
      h.span([h.Class('truncate')], [label]),
    ]
  )

export type ListboxOption<Value extends string = string> = Readonly<{
  value: Value
  label: string
  isDisabled?: boolean
}>

/**
 * What `listboxField` hands to `toSubmodel`: the `viewInputs` of a single-select Listbox
 * created as `Listbox.create<ListboxOption<Value>, Value>()`.
 */
export type ListboxFieldViewInputs<Value extends string> = Listbox.BaseViewInputsCommon<
  ListboxOption<Value>
> &
  Readonly<{
    maybeSelectedValue: Option.Option<Value>
    itemToValue: (option: ListboxOption<Value>) => Value
  }>

/**
 * A labelled single-select drawn with Foldkit UI's Listbox: a button that reads like a text
 * field and opens a floating list of options anchored under it.
 *
 * The caller owns the Submodel, and this only lays it out. The caller's Model holds:
 *  - a `Listbox.Model`, built with `Listbox.init({ id })` where `id` is unique on the page
 *    (derive it from the channel id inside a channel card) and is the `id` passed here;
 *  - the selected value itself, in a field of its own, written when the Listbox's `Selected`
 *    OutMessage is folded. The Listbox keeps no selection.
 *
 * The caller also declares `Listbox.create<ListboxOption<Value>, Value>()` once at module
 * scope, wraps `Listbox.Message` in a `Got…Message`, folds it with `Update.foldChild`, and
 * in `toSubmodel` passes the given `viewInputs` to `h.submodel` unchanged.
 *
 * The list is portaled: into the enclosing `<dialog>` when there is one, otherwise to the
 * document body. It is therefore never clipped by a scrolling ancestor.
 */
export const listboxField = <Message, Value extends string>(
  config: Readonly<{
    /** The id the caller's `Listbox.Model` was initialised with. */
    id: string
    label: string
    options: ReadonlyArray<ListboxOption<Value>>
    maybeValue: Option.Option<Value>
    /** Shown on the button while nothing is selected. */
    placeholder?: string
    helperText?: string
    isDisabled?: boolean
    toSubmodel: (viewInputs: ListboxFieldViewInputs<Value>) => Html
  }>,
  h: HtmlBuilder<Message>
): Html => {
  const helperId = `${config.id}-description`
  const maybeSelectedLabel = Option.flatMap(config.maybeValue, (value) =>
    Option.map(
      Array.findFirst(config.options, (option) => option.value === value),
      (option) => option.label
    )
  )

  return fieldShell(
    h.label([h.For(Listbox.buttonId(config.id)), h.Class(LABEL_CLASS)], [config.label]),
    config.toSubmodel({
      items: config.options,
      maybeSelectedValue: config.maybeValue,
      itemToValue: (option) => option.value,
      itemToSearchText: (option) => option.label,
      isItemDisabled: (option) => option.isDisabled ?? false,
      itemToConfig: (option) => ({
        className: FLOATING_OPTION_CLASS,
        content: floatingOption(option.label, h),
      }),
      buttonContent: h.span(
        [h.Class('flex w-full items-center justify-between gap-2')],
        [
          Option.match(maybeSelectedLabel, {
            onNone: () =>
              h.span([h.Class(`truncate ${MUTED_TEXT_CLASS}`)], [config.placeholder ?? '']),
            onSome: (selectedLabel) => h.span([h.Class('truncate')], [selectedLabel]),
          }),
          icon(
            ICON_CHEVRON_DOWN,
            h,
            'size-4 text-zinc-500 transition-transform group-data-[open]:rotate-180'
          ),
        ]
      ),
      buttonClassName: `group cursor-pointer text-left ${FIELD_CLASS}`,
      ...(config.helperText === undefined
        ? {}
        : { buttonAttributes: childAttributes([h.AriaDescribedBy(helperId)]) }),
      itemsClassName: FLOATING_LIST_CLASS,
      itemsScrollClassName: FLOATING_LIST_SCROLL_CLASS,
      backdropClassName: FLOATING_BACKDROP_CLASS,
      className: 'relative',
      anchor: FLOATING_LIST_ANCHOR,
      isDisabled: config.isDisabled ?? false,
    }),
    Option.map(Option.fromNullishOr(config.helperText), (helperText) =>
      h.p([h.Id(helperId), h.Class(HELPER_CLASS)], [helperText])
    ),
    h
  )
}

/**
 * The items a free-text field offers for what is typed in it.
 *
 * What is typed always comes first, followed by the suggestions that contain it, ignoring
 * case. The first item is the one Enter commits, so committing never replaces the typed text
 * with a suggestion the user did not choose. While the field holds exactly one of the
 * suggestions, every other suggestion follows it, so reopening the list after a pick shows the
 * alternatives again. An empty field offers every suggestion, and text that no suggestion
 * contains offers nothing, so no list opens for it.
 */
export const filterSuggestions = (
  suggestions: ReadonlyArray<string>,
  text: string
): ReadonlyArray<string> => {
  const query = String.toLowerCase(text.trim())

  if (query === '') {
    return suggestions
  }
  const others = Array.filter(suggestions, (suggestion) => suggestion !== text)
  const offered = Array.contains(suggestions, text)
    ? others
    : Array.filter(others, (suggestion) => String.toLowerCase(suggestion).includes(query))

  return Array.match(offered, {
    onEmpty: () => [],
    onNonEmpty: (matches) => Array.prepend(matches, text),
  })
}

/** A Combobox Model whose input holds `text`, for seeding or resetting a `comboboxField`. */
export const withComboboxText = (combobox: Combobox.Model, text: string): Combobox.Model =>
  modifyFields(combobox, { inputValue: () => text })

/**
 * A labelled free-text input drawn with Foldkit UI's Combobox: typing filters a floating list
 * of suggestions anchored under the input, and picking one writes it into the input. The
 * field stays free text — a value that is not among the suggestions is kept as typed.
 *
 * The caller owns the Submodel, and this only lays it out. The caller's Model holds a
 * `Combobox.Model`, built with `Combobox.init({ id })` where `id` is unique on the page
 * (derive it from the channel id inside a channel card) and is the `id` passed here. That
 * Model is also where the text lives: read it as `combobox.inputValue` and pass it here as
 * `inputValue`; write it with `withComboboxText`. No second field for the text is needed.
 *
 * The caller also declares `Combobox.create<string>()` once at module scope, wraps
 * `Combobox.Message` in a `Got…Message`, folds it with `Update.foldChild` (both OutMessages
 * can be folded to no change, since the text is already in the Combobox's Model), and in
 * `toSubmodel` passes the given `viewInputs` to `h.submodel` unchanged.
 *
 * The list is portaled: into the enclosing `<dialog>` when there is one, otherwise to the
 * document body. It is therefore never clipped by a scrolling ancestor.
 */
export const comboboxField = <Message>(
  config: Readonly<{
    /** The id the caller's `Combobox.Model` was initialised with. */
    id: string
    label: string
    /** The caller's `Combobox.Model`'s `inputValue`. */
    inputValue: string
    /** Everything the field can suggest; this narrows it to what matches the text. */
    suggestions: ReadonlyArray<string>
    placeholder?: string
    /** A help line under the input. Html, so it can carry a link. */
    helper?: ReadonlyArray<Html | string>
    isDisabled?: boolean
    isInvalid?: boolean
    isMonospace?: boolean
    toSubmodel: (viewInputs: Combobox.ViewInputs<string>) => Html
  }>,
  h: HtmlBuilder<Message>
): Html => {
  const helperId = `${config.id}-description`
  const isDisabled = config.isDisabled ?? false

  return fieldShell(
    h.label([h.For(Combobox.inputId(config.id)), h.Class(LABEL_CLASS)], [config.label]),
    config.toSubmodel({
      items: filterSuggestions(config.suggestions, config.inputValue),
      maybeSelectedValue: Option.liftPredicate(config.inputValue, (text) =>
        Array.contains(config.suggestions, text)
      ),
      restingInputValue: config.inputValue,
      itemToValue: (suggestion) => suggestion,
      itemToDisplayText: (suggestion) => suggestion,
      itemToConfig: (suggestion) => ({
        className: FLOATING_OPTION_CLASS,
        content: floatingOption(suggestion, h),
      }),
      inputClassName:
        config.isMonospace === true ? `pr-9 font-mono ${FIELD_CLASS}` : `pr-9 ${FIELD_CLASS}`,
      inputAttributes: childAttributes([
        ...(isDisabled ? [h.Disabled(true)] : []),
        ...(config.helper === undefined ? [] : [h.AriaDescribedBy(helperId)]),
      ]),
      ...(config.placeholder === undefined ? {} : { inputPlaceholder: config.placeholder }),
      inputWrapperClassName: 'relative',
      ...(Array.isReadonlyArrayNonEmpty(config.suggestions)
        ? {
            buttonContent: icon(ICON_CHEVRON_DOWN, h),
            buttonClassName:
              'absolute inset-y-0 right-0 flex cursor-pointer items-center px-2.5 text-zinc-500 hover:text-zinc-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 dark:hover:text-zinc-100',
            buttonAttributes: childAttributes([h.AriaLabel(`${config.label} suggestions`)]),
          }
        : {}),
      itemsClassName: FLOATING_LIST_CLASS,
      itemsScrollClassName: FLOATING_LIST_SCROLL_CLASS,
      backdropClassName: FLOATING_BACKDROP_CLASS,
      className: 'relative',
      anchor: FLOATING_LIST_ANCHOR,
      isDisabled,
      isInvalid: config.isInvalid ?? false,
    }),
    Option.map(Option.fromNullishOr(config.helper), (helper) =>
      h.p([h.Id(helperId), h.Class(HELPER_CLASS)], helper)
    ),
    h
  )
}

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
              config.isChecked ? [icon(ICON_CHECK, h, 'size-3')] : []
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

/**
 * A titled section that can be collapsed. The caller's Model owns whether it is open; the
 * content stays in the page while collapsed, hidden and inert.
 */
export const accordion = <Message>(
  config: Readonly<{
    /** Unique on the page: it ties the heading button to the section it discloses. */
    id: string
    title: string
    isOpen: boolean
    onToggle: (isOpen: boolean) => Message
    content: Html
  }>,
  h: HtmlBuilder<Message>
): Html =>
  Disclosure.view(
    {
      id: config.id,
      isOpen: config.isOpen,
      onToggle: config.onToggle,
      toView: (attributes) =>
        h.div(
          [h.Class(`rounded-lg border ${DIVIDER_CLASS}`)],
          [
            h.button(
              [
                ...attributes.button,
                h.Class(
                  'flex w-full items-center justify-between gap-2 px-4 py-3 text-left font-semibold'
                ),
              ],
              [
                config.title,
                icon(
                  ICON_CHEVRON_DOWN,
                  h,
                  config.isOpen
                    ? 'size-5 rotate-180 transition-transform'
                    : 'size-5 transition-transform'
                ),
              ]
            ),
            attributes.animatePanel(
              h.div([...attributes.panel], [h.div([h.Class('px-4 pb-4')], [config.content])])
            ),
          ]
        ),
    },
    h
  )
