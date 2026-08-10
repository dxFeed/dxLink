import { FeedDataFormat } from '@dxfeed/dxlink-api'
import type { FeedAcceptConfig, FeedEventFields } from '@dxfeed/dxlink-api'
import AddIcon from '@mui/icons-material/Add'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import type { ReactNode } from 'react'

import type { FeedViewModel } from './feed-view-model'
import { EVENT_TYPES } from '../../shared/lib/event-types'
import { useVM } from '../../shared/view-model'

interface EventFieldRow {
  type: string
  fields: string
}

const INITIAL_FIELD_ROWS: EventFieldRow[] = [
  { type: 'Quote', fields: 'bidPrice, askPrice, bidSize, askSize' },
]

const parseFields = (fields: string): string[] =>
  fields
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)

/** Build acceptEventFields, re-prepending the mandatory eventType/eventSymbol. */
const buildAcceptEventFields = (rows: EventFieldRow[]): FeedEventFields | undefined => {
  const out: FeedEventFields = {}
  for (const row of rows) {
    const type = row.type.trim()
    if (type === '') continue
    out[type] = Array.from(new Set(['eventType', 'eventSymbol', ...parseFields(row.fields)]))
  }
  return Object.keys(out).length > 0 ? out : undefined
}

const EventFieldsEditor = ({
  rows,
  onChange,
}: {
  rows: EventFieldRow[]
  onChange: (rows: EventFieldRow[]) => void
}) => {
  const update = (index: number, patch: Partial<EventFieldRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const remove = (index: number) => onChange(rows.filter((_row, i) => i !== index))
  const add = () => onChange([...rows, { type: '', fields: '' }])

  return (
    <Stack spacing={1}>
      {rows.map((row, index) => (
        <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {/* Offers the known event types (as dxlink-docs did) without preventing
              a type that is not on the list. */}
          <Autocomplete
            freeSolo
            options={EVENT_TYPES}
            value={row.type}
            onInputChange={(_event, next) => update(index, { type: next })}
            size="small"
            sx={{ width: 180, flexShrink: 0 }}
            renderInput={(params) => <TextField {...params} label="Event type" />}
          />
          <TextField
            label="Fields (comma-separated)"
            value={row.fields}
            onChange={(e) => update(index, { fields: e.target.value })}
            size="small"
            fullWidth
          />
          <Tooltip title="Remove">
            <IconButton size="small" onClick={() => remove(index)}>
              <DeleteSweepIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ))}
      <Box>
        <Button size="small" color="inherit" startIcon={<AddIcon />} onClick={add}>
          Add event type
        </Button>
      </Box>
    </Stack>
  )
}

const DefRow = ({ label, value }: { label: string; value: ReactNode }) => (
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

/** Requested (FeedAcceptConfig) vs server-applied (FeedConfig) configuration, wired to the feed VM. */
export const ConfigurationSection = ({ vm }: { vm: FeedViewModel }) => {
  const applied = useVM(vm, (s) => s.config)

  const [aggPeriod, setAggPeriod] = useState('')
  const [dataFormat, setDataFormat] = useState<'' | FeedDataFormat>('')
  const [fieldRows, setFieldRows] = useState<EventFieldRow[]>(INITIAL_FIELD_ROWS)

  const apply = () => {
    const accept: FeedAcceptConfig = {
      acceptAggregationPeriod: aggPeriod.trim() === '' ? undefined : Number(aggPeriod),
      acceptDataFormat: dataFormat === '' ? undefined : dataFormat,
      acceptEventFields: buildAcceptEventFields(fieldRows),
    }
    vm.configure(accept)
  }

  const appliedTypes = Object.entries(applied.eventFields)

  return (
    <Accordion disableGutters variant="outlined" sx={{ '&::before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography sx={{ fontWeight: 600 }}>Configuration</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box
          sx={{
            display: 'grid',
            gap: 2.5,
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          }}
        >
          {/* Requested — FeedAcceptConfig */}
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
                label="Data format"
                select
                value={dataFormat}
                onChange={(e) => setDataFormat(e.target.value as '' | FeedDataFormat)}
                size="small"
                helperText="empty = server default"
              >
                <MenuItem value="">
                  <em>Server default</em>
                </MenuItem>
                <MenuItem value={FeedDataFormat.FULL}>FULL</MenuItem>
                <MenuItem value={FeedDataFormat.COMPACT}>COMPACT</MenuItem>
              </TextField>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Accept event fields
              </Typography>
              <Box sx={{ mt: 1 }}>
                <EventFieldsEditor rows={fieldRows} onChange={setFieldRows} />
              </Box>
            </Box>
            <Box>
              <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={apply}>
                Apply configuration
              </Button>
            </Box>
          </Stack>

          {/* Applied — FeedConfig reported by the server */}
          <Stack spacing={2}>
            <Typography variant="subtitle2">Applied by server</Typography>
            <Stack spacing={1.5}>
              <Stack spacing={0.75}>
                <DefRow
                  label="Aggregation period"
                  value={
                    Number.isNaN(applied.aggregationPeriod)
                      ? 'default (server-defined)'
                      : `${applied.aggregationPeriod} s`
                  }
                />
                <DefRow label="Data format" value={applied.dataFormat} />
              </Stack>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Event fields
                </Typography>
                {appliedTypes.length > 0 ? (
                  <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                    {appliedTypes.map(([eventType, fields]) => (
                      <Box key={eventType}>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {eventType}
                        </Typography>
                        <Stack
                          direction="row"
                          spacing={0.5}
                          useFlexGap
                          sx={{ flexWrap: 'wrap', mt: 0.5 }}
                        >
                          {fields.map((field) => (
                            <Chip key={field} size="small" label={field} variant="outlined" />
                          ))}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    None reported yet.
                  </Typography>
                )}
              </Box>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              What the server actually applied — may differ from the request.
            </Typography>
          </Stack>
        </Box>
      </AccordionDetails>
    </Accordion>
  )
}
