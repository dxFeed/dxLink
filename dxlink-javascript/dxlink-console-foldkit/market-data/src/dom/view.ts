import { Array, Option } from 'effect'
import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Kit, formatLocalTime } from '@dxfeed/dxlink-console-foldkit-core'

import { Lifecycle, type Model, type Opened } from './channel'
import type { AppliedConfig, DomSnapshot } from './handles'
import { type LadderLevel, formatNumber, toAskLevels, toBidLevels } from './ladder'
import { Message } from './message'

const HEAD_CELL_CLASS = `border-b px-3 py-2 text-right text-xs font-medium ${Kit.DIVIDER_CLASS}`

const BODY_CELL_CLASS = `border-b px-3 py-1.5 text-right tabular-nums ${Kit.DIVIDER_CLASS}`

const BID_CLASS = 'font-semibold text-emerald-600 dark:text-emerald-400'

const ASK_CLASS = 'font-semibold text-red-600 dark:text-red-400'

const sizeCell = (level: LadderLevel, h: HtmlBuilder<Message>): Html =>
  h.td(
    [h.Class(BODY_CELL_CLASS)],
    [Option.match(level.maybeSize, { onNone: () => '—', onSome: formatNumber })]
  )

const priceCell = (level: LadderLevel, sideClass: string, h: HtmlBuilder<Message>): Html =>
  h.td([h.Class(`${BODY_CELL_CLASS} ${sideClass}`)], [formatNumber(level.price)])

/** One side of the book as the ladder lays it out. */
type LadderSide = Readonly<{
  caption: string
  priceHeader: string
  sizeHeader: string
  priceClass: string
  /** Where the price column stands: `Last` on the bid side and `First` on the ask side. */
  pricePosition: 'First' | 'Last'
  levels: ReadonlyArray<LadderLevel>
}>

/**
 * One side of the book as a table of its own, a row per price level and best level first.
 *
 * A row is keyed by its level, so a level keeps its row while its size changes and while
 * other levels enter or leave the book.
 */
const sideTable = (side: LadderSide, h: HtmlBuilder<Message>): Html => {
  const priceHead = h.th(
    [h.Scope('col'), h.Class(`${HEAD_CELL_CLASS} font-bold ${side.priceClass}`)],
    [side.priceHeader]
  )
  const sizeHead = h.th([h.Scope('col'), h.Class(HEAD_CELL_CLASS)], [side.sizeHeader])

  return h.table(
    [h.Class('w-full table-fixed border-collapse self-start text-sm')],
    [
      h.caption([h.Class('sr-only')], [side.caption]),
      h.thead(
        [],
        [h.tr([], side.pricePosition === 'First' ? [priceHead, sizeHead] : [sizeHead, priceHead])]
      ),
      h.tbody(
        [],
        Array.map(side.levels, (level) => {
          const price = priceCell(level, side.priceClass, h)
          const size = sizeCell(level, h)

          return h.keyed('tr')(
            level.key,
            [],
            side.pricePosition === 'First' ? [price, size] : [size, price]
          )
        })
      ),
    ]
  )
}

/**
 * The ladder: the bids and the asks as two tables side by side, each with its best level on
 * top. It is mirrored around the spread — sizes outside, prices meeting in the middle — so the
 * columns read `Bid size | Bid | Ask | Ask size`, and equal row heights put the bid and the
 * ask of the same rank on one line.
 */
const ladder = (snapshot: DomSnapshot, h: HtmlBuilder<Message>): Html =>
  Array.isReadonlyArrayEmpty(snapshot.bids) && Array.isReadonlyArrayEmpty(snapshot.asks)
    ? h.p([h.Class(`text-sm ${Kit.MUTED_TEXT_CLASS}`)], ['Empty book.'])
    : h.div(
        [h.Class('overflow-x-auto')],
        [
          h.div(
            [h.Class('grid min-w-80 grid-cols-2')],
            [
              sideTable(
                {
                  caption: 'Bids',
                  priceHeader: 'Bid',
                  sizeHeader: 'Bid size',
                  priceClass: BID_CLASS,
                  pricePosition: 'Last',
                  levels: toBidLevels(snapshot.bids),
                },
                h
              ),
              sideTable(
                {
                  caption: 'Asks',
                  priceHeader: 'Ask',
                  sizeHeader: 'Ask size',
                  priceClass: ASK_CLASS,
                  pricePosition: 'First',
                  levels: toAskLevels(snapshot.asks),
                },
                h
              ),
            ]
          ),
        ]
      )

const definitionRow = (label: string, value: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex items-baseline justify-between gap-2 text-xs')],
    [
      h.dt([h.Class(Kit.MUTED_TEXT_CLASS)], [label]),
      h.dd([h.Class('text-right font-semibold')], [value]),
    ]
  )

const appliedConfiguration = (applied: AppliedConfig, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex flex-col gap-3')],
    [
      h.h4([h.Class('text-sm font-semibold')], ['Applied by server']),
      h.dl(
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
          definitionRow(
            'Depth limit',
            Option.match(applied.maybeDepthLimit, { onNone: () => '—', onSome: globalThis.String }),
            h
          ),
          definitionRow('Data format', applied.dataFormat, h),
        ]
      ),
      h.div(
        [],
        [
          h.span([h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)], ['Order fields']),
          h.ul(
            [h.Class('mt-1 flex flex-wrap gap-1')],
            Array.map(applied.orderFields, (field) =>
              h.keyed('li')(field, [], [Kit.chip(field, 'Neutral', h)])
            )
          ),
        ]
      ),
    ]
  )

const configuration = (channelId: string, opened: Opened, h: HtmlBuilder<Message>): Html => {
  const fieldId = (name: string): string => `dxlink-dom-${channelId}-${name}`

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
                      value: opened.acceptForm.aggregationPeriod,
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
                      value: opened.acceptForm.depthLimit,
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
                  value: opened.acceptForm.orderFields,
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
          appliedConfiguration(opened.applied, h),
        ]
      ),
    ]
  )
}

const orderBook = (maybeSnapshot: Option.Option<DomSnapshot>, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.div(
        [h.Class('mb-2 flex items-baseline justify-between gap-2')],
        [
          h.h4([h.Class('text-sm font-semibold')], ['Order book']),
          Option.match(maybeSnapshot, {
            onNone: () => h.empty,
            onSome: (snapshot) =>
              h.span(
                [h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)],
                [`Last update ${formatLocalTime(snapshot.time)}`]
              ),
          }),
        ]
      ),
      Option.match(maybeSnapshot, {
        onNone: () =>
          h.p([h.Class(`text-sm ${Kit.MUTED_TEXT_CLASS}`)], ['Waiting for the first snapshot…']),
        onSome: (snapshot) => ladder(snapshot, h),
      }),
    ]
  )

const openedView = (channelId: string, opened: Opened, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex flex-col gap-4')],
    [configuration(channelId, opened, h), orderBook(opened.maybeSnapshot, h)]
  )

/**
 * The body of a DOM channel's card. The configuration form and the order book exist only
 * for an opened channel; every other state of the channel is a line saying which it is.
 */
export const view = Submodel.defineView<Model, Message>((model, h) =>
  Lifecycle.match(model.lifecycle, {
    Opening: () => Kit.notice('Opening the channel…', 'Neutral', h),
    Opened: (opened) => openedView(model.channelId, opened, h),
    FailedToOpen: () =>
      Kit.notice('The channel could not be opened. See the errors of this channel.', 'Danger', h),
    Closed: () => Kit.notice('The channel is closed.', 'Neutral', h),
  })
)
