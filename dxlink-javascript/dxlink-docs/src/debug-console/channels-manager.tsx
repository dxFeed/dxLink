import { DXLinkFeed, FeedContract, DXLinkDepthOfMarket } from '@dxfeed/dxlink-api'
import { Button } from '@dxfeed/ui-kit/Button'
import { Popover } from '@dxfeed/ui-kit/Popover'
import { unit } from '@dxfeed/ui-kit/utils'
import { useState } from 'react'
import styled from 'styled-components'

import { CandlesChannelManager } from './candles-channel-manager'
import { ChannelWidget } from './channel-widget'
import { DomChannelManager } from './dom-channel-manager'
import { DomOpenForm } from './dom-open-form'
import { FeedChannelManager } from './feed-channel-manager'
import { ScriptCandlesChannelManager } from './script-candles-channel-manager'
import { DXLinkCandles } from '../candles/candles'
import { ChartHolder } from '../chart-wrapper'
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

export type Channel = DXLinkFeed<FeedContract> | DXLinkDepthOfMarket | DXLinkCandles | ChartHolder

export interface ChannelManagerProps {
  channels: Channel[]
  onOpenFeed: () => void
  onOpenDom: (symbol: string, sources: string) => void
  onOpenCandles: () => void
  onOpenChart: () => void
}

export function ChannelsManager({
  channels,
  onOpenFeed,
  onOpenDom,
  onOpenChart,
}: ChannelManagerProps) {
  const [anchorElRef, setAnchorElRef] = useState<HTMLElement | null>(null)
  const [domIsOpen, setDomIsOpen] = useState(false)

  return (
    <ContentTemplate title="Channels">
      <Popover
        relativeContainer={anchorElRef}
        anchorEl={anchorElRef}
        isOpen={domIsOpen}
        placement={'bottom-end'}
        sideOffset={8}
        onClose={() => {
          setDomIsOpen(false)
        }}
      >
        <DomOpenForm
          onOpen={(symbol, sources) => {
            setDomIsOpen(false)
            onOpenDom(symbol, sources)
          }}
        />
      </Popover>

      <Actions ref={setAnchorElRef}>
        <ActionButton color={'secondary'} onClick={onOpenChart}>
          CHART Channel
        </ActionButton>
        <ActionButton
          color={domIsOpen ? 'accent' : 'secondary'}
          onClick={() => {
            setDomIsOpen(true)
          }}
        >
          DOM Channel
        </ActionButton>
        <ActionButton onClick={onOpenFeed} color={'secondary'}>
          FEED Channel
        </ActionButton>
      </Actions>

      {channels.length > 0 && (
        <ChannelsGroup>
          {channels.map((channel, index) => (
            <ChannelItemGroup key={channel.id ?? index}>
              <ChannelWidget channel={channel.getChannel()}>
                {channel instanceof DXLinkFeed && <FeedChannelManager channel={channel} />}
                {channel instanceof DXLinkDepthOfMarket && <DomChannelManager channel={channel} />}
                {channel instanceof DXLinkCandles && <CandlesChannelManager channel={channel} />}
                {channel instanceof ChartHolder && (
                  <ScriptCandlesChannelManager channel={channel} />
                )}
              </ChannelWidget>
            </ChannelItemGroup>
          ))}
        </ChannelsGroup>
      )}
    </ContentTemplate>
  )
}
