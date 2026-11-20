import { Array, Option, Record, pipe } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Kit } from '@dxfeed/dxlink-console-foldkit-core'

import {
  CANDLE_SYMBOLS_DOC_URL,
  EPOCH_MILLIS_DOC_URL,
  FEED_ORDER_SOURCES,
  ORDER_SOURCES_DOC_URL,
} from '../lib/orderSources'
import {
  type FeedSubscription,
  buildColumns,
  formatCell,
  subscriptionKey,
  subscriptionLabel,
} from './domain'
import { EVENT_TYPES, EVENT_TYPES_DOC_URL } from './eventTypes'
import { Message } from './message'
import type { ConfigurationForm, Model, SubscriptionsState } from './model'
import { activeEventType, displayedEvents, formToSubscription, rowsOf } from './update'
import {
  ICON_COPY,
  ICON_PAUSE,
  ICON_PLAY,
  ICON_PLUS,
  ICON_SWEEP,
  accordion,
  docLink,
  segmented,
  withHelp,
} from './viewKit'

/**
 * How many rows of one event type are drawn. The table is plain HTML with no virtualization,
 * so a broad subscription is cut off here; every row is still counted, kept and copied.
 */
export const MAX_RENDERED_ROWS = 500

const definitionRow = (label: string, value: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex items-baseline justify-between gap-2 text-xs')],
    [
      h.span([h.Class(Kit.MUTED_TEXT_CLASS)], [label]),
      h.span([h.Class('text-right font-semibold')], [value]),
    ]
  )

const eventFieldsEditor = (
  model: Model,
  configuration: ConfigurationForm,
  h: HtmlBuilder<Message>
): Html => {
  const typesListId = `feed-${model.channelId}-field-types`

  return h.div(
    [h.Class('flex flex-col gap-2')],
    [
      Kit.suggestions(typesListId, EVENT_TYPES, h),
      ...Array.map(configuration.rows, (row) =>
        h.keyed('div')(
          globalThis.String(row.id),
          [h.Class('flex items-end gap-2')],
          [
            h.div(
              [h.Class('w-44 shrink-0')],
              [
                Kit.textField(
                  {
                    id: `feed-${model.channelId}-row-${row.id}-type`,
                    label: 'Event type',
                    value: row.type,
                    listId: typesListId,
                    onInput: (value) => Message.UpdatedFieldRowType({ rowId: row.id, value }),
                  },
                  h
                ),
              ]
            ),
            h.div(
              [h.Class('min-w-0 grow')],
              [
                Kit.textField(
                  {
                    id: `feed-${model.channelId}-row-${row.id}-fields`,
                    label: 'Fields (comma-separated)',
                    value: row.fields,
                    onInput: (value) => Message.UpdatedFieldRowFields({ rowId: row.id, value }),
                  },
                  h
                ),
              ]
            ),
            Kit.iconButton(
              {
                label: 'Remove',
                iconPath: ICON_SWEEP,
                onClick: Message.ClickedRemoveFieldRow({ rowId: row.id }),
              },
              h
            ),
          ]
        )
      ),
      h.div(
        [],
        [
          Kit.button(
            {
              label: 'Add event type',
              iconPath: ICON_PLUS,
              variant: 'Ghost',
              size: 'Small',
              onClick: Message.ClickedAddFieldRow(),
            },
            h
          ),
        ]
      ),
    ]
  )
}

