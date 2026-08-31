import ShowChartIcon from '@mui/icons-material/ShowChart'

import { FeedChannel } from './feed-channel'
import { FeedChannelRequest } from './feed-channel-request'
import type { FeedConfig, FeedRequest } from './types'
import { defineChannelPlugin } from '../channels/plugin'

/** The FEED service: subscribe to symbols, watch events arrive. */
export const feedChannelPlugin = defineChannelPlugin<FeedConfig, FeedRequest>({
  kind: 'feed',
  label: 'Feed',
  icon: <ShowChartIcon />,
  dialogTitle: 'New Feed channel',
  createRequest: () => ({ view: 'subscriptions', feed: '', space: '' }),
  RequestForm: FeedChannelRequest,
  buildConfig: (request) => ({
    view: request.view,
    feed: request.feed.trim(),
    space: request.space.trim(),
  }),
  Channel: FeedChannel,
})
