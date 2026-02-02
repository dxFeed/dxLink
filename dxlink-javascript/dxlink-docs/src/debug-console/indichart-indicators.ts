export interface IndichartIndicatorExample {
  id: string
  docUrl?: string
}

export type Lang = 'js'

export const INDICHART_INDICATROS = window.INDICHART_INDICATROS || {
  js: {},
}

export const INDICHART_INDICATOR_EXAMPLES = window.INDICHART_INDICATOR_EXAMPLES || []

declare global {
  interface Window {
    INDICHART_INDICATOR_EXAMPLES?: IndichartIndicatorExample[]
    INDICHART_INDICATROS?: Record<string, Record<string, string>>
  }
}
