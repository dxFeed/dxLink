import AddIcon from '@mui/icons-material/Add'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import { feedSubKey } from './feed-view-model'
import type { FeedSubKind, FeedSubscriptionInput, FeedViewModel } from './feed-view-model'
import { DocLink } from '../../shared/components/doc-link'
import { EVENT_TYPES, EVENT_TYPES_DOC_URL } from '../../shared/lib/event-types'
import {
  CANDLE_SYMBOLS_DOC_URL,
  EPOCH_MILLIS_DOC_URL,
  FEED_ORDER_SOURCES,
  ORDER_SOURCES_DOC_URL,
} from '../../shared/lib/order-sources'
import { useVM } from '../../shared/view-model'

// The channel always uses the default AUTO contract, which accepts all three
// subscription shapes.
const SUB_KINDS: { value: FeedSubKind; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'indexed', label: 'Indexed' },
  { value: 'timeSeries', label: 'Time series' },
]

/** Human label for a subscription chip. */
const subLabel = (s: FeedSubscriptionInput): string => {
  const base =
    s.kind === 'indexed' && s.source ? `${s.type}#${s.source}:${s.symbol}` : `${s.type}:${s.symbol}`
  return s.kind === 'timeSeries' ? `${base} · from ${s.fromTime ?? 0}` : base
}

/** Subscription form + active-subscription list (add / remove / clear), wired to the feed VM. */
export const SubscriptionManager = ({ vm }: { vm: FeedViewModel }) => {
  const subs = useVM(vm, (s) => s.subscriptions)

  const [kind, setKind] = useState<FeedSubKind>('regular')
  const [type, setType] = useState('Quote')
  const [symbol, setSymbol] = useState('')
  const [source, setSource] = useState('')
  const [fromTime, setFromTime] = useState('0')

  const showSource = kind === 'indexed'
  const showFromTime = kind === 'timeSeries'
  const extraCols = showSource || showFromTime ? 1 : 0

  const canAdd = type.trim() !== '' && symbol.trim() !== '' && (!showSource || source.trim() !== '')

  const addSubscription = () => {
    if (!canAdd) return
    vm.addSubscription({
      type: type.trim(),
      symbol: symbol.trim(),
      kind,
      source: showSource ? source.trim() : undefined,
      fromTime: showFromTime ? Number(fromTime) || 0 : undefined,
    })
  }

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Subscription
      </Typography>

      <Stack spacing={1.5}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={kind}
          onChange={(_e, next: FeedSubKind | null) => next !== null && setKind(next)}
        >
          {SUB_KINDS.map((k) => (
            <ToggleButton key={k.value} value={k.value}>
              {k.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            alignItems: 'start',
            gridTemplateColumns: { xs: '1fr', md: `repeat(${2 + extraCols}, 1fr) auto` },
          }}
        >
          {/* freeSolo: the list is a convenience, the server accepts any type it knows. */}
          <Autocomplete
            freeSolo
            options={EVENT_TYPES}
            value={type}
            onInputChange={(_event, next) => setType(next)}
            size="small"
            renderInput={(params) => (
              <TextField
                {...params}
                label="Event type"
                helperText={
                  <>
                    Event types on <DocLink href={EVENT_TYPES_DOC_URL}>kb.dxfeed.com</DocLink>
                  </>
                }
              />
            )}
          />
          <TextField
            label="Symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSubscription()}
            size="small"
            helperText={
              showFromTime ? (
                <>
                  <DocLink href={CANDLE_SYMBOLS_DOC_URL}>Candle symbol</DocLink>, e.g. AAPL{'{=d}'}
                </>
              ) : (
                'Market symbol, e.g. AAPL'
              )
            }
          />
          {showSource && (
            <Autocomplete
              freeSolo
              options={FEED_ORDER_SOURCES}
              value={source}
              onInputChange={(_event, next) => setSource(next)}
              size="small"
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Order source"
                  helperText={
                    <>
                      Order sources on <DocLink href={ORDER_SOURCES_DOC_URL}>kb.dxfeed.com</DocLink>
                    </>
                  }
                />
              )}
            />
          )}
          {showFromTime && (
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
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={addSubscription}
            disabled={!canAdd}
            sx={{ height: 40 }}
          >
            Add
          </Button>
        </Box>
      </Stack>

      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 2 }}
      >
        <Typography variant="caption" color="text.secondary">
          Active subscriptions ({subs.length})
        </Typography>
        <Button
          size="small"
          color="inherit"
          startIcon={<DeleteSweepIcon />}
          onClick={vm.clearSubscriptions}
          disabled={subs.length === 0}
        >
          Clear all
        </Button>
      </Stack>
      {subs.length > 0 ? (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
          {subs.map((s) => (
            <Chip
              key={feedSubKey(s)}
              label={subLabel(s)}
              onDelete={() => vm.removeSubscription(s)}
              size="small"
              variant="outlined"
              color={s.kind === 'regular' ? 'default' : 'primary'}
            />
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          No active subscriptions.
        </Typography>
      )}
    </Box>
  )
}
