import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Kit } from '@dxfeed/dxlink-console-foldkit-core'

import { CANDLE_SYMBOLS_DOC_URL, EPOCH_MILLIS_DOC_URL } from '../lib/orderSources'
import { MountChart } from './command'
import { Message } from './message'
import type { ChartState, Model } from './model'
import { ICON_CANDLES, ICON_PLAY, docLink, withHelp } from './viewKit'

/** Candle subscription form over a chart that draws whatever the subscription delivers. */
export const chartView = (model: Model, state: ChartState, h: HtmlBuilder<Message>): Html => {
  const candleCount = Option.match(state.maybeActive, {
    onNone: () => 0,
    onSome: (active) => active.candleCount,
  })

  return h.div(
    [h.Class('flex flex-col gap-4')],
    [
      h.div(
        [h.Class('flex flex-col gap-3')],
        [
          h.h4([h.Class('text-sm font-semibold')], ['Candle subscription']),
          h.form(
            [
              h.OnSubmit(Message.SubmittedCandleSubscription()),
              h.Class('grid grid-cols-1 items-start gap-3 md:grid-cols-[repeat(2,1fr)_auto]'),
            ],
            [
              withHelp(
                Kit.textField(
                  {
                    id: `feed-${model.channelId}-candle-symbol`,
                    label: 'Candle symbol',
                    value: state.symbol,
                    onInput: (value) => Message.UpdatedCandleSymbol({ value }),
                  },
                  h
                ),
                [docLink(CANDLE_SYMBOLS_DOC_URL, 'Candle symbol', h), ', e.g. AAPL{=d}'],
                h
              ),
              withHelp(
                Kit.textField(
                  {
                    id: `feed-${model.channelId}-candle-from-time`,
                    label: 'From time',
                    value: state.fromTime,
                    onInput: (value) => Message.UpdatedCandleFromTime({ value }),
                  },
                  h
                ),
                [docLink(EPOCH_MILLIS_DOC_URL, 'Unix ms', h), ', or 0 for full history'],
                h
              ),
              h.div(
                [h.Class('md:pt-5')],
                [
                  Kit.button(
                    {
                      label: 'Subscribe',
                      type: 'submit',
                      iconPath: ICON_PLAY,
                      variant: 'Primary',
                      isDisabled: state.symbol.trim() === '',
                    },
                    h
                  ),
                ]
              ),
            ]
          ),
        ]
      ),
      Option.match(state.maybeChartError, {
        onNone: () => h.empty,
        onSome: (reason) => Kit.notice(reason, 'Danger', h),
      }),
      h.div(
        [h.Class('flex flex-col gap-2')],
        [
          h.p(
            [h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)],
            [
              Option.match(state.maybeActive, {
                onNone: () => 'Set a subscription to load candles.',
                onSome: ({ subscription }) =>
                  `${subscription.symbol} · ${candleCount} candle${candleCount === 1 ? '' : 's'}`,
              }),
            ]
          ),
          h.div(
            [h.Class('relative')],
            [
              h.div([
                h.Class('h-[360px] w-full'),
                h.OnMount(MountChart({ channelId: model.channelId })),
              ]),
              candleCount === 0
                ? h.div(
                    [
                      h.Class(
                        `absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-white dark:bg-zinc-900 ${Kit.DIVIDER_CLASS} ${Kit.MUTED_TEXT_CLASS}`
                      ),
                    ],
                    [
                      Kit.icon(ICON_CANDLES, h, 'size-8'),
                      h.p(
                        [h.Class('text-sm')],
                        [
                          Option.isNone(state.maybeActive)
                            ? 'Subscribe to load candles.'
                            : 'Loading candles…',
                        ]
                      ),
                    ]
                  )
                : h.empty,
            ]
          ),
          h.p([h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)], ['Chart powered by DXCharts.']),
        ]
      ),
    ]
  )
}
