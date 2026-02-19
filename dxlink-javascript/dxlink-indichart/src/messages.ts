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
  readonly name: string
  readonly type: 'DOUBLE' | 'STRING' | 'BOOL' | 'COLOR' | 'SOURCE' | 'SESSION' | 'MAP'
  readonly defaultValue: unknown
  readonly value?: unknown
  readonly options?: string[]
  readonly min?: number
  readonly max?: number
  readonly step?: number
}

export interface DXLinkIndiChartIndicatorEnabled {
  readonly enabled: true
  readonly inParameters: DXLinkIndiChartIndicatorParameterMeta[]
  readonly outParameters: DXLinkIndiChartIndicatorParameterMeta[]
}

export interface ScriptStackFrame {
  column: number
  functionName: string
  line: number
}

export interface ScriptError {
  endColumn: number
  endLine: number
  message: string
  scriptName: string
  scriptStack: ScriptStackFrame[]
  startColumn: number
  startLine: number
  type: string
}

export interface DXLinkIndiChartIndicatorDisabled {
  enabled: false
  scriptError?: ScriptError
  internalErrorMessage?: string
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

export interface DXLinkIndiChartColor {
  readonly value: string
  readonly alpha?: number
}

export interface DXLinkIndiChartSplinePoint {
  readonly value: JSONNumber
  readonly type?: string
  readonly offset?: number
  readonly title?: string
  readonly color?: DXLinkIndiChartColor
}

export interface DXLinkIndiChartCalculationResult {
  readonly output?: { [seriesName: string]: JSONNumber[] }
  readonly spline?: { [seriesIndex: string]: DXLinkIndiChartSplinePoint[] }
}

export interface DXLinkIndiChartIndicatorsData {
  readonly [indicatorName: string]: DXLinkIndiChartCalculationResult
}

// New message type for candle snapshots
export interface DXLinkIndiChartCandleSnapshotMessage {
  readonly type: 'INDICHART_CANDLE_SNAPSHOT'
  readonly reset: boolean
  readonly pending: boolean
  readonly candles: DXLinkIndiChartCandle[]
}

// New message type for indicator snapshots
export interface DXLinkIndiChartIndicatorsSnapshotMessage {
  readonly type: 'INDICHART_INDICATORS_SNAPSHOT'
  readonly pending: boolean
  readonly indicators: DXLinkIndiChartIndicatorsData
}

// Message type for data updates (no reset flag - reset is only in INDICHART_CANDLE_SNAPSHOT)
export interface DXLinkIndiChartUpdateMessage {
  readonly type: 'INDICHART_UPDATE'
  readonly pending: boolean
  readonly candles: DXLinkIndiChartCandle[]
  readonly indicators: DXLinkIndiChartIndicatorsData
}

// Renamed from INDICHART_INDICATORS_REMOVE to INDICHART_REMOVE_INDICATORS
export interface DXLinkIndiChartRemoveIndicatorsMessage {
  readonly type: 'INDICHART_REMOVE_INDICATORS'
  readonly indicators: string[]
}

export type ChartInboundMessage =
  | DXLinkIndiChartIndicatorsMessage
  | DXLinkIndiChartConfigMessage
  | DXLinkIndiChartUpdateMessage
  | DXLinkIndiChartCandleSnapshotMessage
  | DXLinkIndiChartIndicatorsSnapshotMessage

export type ChartOutboundMessage =
  | DXLinkIndiChartSubscriptionMessage
  | DXLinkIndiChartSetupMessage
  | DXLinkIndiChartRemoveIndicatorsMessage

export const isChartInboundMessage = (
  message: DXLinkChannelMessage
): message is ChartInboundMessage =>
  message.type === 'INDICHART_UPDATE' ||
  message.type === 'INDICHART_INDICATORS' ||
  message.type === 'INDICHART_CONFIG' ||
  message.type === 'INDICHART_CANDLE_SNAPSHOT' ||
  message.type === 'INDICHART_INDICATORS_SNAPSHOT'
