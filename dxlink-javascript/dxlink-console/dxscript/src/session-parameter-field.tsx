import type { DXLinkIndiChartIndicatorParameterMeta } from '@dxfeed/dxlink-api'
import EditCalendarIcon from '@mui/icons-material/EditCalendar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import {
  DEFAULT_SESSION_PARTS,
  SESSION_DAYS,
  formatSession,
  normalizeSessionTime,
  parseSession,
} from './session'
import type { SessionParts } from './session'

type SessionMode = 'interval' | 'raw'

// The individual parameter-meta variants are not part of the public API surface, so the
// SESSION one is narrowed out of the exported union rather than imported directly.
type SessionParameterMeta = Extract<DXLinkIndiChartIndicatorParameterMeta, { type: 'SESSION' }>

interface SessionParameterFieldProps {
  meta: SessionParameterMeta
  value: string
  onChange: (value: string) => void
}

/**
 * Editor for a dxScript SESSION parameter.
 *
 * The wire format (`0930-1600:12345`) is awkward to type, so the value is edited in a
 * dialog: an interval mode with time pickers and weekday toggles, and a raw mode for
 * anything the interval form cannot express. When the parameter constrains `options`,
 * only those presets are offered and the modes are unavailable.
 *
 * Ported from the legacy dxlink-docs `debug-console/parameter-field.tsx`; the rebuild
 * had degraded this to a plain text field.
 */
export const SessionParameterField = ({ meta, value, onChange }: SessionParameterFieldProps) => {
  const presets = meta.options ?? []
  const hasPresets = presets.length > 0

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [mode, setMode] = useState<SessionMode>(() => (parseSession(value) ? 'interval' : 'raw'))

  const draftParts = parseSession(draft)
  // Interval mode always needs a window to show; fall back to a sensible default when
  // the current value is raw. Switching into interval mode writes this back into `draft`
  // (see `showInterval`) so the pickers can never display one window while Apply sends
  // another.
  const parts = draftParts ?? DEFAULT_SESSION_PARTS

  const timeZone = meta.timeZone ?? 'UTC'

  /**
   * Times are normalized before formatting. A cleared `<input type="time">` reports `''`,
   * which would otherwise format to a malformed `-1600` that parses back to nothing — the
   * pickers would snap to the default while Apply sent the broken string.
   */
  const updateParts = (next: SessionParts) =>
    setDraft(
      formatSession({
        start: normalizeSessionTime(next.start),
        end: normalizeSessionTime(next.end),
        days: next.days,
      })
    )

  /** Entering interval mode commits the window the pickers are about to show. */
  const showInterval = () => {
    if (draftParts === undefined) {
      setDraft(formatSession(DEFAULT_SESSION_PARTS))
    }
    setMode('interval')
  }

  const openDialog = () => {
    // A constrained parameter whose value is off-list starts from the first preset.
    setDraft(hasPresets && !presets.includes(value) ? (presets[0] ?? value) : value)
    setMode(parseSession(value) ? 'interval' : 'raw')
    setOpen(true)
  }

  const apply = () => {
    onChange(draft)
    setOpen(false)
  }

  return (
    <>
      {/*
        A real button, not a readOnly input with onClick: the input variant could only be
        opened with a mouse, since Enter/Space on a text input synthesises no click. This
        keeps the field reachable and operable from the keyboard.
      */}
      <FormControl size="small" fullWidth>
        <Button
          variant="outlined"
          color="inherit"
          onClick={openDialog}
          endIcon={<EditCalendarIcon fontSize="small" />}
          aria-label={`${meta.name} — configure session`}
          sx={{
            justifyContent: 'space-between',
            textTransform: 'none',
            fontWeight: 400,
            minHeight: 40,
            borderColor: 'divider',
            color: value === '' ? 'text.secondary' : 'text.primary',
          }}
        >
          <Box
            component="span"
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {value === '' ? 'Configure session' : value}
          </Box>
        </Button>
        <FormHelperText sx={{ mx: 1.75 }}>{`SESSION · ${timeZone}`}</FormHelperText>
      </FormControl>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{meta.name}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {hasPresets ? (
              <TextField
                select
                label="Preset"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                size="small"
                fullWidth
                helperText="This parameter accepts only these values."
              >
                {presets.map((preset) => (
                  <MenuItem key={preset} value={preset}>
                    {preset}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={mode}
                  onChange={(_event, next: SessionMode | null) => {
                    if (next === 'interval') {
                      showInterval()
                    } else if (next === 'raw') {
                      setMode('raw')
                    }
                  }}
                >
                  <ToggleButton value="interval">Interval</ToggleButton>
                  <ToggleButton value="raw">Raw</ToggleButton>
                </ToggleButtonGroup>

                {mode === 'raw' ? (
                  <TextField
                    label="Session"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="e.g. 0930-1600:12345"
                    size="small"
                    fullWidth
                    helperText="Written straight to the protocol, unparsed."
                  />
                ) : (
                  <>
                    <Stack direction="row" spacing={2}>
                      <TextField
                        label="Start"
                        type="time"
                        value={parts.start}
                        onChange={(e) => updateParts({ ...parts, start: e.target.value })}
                        size="small"
                        fullWidth
                      />
                      <TextField
                        label="End"
                        type="time"
                        value={parts.end}
                        onChange={(e) => updateParts({ ...parts, end: e.target.value })}
                        size="small"
                        fullWidth
                      />
                    </Stack>

                    <div>
                      <Typography variant="caption" color="text.secondary">
                        Days
                      </Typography>
                      <ToggleButtonGroup
                        size="small"
                        value={parts.days}
                        onChange={(_event, days: string[]) => updateParts({ ...parts, days })}
                        sx={{ display: 'flex', mt: 0.5 }}
                      >
                        {SESSION_DAYS.map((day) => (
                          <ToggleButton
                            key={day.value}
                            value={day.value}
                            aria-label={day.label}
                            sx={{ flex: 1, px: 0 }}
                          >
                            {day.label}
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 0.5, display: 'block' }}
                      >
                        All days selected means no restriction.
                      </Typography>
                    </div>
                  </>
                )}
              </>
            )}

            <TextField
              label="Time zone"
              value={timeZone}
              size="small"
              fullWidth
              disabled
              helperText="Defined by the indicator, not editable."
            />

            <TextField
              label="Result"
              value={draft}
              size="small"
              fullWidth
              disabled
              helperText="Sent to the server on apply."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={apply}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
