import { IconButton } from '@dxfeed/ui-kit/IconButton'
import { Close } from '@dxfeed/ui-kit/Icons'
import { FeedChannel } from '@dxfeed/dxlink-websocket-client'
import { ReactNode } from 'react'
import { ContentTemplate } from '../common/content-template'
import { useObservable } from '../use-observable'
import { ErrorsWatcher } from './errors'

interface ChannelWidgetProps {
  channel: FeedChannel
  children: ReactNode
}

export function ChannelWidget({ channel, children }: ChannelWidgetProps) {
  const status = useObservable(channel.state, 'INITIAL')

  const handleClose = () => {
    channel.close()
  }

  if (status === 'INITIAL') {
    return <ContentTemplate kind={'secondary'} title={`Channel #${channel.id}`} />
  }

  if (status === 'CLOSED') {
    return <ContentTemplate kind={'secondary'} title={`Channel #${channel.id} - CLOSED`} />
  }

  return (
    <ContentTemplate
      kind={'secondary'}
      title={`Channel #${channel.id} - ${channel.contract}`}
      actions={
        <>
          <ErrorsWatcher error={channel.error} />
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
