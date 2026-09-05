import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Fragment, useState } from 'react'

import { MAX_ERRORS } from '../lib/timestamped-error'
import type { TimestampedError } from '../lib/timestamped-error'

interface ErrorCenterProps {
  errors: readonly TimestampedError[]
  onClear?: () => void
  /** The scope these errors belong to, named in the popover heading. */
  scope?: string
  size?: 'small' | 'medium' | 'large'
}

/**
 * A button that opens a popover listing protocol errors, newest first.
 *
 * Used at both scopes: the connection panel passes the connection's errors, and each
 * channel widget passes its own. Renders nothing when there is nothing to report.
 */
export const ErrorCenter = ({ errors, onClear, scope, size = 'small' }: ErrorCenterProps) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const count = errors.length

  // Nothing to show when there are no errors — hide the button entirely.
  if (count === 0) {
    return null
  }

  return (
    <>
      {/* The count is the label rather than a `Badge`: a badge floats over the button's
          corner, where it collided with the status chip beside it in the channel header,
          and "1 error" reads as a sentence where a bare "1" needs the button to explain it. */}
      <Button
        color="error"
        variant="outlined"
        size={size}
        startIcon={<ErrorOutlineIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        {count} error{count === 1 ? '' : 's'}
      </Button>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 420, maxWidth: '90vw' } } }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1,
            gap: 2,
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {scope === undefined ? 'Errors' : `${scope} errors`}
          </Typography>
          <Button size="small" color="inherit" onClick={onClear}>
            Clear
          </Button>
        </Stack>
        <Divider />
        {/* Capped at MAX_ERRORS, which is still far more than fits on screen — a rejected
            batch subscription can produce hundreds at once, and without a bound here the
            popover grew taller than the viewport with no way to reach the Clear button. */}
        <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
          {errors.map((error, index) => (
            <Fragment key={error.id}>
              {index > 0 && <Divider />}
              <Stack direction="row" spacing={1.5} sx={{ px: 2, py: 1.25 }}>
                <ErrorOutlineIcon color="error" fontSize="small" sx={{ mt: '2px' }} />
                <Box sx={{ minWidth: 0 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}
                  >
                    {/* The protocol code, kept verbatim and monospaced — this is a debug
                        console, and the code is what a server-side issue is reported by. */}
                    <Typography
                      variant="caption"
                      sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'error.main' }}
                    >
                      {error.type}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {error.time}
                    </Typography>
                  </Stack>
                  {/* The message is the part worth reading, so it gets body type in the
                      normal colour rather than competing with the code for red. */}
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    {error.message}
                  </Typography>
                </Box>
              </Stack>
            </Fragment>
          ))}
        </Box>
        {count >= MAX_ERRORS && (
          <>
            <Divider />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 1.5 }}>
              Showing the most recent {MAX_ERRORS}; older errors were dropped.
            </Typography>
          </>
        )}
      </Popover>
    </>
  )
}
