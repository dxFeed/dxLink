import { Array, Option } from 'effect'
import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Kit, formatLocalTime } from '@dxfeed/dxlink-console-foldkit-core'

import type { Model } from './channel'
import type { AppliedConfig, DomSnapshot } from './handles'
import { type LadderOrder, formatNumber, toLadderRows } from './ladder'
import { Message } from './message'

const HEAD_CELL_CLASS = `border-b px-3 py-2 text-right text-xs font-medium ${Kit.DIVIDER_CLASS}`

const BODY_CELL_CLASS = `border-b px-3 py-1.5 text-right tabular-nums ${Kit.DIVIDER_CLASS}`

const BID_CLASS = 'font-semibold text-emerald-600 dark:text-emerald-400'

const ASK_CLASS = 'font-semibold text-red-600 dark:text-red-400'

const sizeCell = (maybeOrder: Option.Option<LadderOrder>, h: HtmlBuilder<Message>): Html =>
  h.td(
    [h.Class(BODY_CELL_CLASS)],
    [
      Option.match(maybeOrder, {
        onNone: () => '',
        onSome: (order) =>
          Option.match(order.maybeSize, { onNone: () => '—', onSome: formatNumber }),
      }),
    ]
  )

const priceCell = (
  maybeOrder: Option.Option<LadderOrder>,
  sideClass: string,
  h: HtmlBuilder<Message>
): Html =>
  h.td(
    [h.Class(`${BODY_CELL_CLASS} ${sideClass}`)],
    [
      Option.match(maybeOrder, {
        onNone: () => '',
        onSome: (order) => formatNumber(order.price),
      }),
    ]
  )

/**
 * The combined ladder. It is mirrored around the spread — sizes outside, prices meeting in
 * the middle — so the columns read `Bid size | Bid | Ask | Ask size`.
 */
const ladder = (snapshot: DomSnapshot, h: HtmlBuilder<Message>): Html =>
  Array.match(toLadderRows(snapshot.bids, snapshot.asks), {
    onEmpty: () => h.p([h.Class(`text-sm ${Kit.MUTED_TEXT_CLASS}`)], ['Empty book.']),
    onNonEmpty: (rows) =>
      h.div(
        [h.Class('overflow-x-auto')],
        [
          h.table(
            [h.Class('w-full border-collapse text-sm')],
            [
              h.thead(
                [],
                [
                  h.tr(
                    [],
                    [
                      h.th([h.Scope('col'), h.Class(HEAD_CELL_CLASS)], ['Bid size']),
                      h.th(
                        [
                          h.Scope('col'),
                          h.Class(
                            `${HEAD_CELL_CLASS} font-bold text-emerald-600 dark:text-emerald-400`
                          ),
                        ],
                        ['Bid']
                      ),
                      h.th(
                        [
                          h.Scope('col'),
                          h.Class(`${HEAD_CELL_CLASS} font-bold text-red-600 dark:text-red-400`),
                        ],
                        ['Ask']
                      ),
                      h.th([h.Scope('col'), h.Class(HEAD_CELL_CLASS)], ['Ask size']),
                    ]
                  ),
                ]
              ),
              h.tbody(
                [],
                Array.map(rows, (row) =>
                  h.keyed('tr')(
                    `level-${row.level}`,
                    [],
                    [
                      sizeCell(row.maybeBid, h),
                      priceCell(row.maybeBid, BID_CLASS, h),
                      priceCell(row.maybeAsk, ASK_CLASS, h),
                      sizeCell(row.maybeAsk, h),
                    ]
                  )
                )
              ),
            ]
          ),
        ]
      ),
  })

const definitionRow = (label: string, value: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex items-baseline justify-between gap-2 text-xs')],
    [
      h.dt([h.Class(Kit.MUTED_TEXT_CLASS)], [label]),
      h.dd([h.Class('text-right font-semibold')], [value]),
    ]
  )

