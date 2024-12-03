import type { DXLinkChartIndicator, DXLinkChartSubscription, DXLinkError } from '@dxfeed/dxlink-api'
import { Button } from '@dxfeed/ui-kit/Button'
import { HelperMessage } from '@dxfeed/ui-kit/HelperMessage'
import { IconButton } from '@dxfeed/ui-kit/IconButton'
import { Text } from '@dxfeed/ui-kit/Text'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { ToggleButton } from '@dxfeed/ui-kit/ToggleButton'
import { Tooltip } from '@dxfeed/ui-kit/Tooltip'
import { unit } from '@dxfeed/ui-kit/utils'
import { useState } from 'react'
import AceEditor from 'react-ace'
import styled from 'styled-components'

import { DxScriptMode } from './ace-dxscript-mode'
import { DxScriptIcon, ErrorIcon, JSIcon } from './icons'
import { ContentTemplate } from '../common/content-template'
import 'ace-builds/src-noconflict/mode-python'
import 'ace-builds/src-noconflict/theme-textmate'
import { Errors } from './errors'

const FieldsGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(1, 1fr);
  grid-gap: ${unit(1.5)};
`

const FieldWrapper = styled.div`
  display: flex;
  flex-direction: column;
  padding-bottom: ${unit(1)};
  width: 100%;
`

const TopPanel = styled.div`
  display: flex;
  flex-direction: row;
  border-top: 1px solid ${({ theme }) => theme.palette.separator.primary};
  padding-bottom: ${unit(1)};
  padding-top: ${unit(1)};
`

const ErrorWrapper = styled.div``

const LangWrapper = styled.div`
  flex-grow: 1;
  display: flex;
  flex-direction: row;
`

const LangButton = styled(ToggleButton)`
  margin-right: ${unit(1)};
  display: flex;
  align-items: center;
`
const ExamplesText = styled(Text)``
const ExampleButton = styled(Button)``

const CodeEditorGroup = styled.div`
  display: flex;
  flex-direction: column;
  padding-bottom: ${unit(1)};
  width: 100%;
`
const CodeEditorInput = styled.div`
  width: 100%;
`

const CodeEditorHelp = styled.div`
  width: 100%;
`

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid ${({ theme }) => theme.palette.separator.primary};
  padding-top: ${unit(1)};
`

const ActionGroup = styled.div`
  padding-right: ${unit(1)};
`

const ErrorButton = styled(IconButton)`
  color: ${({ theme }) => theme.palette.red.main};
`

const DxScriptLogo = styled(DxScriptIcon)`
  width: 16px;
  height: 16px;
  margin-right: 2px;
`

const JSLogo = styled(JSIcon)`
  width: 16px;
  height: 16px;
  margin-right: 4px;
  margin-bottom: 2px;
`

export interface ScriptCandlesSubscriptionProps {
  error?: string
  onSet(subscription: DXLinkChartSubscription, indicator: DXLinkChartIndicator): void
}

const mode = new DxScriptMode()

type Lang = 'dxScript' | 'js'

const LANGS = [
  {
    id: 'dxScript' as Lang,
    label: (
      <>
        <DxScriptLogo /> dxScript
      </>
    ),
  },
  {
    id: 'js' as Lang,
    label: (
      <>
        <JSLogo /> JavaScript
      </>
    ),
  },
] as const

const SCRIPT_EXAMPLES = {
  dxScript: [
    {
      label: 'SMA',
      content: `in n = 1
out sma = sma(candle.open, n)`,
    },
    {
      label: 'GAP',
      content: `def o = candle.open
def po = candle.open[1]
def c = candle.close
def pc = candle.close[1]
def v =
if (pc >= po)
  if (c >= o) max(o - pc, po - c) else max(c - pc, po - o)
else
  if (c >= o) max(o - po, pc - c) else max(c - po, pc - o)
out gap = max(v, 0)`,
    },
    {
      label: 'RSI',
      content: `in n = 14
def c = candle.close
def u = if (c > c[1]) c - c[1] else 0
def d = if (c < c[1]) c[1] - c else 0
def uw = u.wima(n)
def dw = d.wima(n)
out rsi = if (dw == 0) 100 else 100 - (100 / (1 + uw / dw))

fun wima {
    in x: number
    in n: const number
    def w = if (x.isNotNaN) (w[1] * (n - 1) + x) / n else w[1] default x.sma(n)
    out = w
}`,
    },
  ],
  js: [
    {
      label: 'SMA',
      content: `input.n = 1
output.sma = sma(open, input.n)`,
    },
    {
      label: 'GAP',
      content: `const o = open.last()
const po = open.last(1)
const c = close.last()
const pc = close.last(1)

let v
if (pc >= po) {
    v = (c >= o) ? Math.max(o - pc, po - c) : Math.max(c - pc, po - o)
} else {
    v = (c >= o) ? Math.max(o - po, pc - c) : Math.max(c - po, pc - o)
}
output.gap = Math.max(v, 0)`,
    },
    {
      label: 'RSI',
      content: `input.n = 14

let c = close
let u = ResultSeries.diff("u", () => c.last() - c.last(1))
let d = ResultSeries.diff("d", () => c.last(1) - c.last())

let uw = wima("uw", u, input.n)
let dw = wima("dw", d, input.n)

output.rsi = (dw === 0) ? 100 : 100 - (100 / (1 + uw / dw))

function wima(name, runtimeSeries, n) {
    const lastWima = global.getOrDefault(name, NaN);
    let wima
    if (!isNaN(lastWima)) {
        let x = runtimeSeries.last()
        wima = !isNaN(x) ? (lastWima * (n - 1) + x) / n : lastWima
    } else {
        wima = sma(runtimeSeries, n)
    }
    global[name] = wima
    return wima
}`,
    },
  ],
}

