import {
  DXLinkAuthState,
  type DXLinkConnectionDetails,
  DXLinkConnectionState,
  type DXLinkError,
  DXLinkFeed,
  DXLinkLogLevel,
  DXLinkWebSocketClient,
  FeedContract,
  DXLinkDepthOfMarket,
} from '@dxfeed/dxlink-api'
import { Text } from '@dxfeed/ui-kit/Text'
import { unit } from '@dxfeed/ui-kit/utils'
import { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'

import { Authorization } from './authorization'
import { ChannelsManager, type Channel } from './channels-manager'
import { type ConnectParams, Connection } from './connection'
import { Errors } from './errors'
import { DXLinkCandles } from '../candles/candles'

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

export function DebugConsole() {
  const [errors, setErrors] = useState<DXLinkError[]>([])
  const [client, setClient] = useState<DXLinkWebSocketClient>()
  const [connectionState, setConnectionState] = useState<ConnectionState>(DEFAULT_CONNECTION_STATE)
  const [authState, setAuthState] = useState<DXLinkAuthState | undefined>()
  const [channels, setChannels] = useState<Channel[]>([])

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
      const client = new DXLinkWebSocketClient({
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

  const handleOpenFeed = () => {
    try {
      if (client === undefined) {
        throw new Error('Client must be connected')
      }

      const feed = new DXLinkFeed(client, FeedContract.AUTO, {
        logLevel: DXLinkLogLevel.DEBUG,
      })

      setChannels((prev) => [...prev, feed])
    } catch (error) {
      handleError(error)
    }
  }

  const handleOpenDom = (symbol: string, sources: string) => {
    try {
      if (client === undefined) {
        throw new Error('Client must be connected')
      }

      const dom = new DXLinkDepthOfMarket(
        client,
        {
          symbol,
          sources: sources.split(',').map((s) => s.trim()),
        },
        {
          logLevel: DXLinkLogLevel.DEBUG,
        }
      )

      setChannels((prev) => [...prev, dom])
    } catch (error) {
      handleError(error)
    }
  }

  const handleOpenCandles = () => {
    try {
      if (client === undefined) {
        throw new Error('Client must be connected')
      }

      const candles = new DXLinkCandles(client, {
        logLevel: DXLinkLogLevel.DEBUG,
      })

      candles.setSubscription({
        symbol: 'AAPL{=d}',
        fromTime: Date.now() - 1000 * 60 * 60 * 24 * 30,
      })

      setChannels((prev) => [...prev, candles])
    } catch (error) {
      handleError(error)
    }
  }

  const state = connectionState.state
  const connectionDetails = connectionState?.details
  const serverKeepaliveTimeout = connectionDetails?.serverKeepaliveTimeout

  return (
    <Root>
      <Connection
        state={state}
        serverKeepaliveTimeout={serverKeepaliveTimeout}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        error={<Errors errors={errors} />}
        info={
          connectionDetails !== undefined && (
            <>
              <Version level={4}>
                <b>Client version</b>: {connectionDetails.clientVersion}
              </Version>
              <Version level={4}>
                <b>Server version</b>:{' '}
                {connectionDetails.serverVersion !== undefined
                  ? connectionDetails.serverVersion
                  : '—'}
              </Version>
            </>
          )
        }
      />
      {state === DXLinkConnectionState.CONNECTED && (
        <>
          {authState === 'UNAUTHORIZED' && (
            <Authorization onAuth={(token) => client?.setAuthToken(token)} />
          )}
          {authState === 'AUTHORIZED' && (
            <ChannelWrapper>
              {state === DXLinkConnectionState.CONNECTED && (
                <ChannelsManager
                  channels={channels}
                  onOpenFeed={handleOpenFeed}
                  onOpenDom={handleOpenDom}
                  onOpenCandles={handleOpenCandles}
                />
              )}
            </ChannelWrapper>
          )}
        </>
      )}
    </Root>
  )
}
