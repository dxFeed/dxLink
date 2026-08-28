import SendIcon from '@mui/icons-material/Send'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'

import { createRequestTemplate, methodModel, parseRequest } from './descriptors'
import { RpcViewModel } from './rpc-view-model'
import type { RpcCallState, RpcMessageEntry } from './rpc-view-model'
import { useVM } from '../../shared/view-model'
import { ChannelWidget } from '../channels/channel-widget'
import type { RpcConfig } from '../channels/types'
import { useConnectionVM } from '../connection/connection-context'

interface RpcChannelProps {
  title: string
  config: RpcConfig
}

const RpcStatusChip = ({ state, responses }: { state: RpcCallState; responses: number }) => {
  if (state === 'failed') {
    return <Chip size="small" color="error" variant="outlined" label="failed" />
  }
  if (state === 'completed') {
    return <Chip size="small" variant="outlined" label="completed" />
  }

  return responses === 0 ? (
    <Chip size="small" color="warning" variant="outlined" label="waiting" />
  ) : (
    <Chip size="small" color="success" variant="outlined" label="streaming" />
  )
}

/** One exchanged message, as the protobuf-JSON that crossed the wire. */
const MessageEntry = ({ entry }: { entry: RpcMessageEntry }) => (
  <Paper variant="outlined" sx={{ p: 1.5 }}>
    <Typography variant="caption" color="text.secondary">
      {entry.time}
    </Typography>
    <Box
      component="pre"
      sx={{ m: 0, mt: 0.5, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
    >
      {JSON.stringify(entry.json, null, 2)}
    </Box>
  </Paper>
)

const MessageList = ({
  title,
  entries,
  empty,
}: {
  title: string
  entries: readonly RpcMessageEntry[]
  empty: string
}) => (
  <Stack spacing={1}>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
      <Typography variant="subtitle2">{title}</Typography>
      <Typography variant="caption" color="text.secondary">
        {entries.length}
      </Typography>
    </Stack>
    {entries.length === 0 ? (
      <Typography variant="body2" color="text.secondary">
        {empty}
      </Typography>
    ) : (
      entries.map((entry) => <MessageEntry key={entry.id} entry={entry} />)
    )}
  </Stack>
)

/**
 * Send box for a bidirectional call — the only model where the client keeps talking after
 * the channel is open.
 */
const SendRequest = ({
  vm,
  config,
  active,
}: {
  vm: RpcViewModel
  config: RpcConfig
  /** False once the call has completed or failed — the channel is gone, nothing can be sent. */
  active: boolean
}) => {
  const [json, setJson] = useState(() =>
    JSON.stringify(createRequestTemplate(config.method.input), null, 2)
  )
  const parsed = parseRequest(config.method.input, json)

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Send another request</Typography>
      <TextField
        value={json}
        onChange={(e) => setJson(e.target.value)}
        multiline
        minRows={4}
        fullWidth
        size="small"
        slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
      />
      {'error' in parsed && <Alert severity="error">{parsed.error}</Alert>}
      <Box>
        <Button
          variant="contained"
          startIcon={<SendIcon />}
          disabled={!active || 'error' in parsed}
          onClick={() => {
            if ('message' in parsed) vm.send(parsed.message)
          }}
        >
          Send
        </Button>
      </Box>
    </Stack>
  )
}

/** Live RPC channel — one method of a protobuf service, bound to the connection. */
export const RpcChannel = ({ title, config }: RpcChannelProps) => {
  const connectionVM = useConnectionVM()
  const [vm] = useState(() => {
    const client = connectionVM.getClient()
    if (client === null) {
      throw new Error('RPC channel opened without an active connection')
    }

    return new RpcViewModel(client, {
      service: config.service,
      method: config.method,
      request: config.request,
    })
  })
  useEffect(() => {
    vm.start()
    return () => vm.stop()
  }, [vm])

  const callState = useVM(vm, (s) => s.callState)
  const responses = useVM(vm, (s) => s.responses)
  const requests = useVM(vm, (s) => s.requests)
  const errors = useVM(vm, (s) => s.errors)

  const model = methodModel(config.method)

  return (
    <ChannelWidget
      icon={<SwapHorizIcon />}
      title={title}
      subtitle={`${config.service.typeName} · ${config.method.name}`}
      onClose={vm.close}
      status={<RpcStatusChip state={callState} responses={responses.length} />}
      // The channel is opened inside the RPC transport, so its protocol id is not exposed
      // here; the parameters are the ones `DxLinkRpcService` opens it with.
      parameters={{ service: config.service.typeName, methodName: config.method.name }}
      errors={errors}
      onClearErrors={vm.clearErrors}
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Chip size="small" variant="outlined" label={model.label} />
          <Chip size="small" variant="outlined" label={`in: ${config.method.input.typeName}`} />
          <Chip size="small" variant="outlined" label={`out: ${config.method.output.typeName}`} />
        </Stack>

        {vm.isBidirectional && (
          <SendRequest vm={vm} config={config} active={callState === 'active'} />
        )}

        <MessageList title="Sent" entries={requests} empty="Nothing sent yet." />
        <MessageList
          title="Received"
          entries={responses}
          empty={
            callState === 'completed'
              ? 'The server closed the channel without a response.'
              : 'Waiting for the first response…'
          }
        />
      </Stack>
    </ChannelWidget>
  )
}
