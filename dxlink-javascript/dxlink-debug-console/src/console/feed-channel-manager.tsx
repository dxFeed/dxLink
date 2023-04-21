import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { unit } from '@dxfeed/ui-kit/utils'
import { Button } from '@dxfeed/ui-kit/Button'
import { TextField } from '@dxfeed/ui-kit/TextField'
import {
  EventData,
  EventFields,
  FeedChannel,
  FeedDataFormat,
  OrderBookSubscription,
  RegularSubscription,
  SubscriptionAction,
  TimeSeriesSubscription,
} from '@dxfeed/dxlink-websocket-client'
import { ContentTemplate } from '../common/content-template'
import { FeedData } from './feed-data'
import { FeedSubscription } from './feed-subscriptions'
import { useObservable } from '../use-observable'
import { FeedEventFields } from './feed-event-fields'
import { Select } from '../common/select'

const ConfigSetupGroup = styled.form`
  display: flex;
  padding-right: ${unit(1)};
  width: 50%;
`

const ConfigGroup = styled.div`
  display: flex;
  padding-bottom: ${unit(1.5)};
`

const ConfigGroupActions = styled.div`
  display: flex;
  justify-content: flex-end;
  width: 100%;
`

const CurrentConfigGroup = styled.div`
  display: flex;
  padding-left: ${unit(1)};
  width: 50%;
`

const FieldWrapper = styled.div`
  padding: ${unit(1.5)} 0;
`

const DataFormatSelect = styled(Select)`
  width: 100%;
`

interface FeedChannelmanagerProps {
  channel: FeedChannel
}

type Action = SubscriptionAction<
  RegularSubscription | TimeSeriesSubscription | OrderBookSubscription
>

const DATA_FORMATS = ['FULL', 'COMPACT']

const DEFAULT_EVENT_FIELDS = ['eventType', 'eventSymbol']

export function FeedChannelManager({ channel }: FeedChannelmanagerProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  const [acceptAggregetionPeriod, setAcceptAggregetionPeriod] = useState<string>('1')
  const [acceptEventFields, setAcceptEventFields] = useState<EventFields>({})
  const [acceptDataFormat, setAcceptDataFormat] = useState<FeedDataFormat>('FULL')

  const config = useObservable(channel.config, null)

  const [eventData, setEventData] = useState<Record<string, Record<string, EventData>>>({})

  const handleSetup = () => {
    const finalAcceptEventFields = Object.keys(acceptEventFields).reduce<EventFields>(
      (acc, field) => {
        const fields = acceptEventFields[field].filter(Boolean)

        if (fields.length > 0) {
          return {
            ...acc,
            [field]: DEFAULT_EVENT_FIELDS.concat(
              fields.filter((field) => field !== 'eventType' && field !== 'eventSymbol')
            ),
          }
        }

        return acc
      },
      {}
    )

    channel.setup({
      acceptAggregationPeriod:
        acceptAggregetionPeriod === '' ? undefined : Number(acceptAggregetionPeriod),
      acceptDataFormat: acceptDataFormat,
      acceptEventFields: finalAcceptEventFields,
    })
  }

  useEffect(() => {
    const element = rootRef.current
    if (element !== null) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  const handleSubscription = (action: Action) => {
    if (action.reset) {
      setEventData({})
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channel.subscription(action as any)
  }

  const eventFields = config?.eventFields

  useEffect(() => {
    const subscription = channel.data.subscribe((events) => {
      setEventData((prev) => {
        const data = { ...prev }
        for (const event of events) {
          if ('eventType' in event && 'eventSymbol' in event) {
            const eventType = String(event.eventType)
            const eventSymbol = String(event.eventSymbol)
            data[eventType] = prev[eventType] ?? {}
            data[eventType][eventSymbol] = event
          } else {
            console.error('Unmatched event', event)
            data['unknown'] = prev['unknown'] ?? []
            data['unknown']['unknown'] = event
          }
        }
        return data
      })
    })
    return () => subscription.unsubscribe()
  }, [channel.data])

  return (
    <>
      <ConfigGroup ref={rootRef}>
        <ConfigSetupGroup
          onSubmit={(e) => {
            e.preventDefault()
            handleSetup()
          }}
        >
          <ContentTemplate title={'Setup'} kind="primary">
            <FieldWrapper>
              <TextField
                label={'Accept agregation period, s'}
                value={acceptAggregetionPeriod}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === '') {
                    setAcceptAggregetionPeriod('')
                  }
                  const numberValue = Number(value.endsWith('.') ? value.concat('0') : value)
                  if (Number.isNaN(numberValue) || numberValue < 0) {
                    return
                  }
                  setAcceptAggregetionPeriod(value)
                }}
              />
            </FieldWrapper>
            <FieldWrapper>
              <DataFormatSelect
                label={'Accept data format'}
                value={acceptDataFormat}
                options={DATA_FORMATS}
                onChange={(v) => setAcceptDataFormat(v as FeedDataFormat)}
              />
            </FieldWrapper>

            <FieldWrapper>
              <FeedEventFields
                label={'Accept event fields'}
                description={'Specify the fields, separated by commas (,)'}
                value={acceptEventFields}
                onChange={setAcceptEventFields}
              />
            </FieldWrapper>

            <ConfigGroupActions>
              <Button type="submit" color={'primary'} kind={'outline'}>
                Setup
              </Button>
            </ConfigGroupActions>
          </ContentTemplate>
        </ConfigSetupGroup>
        <CurrentConfigGroup>
          <ContentTemplate title={'Config'} kind="primary">
            <FieldWrapper>
              <TextField
                label={'Agregation period, s'}
                value={config?.aggregationPeriod?.toString() ?? ''}
                readOnly
                disabled
              />
            </FieldWrapper>

            <FieldWrapper>
              <TextField label={'Data format'} value={config?.dataFormat ?? ''} readOnly disabled />
            </FieldWrapper>

            <FieldWrapper>
              <FeedEventFields label={'Event fields'} value={config?.eventFields} readOnly />
            </FieldWrapper>
          </ContentTemplate>
        </CurrentConfigGroup>
      </ConfigGroup>

      <FeedSubscription contract={channel.contract} onAction={handleSubscription} />

      {eventFields && <FeedData eventFields={eventFields} data={eventData} />}
    </>
  )
}
