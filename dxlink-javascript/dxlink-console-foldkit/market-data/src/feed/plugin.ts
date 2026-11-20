import { Match, Option, Schema } from 'effect'
import { Submodel } from 'foldkit'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import {
  type ChannelStatus,
  type ChannelSummary,
  defineChannelPlugin,
} from '@dxfeed/dxlink-console-foldkit-core'

import { chartView } from './chartView'
import { events } from './events'
import { Message, RequestMessage } from './message'
import { type Model, Request, View, isModel } from './model'
import { requestView } from './requestView'
import { subscriptionsView } from './subscriptionsView'
import {
  clearErrors,
  close,
  init,
  initRequest,
  requestToConfig,
  update,
  updateRequest,
} from './update'

const ICON_FEED =
  'M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941'

const statusOf = (channelState: DXLinkChannelState): ChannelStatus =>
  Match.value(channelState).pipe(
    Match.withReturnType<ChannelStatus>(),
    Match.when(DXLinkChannelState.OPENED, () => ({
      label: 'opened',
      tone: 'Success',
    })),
    Match.when(DXLinkChannelState.CLOSED, () => ({
      label: 'closed',
      tone: 'Neutral',
    })),
    Match.orElse(() => ({ label: 'opening', tone: 'Warning' }))
  )

export const summarize = (model: Model): ChannelSummary => ({
  subtitle: View.match(model.view, {
    Subscriptions: () => 'Feed · subscriptions',
    Chart: () => 'Feed · candle chart',
  }),
  maybeStatus: Option.some(statusOf(model.channelState)),
  maybeChannelId: model.maybeProtocolChannelId,
  parameters: model.parameters,
  errors: model.errorLog.errors,
})

const channelView = Submodel.defineView<Model, Message>((model, h) =>
  View.match(model.view, {
    Subscriptions: ({ state }) => subscriptionsView(model, state, h),
    Chart: ({ state }) => chartView(model, state, h),
  })
)

/** The FEED service: subscribe to symbols and watch events arrive, or chart candles. */
export const feedChannelPlugin = defineChannelPlugin({
  kind: 'feed',
  label: 'Feed',
  iconPath: ICON_FEED,
  dialogTitle: 'New Feed channel',
  request: {
    init: initRequest,
    update: updateRequest,
    view: requestView,
    toConfig: requestToConfig,
    isModel: Schema.is(Request),
    isMessage: Schema.is(RequestMessage),
  },
  channel: {
    init,
    update,
    view: channelView,
    summarize,
    close,
    clearErrors,
    isModel,
    isMessage: Schema.is(Message),
  },
  events,
})
