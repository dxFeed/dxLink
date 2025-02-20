import { DXLinkConnectionState } from '@dxfeed/dxlink-api'
import { Button } from '@dxfeed/ui-kit/Button'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { unit } from '@dxfeed/ui-kit/utils'
import { useState } from 'react'
import styled from 'styled-components'

import { ContentTemplate } from '../common/content-template'

const ActionsGroup = styled.div`
  display: flex;
  align-items: center;
  border-top: 1px solid ${({ theme }) => theme.palette.separator.primary};
  padding-top: ${unit(1)};
  margin-top: ${unit(1.5)};
`

const Info = styled.div`
  flex-grow: 1;
`

const ConnectioStatus = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: ${({ theme }) => theme.palette.green.main};

  &::after {
    margin-left: ${unit(1)};
    content: '';
    background: ${({ theme }) => theme.palette.green.main};
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
`

const FieldsGroup = styled.div`
  display: flex;
  flex-direction: column;
`

const InnerFieldGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  grid-gap: ${unit(1.5)};
`

const FieldWrapper = styled.div`
  padding: ${unit(1.5)} 0;
`

const ConnectionButton = styled.div`
  margin-right: ${unit(1)};
`

export interface ConnectParams {
  url: string
  keepaliveInterval?: number
  keepaliveTimeout?: number
  acceptKeepaliveTimeout?: number
}

export interface ConnectionProps {
  state: DXLinkConnectionState
  serverKeepaliveTimeout?: number
  onConnect: (con: ConnectParams) => void
  onDisconnect: () => void
  error: React.ReactNode
  info: React.ReactNode
}

const getConnectionUrl = (location: Location) => {
  const debugIndex = location.pathname.indexOf('/debug')
  const pathname = debugIndex !== -1 ? location.pathname.slice(0, debugIndex) : location.pathname

  return `ws${location.protocol.startsWith('https') ? 's' : ''}://${location.host}${pathname}`
}

// const DEFAULT_URL = 'ws://localhost:9959'

const DEFAULT_URL =
  process.env.NODE_ENV === 'production'
    ? getConnectionUrl(window.location)
    : getConnectionUrl(new URL('ws://localhost:9959/') as unknown as Location)

export function Connection({
  state,
  serverKeepaliveTimeout,
  onConnect,
  onDisconnect,
  error,
  info,
}: ConnectionProps) {
  const [url, setUrl] = useState(DEFAULT_URL)
  const [keepaliveInterval, setKeepaliveInterval] = useState('30')
  const [keepaliveTimeout, setKeepaliveTimeout] = useState('60')
  const [acceptKeepaliveTimeout, setAcceptKeepaliveTimeout] = useState('60')

  const handleConnect = () => {
    const conn: ConnectParams = {
      url,
    }

    if (keepaliveInterval !== '') {
      conn.keepaliveInterval = Number(keepaliveInterval)
    }
    if (keepaliveTimeout !== '') {
      conn.keepaliveTimeout = Number(keepaliveTimeout)
    }
    if (acceptKeepaliveTimeout !== '') {
      conn.acceptKeepaliveTimeout = Number(acceptKeepaliveTimeout)
    }

    onConnect(conn)
  }

  const inputFreeze =
    state === DXLinkConnectionState.CONNECTED || state === DXLinkConnectionState.CONNECTING

  return (
    <ContentTemplate title="Connection">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleConnect()
        }}
      >
        <FieldsGroup>
          <FieldWrapper>
            <TextField
              label={'URL'}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={inputFreeze}
            />
          </FieldWrapper>
          <InnerFieldGroup>
            <TextField
              label={'Client keepalive interval, s'}
              value={keepaliveInterval}
              onChange={(e) => {
                const value = e.target.value
                setKeepaliveInterval(value.replace(/[^0-9]/g, ''))
              }}
              disabled={inputFreeze}
            />
            <TextField
              label={'Client keepalive timeout, s'}
              value={keepaliveTimeout}
              onChange={(e) => {
                const value = e.target.value
                setKeepaliveTimeout(value.replace(/[^0-9]/g, ''))
              }}
              disabled={inputFreeze}
            />
            <TextField
              label={'Server accept keepalive timeout, s'}
              value={acceptKeepaliveTimeout}
              onChange={(e) => {
                const value = e.target.value
                setAcceptKeepaliveTimeout(value.replace(/[^0-9]/g, ''))
              }}
              disabled={inputFreeze}
            />
            {serverKeepaliveTimeout !== undefined && (
              <TextField
                label={'Server keepalive timeout, s'}
                value={serverKeepaliveTimeout.toString()}
                disabled={true}
              />
            )}
          </InnerFieldGroup>
        </FieldsGroup>
        <ActionsGroup>
          <Info>{info}</Info>
          {error}
          <ConnectionButton>
            <Button
              type="submit"
              disabled={
                state === DXLinkConnectionState.CONNECTING ||
                state === DXLinkConnectionState.CONNECTED
              }
            >
              {state === DXLinkConnectionState.CONNECTED ? (
                <ConnectioStatus>Connected</ConnectioStatus>
              ) : state === DXLinkConnectionState.CONNECTING ? (
                'Connecting'
              ) : (
                'Connect'
              )}
            </Button>
          </ConnectionButton>
          <Button
            type="button"
            onClick={onDisconnect}
            disabled={state === DXLinkConnectionState.NOT_CONNECTED}
          >
            Disconnect
          </Button>
        </ActionsGroup>
      </form>
    </ContentTemplate>
  )
}
