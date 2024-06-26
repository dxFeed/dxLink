import {
  type DXLinkFeed,
  type FeedConfig,
  FeedContract,
  FeedDataFormat,
  type FeedEventData,
  type FeedEventFields,
} from '@dxfeed/dxlink-api'
import { Button } from '@dxfeed/ui-kit/Button'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { unit } from '@dxfeed/ui-kit/utils'
import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import { FeedData } from './feed-data'
import { FeedEventFieldsView } from './feed-event-fields'
import { FeedSubscription } from './feed-subscriptions'
import { FieldWrapper, FormActions } from './forms'
import { ContentTemplate } from '../common/content-template'
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

const CurrentConfigGroup = styled.div`
  display: flex;
  padding-left: ${unit(1)};
  width: 50%;
`

const DataFormatSelect = styled(Select)`
  width: 100%;
`

interface FeedChannelmanagerProps {
  channel: DXLinkFeed<FeedContract>
}

const DATA_FORMATS = ['FULL', 'COMPACT']

const DEFAULT_EVENT_FIELDS = ['eventType', 'eventSymbol']

export function FeedChannelManager({ channel }: FeedChannelmanagerProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  const [acceptAggregetionPeriod, setAcceptAggregetionPeriod] = useState<string>('1')
  const [acceptEventFields, setAcceptEventFields] = useState<FeedEventFields>({})
  const [acceptDataFormat, setAcceptDataFormat] = useState<FeedDataFormat>(FeedDataFormat.COMPACT)

  const [config, setConfig] = useState<FeedConfig>()

  useEffect(() => {
    const configListener = (config: FeedConfig) => {
      setConfig(config)
    }
    channel.addConfigChangeListener(configListener)
    return () => channel.removeConfigChangeListener(configListener)
  }, [channel])

  const [eventData, setEventData] = useState<Record<string, Record<string, FeedEventData>>>({})

  const handleSetup = () => {
    const finalAcceptEventFields = Object.keys(acceptEventFields).reduce<FeedEventFields>(
      (acc, field) => {
        const fields = acceptEventFields[field]?.filter(Boolean)

        if (fields !== undefined && fields.length > 0) {
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

    channel.configure({
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

  const eventFields = config?.eventFields

  useEffect(() => {
    const eventListener = (events: FeedEventData[]) => {
      setEventData((prev) => {
        const data = { ...prev }
        for (const event of events) {
          if ('eventType' in event && 'eventSymbol' in event) {
            const eventType = String(event.eventType)
            const eventSymbol =
              String(event.eventSymbol) + ('source' in event ? `#${String(event.source)}` : '')
            const group = prev[eventType] ?? {}
            group[eventSymbol] = event
            data[eventType] = group
          } else {
            console.error('Unmatched event', event)
            const group = prev['unknown'] ?? {}
            group['unknown'] = event
            data['unknown'] = group
          }
        }
        return data
      })
    }
    channel.addEventListener(eventListener)
    return () => channel.removeEventListener(eventListener)
  }, [channel])

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
              <FeedEventFieldsView
                label={'Accept event fields'}
                description={'Specify the fields, separated by commas (,)'}
                value={acceptEventFields}
                placement="right"
                onChange={setAcceptEventFields}
              />
            </FieldWrapper>

            <FormActions>
              <Button type="submit" color={'primary'} kind={'outline'}>
                Setup
              </Button>
            </FormActions>
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
              <FeedEventFieldsView
                label={'Event fields'}
                value={config?.eventFields}
                readOnly
                placement="left"
              />
            </FieldWrapper>
          </ContentTemplate>
        </CurrentConfigGroup>
      </ConfigGroup>

      <FeedSubscription
        contract={channel.contract}
        onAdd={channel.addSubscriptions}
        onRemove={channel.removeSubscriptions}
        onReset={channel.clearSubscriptions}
      />

      {eventFields && <FeedData eventFields={eventFields} data={eventData} />}
    </>
  )
}
