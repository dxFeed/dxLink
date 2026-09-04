import { DXLinkConnectionState } from '@dxfeed/dxlink-api'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import { useConnectionVM } from './connection-context'
import { ErrorCenter } from '../errors/error-center'
import type { ConsoleConfig } from '../lib/console-config'
import { useConsoleConfig } from '../lib/console-config-context'
import { useVM } from '../view-model'

const STATUS: Record<DXLinkConnectionState, { label: string; color: ChipProps['color'] }> = {
  [DXLinkConnectionState.NOT_CONNECTED]: { label: 'Not connected', color: 'default' },
  [DXLinkConnectionState.CONNECTING]: { label: 'Connecting…', color: 'warning' },
  [DXLinkConnectionState.CONNECTED]: { label: 'Connected', color: 'success' },
}

const PRIMARY_LABEL: Record<DXLinkConnectionState, string> = {
  [DXLinkConnectionState.NOT_CONNECTED]: 'Connect',
  [DXLinkConnectionState.CONNECTING]: 'Connecting…',
  [DXLinkConnectionState.CONNECTED]: 'Reconnect',
}

interface ConnectionForm {
  url: string
  keepaliveInterval: string
  keepaliveTimeout: string
  acceptKeepalive: string
}

/**
 * The values the form starts with, taken from the console's configuration profile. The
 * fields stay editable drafts from here on — the profile seeds them and is never written
 * back to.
 */
const createDefaultForm = (config: ConsoleConfig): ConnectionForm => ({
  url: config.wsUrl,
  keepaliveInterval: String(config.keepalive.interval),
  keepaliveTimeout: String(config.keepalive.timeout),
  acceptKeepalive: String(config.keepalive.acceptTimeout),
})

const InfoLine = ({ label, value }: { label: string; value: string }) => (
  <Typography variant="caption" component="div" color="text.secondary" sx={{ lineHeight: 1.4 }}>
    <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
      {label}
    </Box>
    : {value}
  </Typography>
)

/**
 * Connection panel — the live connection view. Reads connection state / details /
 * errors from the page-scoped {@link ConnectionViewModel} and drives connect /
 * reconnect / disconnect. Form fields (URL + keepalive) are local draft state seeded from
 * the console's configuration profile, which can also pin a field: a pinned field renders
 * read-only rather than hidden, since which endpoint you are talking to is worth seeing
 * even when the deployment fixed it.
 */
export const ConnectionPanel = () => {
  const vm = useConnectionVM()
  const config = useConsoleConfig()
  const connection = useVM(vm, (s) => s.connection)
  const details = useVM(vm, (s) => s.details)
  const errors = useVM(vm, (s) => s.errors)

  const [form, setForm] = useState<ConnectionForm>(() => createDefaultForm(config))

  const connected = connection === DXLinkConnectionState.CONNECTED
  const connecting = connection === DXLinkConnectionState.CONNECTING
  const frozen = connected || connecting
  const urlPinned = config.locked.includes('wsUrl')
  const keepalivePinned = config.locked.includes('keepalive')

  const setField =
    (key: keyof ConnectionForm, digitsOnly = false) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = digitsOnly ? e.target.value.replace(/[^0-9]/g, '') : e.target.value
      setForm((current) => ({ ...current, [key]: value }))
    }

  const handlePrimary = () => {
    if (connected) {
      vm.reconnect()
      return
    }
    vm.connect(form.url.trim(), {
      keepaliveInterval: Number(form.keepaliveInterval) || 0,
      keepaliveTimeout: Number(form.keepaliveTimeout) || 0,
      acceptKeepaliveTimeout: Number(form.acceptKeepalive) || 0,
    })
  }

  const clientVersion = details?.clientVersion ?? '—'
  const serverVersion = details?.serverVersion ?? '—'
  const serverKeepalive =
    details?.serverKeepaliveTimeout != null ? String(details.serverKeepaliveTimeout) : ''

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Typography sx={{ fontWeight: 700 }}>Connection</Typography>
            <Chip
              size="small"
              color={STATUS[connection].color}
              variant={connected ? 'filled' : 'outlined'}
              label={STATUS[connection].label}
            />
          </Stack>

          <TextField
            label="WebSocket URL"
            value={form.url}
            onChange={setField('url')}
            disabled={frozen || urlPinned}
            helperText={urlPinned ? 'Fixed by this deployment.' : undefined}
            size="small"
            fullWidth
          />
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            }}
          >
            <TextField
              label="Keepalive interval, s"
              value={form.keepaliveInterval}
              onChange={setField('keepaliveInterval', true)}
              disabled={frozen || keepalivePinned}
              size="small"
            />
            <TextField
              label="Keepalive timeout, s"
              value={form.keepaliveTimeout}
              onChange={setField('keepaliveTimeout', true)}
              disabled={frozen || keepalivePinned}
              size="small"
            />
            <TextField
              label="Accept keepalive, s"
              value={form.acceptKeepalive}
              onChange={setField('acceptKeepalive', true)}
              disabled={frozen || keepalivePinned}
              size="small"
            />
            <TextField label="Server keepalive, s" value={serverKeepalive} size="small" disabled />
          </Box>
        </Stack>
      </CardContent>

      <Divider />

      <Box sx={{ p: 2 }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1.5 }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 200 }}>
            {connected && (
              <>
                <InfoLine label="Client version" value={clientVersion} />
                <InfoLine label="Server version" value={serverVersion} />
              </>
            )}
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <ErrorCenter errors={errors} onClear={vm.clearErrors} />
            <Button variant="contained" onClick={handlePrimary} disabled={connecting}>
              {PRIMARY_LABEL[connection]}
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              onClick={vm.disconnect}
              disabled={connection === DXLinkConnectionState.NOT_CONNECTED}
            >
              Disconnect
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Card>
  )
}
