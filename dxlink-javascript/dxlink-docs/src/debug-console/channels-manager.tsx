import { type DXLinkFeed, FeedContract } from '@dxfeed/dxlink-api'
import { Button } from '@dxfeed/ui-kit/Button'
import { unit } from '@dxfeed/ui-kit/utils'
import { useState } from 'react'
import styled from 'styled-components'

import { ChannelWidget } from './channel-widget'
import { FeedChannelManager } from './feed-channel-manager'
import { ContentTemplate } from '../common/content-template'

const Actions = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
`

const ActionButton = styled(Button)`
  margin-left: ${unit(1)};
`

const ChannelsGroup = styled.div`
  display: flex;
  flex-direction: column;
  padding-top: ${unit(1)};
`

const ChannelItemGroup = styled.div`
  padding: ${unit(1)} 0;
`

export interface ChannelManagerProps {
  channels: DXLinkFeed<FeedContract>[]
  onOpenChannel: () => void
}

export function ChannelsManager({ channels, onOpenChannel }: ChannelManagerProps) {
  const handleOpenChannel = () => {
    onOpenChannel()
  }

  return (
    <ContentTemplate title="Channels">
      <Actions>
        <ActionButton color={'secondary'}>Open Candle widget</ActionButton>
        <ActionButton color={'secondary'}>Open DOM Channel</ActionButton>
        <ActionButton onClick={handleOpenChannel} color={'secondary'}>
          Open FEED Channel
        </ActionButton>
      </Actions>

      {channels.length > 0 && (
        <ChannelsGroup>
          {channels.map((channel) => (
            <ChannelItemGroup key={channel.id}>
              <ChannelWidget channel={channel.getChannel()}>
                <FeedChannelManager channel={channel} />
              </ChannelWidget>
            </ChannelItemGroup>
          ))}
        </ChannelsGroup>
      )}
    </ContentTemplate>
  )
}
