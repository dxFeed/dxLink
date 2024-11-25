import type { DXLinkChannelMessage } from '@dxfeed/dxlink-core'

export interface DXLinkChartIndicator {
  lang: string
  content: string
}

export interface DXLinkChartIndicators {
  [key: string]: DXLinkChartIndicator
}

export interface DXLinkChartChannelParameters {
  indicators: DXLinkChartIndicators
}

export type JSONNumber = number | 'NaN' | 'Infinity' | '-Infinity'

export interface DXLinkChartSubscription {
  readonly symbol: string
  readonly fromTime: number
}

export interface DXLinkChartIndicatorsParameters {
  [key: string]: {
    [key: string]: number
  }
}

export interface DXLinkChartIndicatorParameterMeta {
  type: 'number' | 'double' | 'string' | 'boolean'
  default: number | string | boolean
  name: string
}

export interface DXLinkChartIndicatorEnabled {
  enabled: true
  inParameters: DXLinkChartIndicatorParameterMeta[]
  outParameters: DXLinkChartIndicatorParameterMeta[]
}

export interface DXLinkChartIndicatorDisabled {
  enabled: true
  error: string
}

export type DXLinkChartIndicatorState = DXLinkChartIndicatorEnabled | DXLinkChartIndicatorDisabled

export interface DXLinkChartIndicatorsStates {
  [key: string]: DXLinkChartIndicatorState
}

export interface DXLinkChartIndicatorsMessage {
  type: 'CHART_INDICATORS'
  indicators: DXLinkChartIndicatorsStates
}

export interface DXLinkChartSubscriptionMessage {
  readonly type: 'CHART_SUBSCRIPTION'
  readonly subscription: DXLinkChartSubscription
  readonly indicatorsParameters: DXLinkChartIndicatorsParameters
}

export interface DXLinkChartSetup {
  readonly acceptAggregationPeriod: number
  readonly acceptDataFormat: 'FULL'
  readonly acceptCandleFields: string[]
}

export interface DXLinkChartSetupMessage extends DXLinkChartSetup {
  readonly type: 'CHART_SETUP'
}

export interface DXLinkChartConfig {
  readonly aggregationPeriod: number
  readonly dataFormat: 'FULL'
  readonly candleFields: string[]
}

export interface DXLinkChartConfigMessage extends DXLinkChartConfig {
  readonly type: 'CHART_CONFIG'
}

export interface DXLinkChartCandle {
  readonly eventSymbol: string
  readonly index: number
  readonly time: number
  readonly open: JSONNumber
  readonly high: JSONNumber
  readonly low: JSONNumber
  readonly close: JSONNumber
  readonly volume: JSONNumber
}

export interface DXLinkChartIndicatorsData {
  // Indicator name
  [key: string]: {
    // Outputs of the indicator
    [key: string]: JSONNumber[]
  }
}

export interface DXLinkChartDataMessage {
  readonly type: 'CHART_DATA'
  reset?: boolean
  pending?: boolean
  candles: DXLinkChartCandle[]
  indicators: DXLinkChartIndicatorsData
}

export interface DXLinkChartIndicatorsRemoveMessage {
  readonly type: 'CHART_INDICATORS_REMOVE'
  readonly indicators: string[]
}

export type ChartInboundMessage =
  | DXLinkChartIndicatorsMessage
  | DXLinkChartConfigMessage
  | DXLinkChartDataMessage

export type ChartOutboundMessage =
  | DXLinkChartSubscriptionMessage
  | DXLinkChartSetupMessage
  | DXLinkChartIndicatorsRemoveMessage

export const isChartInboundMessage = (
  message: DXLinkChannelMessage
): message is ChartInboundMessage =>
  message.type === 'CHART_DATA' ||
  message.type === 'CHART_INDICATORS' ||
  message.type === 'CHART_CONFIG'
