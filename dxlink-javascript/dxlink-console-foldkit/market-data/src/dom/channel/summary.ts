import { Match, Option } from 'effect'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import type { ChannelStatus, ChannelSummary } from '@dxfeed/dxlink-console-foldkit-core'

import { Lifecycle, type Model } from './model'

const OPENING_STATUS: ChannelStatus = { label: 'opening', tone: 'Warning' }

const CLOSED_STATUS: ChannelStatus = { label: 'closed', tone: 'Neutral' }

const openedStatus = (channelState: DXLinkChannelState): ChannelStatus =>
  Match.value(channelState).pipe(
    Match.withReturnType<ChannelStatus>(),
    Match.when(DXLinkChannelState.OPENED, () => ({
      label: 'streaming',
      tone: 'Success',
    })),
    Match.when(DXLinkChannelState.CLOSED, () => CLOSED_STATUS),
    Match.when(DXLinkChannelState.REQUESTED, () => OPENING_STATUS),
    Match.exhaustive
  )

type LifecycleSummary = Pick<ChannelSummary, 'maybeStatus' | 'maybeChannelId' | 'parameters'>

/** The facts of the card header, for every state of the channel. */
export const summarize = (model: Model): ChannelSummary => ({
  subtitle: `DOM · ${model.config.symbol === '' ? '—' : model.config.symbol}`,
  ...Lifecycle.match<LifecycleSummary>(model.lifecycle, {
    Opening: () => ({
      maybeStatus: Option.some(OPENING_STATUS),
      maybeChannelId: Option.none(),
      parameters: {},
    }),
    Opened: ({ channelState, protocolChannelId, parameters }) => ({
      maybeStatus: Option.some(openedStatus(channelState)),
      maybeChannelId: Option.some(protocolChannelId),
      parameters,
    }),
    FailedToOpen: () => ({
      maybeStatus: Option.some({ label: 'failed', tone: 'Danger' }),
      maybeChannelId: Option.none(),
      parameters: {},
    }),
    Closed: ({ maybeProtocolChannelId }) => ({
      maybeStatus: Option.some(CLOSED_STATUS),
      maybeChannelId: maybeProtocolChannelId,
      parameters: {},
    }),
  }),
  errors: model.errorLog.errors,
})
