import { Option } from 'effect'

import type { ChannelStatus, ChannelSummary } from '@dxfeed/dxlink-console-foldkit-core'

import { Lifecycle, type Model, type OpenedChannel, View } from './model'

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

/** The facts of a FEED card's header. */
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
