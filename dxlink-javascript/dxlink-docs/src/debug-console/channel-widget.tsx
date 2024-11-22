import { type DXLinkChannel, DXLinkChannelState, type DXLinkError } from '@dxfeed/dxlink-api'
import { IconButton } from '@dxfeed/ui-kit/IconButton'
import { Close } from '@dxfeed/ui-kit/Icons'
import { type ReactNode, useEffect, useState } from 'react'

import { Errors } from './errors'
import { ContentTemplate } from '../common/content-template'

interface ChannelWidgetProps {
  channel?: DXLinkChannel
  children: ReactNode
}

export function ChannelWidget({ channel, children }: ChannelWidgetProps) {
  const [state, setState] = useState(channel?.getState() ?? DXLinkChannelState.REQUESTED)
  const [errors, setErrors] = useState<DXLinkError[]>([])

  useEffect(() => {
    const innerChannel = channel
    if (innerChannel === undefined) {
      return
    }

    const stateListener = (_state: DXLinkChannelState) => {
      setState(innerChannel.getState())
    }
    const errorListener = (error: DXLinkError) => {
      setErrors((errors) => [...errors, error])
    }
    innerChannel.addStateChangeListener(stateListener)
    innerChannel.addErrorListener(errorListener)
    return () => {
      setErrors([])
      innerChannel.removeStateChangeListener(stateListener)
      innerChannel.removeErrorListener(errorListener)
    }
  }, [channel])

  const handleClose = () => {
    channel?.close()
  }

  const channelTitle = `Channel #${channel?.id ?? '-'} ${channel?.service ?? 'CHART'}`

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
    ? Object.entries(channel.parameters).reduce(
        (acc, [key, value]) => `${acc}${acc != '' ? ', ' : ''}${key}: ${value}`,
        ''
      )
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
