import { type DXLinkChannel, DXLinkChannelState, type DXLinkError } from '@dxfeed/dxlink-api'
import { IconButton } from '@dxfeed/ui-kit/IconButton'
import { Close } from '@dxfeed/ui-kit/Icons'
import { type ReactNode, useEffect, useState } from 'react'

import { Errors } from './errors'
import { ContentTemplate } from '../common/content-template'

interface ChannelWidgetProps {
  channel: DXLinkChannel
  children: ReactNode
}

export function ChannelWidget({ channel, children }: ChannelWidgetProps) {
  const [state, setState] = useState(channel.getState())
  const [errors, setErrors] = useState<DXLinkError[]>([])

  useEffect(() => {
    const stateListener = (_state: DXLinkChannelState) => {
      setState(channel.getState())
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

  if (state === DXLinkChannelState.CLOSED) {
    return <ContentTemplate kind={'secondary'} title={`Channel #${channel.id} - CLOSED`} />
  }

  return (
    <ContentTemplate
      kind={'secondary'}
      title={`Channel #${channel.id} - ${channel.parameters.contract}`}
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
