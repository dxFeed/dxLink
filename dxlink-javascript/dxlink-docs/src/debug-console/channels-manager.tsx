import { DXLinkFeed, FeedContract, DXLinkDepthOfMarket } from '@dxfeed/dxlink-api'
import { Button } from '@dxfeed/ui-kit/Button'
import { Paper } from '@dxfeed/ui-kit/Paper'
import { Popover } from '@dxfeed/ui-kit/Popover'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { unit } from '@dxfeed/ui-kit/utils'
import { useState } from 'react'
import styled from 'styled-components'

import { ChannelWidget } from './channel-widget'
import { DomChannelManager } from './dom-channel-manager'
import { FeedChannelManager } from './feed-channel-manager'
import { FieldWrapper, FormActions } from './forms'
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

export type Channel = DXLinkFeed<FeedContract> | DXLinkDepthOfMarket

export interface ChannelManagerProps {
  channels: Channel[]
  onOpenFeed: () => void
  onOpenDom: (symbol: string, source: string) => void
}

export function ChannelsManager({ channels, onOpenFeed, onOpenDom }: ChannelManagerProps) {
  const [anchorElRef, setAnchorElRef] = useState<HTMLElement | null>(null)
  const [domIsOpen, setDomIsOpen] = useState(false)

  const [domSymbol, setDomSymbol] = useState('')
  const [domSource, setDomSource] = useState('')

  const handleOpenDom = () => {
    onOpenDom(domSymbol, domSource)
    setDomIsOpen(false)
  }

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
        <Paper type="outlined">
          <ContentTemplate title={'DOM parameters'} kind="primary">
            <FieldWrapper>
              <TextField
                label={'Symbol'}
                value={domSymbol}
                onChange={(e) => {
                  setDomSymbol(e.target.value)
                }}
              />
            </FieldWrapper>
            <FieldWrapper>
              <TextField
                label={'Source'}
                value={domSource}
                onChange={(e) => {
                  setDomSource(e.target.value)
                }}
              />
            </FieldWrapper>

            <FormActions>
              <Button type="submit" color={'primary'} kind={'outline'} onClick={handleOpenDom}>
                Open
              </Button>
            </FormActions>
          </ContentTemplate>
        </Paper>
      </Popover>

      <Actions ref={setAnchorElRef}>
        <ActionButton color={'secondary'}>Open Candle Widget</ActionButton>
        <ActionButton
          color={domIsOpen ? 'primary' : 'secondary'}
          onClick={() => {
            setDomIsOpen(true)
          }}
        >
          Open DOM Channel
        </ActionButton>
        <ActionButton onClick={onOpenFeed} color={'secondary'}>
          Open FEED Channel
        </ActionButton>
      </Actions>

      {channels.length > 0 && (
        <ChannelsGroup>
          {channels.map((channel) => (
            <ChannelItemGroup key={channel.id}>
              <ChannelWidget channel={channel.getChannel()}>
                {channel instanceof DXLinkFeed && <FeedChannelManager channel={channel} />}
                {channel instanceof DXLinkDepthOfMarket && <DomChannelManager channel={channel} />}
              </ChannelWidget>
            </ChannelItemGroup>
          ))}
        </ChannelsGroup>
      )}
    </ContentTemplate>
  )
}
