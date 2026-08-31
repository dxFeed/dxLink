import { DXLinkAuthState } from '@dxfeed/dxlink-api'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import { useConnectionVM } from '../connection/connection-context'
import { useVM } from '../view-model'

/**
 * Authorization panel — the live auth view. Shown when the server reports
 * UNAUTHORIZED (or while AUTHORIZING). Submits the token to the connection VM;
 * on success the page swaps this panel for the channels area.
 */
export const AuthPanel = () => {
  const vm = useConnectionVM()
  const auth = useVM(vm, (s) => s.auth)
  const [token, setToken] = useState('')

  const authorizing = auth === DXLinkAuthState.AUTHORIZING

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = token.trim()
    if (trimmed !== '') {
      vm.setAuthToken(trimmed)
    }
  }

  return (
    <Card>
      <CardContent>
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            <Typography sx={{ fontWeight: 700 }}>Authorization</Typography>
            <Stack
              spacing={2}
              direction={{ xs: 'column', sm: 'row' }}
              sx={{ alignItems: { xs: 'stretch', sm: 'flex-start' } }}
            >
              <TextField
                label="Token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={authorizing}
                size="small"
                fullWidth
                placeholder="Bearer token"
                helperText="This server requires authorization before opening channels."
              />
              <Button
                type="submit"
                variant="contained"
                disabled={authorizing || token.trim() === ''}
                startIcon={authorizing ? <CircularProgress size={16} color="inherit" /> : undefined}
                // Match the 40px height of the adjacent `size="small"` field
                // (same convention as the Add / Subscribe / Apply buttons).
                sx={{ height: 40, flexShrink: 0 }}
              >
                {authorizing ? 'Authorizing…' : 'Authorize'}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  )
}
