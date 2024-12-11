import type { DXLinkChannelMessage } from '@dxfeed/dxlink-core'

export interface DXLinkIndiChartIndicator {
  readonly lang: string
  readonly content: string
}

export interface DXLinkIndiChartIndicators {
  readonly [key: string]: DXLinkIndiChartIndicator
}

export interface DXLinkIndiChartChannelParameters {
  readonly indicators: DXLinkIndiChartIndicators
}

export type JSONNumber = number | 'NaN' | 'Infinity' | '-Infinity'

export interface DXLinkIndiChartSubscription {
  readonly symbol: string
  readonly fromTime: number
}

export interface DXLinkIndiChartIndicatorsParameters {
  readonly [key: string]: {
    readonly [key: string]: number | string | boolean
  }
}

export interface DXLinkIndiChartIndicatorParameterMeta {
  readonly type: 'number' | 'double' | 'string' | 'boolean'
  readonly default: number | string | boolean
  readonly name: string
}

export interface DXLinkIndiChartIndicatorEnabled {
  readonly enabled: true
  readonly inParameters: DXLinkIndiChartIndicatorParameterMeta[]
  readonly outParameters: DXLinkIndiChartIndicatorParameterMeta[]
}

export interface DXLinkIndiChartIndicatorDisabled {
  enabled: false
  error: string
}

export type DXLinkIndiChartIndicatorState =
  | DXLinkIndiChartIndicatorEnabled
  | DXLinkIndiChartIndicatorDisabled

export interface DXLinkIndiChartIndicatorsStates {
  readonly [key: string]: DXLinkIndiChartIndicatorState
}

export interface DXLinkIndiChartIndicatorsMessage {
  readonly type: 'INDICHART_INDICATORS'
  readonly indicators: DXLinkIndiChartIndicatorsStates
}

export interface DXLinkIndiChartSubscriptionMessage {
  readonly type: 'INDICHART_SUBSCRIPTION'
  readonly subscription: DXLinkIndiChartSubscription
  readonly indicatorsParameters: DXLinkIndiChartIndicatorsParameters
}

export interface DXLinkIndiChartSetup {
  readonly acceptAggregationPeriod: number
  readonly acceptDataFormat: 'FULL'
  readonly acceptCandleFields: string[]
}

export interface DXLinkIndiChartSetupMessage extends DXLinkIndiChartSetup {
  readonly type: 'INDICHART_SETUP'
}

export interface DXLinkIndiChartConfig {
  readonly aggregationPeriod: number
  readonly dataFormat: 'FULL'
  readonly candleFields: string[]
}

export interface DXLinkIndiChartConfigMessage extends DXLinkIndiChartConfig {
  readonly type: 'INDICHART_CONFIG'
}

export interface DXLinkIndiChartCandle {
  readonly eventSymbol: string
  readonly index: number
  readonly time: number
  readonly open: JSONNumber
  readonly high: JSONNumber
  readonly low: JSONNumber
  readonly close: JSONNumber
  readonly volume: JSONNumber
}

export type DXLinkIndiChartIndicatorsDataValue = JSONNumber | string | boolean

export interface DXLinkIndiChartIndicatorsData {
  // Indicator name
  readonly [key: string]: {
    // Outputs of the indicator
    readonly [key: string]: DXLinkIndiChartIndicatorsDataValue[]
  }
}

export interface DXLinkIndiChartDataMessage {
  readonly type: 'INDICHART_DATA'
  readonly reset?: boolean
  readonly pending?: boolean
  readonly candles: DXLinkIndiChartCandle[]
  readonly indicators: DXLinkIndiChartIndicatorsData
}

export interface DXLinkIndiChartIndicatorsRemoveMessage {
  readonly type: 'INDICHART_INDICATORS_REMOVE'
  readonly indicators: string[]
}

export type ChartInboundMessage =
  | DXLinkIndiChartIndicatorsMessage
  | DXLinkIndiChartConfigMessage
  | DXLinkIndiChartDataMessage

export type ChartOutboundMessage =
  | DXLinkIndiChartSubscriptionMessage
  | DXLinkIndiChartSetupMessage
  | DXLinkIndiChartIndicatorsRemoveMessage

export const isChartInboundMessage = (
  message: DXLinkChannelMessage
): message is ChartInboundMessage =>
  message.type === 'INDICHART_DATA' ||
  message.type === 'INDICHART_INDICATORS' ||
  message.type === 'INDICHART_CONFIG'
