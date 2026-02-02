/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import ace from 'ace-builds/src-noconflict/ace'
import 'ace-builds/src-noconflict/ext-language_tools'
import 'ace-builds/src-noconflict/mode-text'
import 'ace-builds/src-noconflict/mode-javascript'

const TextMode = ace.require('ace/mode/text').Mode
const JavaScriptMode = ace.require('ace/mode/javascript').Mode
const MatchingBraceOutdent = ace.require('ace/mode/matching_brace_outdent').MatchingBraceOutdent
const CstyleBehaviour = ace.require('ace/mode/behaviour/cstyle').CstyleBehaviour
const CstyleFoldMode = ace.require('ace/mode/folding/cstyle').FoldMode
const TextHighlightRules = ace.require('ace/mode/text_highlight_rules').TextHighlightRules
const langTools = ace.require('ace/ext/language_tools')

// Configure Ace base path for dynamic loading
ace.config.set('basePath', 'https://cdn.jsdelivr.net/npm/ace-builds@1.43.6/src-noconflict/')

const dxScriptCompletions = [
  // Candle
  { caption: 'eventType', value: 'eventType', meta: 'candle' },
  { caption: 'eventSymbol', value: 'eventSymbol', meta: 'candle' },
  { caption: 'eventTime', value: 'eventTime', meta: 'candle' },
  { caption: 'eventFlags', value: 'eventFlags', meta: 'candle' },
  { caption: 'index', value: 'index', meta: 'candle' },
  { caption: 'time', value: 'time', meta: 'candle' },
  { caption: 'sequence', value: 'sequence', meta: 'candle' },
  { caption: 'count', value: 'count', meta: 'candle' },
  { caption: 'open', value: 'open', meta: 'candle' },
  { caption: 'high', value: 'high', meta: 'candle' },
  { caption: 'low', value: 'low', meta: 'candle' },
  { caption: 'close', value: 'close', meta: 'candle' },
  { caption: 'volume', value: 'volume', meta: 'candle' },
  { caption: 'vwap', value: 'vwap', meta: 'candle' },
  { caption: 'bidVolume', value: 'bidVolume', meta: 'candle' },
  { caption: 'askVolume', value: 'askVolume', meta: 'candle' },
  { caption: 'impVolatility', value: 'impVolatility', meta: 'candle' },
  { caption: 'openInterest', value: 'openInterest', meta: 'candle' },

  // Keywords
  { caption: 'fun', value: 'fun', meta: 'keyword' },
  { caption: 'in', value: 'in', meta: 'keyword' },
  { caption: 'out', value: 'out', meta: 'keyword' },
  { caption: 'set', value: 'set', meta: 'keyword' },
  { caption: 'def', value: 'def', meta: 'keyword' },
  { caption: 'if', value: 'if', meta: 'keyword' },
  { caption: 'else', value: 'else', meta: 'keyword' },
  { caption: 'default', value: 'default', meta: 'keyword' },
  { caption: 'true', value: 'true', meta: 'keyword' },
  { caption: 'false', value: 'false', meta: 'keyword' },

  // Constants
  { caption: 'NaN', value: 'NaN', meta: 'constant' },
  { caption: 'E', value: 'E', meta: 'constant' },
  { caption: 'PI', value: 'PI', meta: 'constant' },

  // Functions
  { caption: 'abs', value: 'abs', meta: 'function' },
  { caption: 'acos', value: 'acos', meta: 'function' },
  { caption: 'asin', value: 'asin', meta: 'function' },
  { caption: 'atan', value: 'atan', meta: 'function' },
  { caption: 'cbrt', value: 'cbrt', meta: 'function' },
  { caption: 'ceil', value: 'ceil', meta: 'function' },
  { caption: 'cos', value: 'cos', meta: 'function' },
  { caption: 'cosh', value: 'cosh', meta: 'function' },
  { caption: 'ema', value: 'ema', meta: 'function' },
  { caption: 'exp', value: 'exp', meta: 'function' },
  { caption: 'floor', value: 'floor', meta: 'function' },
  { caption: 'log', value: 'log', meta: 'function' },
  { caption: 'log10', value: 'log10', meta: 'function' },
  { caption: 'max', value: 'max', meta: 'function' },
  { caption: 'maximum', value: 'maximum', meta: 'function' },
  { caption: 'min', value: 'min', meta: 'function' },
  { caption: 'minimum', value: 'minimum', meta: 'function' },
  { caption: 'pow', value: 'pow', meta: 'function' },
  { caption: 'random', value: 'random', meta: 'function' },
  { caption: 'signum', value: 'signum', meta: 'function' },
  { caption: 'sin', value: 'sin', meta: 'function' },
  { caption: 'sinh', value: 'sinh', meta: 'function' },
  { caption: 'sma', value: 'sma', meta: 'function' },
  { caption: 'sqrt', value: 'sqrt', meta: 'function' },
  { caption: 'sum', value: 'sum', meta: 'function' },
  { caption: 'tan', value: 'tan', meta: 'function' },
  { caption: 'tanh', value: 'tanh', meta: 'function' },
  { caption: 'totalSum', value: 'totalSum', meta: 'function' },
  { caption: 'wma', value: 'wma', meta: 'function' },
  { caption: 'all', value: 'all', meta: 'function' },
  { caption: 'any', value: 'any', meta: 'function' },
  { caption: 'contains', value: 'contains', meta: 'function' },
  { caption: 'endsWith', value: 'endsWith', meta: 'function' },
  { caption: 'indexOf', value: 'indexOf', meta: 'function' },
  { caption: 'isEmpty', value: 'isEmpty', meta: 'function' },
  { caption: 'isNaN', value: 'isNaN', meta: 'function' },
  { caption: 'isNotNaN', value: 'isNotNaN', meta: 'function' },
  { caption: 'meta', value: 'meta', meta: 'function' },
  { caption: 'prefetch', value: 'prefetch', meta: 'function' },
  { caption: 'size', value: 'size', meta: 'function' },
  { caption: 'startsWith', value: 'startsWith', meta: 'function' },
  { caption: 'tick', value: 'tick', meta: 'function' },
  { caption: 'toArray', value: 'toArray', meta: 'function' },
  { caption: 'toLowerCase', value: 'toLowerCase', meta: 'function' },
  { caption: 'toString', value: 'toString', meta: 'function' },
  { caption: 'toUpperCase', value: 'toUpperCase', meta: 'function' },
]