const appliedConfiguration = (
  maybeApplied: Option.Option<AppliedConfig>,
  h: HtmlBuilder<Message>
): Html =>
  h.div(
    [h.Class('flex flex-col gap-3')],
    [
      h.h4([h.Class('text-sm font-semibold')], ['Applied by server']),
      h.dl(
        [h.Class('flex flex-col gap-1.5')],
        [
          definitionRow(
            'Aggregation period',
            Option.match(
              Option.flatMap(maybeApplied, (applied) => applied.maybeAggregationPeriod),
              {
                onNone: () => 'default (server-defined)',
                onSome: (period) => `${period} s`,
              }
            ),
            h
          ),
          definitionRow(
            'Depth limit',
            Option.match(
              Option.flatMap(maybeApplied, (applied) => applied.maybeDepthLimit),
              { onNone: () => '—', onSome: globalThis.String }
            ),
            h
          ),
          definitionRow(
            'Data format',
            Option.match(maybeApplied, {
              onNone: () => '—',
              onSome: (applied) => applied.dataFormat,
            }),
            h
          ),
        ]
      ),
      h.div(
        [],
        [
          h.span([h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)], ['Order fields']),
          h.ul(
            [h.Class('mt-1 flex flex-wrap gap-1')],
            Array.map(
              Option.match(maybeApplied, {
                onNone: () => [],
                onSome: (applied) => applied.orderFields,
              }),
              (field) => h.keyed('li')(field, [], [Kit.chip(field, 'Neutral', h)])
            )
          ),
        ]
      ),
    ]
  )

const configuration = (model: Model, h: HtmlBuilder<Message>): Html => {
  const fieldId = (name: string): string => `dxlink-dom-${model.channelId}-${name}`

  return h.details(
    [h.Class(`rounded-lg border ${Kit.DIVIDER_CLASS}`)],
    [
      h.summary([h.Class('cursor-pointer px-4 py-3 font-semibold select-none')], ['Configuration']),
      h.div(
        [h.Class('grid grid-cols-1 gap-5 px-4 pb-4 md:grid-cols-2')],
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
                      id: fieldId('aggregation-period'),
                      label: 'Aggregation period, s',
                      type: 'number',
                      value: model.acceptForm.aggregationPeriod,
                      onInput: (value) => Message.UpdatedAcceptAggregationPeriod({ value }),
                      helperText: '0 = none · empty = server default',
                    },
                    h
                  ),
                  Kit.textField(
                    {
                      id: fieldId('depth-limit'),
                      label: 'Depth limit',
                      type: 'number',
                      value: model.acceptForm.depthLimit,
                      onInput: (value) => Message.UpdatedAcceptDepthLimit({ value }),
                      helperText: '0 = no limit · empty = server default',
                    },
                    h
                  ),
                ]
              ),
              Kit.textField(
                {
                  id: fieldId('order-fields'),
                  label: 'Accept order fields (comma-separated)',
                  value: model.acceptForm.orderFields,
                  onInput: (value) => Message.UpdatedAcceptOrderFields({ value }),
                  helperText:
                    'Empty = server default. The server may return fewer fields, or different ones — compare with Order fields under “Applied by server”.',
                },
                h
              ),
              h.div(
                [],
                [
                  Kit.button(
                    {
                      label: 'Apply configuration',
                      variant: 'Primary',
                      onClick: Message.ClickedApplyConfiguration(),
                    },
                    h
                  ),
                ]
              ),
            ]
          ),
          appliedConfiguration(model.maybeApplied, h),
        ]
      ),
    ]
  )
}

/** The body of a DOM channel's card: the configuration, then the order book. */
export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('flex flex-col gap-4')],
    [
      configuration(model, h),
      h.div(
        [],
        [
          h.div(
            [h.Class('mb-2 flex items-baseline justify-between gap-2')],
            [
              h.h4([h.Class('text-sm font-semibold')], ['Order book']),
              Option.match(model.maybeSnapshot, {
                onNone: () => h.empty,
                onSome: (snapshot) =>
                  h.span(
                    [h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)],
                    [`Last update ${formatLocalTime(snapshot.time)}`]
                  ),
              }),
            ]
          ),
          Option.match(model.maybeSnapshot, {
            onNone: () =>
              h.p(
                [h.Class(`text-sm ${Kit.MUTED_TEXT_CLASS}`)],
                ['Waiting for the first snapshot…']
              ),
            onSome: (snapshot) => ladder(snapshot, h),
          }),
        ]
      ),
    ]
  )
)