/** Requested configuration beside the one the server actually applied. */
const configurationSection = (
  model: Model,
  state: SubscriptionsState,
  h: HtmlBuilder<Message>
): Html => {
  const { configuration, applied } = state
  const appliedTypes = Record.toEntries(applied.eventFields)

  return accordion(
    'Configuration',
    [
      h.div(
        [h.Class('grid grid-cols-1 gap-5 md:grid-cols-2')],
        [
          h.div(
            [h.Class('flex flex-col gap-4')],
            [
              h.h4([h.Class('text-sm font-semibold')], ['Requested']),
              h.div(
                [h.Class('grid grid-cols-1 gap-4 sm:grid-cols-2')],
                [
                  Kit.textField(
                    {
                      id: `feed-${model.channelId}-aggregation-period`,
                      label: 'Aggregation period, s',
                      type: 'number',
                      value: configuration.aggregationPeriod,
                      onInput: (value) => Message.UpdatedAggregationPeriod({ value }),
                      helperText: '0 = none · empty = server default',
                    },
                    h
                  ),
                  Kit.selectField(
                    {
                      id: `feed-${model.channelId}-data-format`,
                      label: 'Data format',
                      value: configuration.dataFormat,
                      options: [
                        { value: '', label: 'Server default' },
                        { value: 'FULL', label: 'FULL' },
                        { value: 'COMPACT', label: 'COMPACT' },
                      ],
                      onChange: (value) => Message.SelectedDataFormat({ value }),
                      helperText: 'empty = server default',
                    },
                    h
                  ),
                ]
              ),
              h.div(
                [h.Class('flex flex-col gap-2')],
                [
                  h.span([h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)], ['Accept event fields']),
                  eventFieldsEditor(model, configuration, h),
                ]
              ),
              h.div(
                [],
                [
                  Kit.button(
                    {
                      label: 'Apply configuration',
                      iconPath: ICON_PLAY,
                      variant: 'Primary',
                      onClick: Message.ClickedApplyConfiguration(),
                    },
                    h
                  ),
                ]
              ),
            ]
          ),
          h.div(
            [h.Class('flex flex-col gap-4')],
            [
              h.h4([h.Class('text-sm font-semibold')], ['Applied by server']),
              h.div(
                [h.Class('flex flex-col gap-1.5')],
                [
                  definitionRow(
                    'Aggregation period',
                    Option.match(applied.maybeAggregationPeriod, {
                      onNone: () => 'default (server-defined)',
                      onSome: (period) => `${period} s`,
                    }),
                    h
                  ),
                  definitionRow('Data format', applied.dataFormat, h),
                ]
              ),
              h.div(
                [h.Class('flex flex-col gap-1.5')],
                [
                  h.span([h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)], ['Event fields']),
                  Array.match(appliedTypes, {
                    onEmpty: () =>
                      h.p([h.Class(`text-sm ${Kit.MUTED_TEXT_CLASS}`)], ['None reported yet.']),
                    onNonEmpty: (types) =>
                      h.div(
                        [h.Class('flex flex-col gap-1.5')],
                        Array.map(types, ([type, fields]) =>
                          h.keyed('div')(
                            type,
                            [],
                            [
                              h.span([h.Class('text-xs font-semibold')], [type]),
                              h.ul(
                                [h.Class('mt-1 flex flex-wrap gap-1')],
                                Array.map(fields, (field) =>
                                  h.keyed('li')(field, [], [Kit.chip(field, 'Neutral', h)])
                                )
                              ),
                            ]
                          )
                        )
                      ),
                  }),
                ]
              ),
              h.p(
                [h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)],
                ['What the server actually applied — may differ from the request.']
              ),
            ]
          ),
        ]
      ),
    ],
    h
  )
}

const subscriptionChip = (subscription: FeedSubscription, h: HtmlBuilder<Message>): Html =>
  h.span(
    [
      h.Class(
        subscription._tag === 'Regular'
          ? 'inline-flex h-6 items-center gap-1 rounded-full border border-zinc-300 pr-1 pl-2.5 text-xs font-medium dark:border-zinc-700'
          : 'inline-flex h-6 items-center gap-1 rounded-full border border-sky-500 pr-1 pl-2.5 text-xs font-medium text-sky-700 dark:text-sky-300'
      ),
    ],
    [
      subscriptionLabel(subscription),
      h.button(
        [
          h.Type('button'),
          h.AriaLabel(`Remove ${subscriptionLabel(subscription)}`),
          h.OnClick(
            Message.ClickedRemoveSubscription({
              key: subscriptionKey(subscription),
            })
          ),
          h.Class(
            'inline-flex size-4 items-center justify-center rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700'
          ),
        ],
        [Kit.icon(Kit.ICON_CLOSE, h, 'size-3')]
      ),
    ]
  )

