import InsightsIcon from '@mui/icons-material/Insights'

import { IndiChartChannel } from './indichart-channel'
import { IndiChartChannelRequest } from './indichart-channel-request'
import { createIndicatorEntry } from './types'
import type { IndiChartConfig, IndiChartRequest } from './types'
import { defineChannelPlugin } from '../channels/plugin'

/** The INDICHART service: run dxScript indicators against a chart. */
export const indiChartChannelPlugin = defineChannelPlugin<IndiChartConfig, IndiChartRequest>({
  kind: 'indichart',
  label: 'IndiChart',
  icon: <InsightsIcon />,
  dialogTitle: 'New IndiChart channel',
  createRequest: () => ({ indicators: [createIndicatorEntry()] }),
  RequestForm: IndiChartChannelRequest,
  canOpen: (request) => request.indicators.some((entry) => entry.code.trim() !== ''),
  buildConfig: (request) => ({
    indicators: request.indicators.map((entry) => entry.code).filter((code) => code.trim() !== ''),
  }),
  Channel: IndiChartChannel,
})
