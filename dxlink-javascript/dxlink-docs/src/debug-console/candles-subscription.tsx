import { Button } from '@dxfeed/ui-kit/Button'
import { HelperMessage } from '@dxfeed/ui-kit/HelperMessage'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { unit } from '@dxfeed/ui-kit/utils'
import { useState } from 'react'
import styled from 'styled-components'

import type { DXLinkCandleSubscription } from '../candles/candles'
import { ContentTemplate } from '../common/content-template'

const FieldsGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(1, 1fr);
  grid-gap: ${unit(1.5)};
`

const FieldWrapper = styled.div`
  display: flex;
  flex-direction: column;
  padding-bottom: ${unit(1)};
  width: 100%;
`

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid ${({ theme }) => theme.palette.separator.primary};
  padding-top: ${unit(1)};
`

const ActionGroup = styled.div`
  padding-right: ${unit(1)};
`

export interface CandlesSubscriptionProps {
  onSet(subscription: DXLinkCandleSubscription): void
}

export function CandlesSubscription({ onSet }: CandlesSubscriptionProps) {
  const [symbol, setSymbol] = useState('AAPL{=d}')
  const [fromTime, setFromTime] = useState('0')

  const handleSet = () => {
    onSet({
      symbol,
      fromTime: Number(fromTime),
    })
  }

  return (
    <ContentTemplate title="Manage Candle subscription">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSet()
        }}
      >
        <FieldsGroup>
          <FieldWrapper>
            <TextField
              label={'Symbol'}
              value={symbol}
              fullWidth
              onChange={(e) => setSymbol(e.target.value)}
            />
            <HelperMessage state="normal">
              <a href="https://currentmillis.com/" target="_blank" rel="noreferrer">
                Milliseconds since epoch
              </a>
            </HelperMessage>
          </FieldWrapper>
          <FieldWrapper>
            <TextField
              label={'From time (unix timestamp)'}
              value={fromTime}
              onChange={(e) => {
                const value = e.target.value
                setFromTime(value.replace(/[^0-9]/g, ''))
              }}
            />
            <HelperMessage state="normal">
              <a href="https://currentmillis.com/" target="_blank" rel="noreferrer">
                Milliseconds since epoch
              </a>
            </HelperMessage>
          </FieldWrapper>
        </FieldsGroup>

        <Actions>
          <ActionGroup>
            <Button type="submit" kind={'outline'}>
              Set subscription
            </Button>
          </ActionGroup>
        </Actions>
      </form>
    </ContentTemplate>
  )
}
