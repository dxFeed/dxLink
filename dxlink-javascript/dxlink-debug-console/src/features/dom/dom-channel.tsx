import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import type { DepthOfMarketOrder } from '@dxfeed/dxlink-api'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'

import { DomViewModel } from './dom-view-model'
import type { DomSnapshot } from './dom-view-model'
import { useVM } from '../../shared/view-model'
import { ChannelWidget } from '../channels/channel-widget'
import type { DomConfig } from '../channels/types'
import { useConnectionVM } from '../connection/connection-context'

interface DomChannelProps {
  title: string
  config: DomConfig
}

const parseSources = (raw: string): string[] =>
  raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)

const DomStatusChip = ({ state }: { state: DXLinkChannelState }) => {
  if (state === DXLinkChannelState.OPENED) {
    return <Chip size="small" color="success" variant="outlined" label="streaming" />
  }
  if (state === DXLinkChannelState.CLOSED) {
    return <Chip size="small" variant="outlined" label="closed" />
  }
  return <Chip size="small" color="warning" variant="outlined" label="opening" />
}

const num = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'

/** Combined bid/ask ladder: best levels at the top, bids left / asks right. */
const Ladder = ({ snapshot }: { snapshot: DomSnapshot }) => {
  const bids = [...snapshot.bids].sort((a, b) => b.price - a.price)
  const asks = [...snapshot.asks].sort((a, b) => a.price - b.price)
  const rows = Math.max(bids.length, asks.length)

  if (rows === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Empty book.
      </Typography>
    )
  }

  const cell = (order: DepthOfMarketOrder | undefined, side: 'bid' | 'ask') => {
    const color = side === 'bid' ? 'success.main' : 'error.main'
    return order ? (
      <>
        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {num(order.size)}
        </TableCell>
        <TableCell
          align="right"
          sx={{ color, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
        >
          {num(order.price)}
        </TableCell>
      </>
    ) : (
      <>
        <TableCell />
        <TableCell />
      </>
    )
  }

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell align="right">Bid size</TableCell>
          <TableCell align="right" sx={{ color: 'success.main', fontWeight: 700 }}>
            Bid
          </TableCell>
          <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>
            Ask
          </TableCell>
          <TableCell align="right">Ask size</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {Array.from({ length: rows }, (_unused, i) => (
          <TableRow key={i}>
            {cell(bids[i], 'bid')}
            {cell(asks[i], 'ask')}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

const ConfigurationSection = ({ vm }: { vm: DomViewModel }) => {
  const applied = useVM(vm, (s) => s.config)
  const [aggPeriod, setAggPeriod] = useState('')
  const [depthLimit, setDepthLimit] = useState('')

  const apply = () =>
    vm.configure({
      acceptAggregationPeriod: aggPeriod.trim() === '' ? undefined : Number(aggPeriod),
      acceptDepthLimit: depthLimit.trim() === '' ? undefined : Number(depthLimit),
    })

  return (
    <Accordion disableGutters variant="outlined" sx={{ '&::before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography sx={{ fontWeight: 600 }}>Configuration</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <Stack spacing={2}>
            <Typography variant="subtitle2">Requested</Typography>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
              }}
            >
              <TextField
                label="Aggregation period, s"
                value={aggPeriod}
                onChange={(e) => setAggPeriod(e.target.value)}
                type="number"
                size="small"
                helperText="0 = none · empty = server default"
              />
              <TextField
                label="Depth limit"
                value={depthLimit}
                onChange={(e) => setDepthLimit(e.target.value)}
                type="number"
                size="small"
                helperText="0 = no limit · empty = server default"
              />
            </Box>
            <TextField
              label="Accept order fields"
              value="Not available"
              size="small"
              disabled
              fullWidth
            />
            <Box>
              <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={apply}>
                Apply configuration
              </Button>
            </Box>
          </Stack>

          <Stack spacing={1.5}>
            <Typography variant="subtitle2">Applied by server</Typography>
            <Stack spacing={0.75}>
              <DefRow
                label="Aggregation period"
                value={
                  applied && !Number.isNaN(applied.aggregationPeriod)
                    ? `${applied.aggregationPeriod} s`
                    : 'default (server-defined)'
                }
              />
              <DefRow label="Depth limit" value={applied ? String(applied.depthLimit) : '—'} />
              <DefRow label="Data format" value={applied ? applied.dataFormat : '—'} />
            </Stack>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Order fields
              </Typography>
              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                {(applied?.orderFields ?? []).map((field) => (
                  <Chip key={field} size="small" label={field} variant="outlined" />
                ))}
              </Stack>
            </Box>
          </Stack>
        </Box>
      </AccordionDetails>
    </Accordion>
  )
}

const DefRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <Stack
    direction="row"
    spacing={1}
    sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}
  >
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="caption" sx={{ fontWeight: 600, textAlign: 'right' }}>
      {value}
    </Typography>
  </Stack>
)

/** Live Depth-of-Market channel — wraps a real {@link DomViewModel}. */
export const DomChannel = ({ title, config }: DomChannelProps) => {
  const connectionVM = useConnectionVM()
  const [vm] = useState(() => {
    const client = connectionVM.getClient()
    if (client === null) {
      throw new Error('DOM channel opened without an active connection')
    }
    return new DomViewModel(client, {
      symbol: config.symbol,
      sources: parseSources(config.source),
      feed: config.feed || undefined,
      space: config.space || undefined,
    })
  })
  useEffect(() => {
    vm.start()
    return () => vm.stop()
  }, [vm])

  const channelState = useVM(vm, (s) => s.channelState)
  const snapshot = useVM(vm, (s) => s.snapshot)
  const channelId = useVM(vm, (s) => s.channelId)
  const channelParameters = useVM(vm, (s) => s.channelParameters)
  const errors = useVM(vm, (s) => s.errors)

  return (
    <ChannelWidget
      icon={<ViewColumnIcon />}
      title={title}
      subtitle={`DOM · ${config.symbol || '—'}`}
      onClose={vm.close}
      status={<DomStatusChip state={channelState} />}
      channelId={channelId}
      parameters={channelParameters}
      errors={errors}
      onClearErrors={vm.clearErrors}
    >
      <Stack spacing={2}>
        <ConfigurationSection vm={vm} />

        <Box>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}
          >
            <Typography variant="subtitle2">Order book</Typography>
            {snapshot && (
              <Typography variant="caption" color="text.secondary">
                Last update {new Date(snapshot.time).toLocaleTimeString()}
              </Typography>
            )}
          </Stack>
          {snapshot ? (
            <Ladder snapshot={snapshot} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              Waiting for the first snapshot…
            </Typography>
          )}
        </Box>
      </Stack>
    </ChannelWidget>
  )
}
