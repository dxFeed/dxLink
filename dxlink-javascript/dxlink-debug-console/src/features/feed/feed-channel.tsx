import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import { useEffect, useState } from 'react'

import { FeedChartChannel } from './feed-chart-channel'
import { ConfigurationSection } from './feed-configuration'
import { EventsTable } from './feed-events-table'
import { SubscriptionManager } from './feed-subscriptions'
import { FeedViewModel } from './feed-view-model'
import type { FeedConfig } from './types'
import { useVM } from '../../shared/view-model'
import { ChannelWidget } from '../channels/channel-widget'
import { useConnectionVM } from '../connection/connection-context'

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

/** Live Feed subscriptions view — wraps a real {@link FeedViewModel}. */
const FeedSubscriptionsChannel = ({ title, config }: FeedChannelProps) => {
  const connectionVM = useConnectionVM()
  // Pure construction (StrictMode double-invokes this) — the feed channel is
  // opened in start()/closed in stop() via the effect below, not here.
  const [vm] = useState(() => {
    const client = connectionVM.getClient()
    if (client === null) {
      throw new Error('Feed channel opened without an active connection')
    }
    return new FeedViewModel(client, {
      feed: config.feed || undefined,
      space: config.space || undefined,
    })
  })
  useEffect(() => {
    vm.start()
    return () => vm.stop()
  }, [vm])
  const channelState = useVM(vm, (s) => s.channelState)
  const channelId = useVM(vm, (s) => s.channelId)
  const channelParameters = useVM(vm, (s) => s.channelParameters)
  const errors = useVM(vm, (s) => s.errors)

  return (
    <ChannelWidget
      icon={<ShowChartIcon />}
      title={title}
      subtitle="Feed · subscriptions"
      onClose={vm.close}
      status={<FeedStatusChip state={channelState} />}
      channelId={channelId}
      parameters={channelParameters}
      errors={errors}
      onClearErrors={vm.clearErrors}
    >
      <Stack spacing={2}>
        <ConfigurationSection vm={vm} />
        <Divider />
        <SubscriptionManager vm={vm} />
        <Divider />
        <EventsTable vm={vm} />
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