/** Subscription form and the active subscriptions: add, remove, clear. */
const subscriptionSection = (
  model: Model,
  state: SubscriptionsState,
  h: HtmlBuilder<Message>
): Html => {
  const { form, subscriptions } = state
  const typesListId = `feed-${model.channelId}-types`
  const sourcesListId = `feed-${model.channelId}-sources`
  const hasExtraField = form.kind !== 'Regular'

  return h.div(
    [h.Class('flex flex-col gap-3')],
    [
      h.h4([h.Class('text-sm font-semibold')], ['Subscription']),
      h.div(
        [],
        [
          // NOTE: the channel uses the AUTO contract, which accepts all three shapes.
          segmented(
            {
              label: 'Subscription kind',
              value: form.kind,
              options: [
                { value: 'Regular', label: 'Regular' },
                { value: 'Indexed', label: 'Indexed' },
                { value: 'TimeSeries', label: 'Time series' },
              ],
              onSelect: (kind) => Message.SelectedSubscriptionKind({ kind }),
            },
            h
          ),
        ]
      ),
      Kit.suggestions(typesListId, EVENT_TYPES, h),
      Kit.suggestions(sourcesListId, FEED_ORDER_SOURCES, h),
      h.form(
        [
          h.OnSubmit(Message.SubmittedSubscription()),
          h.Class(
            hasExtraField
              ? 'grid grid-cols-1 items-start gap-3 md:grid-cols-[repeat(3,1fr)_auto]'
              : 'grid grid-cols-1 items-start gap-3 md:grid-cols-[repeat(2,1fr)_auto]'
          ),
        ],
        [
          withHelp(
            Kit.textField(
              {
                id: `feed-${model.channelId}-type`,
                label: 'Event type',
                value: form.type,
                listId: typesListId,
                onInput: (value) => Message.UpdatedSubscriptionType({ value }),
              },
              h
            ),
            ['Event types on ', docLink(EVENT_TYPES_DOC_URL, 'kb.dxfeed.com', h)],
            h
          ),
          withHelp(
            Kit.textField(
              {
                id: `feed-${model.channelId}-symbol`,
                label: 'Symbol',
                value: form.symbol,
                onInput: (value) => Message.UpdatedSubscriptionSymbol({ value }),
              },
              h
            ),
            form.kind === 'TimeSeries'
              ? [docLink(CANDLE_SYMBOLS_DOC_URL, 'Candle symbol', h), ', e.g. AAPL{=d}']
              : ['Market symbol, e.g. AAPL'],
            h
          ),
          form.kind === 'Indexed'
            ? withHelp(
                Kit.textField(
                  {
                    id: `feed-${model.channelId}-source`,
                    label: 'Order source',
                    value: form.source,
                    listId: sourcesListId,
                    onInput: (value) => Message.UpdatedSubscriptionSource({ value }),
                  },
                  h
                ),
                ['Order sources on ', docLink(ORDER_SOURCES_DOC_URL, 'kb.dxfeed.com', h)],
                h
              )
            : h.empty,
          form.kind === 'TimeSeries'
            ? withHelp(
                Kit.textField(
                  {
                    id: `feed-${model.channelId}-from-time`,
                    label: 'From time',
                    value: form.fromTime,
                    onInput: (value) => Message.UpdatedSubscriptionFromTime({ value }),
                  },
                  h
                ),
                [docLink(EPOCH_MILLIS_DOC_URL, 'Unix ms', h), ', or 0 for full history'],
                h
              )
            : h.empty,
          h.div(
            [h.Class('md:pt-5')],
            [
              Kit.button(
                {
                  label: 'Add',
                  type: 'submit',
                  iconPath: ICON_PLUS,
                  variant: 'Primary',
                  isDisabled: Option.isNone(formToSubscription(form)),
                },
                h
              ),
            ]
          ),
        ]
      ),
      h.div(
        [h.Class('mt-1 flex items-center justify-between gap-2')],
        [
          h.span(
            [h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)],
            [`Active subscriptions (${subscriptions.length})`]
          ),
          Kit.button(
            {
              label: 'Clear all',
              iconPath: ICON_SWEEP,
              variant: 'Ghost',
              size: 'Small',
              isDisabled: Array.isReadonlyArrayEmpty(subscriptions),
              onClick: Message.ClickedClearSubscriptions(),
            },
            h
          ),
        ]
      ),
      Array.match(subscriptions, {
        onEmpty: () =>
          h.p([h.Class(`text-sm ${Kit.MUTED_TEXT_CLASS}`)], ['No active subscriptions.']),
        onNonEmpty: (active: ReadonlyArray<FeedSubscription>) =>
          h.ul(
            [h.Class('flex flex-wrap gap-1')],
            Array.map(active, (subscription) =>
              h.keyed('li')(subscriptionKey(subscription), [], [subscriptionChip(subscription, h)])
            )
          ),
      }),
    ]
  )
}

