import {
  type DXLinkIndiChartIndicator,
  type DXLinkIndiChartIndicatorParameterMeta,
  type DXLinkIndiChartIndicatorsParameters,
  type DXLinkIndiChartSubscription,
} from '@dxfeed/dxlink-api'
import { unit } from '@dxfeed/ui-kit/utils'
import { IndiChart, type IndiChartHandle } from '@dxscript/dxlink-dxcharts-lite'
import { useRef, useState } from 'react'
import styled from 'styled-components'

import { ParameterFieldContainer } from './parameter-field-container'
import { ScriptCandlesSubscription } from './script-candles-subscription'
import type { ChartHolder } from '../chart-wrapper'
import { ContentTemplate } from '../common/content-template'

const ChartContainer = styled(IndiChart)`
  width: 100%;
  height: 600px;
  border: 1px solid ${({ theme }) => theme.palette.separator.primary};
`

const Group = styled.div`
  padding-bottom: ${unit(1.5)};
`

const ChartGroup = styled.div<{ available: boolean }>`
  display: ${(props) => (props.available ? 'block' : 'none')};
`

const Powered = styled.div`
  text-align: right;
  padding-top: ${unit(1)};
  color: ${({ theme }) => theme.palette.secondary.main};
  ${(p) => p.theme.typography.body.regular[3]}
`

interface ScriptCandlesChannelManagerProps {
  channel: ChartHolder
}

export function ScriptCandlesChannelManager({ channel }: ScriptCandlesChannelManagerProps) {
  const [available, setAvailable] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [inParameters, setInParameters] = useState<DXLinkIndiChartIndicatorParameterMeta[]>([])
  const chartRef = useRef<IndiChartHandle>(null)

  const handleSet = (
    subscription: DXLinkIndiChartSubscription,
    indicator: DXLinkIndiChartIndicator
  ) => {
    setError(undefined)
    setAvailable(false)
    setInParameters([])
    chartRef.current?.reset()

    channel.update(
      subscription,
      indicator,
      (candles, indicators, dataType) => {
        chartRef.current?.pushData(candles, indicators, dataType)

        if (dataType === 'candles' && candles.length > 0) {
          setAvailable(true)
        }
      },
      (params) => setInParameters(params),
      (nextError) => setError(nextError)
    )
  }

  const handleOnApply = (values: DXLinkIndiChartIndicatorsParameters[string]) => {
    channel.getChart()?.updateIndicatorsParameters({ current: values })
  }

  const handleReset = () => {
    channel.clear()
    chartRef.current?.reset()
    setInParameters([])
    setError(undefined)
    setAvailable(false)
  }

  return (
    <>
      <Group>
        <ScriptCandlesSubscription onSet={handleSet} onReset={handleReset} error={error} />{' '}
      </Group>

      {inParameters.length > 0 && available && (
        <ContentTemplate title={'Input Parameters'}>
          <ParameterFieldContainer parameters={inParameters} onApply={handleOnApply} />
        </ContentTemplate>
      )}

      {inParameters.length > 0 && <div style={{ height: '16px' }} />}

      <ChartGroup available={available}>
        <ContentTemplate title={'Chart'}>
          <ChartContainer
            ref={chartRef}
            onIndicatorError={(chartError) => setError(chartError ?? undefined)}
          />
          <Powered>
            Chart powered by{' '}
            <a href="https://devexperts.com/dxcharts/" target="_blank" rel="noreferrer">
              DXCharts
            </a>
          </Powered>
        </ContentTemplate>
      </ChartGroup>
    </>
  )
}
