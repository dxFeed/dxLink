import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import {
  ChannelWidget,
  useChannelCard,
  useConnectionClient,
  useSession,
} from '@dxfeed/dxlink-console-core'
import { useAtomValue } from '@effect/atom-react'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import { useState } from 'react'

import { FeedChartChannel } from './feed-chart-channel'
import { ConfigurationSection } from './feed-configuration'
import { EventsTable } from './feed-events-table'
import { makeFeedModel } from './feed-model'
import { SubscriptionManager } from './feed-subscriptions'
import type { FeedConfig } from './types'

interface FeedChannelProps {
  title: string
  config: FeedConfig
}

const FeedStatusChip = ({ state }: { state: DXLinkChannelState }) => {
  if (state === DXLinkChannelState.OPENED) {
    return <Chip size="small" color="success" variant="outlined" label="opened" />
  }
  if (state === DXLinkChannelState.CLOSED) {
    return <Chip size="small" variant="outlined" label="closed" />
  }
  return <Chip size="small" color="warning" variant="outlined" label="opening" />
}

/** Live Feed subscriptions view — wraps a {@link FeedModel}. */
const FeedSubscriptionsChannel = ({ title, config }: FeedChannelProps) => {
  const client = useConnectionClient()
  // Pure construction (StrictMode double-invokes this): the feed channel opens with the
  // session below, not here.
  const [model] = useState(() =>
    makeFeedModel(client, {
      feed: config.feed || undefined,
      space: config.space || undefined,
    })
  )
  useSession(model.session)
  const channelState = useAtomValue(model.channel.state)
  const card = useChannelCard(model.channel)

  return (
    <ChannelWidget
      icon={<ShowChartIcon />}
      title={title}
      subtitle="Feed · subscriptions"
      status={<FeedStatusChip state={channelState} />}
      {...card}
    >
      <Stack spacing={2}>
        <ConfigurationSection model={model} />
        <Divider />
        <SubscriptionManager model={model} />
        <Divider />
        <EventsTable model={model} />
      </Stack>
    </ChannelWidget>
  )
}

/** Feed channel view. Both the subscriptions and candle-chart views are live. */
export const FeedChannel = ({ title, config }: FeedChannelProps) =>
  config.view === 'chart' ? (
    <FeedChartChannel title={title} config={config} />
  ) : (
    <FeedSubscriptionsChannel title={title} config={config} />
  )
