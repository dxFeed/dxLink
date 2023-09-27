import styled from 'styled-components'
import { Connection, ConnectParams } from './connection'
import { ChannelsManager } from './channels-manager'
import { useCallback, useEffect, useState } from 'react'
import {
  DXLinkAuthState,
  DXLinkConnectionDetails,
  DXLinkConnectionState,
  DXLinkError,
  DXLinkFeed,
  DXLinkWebSocketClient,
  DXLinkWebSocketClientImpl,
  DXLinkLogLevel,
  FeedContract,
  DXLinkFeedImpl,
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

interface ConnectionState {
  state: DXLinkConnectionState
  details?: DXLinkConnectionDetails
}

const DEFAULT_CONNECTION_STATE: ConnectionState = {
  state: DXLinkConnectionState.NOT_CONNECTED,
}

export function Console() {
  const [errors, setErrors] = useState<DXLinkError[]>([])
  const [client, setClient] = useState<DXLinkWebSocketClient>()
  const [connectionState, setConnectionState] = useState<ConnectionState>(DEFAULT_CONNECTION_STATE)
  const [authState, setAuthState] = useState<DXLinkAuthState | undefined>()
  const [channels, setChannels] = useState<DXLinkFeed<FeedContract>[]>([])

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
    setErrors([])

    try {
      const client = new DXLinkWebSocketClientImpl({
        logLevel: DXLinkLogLevel.DEBUG,
        keepaliveTimeout: con.keepaliveTimeout,
        acceptKeepaliveTimeout: con.acceptKeepaliveTimeout,
        keepaliveInterval: con.keepaliveInterval,
        maxReconnectAttempts: 1,
      })

      setConnectionState({
        state: DXLinkConnectionState.CONNECTING,
        details: client.getConnectionDetails(),
      })

      client.connect(con.url)

      setClient(client)
    } catch (error) {
      handleError(error)

      handleDisconnect()
    }
  }

  const handleDisconnect = useCallback(() => {
    console.log('Disconnecting')

    client?.disconnect()
    setClient(undefined)
    setConnectionState(DEFAULT_CONNECTION_STATE)
    setAuthState(undefined)
    setChannels([])
  }, [client])

  // Cleanup client on unmount
  useEffect(() => () => client?.close(), [client])

  useEffect(() => {
    if (client !== undefined) {
      const connectionStateListener = (state: DXLinkConnectionState) => {
        console.log('Connection state', state)

        if (state === DXLinkConnectionState.NOT_CONNECTED) {
          return handleDisconnect()
        }

        setConnectionState({
          state,
          details: client.getConnectionDetails(),
        })
      }
      client.addConnectionStateChangeListener(connectionStateListener)

      const authStateListener = (state: DXLinkAuthState) => {
        console.log('Auth state', state)
        setAuthState(state)
      }
      client.addAuthStateChangeListener(authStateListener)

      const errorListener = (error: DXLinkError) => {
        console.error(error)
        setErrors((prev) => [...prev, error])
      }
      client.addErrorListener(errorListener)

      return () => {
        client.removeConnectionStateChangeListener(connectionStateListener)
        client.removeAuthStateChangeListener(authStateListener)
        client.removeErrorListener(errorListener)
      }
    }
  }, [client, handleDisconnect])

  const handleOpenChannel = async (contract: FeedContract) => {
    try {
      if (client === undefined) {
        throw new Error('Client must be connected')
      }

      const feed = new DXLinkFeedImpl(client, contract, {
        logLevel: DXLinkLogLevel.DEBUG,
      })

      setChannels((prev) => [...prev, feed])
    } catch (error) {
      handleError(error)
    }
  }

  const state = connectionState.state
  const clientVersion = connectionState?.details?.clientVersion
  const serverVersion = connectionState?.details?.serverVersion
  const serverKeepaliveTimeout = connectionState?.details?.serverKeepaliveTimeout

  return (
    <Root>
      <Connection
        state={state}
        serverKeepaliveTimeout={serverKeepaliveTimeout}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        error={<Errors errors={errors} />}
        info={
          <>
            {client !== undefined && (
              <Version level={4}>
                <b>Client version</b>: {clientVersion}
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
      {authState === 'UNAUTHORIZED' && (
        <Authorization onAuth={(token) => client?.setAuthToken(token)} />
      )}
      {authState === 'AUTHORIZED' && (
        <ChannelWrapper>
          {state === DXLinkConnectionState.CONNECTED && (
            <ChannelsManager channels={channels} onOpenChannel={handleOpenChannel} />
          )}
        </ChannelWrapper>
      )}
    </Root>
  )
}