langTools.addCompleter({
  getCompletions: (_editor: any, _session: any, _pos: any, _prefix: any, callback: any) => {
    callback(null, dxScriptCompletions)
  },
})

class DxScriptHighlightRules extends TextHighlightRules {
  constructor() {
    super()

    const keywords = 'fun|in|out|set|def|if|else|default|true|false'

    const builtinConstants = 'NaN|E|PI'

    const builtinFunctions =
      'abs|acos|asin|atan|cbrt|ceil|cos|cosh|ema|exp|floor|log|log10|max|maximum|min|minimum|pow|random|signum|sin|sinh|sma|sqrt|sum|tan|tanh|totalSum|wma|all|any|contains|endsWith|indexOf|isEmpty|isNaN|isNotNaN|meta|prefetch|size|startsWith|tick|toArray|toLowerCase|toString|toUpperCase'

    const candleFields =
      'eventType|eventSymbol|index|time|sequence|count|open|high|low|close|volume|vwap|bidVolume|askVolume|impVolatility|openInterest'

    const keywordMapper = this.createKeywordMapper(
      {
        keyword: keywords,
        'constant.language': builtinConstants,
        'support.function': builtinFunctions,
        'variable.language': candleFields,
      },
      'identifier',
      true
    )

    this.$rules = {
      start: [
        { token: 'comment', regex: '//.*$' },
        { token: 'comment.start', regex: '/\\*', next: 'comment' },
        { token: 'string', regex: '".*?"' },
        { token: 'string', regex: "'.*?'" },
        { token: 'constant.numeric', regex: '[+-]?\\d+(\\.\\d+)?([eE][+-]?\\d+)?' },
        { token: keywordMapper, regex: '[a-zA-Z_$][a-zA-Z0-9_$]*\\b' },
        { token: 'keyword.operator', regex: '!|%|\\*|\\+|\\-|\\/|<|<=|==|>=|>|\\[|\\]' },
        { token: 'paren.lparen', regex: '[\\[\\(\\{]' },
        { token: 'paren.rparen', regex: '[\\]\\)\\}]' },
        { token: 'text', regex: '\\s+' },
      ],
      comment: [
        { token: 'comment.end', regex: '\\*/', next: 'start' },
        { defaultToken: 'comment' },
      ],
    }

    this.normalizeRules()
  }
}

export class DxScriptMode extends TextMode {
  constructor() {
    super()
    this.HighlightRules = DxScriptHighlightRules
    this.$outdent = new MatchingBraceOutdent()
    this.$behaviour = new CstyleBehaviour()
    this.foldingRules = new CstyleFoldMode()
  }

  createWorker(session: any) {
    return null
  }

  getNextLineIndent(state: any, line: string, tab: string) {
    const indent = this.$getIndent(line)
    const tokenizedLine = this.getTokenizer().getLineTokens(line, state).tokens

    if (tokenizedLine.length && tokenizedLine[tokenizedLine.length - 1].type === 'comment') {
      return indent
    }

    if (state === 'start' && line.match(/^.*[{([]\s*$/)) {
      return indent + tab
    }

    return indent
  }

  checkOutdent(_state: any, line: any, input: any) {
    return this.$outdent.checkOutdent(line, input)
  }

  autoOutdent(_state: any, doc: any, row: any) {
    this.$outdent.autoOutdent(doc, row)
  }
}

// Register the custom mode
ace.define('ace/mode/dxscript', ['require', 'exports', 'module'], (require: any, exports: any) => {
  exports.Mode = DxScriptMode
})
