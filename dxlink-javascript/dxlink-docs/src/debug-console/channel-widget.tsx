import { type DXLinkChannel, DXLinkChannelState, type DXLinkError } from '@dxfeed/dxlink-api'
import { IconButton } from '@dxfeed/ui-kit/IconButton'
import { Close } from '@dxfeed/ui-kit/Icons'
import { type ReactNode, useEffect, useState } from 'react'

import { Errors } from './errors'
import { ContentTemplate } from '../common/content-template'

export interface ChannelInfo {
  id?: DXLinkChannel['id']
  service: DXLinkChannel['service']
  parameters?: DXLinkChannel['parameters']
  addStateChangeListener: DXLinkChannel['addStateChangeListener']
  addErrorListener: DXLinkChannel['addErrorListener']
  removeErrorListener: DXLinkChannel['removeErrorListener']
  removeStateChangeListener: DXLinkChannel['removeStateChangeListener']
  getState: DXLinkChannel['getState']
  close: DXLinkChannel['close']
}

interface ChannelWidgetProps {
  channel: ChannelInfo
  children: ReactNode
}

export function ChannelWidget({ channel, children }: ChannelWidgetProps) {
  const [state, setState] = useState(channel?.getState() ?? DXLinkChannelState.REQUESTED)
  const [errors, setErrors] = useState<DXLinkError[]>([])
  const [id, setId] = useState(channel.id)

  useEffect(() => {
    const stateListener = (_state: DXLinkChannelState) => {
      console.log('Channel state changed', channel.getState())
      setState(channel.getState())
      setId(channel.id)
    }
    const errorListener = (error: DXLinkError) => {
      setErrors((errors) => [...errors, error])
    }
    channel.addStateChangeListener(stateListener)
    channel.addErrorListener(errorListener)
    return () => {
      setErrors([])
      channel.removeStateChangeListener(stateListener)
      channel.removeErrorListener(errorListener)
    }
  }, [channel])

  const handleClose = () => {
    channel.close()
  }

  const channelTitle = `Channel ${id ? `#${id}` : ''} ${channel.service}`

  if (state === DXLinkChannelState.CLOSED) {
    return (
      <ContentTemplate
        kind={'secondary'}
        title={`${channelTitle} - CLOSED`}
        actions={<Errors errors={errors} />}
      />
    )
  }

  const parameters = channel
    ? channel.parameters
      ? Object.entries(channel.parameters).reduce(
          (acc, [key, value]) => `${acc}${acc != '' ? ', ' : ''}${key}: ${value}`,
          ''
        )
      : ''
    : ''

  return (
    <ContentTemplate
      kind={'secondary'}
      title={`${channelTitle} - ${parameters}`}
      actions={
        <>
          <Errors errors={errors} />
          <IconButton title="Close channel" onClick={handleClose} kind={'ghost'}>
            <Close />
          </IconButton>
        </>
      }
    >
      {children}
    </ContentTemplate>
  )
}
