import styled from 'styled-components'
import { Connection, ConnectParams } from './connection'
import { ChannelsManager } from './channels-manager'
import { useCallback, useEffect, useState } from 'react'
import {
  DXLinkWebSocket,
  FeedContract,
  FeedChannel,
  ErrorData,
  ConnectionStatus,
  AuthState,
} from '@dxfeed/dxlink-websocket-client'
import { unit } from '@dxfeed/ui-kit/utils'
import { Text } from '@dxfeed/ui-kit/Text'
import { Errors } from './errors'
import { Authorization } from './authorization'

const Root = styled.div`
  display: flex;
  width: 100%;
  flex-direction: column;
  justify-content: space-around;
`

const ChannelWrapper = styled.div`
  padding-top: ${unit(1.5)};
`

const Version = styled(Text)`
  display: block;
`

interface ClientState {
  status: ConnectionStatus
  serverKeepaliveTimeout?: number
  serverVersion?: string
}

export function Console() {
  const [errors, setErrors] = useState<ErrorData[]>([])
  const [client, setClient] = useState<DXLinkWebSocket.Client>()
  const [state, setState] = useState<ClientState>()
  const [authState, setAuthState] = useState<AuthState | undefined>()
  const [channels, setChannels] = useState<FeedChannel[]>([])

  const handleError = (error: unknown) => {
    console.error(error)

    setErrors((prev) => [
      ...prev,
      { type: 'UNKNOWN', message: error instanceof Error ? error.message : String(error) },
    ])
  }

  // Connect to dxLink
  const handleConnect = async (con: ConnectParams) => {
    setClient(undefined)
    setAuthState(undefined)
    setState({ status: 'PENDED' })
    setErrors([])

    try {
      const client = await DXLinkWebSocket.newClient(con)

      setClient(client)
    } catch (error) {
      handleError(error)

      setState({ status: 'CLOSED' })
    }
  }

  const handleDisconnect = useCallback(() => {
    console.log('Disconnecting')

    client?.close()
    setClient(undefined)
    setState(undefined)
    setAuthState(undefined)
    setChannels([])
  }, [client])

  // Cleanup client on unmount
  useEffect(() => () => client?.close(), [client])

  useEffect(() => {
    if (client !== undefined) {
      const stateSub = client.connectionState.subscribe((state) => {
        console.log('Connection state', state)

        if (state.status === 'CLOSED') {
          return handleDisconnect()
        }

        setState(state)
      })
      const authStateSub = client.authState.subscribe((state) => {
        console.log('Auth state', state)
        setAuthState(state)
      })
      const errorSub = client.error.subscribe((error) => {
        setErrors((prev) => [...prev, error])
      })

      return () => {
        stateSub.unsubscribe()
        authStateSub.unsubscribe()
        errorSub.unsubscribe()
      }
    }
  }, [client, handleDisconnect])

  const handleOpenChannel = async (contract: FeedContract) => {
    try {
      if (client === undefined) {
        throw new Error('Client must be connected')
      }

      const channel = await client.openFeedChannel(contract)

      setChannels((prev) => [...prev, channel])
    } catch (error) {
      handleError(error)
    }
  }

  const status = state?.status
  const serverVersion = state?.serverVersion
  const serverKeepaliveTimeout = state?.serverKeepaliveTimeout

  return (
    <Root>
      <Connection
        status={status}
        serverKeepaliveTimeout={serverKeepaliveTimeout}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        error={<Errors errors={errors} />}
        info={
          <>
            {client !== undefined && (
              <Version level={4}>
                <b>Client version</b>: {client.version}
              </Version>
            )}
            {serverVersion !== undefined && (
              <Version level={4}>
                <b>Server version</b>: {serverVersion}
              </Version>
            )}
          </>
        }
      />
      {authState === 'UNAUTHORIZED' && <Authorization onAuth={client?.auth} />}
      {authState === 'AUTHORIZED' && (
        <ChannelWrapper>
          {status === 'OPENED' && (
            <ChannelsManager channels={channels} onOpenChannel={handleOpenChannel} />
          )}
        </ChannelWrapper>
      )}
    </Root>
  )
}
