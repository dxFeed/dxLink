import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Badge from '@mui/material/Badge'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import type { TimestampedError } from '../../shared/lib/timestamped-error'

interface ErrorCenterProps {
  errors: readonly TimestampedError[]
  onClear?: () => void
  /** Label on the trigger button — the scope these errors belong to. */
  label?: string
  size?: 'small' | 'medium' | 'large'
}

/**
 * A badge button that opens a popover listing protocol errors, newest first.
 *
 * Used at both scopes: the connection panel passes the connection's errors, and each
 * channel widget passes its own. Renders nothing when there is nothing to report.
 */
export const ErrorCenter = ({ errors, onClear, label = 'Errors', size }: ErrorCenterProps) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const count = errors.length

  // Nothing to show when there are no errors — hide the button entirely.
  if (count === 0) {
    return null
  }

  return (
    <>
      <Badge badgeContent={count} color="error">
        <Button
          color="error"
          variant="outlined"
          size={size}
          startIcon={<ErrorOutlineIcon />}
          onClick={(e) => setAnchor(e.currentTarget)}
        >
          {label}
        </Button>
      </Badge>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 380, maxWidth: '90vw' } } }}
      >
        <Stack spacing={1} sx={{ p: 1.5 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontWeight: 700 }}>Errors</Typography>
            <Button size="small" color="inherit" onClick={onClear}>
              Clear
            </Button>
          </Stack>
          {errors.map((error, index) => (
            <Alert key={index} severity="error" variant="outlined">
              <AlertTitle sx={{ mb: 0 }}>
                {error.type}
                <Typography
                  component="span"
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  {error.time}
                </Typography>
              </AlertTitle>
              {error.message}
            </Alert>
          ))}
        </Stack>
      </Popover>
    </>
  )
}
