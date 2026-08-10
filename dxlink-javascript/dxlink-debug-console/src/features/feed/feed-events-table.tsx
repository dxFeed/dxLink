import type { FeedEventData } from '@dxfeed/dxlink-api'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useState } from 'react'

import type { FeedEventsByType, FeedViewModel } from './feed-view-model'
import { useVM } from '../../shared/view-model'

// Columns shown first when present; the rest follow alphabetically. Used only when
// the server has not reported an event-field order yet.
const PRIORITY_FIELDS = ['eventSymbol', 'eventType']

export interface EventRow extends FeedEventData {
  id: string
}

const toRows = (bySymbol: Record<string, FeedEventData> | undefined): EventRow[] =>
  bySymbol ? Object.entries(bySymbol).map(([key, event]) => ({ ...event, id: key })) : []

/**
 * Column order for one event type.
 *
 * Prefers the field order the server negotiated for this event type (`FeedConfig.
 * eventFields`) — in a protocol debug console the order the protocol actually agreed
 * on is information, not noise, so it is not re-sorted. `eventSymbol` is hoisted to
 * the front to keep the row identity leftmost. Fields present on rows but absent from
 * the negotiated list are appended alphabetically, so nothing received is ever hidden.
 *
 * Falls back to the previous behaviour (priority fields, then alphabetical) before the
 * first config arrives, e.g. for the unknown-event bucket.
 */
export const buildColumns = (
  rows: EventRow[],
  negotiated: readonly string[] | undefined
): GridColDef[] => {
  const keys = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== 'id') keys.add(key)
    }
  }

  let ordered: string[]
  if (negotiated !== undefined && negotiated.length > 0) {
    const inOrder = [
      ...negotiated.filter((field) => field === 'eventSymbol'),
      ...negotiated.filter((field) => field !== 'eventSymbol'),
    ]
    const extra = [...keys].filter((key) => !inOrder.includes(key)).sort()
    ordered = [...inOrder, ...extra]
  } else {
    const rest = [...keys].filter((key) => !PRIORITY_FIELDS.includes(key)).sort()
    ordered = [...PRIORITY_FIELDS.filter((key) => keys.has(key)), ...rest]
  }

  return ordered.map((field) => ({ field, headerName: field, minWidth: 90, flex: 1 }))
}

/** Live received-events grid: one tab per event type, one row per symbol. */
export const EventsTable = ({ vm }: { vm: FeedViewModel }) => {
  const events = useVM(vm, (s) => s.events)
  const eventFields = useVM(vm, (s) => s.config.eventFields)
  const [activeType, setActiveType] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState<FeedEventsByType | null>(null)

  const display = paused && frozen !== null ? frozen : events
  const types = Object.keys(display)
  const active = activeType !== null && types.includes(activeType) ? activeType : (types[0] ?? null)

  const rows = active !== null ? toRows(display[active]) : []
  const columns = buildColumns(rows, active !== null ? eventFields[active] : undefined)

  const togglePause = () => {
    setFrozen(paused ? null : events)
    setPaused((value) => !value)
  }

  const copyJson = () => {
    const data = rows.map(({ id: _id, ...rest }) => rest)
    void navigator.clipboard?.writeText(JSON.stringify(data, null, 2))
  }

  if (types.length === 0) {
    return (
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Events
        </Typography>
        <Typography variant="body2" color="text.secondary">
          No events received yet. Add a subscription to start receiving data.
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Tabs
          value={active}
          onChange={(_e, value) => setActiveType(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minWidth: 0, flexGrow: 1 }}
        >
          {types.map((type) => (
            <Tab
              key={type}
              value={type}
              label={`${type} (${Object.keys(display[type] ?? {}).length})`}
            />
          ))}
        </Tabs>
        <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, ml: 1 }}>
          <Tooltip title={paused ? 'Resume' : 'Pause'}>
            <IconButton size="small" onClick={togglePause}>
              {paused ? <PlayArrowIcon /> : <PauseIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Clear">
            <IconButton size="small" onClick={vm.clearEvents}>
              <DeleteSweepIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Copy as JSON">
            <IconButton size="small" onClick={copyJson}>
              <ContentCopyIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      <Box sx={{ height: 280, mt: 1 }}>
        <DataGrid
          density="compact"
          hideFooter
          disableRowSelectionOnClick
          rows={rows}
          columns={columns}
        />
      </Box>
    </Box>
  )
}
