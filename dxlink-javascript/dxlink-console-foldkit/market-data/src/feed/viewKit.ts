import { Array } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Kit } from '@dxfeed/dxlink-console-foldkit-core'

export const ICON_PLUS = 'M12 4.5v15m7.5-7.5h-15'
export const ICON_SWEEP =
  'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0'
export const ICON_PLAY =
  'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z'
export const ICON_PAUSE = 'M15.75 5.25v13.5m-7.5-13.5v13.5'
export const ICON_COPY =
  'M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75'
export const ICON_CANDLES =
  'M7.5 3v3m0 9v6m0-15a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 7.5 15m0-9A1.5 1.5 0 0 1 9 7.5v6A1.5 1.5 0 0 1 7.5 15m9-12v6m0 6v6m0-12a1.5 1.5 0 0 0-1.5 1.5v3a1.5 1.5 0 0 0 1.5 1.5m0-6a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5'

/** An exclusive choice among a few options, drawn as joined buttons. */
export const segmented = <Message, Value extends string>(
  config: Readonly<{
    label: string
    value: Value
    options: ReadonlyArray<Readonly<{ value: Value; label: string }>>
    onSelect: (value: Value) => Message
  }>,
  h: HtmlBuilder<Message>
): Html =>
  h.div(
    [
      h.Role('radiogroup'),
      h.AriaLabel(config.label),
      h.Class('inline-flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700'),
    ],
    Array.map(config.options, (option) =>
      h.keyed('button')(
        option.value,
        [
          h.Type('button'),
          h.Role('radio'),
          h.AriaChecked(option.value === config.value),
          h.OnClick(config.onSelect(option.value)),
          h.Class(
            option.value === config.value
              ? 'border-r border-zinc-300 bg-zinc-200 px-3 py-1.5 text-xs font-semibold last:border-r-0 dark:border-zinc-700 dark:bg-zinc-700'
              : 'border-r border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 last:border-r-0 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
          ),
        ],
        [option.label]
      )
    )
  )

/** An external documentation link, sized by the text around it. */
export const docLink = <Message>(href: string, text: string, h: HtmlBuilder<Message>): Html =>
  h.a(
    [
      h.Href(href),
      h.Target('_blank'),
      h.Rel('noreferrer'),
      h.Class('text-sky-600 hover:underline dark:text-sky-400'),
    ],
    [text]
  )

/** A field with a help line under it that can carry a link, which plain helper text cannot. */
export const withHelp = <Message>(
  field: Html,
  help: ReadonlyArray<Html | string>,
  h: HtmlBuilder<Message>
): Html =>
  h.div(
    [h.Class('flex min-w-0 flex-col gap-1')],
    [field, h.p([h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)], help)]
  )

/** A collapsible outlined section; open or closed is the element's own state. */
export const accordion = <Message>(
  title: string,
  body: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>
): Html =>
  h.details(
    [h.Class(`group rounded-lg border ${Kit.DIVIDER_CLASS}`)],
    [
      h.summary(
        [
          h.Class(
            'flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden'
          ),
        ],
        [
          title,
          Kit.icon(Kit.ICON_CHEVRON_DOWN, h, 'size-5 transition-transform group-open:rotate-180'),
        ]
      ),
      h.div([h.Class('px-4 pb-4')], body),
    ]
  )
