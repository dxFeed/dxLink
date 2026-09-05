import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import { useVM } from '@dxfeed/dxlink-console-core'
import { ChannelWidget } from '@dxfeed/dxlink-console-core'
import { useConnectionVM } from '@dxfeed/dxlink-console-core'
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState } from 'react'

import { CandleChart } from './candle-chart'
import type { CandleChartHandle } from './candle-chart'
import { FeedCandlesViewModel } from './feed-candles-view-model'
import type { FeedConfig } from './types'
import { DocLink } from '../components/doc-link'
import { CANDLE_SYMBOLS_DOC_URL, EPOCH_MILLIS_DOC_URL } from '../lib/order-sources'

interface FeedChartChannelProps {
  title: string
  config: FeedConfig
}

const StatusChip = ({ state }: { state: DXLinkChannelState }) => {
  if (state === DXLinkChannelState.OPENED) {
    return <Chip size="small" color="success" variant="outlined" label="opened" />
  }
  if (state === DXLinkChannelState.CLOSED) {
    return <Chip size="small" variant="outlined" label="closed" />
  }
  return <Chip size="small" color="warning" variant="outlined" label="opening" />
}

/** Live Feed candle-chart view — wraps {@link FeedCandlesViewModel} + {@link CandleChart}. */
export const FeedChartChannel = ({ title, config }: FeedChartChannelProps) => {
  const connectionVM = useConnectionVM()
  const [vm] = useState(() => {
    const client = connectionVM.getClient()
    if (client === null) {
      throw new Error('Feed chart channel opened without an active connection')
    }
    return new FeedCandlesViewModel(client, {
      feed: config.feed || undefined,
      space: config.space || undefined,
    })
  })

  const chartRef = useRef<CandleChartHandle>(null)
  const [symbol, setSymbol] = useState('AAPL{=d}')
  const [fromTime, setFromTime] = useState('0')
  const [chartError, setChartError] = useState<string | null>(null)

  useEffect(() => {
    vm.start()
    vm.setChartListener((candles, dataType) => {
      // This runs synchronously inside the WebSocket frame dispatch, which does not guard
      // its listeners. An escaping throw would abort processing of that frame for every
      // other channel, and React's error boundary cannot see it — this is not a render
      // error. Contain it here and report it as a chart error.
      try {
        chartRef.current?.push(candles, dataType)
      } catch (error) {
        setChartError(error instanceof Error ? error.message : String(error))
      }
    })
    return () => {
      vm.setChartListener(null)
      vm.stop()
    }
  }, [vm])

  const channelState = useVM(vm, (s) => s.channelState)
  const subscription = useVM(vm, (s) => s.subscription)
  const candleCount = useVM(vm, (s) => s.candleCount)
  const channelId = useVM(vm, (s) => s.channelId)
  const channelParameters = useVM(vm, (s) => s.channelParameters)
  const errors = useVM(vm, (s) => s.errors)

  const subscribe = () => {
    setChartError(null)
    chartRef.current?.reset()
    vm.setSubscription(symbol.trim(), Number(fromTime) || 0)
  }

  return (
    <ChannelWidget
      icon={<ShowChartIcon />}
      title={title}
      subtitle="Feed · candle chart"
      onClose={vm.close}
      status={<StatusChip state={channelState} />}
      channelId={channelId}
      parameters={channelParameters}
      errors={errors}
      onClearErrors={vm.clearErrors}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Candle subscription
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              alignItems: 'start',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr) auto' },
            }}
          >
            <TextField
              label="Candle symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && subscribe()}
              size="small"
              helperText={
                <>
                  <DocLink href={CANDLE_SYMBOLS_DOC_URL}>Candle symbol</DocLink>, e.g. AAPL
                  {'{=d}'}
                </>
              }
            />
            <TextField
              label="From time"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value.replace(/[^0-9]/g, ''))}
              size="small"
              helperText={
                <>
                  <DocLink href={EPOCH_MILLIS_DOC_URL}>Unix ms</DocLink>, or 0 for full history
                </>
              }
            />
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={subscribe}
              disabled={symbol.trim() === ''}
              sx={{ height: 40 }}
            >
              Subscribe
            </Button>
          </Box>
        </Box>

        {chartError !== null && (
          <Alert severity="error" variant="outlined">
            {chartError}
          </Alert>
        )}

        <Box>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}
          >
            <Typography variant="caption" color="text.secondary">
              {subscription
                ? `${subscription.symbol} · ${candleCount} candle${candleCount === 1 ? '' : 's'}`
                : 'Set a subscription to load candles.'}
            </Typography>
          </Stack>
          <Box sx={{ position: 'relative' }}>
            <CandleChart ref={chartRef} />
            {candleCount === 0 && (
              <Stack
                spacing={1}
                sx={{
                  position: 'absolute',
                  inset: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'text.secondary',
                  bgcolor: 'background.paper',
                  border: '1px dashed',
                  borderColor: 'divider',
                  borderRadius: 2,
                }}
              >
                <CandlestickChartIcon fontSize="large" />
                <Typography variant="body2">
                  {subscription === null ? 'Subscribe to load candles.' : 'Loading candles…'}
                </Typography>
              </Stack>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Chart powered by DXCharts.
          </Typography>
        </Box>
      </Stack>
    </ChannelWidget>
  )
}
