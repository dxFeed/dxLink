import {
  DXLinkDepthOfMarket,
  type DepthOfMarketConfig,
  type DepthOfMarketOrder,
} from '@dxfeed/dxlink-api'
import { Button } from '@dxfeed/ui-kit/Button'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { unit } from '@dxfeed/ui-kit/utils'
import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import { DomSnapshot, type DomSnapshotData } from './dom-snapshot'
import { FieldWrapper, FormActions } from './forms'
import { ContentTemplate } from '../common/content-template'

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

interface DomChannelmanagerProps {
  channel: DXLinkDepthOfMarket
}

export function DomChannelManager({ channel }: DomChannelmanagerProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  const [acceptAggregetionPeriod, setAcceptAggregetionPeriod] = useState<string>('1')
  const [acceptDepthLimit, setDepthLimit] = useState<string>('10')

  const [config, setConfig] = useState<DepthOfMarketConfig>()
  const [domSnapshot, setDomSnapshot] = useState<DomSnapshotData | undefined>()

  useEffect(() => {
    const configListener = (config: DepthOfMarketConfig) => {
      setConfig(config)
    }

    const snapshotListener = (
      time: number,
      bids: DepthOfMarketOrder[],
      asks: DepthOfMarketOrder[]
    ) => {
      setDomSnapshot({
        time,
        bids,
        asks,
      })
    }

    channel.addSnapshotListener(snapshotListener)
    channel.addConfigChangeListener(configListener)
    return () => {
      channel.removeConfigChangeListener(configListener)
      channel.removeSnapshotListener(snapshotListener)
    }
  }, [channel])

  const handleSetup = () => {
    channel.configure({
      acceptAggregationPeriod:
        acceptAggregetionPeriod === '' ? undefined : Number(acceptAggregetionPeriod),
      acceptDepthLimit: acceptDepthLimit === '' ? undefined : Number(acceptDepthLimit),
    })
  }

  useEffect(() => {
    const element = rootRef.current
    if (element !== null) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

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
              <TextField
                label={'Accept depth limit'}
                value={acceptDepthLimit}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === '') {
                    setDepthLimit('')
                  }
                  const numberValue = Number(value.split('.')[0])
                  if (Number.isNaN(numberValue) || numberValue < 0) {
                    return
                  }
                  setDepthLimit(value)
                }}
              />
            </FieldWrapper>

            <FieldWrapper>
              <TextField label={'Accept Order fields'} title="Not available" disabled readOnly />
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
              <TextField
                label={'Depth limit'}
                value={config?.depthLimit?.toString() ?? ''}
                readOnly
                disabled
              />
            </FieldWrapper>
            <FieldWrapper>
              <TextField
                label={'Order fields'}
                value={config?.orderFields?.toString() ?? ''}
                readOnly
                disabled
              />
            </FieldWrapper>
          </ContentTemplate>
        </CurrentConfigGroup>
      </ConfigGroup>

      <DomSnapshot data={domSnapshot} />
    </>
  )
}
