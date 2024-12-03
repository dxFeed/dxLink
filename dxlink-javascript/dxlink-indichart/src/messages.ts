import type { DXLinkChannelMessage } from '@dxfeed/dxlink-core'

export interface DXLinkChartIndicator {
  readonly lang: string
  readonly content: string
}

export interface DXLinkChartIndicators {
  readonly [key: string]: DXLinkChartIndicator
}

export interface DXLinkChartChannelParameters {
  readonly indicators: DXLinkChartIndicators
}

export type JSONNumber = number | 'NaN' | 'Infinity' | '-Infinity'

export interface DXLinkChartSubscription {
  readonly symbol: string
  readonly fromTime: number
}

export interface DXLinkChartIndicatorsParameters {
  readonly [key: string]: {
    readonly [key: string]: number | string | boolean
  }
}

export interface DXLinkChartIndicatorParameterMeta {
  readonly type: 'number' | 'double' | 'string' | 'boolean'
  readonly default: number | string | boolean
  readonly name: string
}

export interface DXLinkChartIndicatorEnabled {
  readonly enabled: true
  readonly inParameters: DXLinkChartIndicatorParameterMeta[]
  readonly outParameters: DXLinkChartIndicatorParameterMeta[]
}

export interface DXLinkChartIndicatorDisabled {
  enabled: false
  error: string
}

export type DXLinkChartIndicatorState = DXLinkChartIndicatorEnabled | DXLinkChartIndicatorDisabled

export interface DXLinkChartIndicatorsStates {
  readonly [key: string]: DXLinkChartIndicatorState
}

export interface DXLinkChartIndicatorsMessage {
  readonly type: 'INDICHART_INDICATORS'
  readonly indicators: DXLinkChartIndicatorsStates
}

export interface DXLinkChartSubscriptionMessage {
  readonly type: 'INDICHART_SUBSCRIPTION'
  readonly subscription: DXLinkChartSubscription
  readonly indicatorsParameters: DXLinkChartIndicatorsParameters
}

export interface DXLinkChartSetup {
  readonly acceptAggregationPeriod: number
  readonly acceptDataFormat: 'FULL'
  readonly acceptCandleFields: string[]
}

export interface DXLinkChartSetupMessage extends DXLinkChartSetup {
  readonly type: 'INDICHART_SETUP'
}

export interface DXLinkChartConfig {
  readonly aggregationPeriod: number
  readonly dataFormat: 'FULL'
  readonly candleFields: string[]
}

export interface DXLinkChartConfigMessage extends DXLinkChartConfig {
  readonly type: 'INDICHART_CONFIG'
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

export type DXLinkChartIndicatorsDataValue = JSONNumber | string | boolean

export interface DXLinkChartIndicatorsData {
  // Indicator name
  readonly [key: string]: {
    // Outputs of the indicator
    readonly [key: string]: DXLinkChartIndicatorsDataValue[]
  }
}

export interface DXLinkChartDataMessage {
  readonly type: 'INDICHART_DATA'
  readonly reset?: boolean
  readonly pending?: boolean
  readonly candles: DXLinkChartCandle[]
  readonly indicators: DXLinkChartIndicatorsData
}

export interface DXLinkChartIndicatorsRemoveMessage {
  readonly type: 'INDICHART_INDICATORS_REMOVE'
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
  message.type === 'INDICHART_DATA' ||
  message.type === 'INDICHART_INDICATORS' ||
  message.type === 'INDICHART_CONFIG'
