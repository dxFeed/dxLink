import { Option, Schema } from 'effect'
import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import {
  type ChannelStatus,
  type ChannelSummary,
  Kit,
  defineChannelPlugin,
} from '@dxfeed/dxlink-console-foldkit-core'

import { chartView } from './chartView'
import { events } from './events'
import { Message, RequestMessage } from './message'
import { Lifecycle, type Model, type OpenedChannel, Request, View, isModel } from './model'
import { requestView } from './requestView'
import { eventsSection, subscriptionsView } from './subscriptionsView'
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

const statusOf = (lifecycle: Lifecycle): ChannelStatus =>
  Lifecycle.match<ChannelStatus>(lifecycle, {
    Opening: () => ({ label: 'opening', tone: 'Warning' }),
    Opened: ({ link }) =>
      link === 'Ready'
        ? { label: 'opened', tone: 'Success' }
        : { label: 'opening', tone: 'Warning' },
    FailedToOpen: () => ({ label: 'failed', tone: 'Danger' }),
    Closed: () => ({ label: 'closed', tone: 'Neutral' }),
  })

/** The protocol identity of the channel, which it has once opened and keeps when closed. */
const maybeOpenedChannel = (lifecycle: Lifecycle): Option.Option<OpenedChannel> =>
  Lifecycle.match<Option.Option<OpenedChannel>>(lifecycle, {
    Opening: () => Option.none(),
    Opened: ({ channel }) => Option.some(channel),
    FailedToOpen: () => Option.none(),
    Closed: ({ maybeChannel }) => maybeChannel,
  })

export const summarize = (model: Model): ChannelSummary => {
  const maybeChannel = maybeOpenedChannel(model.lifecycle)

  return {
    subtitle: View.match(model.view, {
      Subscriptions: () => 'Feed · subscriptions',
      Chart: () => 'Feed · candle chart',
    }),
    maybeStatus: Option.some(statusOf(model.lifecycle)),
    maybeChannelId: Option.map(maybeChannel, (channel) => channel.protocolChannelId),
    parameters: Option.match(maybeChannel, {
      onNone: () => ({}),
      onSome: (channel) => channel.parameters,
    }),
    errors: model.errorLog.errors,
  }
}

const openingView = (h: HtmlBuilder<Message>): Html =>
  Kit.notice('Opening the channel…', 'Neutral', h)

const failedToOpenView = (h: HtmlBuilder<Message>): Html =>
  Kit.notice(
    'The channel could not be opened. The reason is in the errors of this channel.',
    'Danger',
    h
  )

const openedView = (model: Model, h: HtmlBuilder<Message>): Html =>
  View.match(model.view, {
    Subscriptions: ({ state }) => subscriptionsView(model, state, h),
    Chart: ({ state }) => chartView(model, state, h),
  })

/** What a closed channel leaves to read: the events it received, and no form to act on. */
const closedView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex flex-col gap-4')],
    [
      Kit.notice('The channel is closed and accepts no further input.', 'Neutral', h),
      View.match(model.view, {
        Subscriptions: ({ state }) => eventsSection(state, h),
        Chart: () => h.empty,
      }),
    ]
  )

/** The body of a FEED card. The forms that act on the channel exist only while it is opened. */
export const channelView = Submodel.defineView<Model, Message>((model, h) =>
  Lifecycle.match(model.lifecycle, {
    Opening: () => openingView(h),
    Opened: () => openedView(model, h),
    FailedToOpen: () => failedToOpenView(h),
    Closed: () => closedView(model, h),
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
