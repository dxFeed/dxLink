/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import ace from 'ace-builds/src-noconflict/ace'
import 'ace-builds/src-noconflict/ext-language_tools'
import 'ace-builds/src-noconflict/mode-text'
import 'ace-builds/src-noconflict/mode-javascript'
import { dxScriptCompletions } from './dxscript-completions'

const JavaScriptMode = ace.require('ace/mode/javascript').Mode
const MatchingBraceOutdent = ace.require('ace/mode/matching_brace_outdent').MatchingBraceOutdent
const CstyleBehaviour = ace.require('ace/mode/behaviour/cstyle').CstyleBehaviour
const CstyleFoldMode = ace.require('ace/mode/folding/cstyle').FoldMode
const JavaScriptHighlightRules = ace.require('ace/mode/javascript_highlight_rules').JavaScriptHighlightRules
const langTools = ace.require('ace/ext/language_tools')

// Configure Ace base path for dynamic loading
ace.config.set('basePath', 'https://cdn.jsdelivr.net/npm/ace-builds@1.43.6/src-noconflict/')

langTools.addCompleter({
  getCompletions: (_editor: any, _session: any, _pos: any, _prefix: any, callback: any) => {
    callback(null, dxScriptCompletions)
  },
})

class DxScriptHighlightRules extends JavaScriptHighlightRules {
  constructor() {
    super()

    const candleFields =
      'askVolume|bar_index|bidVolume|close|count|high|hl2|hlc3|impVolatility|low|ohlc4|open|openInterest|time|volume|vwap';

    const builtinFunctions = 'input|output|spline|ts';

    const builtinConstants =
      'BOLD|BoxExtend|ITALIC|LineExtend|LineStyle|NONE|SplineType|TextAlign|TextHorizontalAlign|TextVerticalAlign|XLocation';

    const colorNames =
      'BLACK|BLUE|CORAL|CRIMSON|CYAN|GOLD|GRAY|GREEN|LIME|MAGENTA|MAROON|NAVY|ORANGE|PINK|PURPLE|RED|SILVER|TEAL|WHITE|YELLOW';

    const namespaces = 'bar|box|console|hline|input|label|line|Math|output|polyline|session|spline|ta|ts';

    if (this.$rules.start) {
      this.$rules.start.unshift({
        token: 'support.type',
        regex: String.raw`\b(?:${namespaces})\b`,
      })

      this.$rules.start.unshift({
        token: 'constant.language',
        regex: String.raw`\b(?:${builtinConstants})\b`,
      })

      this.$rules.start.unshift({
        token: 'support.function',
        regex: String.raw`\b(?:${builtinFunctions})\b`,
      })

      this.$rules.start.unshift({
        token: 'variable.language',
        regex: String.raw`\b(?:${candleFields})\b`,
      })

      this.$rules.start.unshift({
        token: 'constant.language',
        regex: String.raw`(?<=color\.)(?:${colorNames})\b`,
      })

      this.$rules.start.unshift({
        token: "support.function",
        regex: String.raw`\b(?:${namespaces})\.[A-Za-z_$][\w$]*\b`,
      });
    }
  }
}

export class DxScriptMode extends JavaScriptMode {
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

    if (state === 'start' && /^.*[{([]\s*$/.exec(line)) {
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