/** Received events: one tab per event type, one row per symbol and source. */
export const eventsSection = (state: SubscriptionsState, h: HtmlBuilder<Message>): Html => {
  const events = displayedEvents(state)
  const isPaused = state.table._tag === 'Paused'

  const pauseButton = Kit.iconButton(
    {
      label: isPaused ? 'Resume' : 'Pause',
      iconPath: isPaused ? ICON_PLAY : ICON_PAUSE,
      onClick: Message.ClickedTogglePause(),
    },
    h
  )

  return Option.match(activeEventType(state), {
    onNone: () =>
      h.div(
        [h.Class('flex flex-col gap-1')],
        [
          h.h4([h.Class('text-sm font-semibold')], ['Events']),
          // NOTE: a paused table with nothing to show still offers Resume: events received
          // while it is paused stay out of sight, so without it the table could not leave
          // the pause.
          isPaused
            ? h.div(
                [h.Class('flex items-center justify-between gap-2')],
                [
                  h.p(
                    [h.Class(`text-sm ${Kit.MUTED_TEXT_CLASS}`)],
                    ['Paused. Events received meanwhile are shown when the table resumes.']
                  ),
                  pauseButton,
                ]
              )
            : h.p(
                [h.Class(`text-sm ${Kit.MUTED_TEXT_CLASS}`)],
                ['No events received yet. Add a subscription to start receiving data.']
              ),
        ]
      ),
    onSome: (active) => {
      const rows = rowsOf(events, active)
      const rendered = Array.take(rows, MAX_RENDERED_ROWS)
      const columns = buildColumns(
        Array.map(rows, (row) => row.event),
        Option.getOrElse(Record.get(state.applied.eventFields, active), () => [])
      )

      return h.div(
        [h.Class('flex flex-col gap-2')],
        [
          h.div(
            [h.Class('flex items-center justify-between gap-2')],
            [
              h.div(
                [
                  h.Role('tablist'),
                  h.AriaLabel('Event types'),
                  h.Class('flex min-w-0 grow gap-1 overflow-x-auto'),
                ],
                Array.map(Record.keys(events), (type) =>
                  h.keyed('button')(
                    type,
                    [
                      h.Type('button'),
                      h.Role('tab'),
                      h.AriaSelected(type === active),
                      h.OnClick(Message.SelectedEventType({ type })),
                      h.Class(
                        type === active
                          ? 'shrink-0 border-b-2 border-sky-600 px-3 py-2 text-sm font-semibold text-sky-700 dark:border-sky-400 dark:text-sky-300'
                          : 'shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                      ),
                    ],
                    [`${type} (${rowsOf(events, type).length})`]
                  )
                )
              ),
              h.div(
                [h.Class('flex shrink-0 gap-1')],
                [
                  pauseButton,
                  Kit.iconButton(
                    {
                      label: 'Clear',
                      iconPath: ICON_SWEEP,
                      onClick: Message.ClickedClearEvents(),
                    },
                    h
                  ),
                  Kit.iconButton(
                    {
                      label: 'Copy as JSON',
                      iconPath: ICON_COPY,
                      onClick: Message.ClickedCopyEvents(),
                    },
                    h
                  ),
                ]
              ),
            ]
          ),
          h.div(
            [
              h.Role('tabpanel'),
              h.Class(`h-72 overflow-auto rounded-md border ${Kit.DIVIDER_CLASS}`),
            ],
            [
              h.table(
                [h.Class('w-full border-collapse text-left text-xs')],
                [
                  h.thead(
                    [h.Class('sticky top-0 bg-zinc-100 dark:bg-zinc-800')],
                    [
                      h.tr(
                        [],
                        Array.map(columns, (column) =>
                          h.keyed('th')(
                            column,
                            [
                              h.Scope('col'),
                              h.Class('px-2 py-1.5 font-semibold whitespace-nowrap'),
                            ],
                            [column]
                          )
                        )
                      ),
                    ]
                  ),
                  h.tbody(
                    [],
                    Array.map(rendered, ({ key, event }) =>
                      h.keyed('tr')(
                        key,
                        [
                          h.Class(
                            `border-t ${Kit.DIVIDER_CLASS} hover:bg-zinc-50 dark:hover:bg-zinc-800/50`
                          ),
                        ],
                        Array.map(columns, (column) =>
                          h.keyed('td')(
                            column,
                            [h.Class('px-2 py-1 font-mono whitespace-nowrap')],
                            [formatCell(event[column])]
                          )
                        )
                      )
                    )
                  ),
                ]
              ),
            ]
          ),
          rows.length > MAX_RENDERED_ROWS
            ? h.p(
                [h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)],
                [
                  `Showing the first ${MAX_RENDERED_ROWS} of ${rows.length} rows; Copy as JSON includes all of them.`,
                ]
              )
            : h.empty,
        ]
      )
    },
  })
}

export const subscriptionsView = (
  model: Model,
  state: SubscriptionsState,
  h: HtmlBuilder<Message>
): Html =>
  h.div(
    [h.Class('flex flex-col gap-4')],
    pipe(
      [
        configurationSection(model, state, h),
        subscriptionSection(model, state, h),
        eventsSection(state, h),
      ],
      Array.intersperse(h.hr([h.Class(Kit.DIVIDER_CLASS)]))
    )
  )
