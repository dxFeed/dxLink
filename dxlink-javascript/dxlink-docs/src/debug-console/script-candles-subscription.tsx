import type { DXLinkChartIndicatorsParameters, DXLinkChartSubscription } from '@dxfeed/dxlink-api'
import { Button } from '@dxfeed/ui-kit/Button'
import { HelperMessage } from '@dxfeed/ui-kit/HelperMessage'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { unit } from '@dxfeed/ui-kit/utils'
import { useState } from 'react'
import AceEditor from 'react-ace'
import styled from 'styled-components'

import { DxScriptMode } from './ace-dxscript-mode'
import { ContentTemplate } from '../common/content-template'

import 'ace-builds/src-noconflict/mode-python'
import 'ace-builds/src-noconflict/theme-textmate'

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

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid ${({ theme }) => theme.palette.separator.primary};
  padding-top: ${unit(1)};
`

const ActionGroup = styled.div`
  padding-right: ${unit(1)};
`

export interface ScriptCandlesSubscriptionProps {
  onSet(
    subscription: DXLinkChartSubscription,
    indicatorsParameters: DXLinkChartIndicatorsParameters
  ): void
}

const mode = new DxScriptMode()

export function ScriptCandlesSubscription({ onSet }: ScriptCandlesSubscriptionProps) {
  const [symbol, setSymbol] = useState('AAPL{=d}')
  const [fromTime, setFromTime] = useState('0')
  const [script, setScript] = useState<string>(`out sma = sma(close, 5)
out open = open`)

  const handleSet = () => {
    onSet(
      {
        symbol,
        fromTime: Number(fromTime),
      },
      {}
    )
  }

  return (
    <ContentTemplate title="Manage Script subscription">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSet()
        }}
      >
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
        <FieldWrapper>
          <AceEditor
            placeholder="Script code"
            mode={mode}
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
        </FieldWrapper>

        <Actions>
          <ActionGroup>
            <Button type="submit" kind={'outline'}>
              Set
            </Button>
          </ActionGroup>
        </Actions>
      </form>
    </ContentTemplate>
  )
}