export function ScriptCandlesSubscription({ onSet, error }: ScriptCandlesSubscriptionProps) {
  const [symbol, setSymbol] = useState('AAPL{=d}')
  const [fromTime, setFromTime] = useState('0')
  const [script, setScript] = useState<string>(SCRIPT_EXAMPLES.dxScript[0]!.content)

  const [lang, setLang] = useState<Lang>('dxScript')

  const handleSet = () => {
    onSet(
      {
        symbol,
        fromTime: Number(fromTime),
      },
      {
        lang,
        content: script,
      }
    )
  }

  return (
    <ContentTemplate title="Manage CHART channel">
      <div>
        <FieldsGroup>
          <FieldWrapper>
            <TextField
              label={'Symbol'}
              value={symbol}
              fullWidth
              onChange={(e) => setSymbol(e.target.value)}
            />
            <HelperMessage state="normal">
              <a
                href="https://kb.dxfeed.com/en/data-access/rest-api.html#candle-symbols"
                target="_blank"
                rel="noreferrer"
              >
                Candle symbols
              </a>
            </HelperMessage>
          </FieldWrapper>
          <FieldWrapper>
            <TextField
              label={'From time (unix timestamp)'}
              value={fromTime}
              onChange={(e) => {
                const value = e.target.value
                setFromTime(value.replace(/[^0-9]/g, ''))
              }}
            />
            <HelperMessage state="normal">
              <a href="https://currentmillis.com/" target="_blank" rel="noreferrer">
                Milliseconds since epoch
              </a>
            </HelperMessage>
          </FieldWrapper>
        </FieldsGroup>

        <TopPanel>
          <LangWrapper>
            {LANGS.map((item) => (
              <LangButton
                key={item.id}
                onPressedChange={() => {
                  const lang = item.id
                  setScript(SCRIPT_EXAMPLES[lang][0]!.content)
                  setLang(item.id)
                }}
                pressed={item.id === lang}
              >
                {item.label}
              </LangButton>
            ))}
          </LangWrapper>
          <ErrorWrapper>
            {error && (
              <Tooltip content={error} placement="left-start" enableHoverableContent={true}>
                {(triggerProps) => (
                  <ErrorButton type="button" kind="ghost" size="small" {...triggerProps}>
                    <ErrorIcon />
                  </ErrorButton>
                )}
              </Tooltip>
            )}
          </ErrorWrapper>
        </TopPanel>
        <CodeEditorGroup>
          <CodeEditorInput>
            <AceEditor
              placeholder="Script code"
              mode={lang === 'dxScript' ? mode : 'javascript'}
              theme="textmate"
              name="script-code"
              onChange={(value) => setScript(value)}
              fontSize={14}
              lineHeight={18}
              showPrintMargin={true}
              showGutter={true}
              highlightActiveLine={true}
              value={script}
              width="100%"
              height="250px"
              setOptions={{
                enableBasicAutocompletion: true,
                enableLiveAutocompletion: true,
                enableSnippets: false,
                showLineNumbers: true,
                tabSize: 2,
              }}
            />
          </CodeEditorInput>
          <CodeEditorHelp>
            <ExamplesText>Try examples:</ExamplesText>
            {SCRIPT_EXAMPLES[lang].map((item) => (
              <ExampleButton
                kind="ghost"
                key={item.label}
                onClick={() => {
                  setScript(item.content)
                }}
              >
                {item.label}
              </ExampleButton>
            ))}
          </CodeEditorHelp>
        </CodeEditorGroup>

        <Actions>
          <ActionGroup>
            <Button type="submit" kind={'outline'} onClick={handleSet}>
              Re-Open Channel
            </Button>
          </ActionGroup>
        </Actions>
      </div>
    </ContentTemplate>
  )
}
