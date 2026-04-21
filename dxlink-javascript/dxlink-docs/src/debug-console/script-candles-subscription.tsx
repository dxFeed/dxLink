import type { DXLinkIndiChartIndicator, DXLinkIndiChartSubscription } from '@dxfeed/dxlink-api'
import { Button } from '@dxfeed/ui-kit/Button'
import { HelperMessage } from '@dxfeed/ui-kit/HelperMessage'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { unit } from '@dxfeed/ui-kit/utils'
import { DxScriptEditor } from '@dxscript/dxlink-dxscript-editor'
import { useState } from 'react'
import styled from 'styled-components'

import { ContentTemplate } from '../common/content-template'

type Lang = 'dxscript-js'

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
  error?: string
  onSet(subscription: DXLinkIndiChartSubscription, indicator: DXLinkIndiChartIndicator): void
  onReset(): void
}

const lang: Lang = 'dxscript-js'

export function ScriptCandlesSubscription({
  onSet,
  onReset,
  error,
}: ScriptCandlesSubscriptionProps) {
  const [symbol, setSymbol] = useState('AAPL{=d}')
  const [fromTime, setFromTime] = useState('0')
  const [script, setScript] = useState('')

  const handleSet = () => {
    onSet({ symbol, fromTime: Number(fromTime) }, { lang, content: script })
  }

  return (
    <ContentTemplate title="Manage channel">
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

        <DxScriptEditor
          onChange={setScript}
          onError={error}
          showLangLogo={true}
          enableSamplesButton={true}
          colorScheme ={"dark"}
        />

        <Actions>
          <ActionGroup>
            <Button type="button" onClick={onReset} color={'accent'}>
              Reset
            </Button>
          </ActionGroup>
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
