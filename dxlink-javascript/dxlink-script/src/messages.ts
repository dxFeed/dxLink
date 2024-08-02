import type { DXLinkChannelMessage } from '@dxfeed/dxlink-core'

export enum DepthOfMarketDataFormat {
  'FULL' = 'FULL',
}

type JSONNumber = number | 'NaN' | 'Infinity' | '-Infinity'

export interface ScriptSubscription {
  readonly type: 'Candle'
  readonly symbol: string
  readonly fromTime: number
}

export interface ScriptSetup {
  readonly subscription: ScriptSubscription
  readonly script: string
}

export interface ScriptSetupMessage extends ScriptSetup {
  readonly type: 'SCRIPT_SETUP'
}

export interface DXLinkScriptCandle {
  eventType: 'Candle'
  // TODO: values of candle fields
  result: Record<string, string | JSONNumber | undefined>
}

export interface ScriptDataMessage {
  readonly type: 'SCRIPT_DATA'
  readonly data: DXLinkScriptCandle[]
}

export type ScriptMessage = ScriptDataMessage

export const isScriptMessage = (message: DXLinkChannelMessage): message is ScriptMessage =>
  message.type === 'SCRIPT_DATA'
