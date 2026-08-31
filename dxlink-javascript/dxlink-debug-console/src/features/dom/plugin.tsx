import ViewColumnIcon from '@mui/icons-material/ViewColumn'

import { DomChannel } from './dom-channel'
import { DomChannelRequest } from './dom-channel-request'
import type { DomConfig, DomRequest } from './types'
import { defineChannelPlugin } from '../channels/plugin'

/** The DOM service: a price-level ladder for one symbol. */
export const domChannelPlugin = defineChannelPlugin<DomConfig, DomRequest>({
  kind: 'dom',
  label: 'DOM',
  icon: <ViewColumnIcon />,
  dialogTitle: 'New DOM channel',
  createRequest: () => ({
    symbol: 'AAPL',
    // AGGREGATE is the price-level source that works without picking a venue.
    source: 'AGGREGATE',
    feed: '',
    space: '',
  }),
  RequestForm: DomChannelRequest,
  canOpen: (request) => request.symbol.trim().length > 0,
  buildConfig: (request) => ({
    symbol: request.symbol.trim(),
    source: request.source.trim(),
    feed: request.feed.trim(),
    space: request.space.trim(),
  }),
  Channel: DomChannel,
})
