import {
  type DXLinkIndiChartIndicator,
  type DXLinkIndiChartIndicatorParameterMeta,
  type DXLinkIndiChartIndicatorsParameters,
  type DXLinkIndiChartSubscription,
} from '@dxfeed/dxlink-api'
import { unit } from '@dxfeed/ui-kit/utils'
import {
  IndiChart as IndiChartBase,
  type IndiChartHandle,
  type IndiChartStatus,
  type IndiChartProps,
} from '@dxscript/dxlink-dxcharts-lite'
import { useRef, useState } from 'react'
import styled from 'styled-components'

import { ParameterFieldContainer } from './parameter-field-container'
import { ScriptCandlesSubscription } from './script-candles-subscription'
import { ChartHolder } from '../chart-wrapper'
import { ContentTemplate } from '../common/content-template'

const IndiChart: React.ForwardRefExoticComponent<IndiChartProps & React.RefAttributes<IndiChartHandle>> =
  IndiChartBase as any

const Group = styled.div`
  padding-bottom: ${unit(1.5)};
`

const CHART_SURFACE_CLASS = 'indichart-surface'

const ChartContainer = styled.div`
  width: 100%;
  height: 600px;
  border: 1px solid ${({ theme }) => theme.palette.separator.primary};

  .${CHART_SURFACE_CLASS} {
    width: 100%;
    height: 100%;
  }
`

const ChartGroup = styled.div<{ available: boolean }>`
  visibility: ${(props) => (props.available ? 'visible' : 'hidden')};
  height: ${(props) => (props.available ? 'auto' : '0')};
  overflow: ${(props) => (props.available ? 'visible' : 'hidden')};
`

const Powered = styled.div`
  text-align: right;
  padding-top: ${unit(1)};
  color: ${({ theme }) => theme.palette.secondary.main};
  ${(p) => p.theme.typography.body.regular[3]}
`

const StatusLabel = styled.span`
  display: block;
  margin-bottom: ${unit(0.5)};
  font-size: 0.75rem;
  color: ${({ theme }) => theme.palette.secondary.main};
`

interface ScriptCandlesChannelManagerProps {
  channel: ChartHolder
}

const STATUS_LABELS: Record<IndiChartStatus, string> = {
  idle: '',
  loading: 'Loading chart data…',
  ready: '',
  error: 'Chart error',
}

export function ScriptCandlesChannelManager({ channel }: ScriptCandlesChannelManagerProps) {
  const [available, setAvailable] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [inParameters, setInParameters] = useState<DXLinkIndiChartIndicatorParameterMeta[]>([])
  const [statusLabel, setStatusLabel] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const chartRef = useRef<IndiChartHandle>(null)

  const handleIndicatorError = (err: string | null) => {
    setError(err ?? undefined)
  }

  const handleStatusChange = (status: IndiChartStatus) => {
    setStatusLabel(STATUS_LABELS[status])
    if (status === 'ready') {
      setAvailable(true)
    }
  }

  const handleSet = (sub: DXLinkIndiChartSubscription, indicator: DXLinkIndiChartIndicator) => {
    setError(undefined)

    chartRef.current?.reset()
    setResetKey((k) => k + 1)

    channel.update(
      sub,
      indicator,
      (candles, indicators, dataType) => {
        chartRef.current?.pushData(candles, indicators, dataType)
      },
      (params) => setInParameters(params),
      setError
    )
  }

  const handleOnApply = (values: DXLinkIndiChartIndicatorsParameters[string]) => {
    channel.getChart()?.updateIndicatorsParameters({ current: values })
  }

  const handleReset = () => {
    channel.clear()
    chartRef.current?.reset()
    setInParameters([])
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
          {statusLabel && <StatusLabel>{statusLabel}</StatusLabel>}
          <ChartContainer>
            <IndiChart
              ref={chartRef}
              className={CHART_SURFACE_CLASS}
              resetKey={resetKey}
              onIndicatorError={handleIndicatorError}
              onStatusChange={handleStatusChange}
            />
          </ChartContainer>
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
