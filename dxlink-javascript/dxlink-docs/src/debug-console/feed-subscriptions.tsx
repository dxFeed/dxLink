import {
  FeedContract,
  type IndexedEventSubscription,
  type Subscription,
  type TimeSeriesSubscription,
} from '@dxfeed/dxlink-api'
import { Button } from '@dxfeed/ui-kit/Button'
import { Checkbox } from '@dxfeed/ui-kit/Checkbox'
import { HelperMessage } from '@dxfeed/ui-kit/HelperMessage'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { unit } from '@dxfeed/ui-kit/utils'
import { useState } from 'react'
import styled from 'styled-components'

import { EVENT_TYPES } from './feed-event-type'
import { FEED_ORDER_SOURCE } from './feed-order-source'
import { ContentTemplate } from '../common/content-template'
import { Select } from '../common/select'

const FieldsGroup = styled.div`
  display: flex;
  justify-content: space-between;
  padding-bottom: ${unit(1)};
`

const ParamTextField = styled.div`
  flex-grow: 1;

  &:not(:last-of-type) {
    margin-right: ${unit(1)};
  }
`

const FieldTypeGroup = styled.div`
  display: flex;
  width: 160px;
  padding-right: ${unit(1)};
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

const OrderSourceSelect = styled(Select)`
  width: 100%;
  padding-left: ${unit(1)};
`

const OrderSourceWrapper = styled.div`
  height: 40px;
  display: flex;
  flex-direction: row;
  align-items: center;
`
export interface FeedSubscriptionProps {
  contract: FeedContract
  onAdd(subscription: Subscription | TimeSeriesSubscription | IndexedEventSubscription): void
  onRemove(subscription: Subscription | TimeSeriesSubscription | IndexedEventSubscription): void
  onReset(): void
}

export function FeedSubscription({ onAdd, onRemove, onReset, contract }: FeedSubscriptionProps) {
  const [symbol, setSymbol] = useState('')
  const [eventType, setEventType] = useState('Quote')
  const [fromTime, setFromTime] = useState('')
  const [source, setSource] = useState('')

  const handleAdd = () => {
    onAdd({
      type: eventType,
      symbol,
      fromTime: fromTime !== '' ? Number(fromTime) : undefined,
      source: source !== '' ? source : undefined,
    })
  }

  const handleRemove = () => {
    onRemove({
      type: eventType,
      symbol,
      fromTime: fromTime !== '' ? Number(fromTime) : undefined,
    })
  }

  const handleReset = () => {
    onReset()
  }

  return (
    <ContentTemplate title="Manage subscription">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleAdd()
        }}
      >
        <FieldsGroup>
          <FieldTypeGroup>
            <Select
              value={eventType}
              label="Event type"
              onChange={setEventType}
              options={EVENT_TYPES}
              description={
                <>
                  Detailed information{' '}
                  <a
                    href="https://kb.dxfeed.com/en/data-model/dxfeed-api-market-events.html#event-types"
                    rel="noreferrer"
                    target="_blank"
                  >
                    kb.dxfeed.com
                  </a>
                </>
              }
            />
          </FieldTypeGroup>
          <ParamTextField>
            <TextField
              label={'Symbol'}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            />
          </ParamTextField>
        </FieldsGroup>
        {(contract === 'HISTORY' || contract === 'AUTO') && (
          <FieldsGroup>
            <ParamTextField>
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
            </ParamTextField>

            <ParamTextField>
              <OrderSourceWrapper>
                <Checkbox
                  onChange={() => {
                    if (source === '') {
                      setSource('DEFAULT')
                    } else {
                      setSource('')
                    }
                  }}
                  checked={source !== ''}
                  label="Source"
                />
                {source !== '' && (
                  <OrderSourceSelect
                    label={'Source'}
                    value={source}
                    placement="left"
                    onChange={(value) => setSource(value)}
                    options={FEED_ORDER_SOURCE}
                    description={
                      <>
                        Detailed information{' '}
                        <a
                          href="https://kb.dxfeed.com/en/data-model/qd-model-of-market-events.html#order-x"
                          rel="noreferrer"
                          target="_blank"
                        >
                          kb.dxfeed.com
                        </a>
                      </>
                    }
                  />
                )}
              </OrderSourceWrapper>
            </ParamTextField>
          </FieldsGroup>
        )}
        <Actions>
          <ActionGroup>
            <Button type="submit" kind={'outline'}>
              Add
            </Button>
          </ActionGroup>
          <ActionGroup>
            <Button type="button" onClick={handleRemove} kind={'outline'}>
              Remove
            </Button>
          </ActionGroup>
          <Button type="button" onClick={handleReset} color={'accent'}>
            Reset
          </Button>
        </Actions>
      </form>
    </ContentTemplate>
  )
}
