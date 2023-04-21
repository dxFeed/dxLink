import { Button } from '@dxfeed/ui-kit/Button'
import { ContentTemplate } from '../common/content-template'
import { FeedChannel, FeedContract } from '@dxfeed/dxlink-websocket-client'
import { useState } from 'react'
import { FeedChannelManager } from './feed-channel-manager'
import { Select } from '../common/select'
import styled from 'styled-components'
import { unit } from '@dxfeed/ui-kit/utils'
import { ChannelWidget } from './channel-widget'

const Actions = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
`

const ContractSelect = styled(Select)`
  width: 120px;
  margin-right: ${unit(1)};
`

const ChannelsGroup = styled.div`
  display: flex;
  flex-direction: column;
  padding-top: ${unit(1)};
`

const ChannelItemGroup = styled.div`
  padding: ${unit(1)} 0;
`

const CONTRACT_LIST: FeedContract[] = ['AUTO', 'TICKER', 'HISTORY', 'STREAM']

export interface ChannelManagerProps {
  channels: FeedChannel[]
  onOpenChannel: (contract: FeedContract) => Promise<void>
}

export function ChannelsManager({ channels, onOpenChannel }: ChannelManagerProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [contract, setContract] = useState<FeedContract>(CONTRACT_LIST[0])

  const handleOpenChannel = () => {
    if (isLoading) {
      return
    }

    setIsLoading(true)
    onOpenChannel(contract).finally(() => setIsLoading(false))
  }

  return (
    <ContentTemplate title="Channels">
      <Actions>
        <ContractSelect
          value={contract}
          label="Contract"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onChange={(e) => setContract(e as any)}
          options={CONTRACT_LIST}
        />
        <Button onClick={handleOpenChannel} disabled={isLoading} color={'secondary'}>
          Open FEED Channel
        </Button>
      </Actions>

      {channels.length > 0 && (
        <ChannelsGroup>
          {channels.map((channel) => (
            <ChannelItemGroup key={channel.id}>
              <ChannelWidget channel={channel}>
                <FeedChannelManager channel={channel} />
              </ChannelWidget>
            </ChannelItemGroup>
          ))}
        </ChannelsGroup>
      )}
    </ContentTemplate>
  )
}
