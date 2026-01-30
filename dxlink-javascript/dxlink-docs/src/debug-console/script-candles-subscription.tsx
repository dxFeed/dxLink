import type { DXLinkIndiChartIndicator, DXLinkIndiChartSubscription } from '@dxfeed/dxlink-api'
import { Button } from '@dxfeed/ui-kit/Button'
import { HelperMessage } from '@dxfeed/ui-kit/HelperMessage'
import { IconButton } from '@dxfeed/ui-kit/IconButton'
import { Search } from '@dxfeed/ui-kit/Icons'
import { Menu, MenuItem } from '@dxfeed/ui-kit/Menu'
import { Notification } from '@dxfeed/ui-kit/Notification'
import { Text } from '@dxfeed/ui-kit/Text'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { TextInput } from '@dxfeed/ui-kit/TextInput'
import { ToggleButton } from '@dxfeed/ui-kit/ToggleButton'
import { Tooltip } from '@dxfeed/ui-kit/Tooltip'
import { unit } from '@dxfeed/ui-kit/utils'
import { useState } from 'react'
import AceEditor from 'react-ace'
import styled from 'styled-components'

import { ErrorIcon, JSIcon } from './icons'
import {
  INDICHART_INDICATOR_EXAMPLES,
  INDICHART_INDICATROS,
  type Lang,
} from './indichart-indicators'
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

const ExampleButton = styled(Button)`
  margin-top: ${unit(1)};
`

const ExampleItem = styled(MenuItem)`
  cursor: pointer;
`

const CodeEditorGroup = styled.div`
  display: flex;
  flex-direction: column;
  padding-bottom: ${unit(1)};
  width: 100%;
`
const CodeEditorInput = styled.div`
  width: 100%;

  .ace_custom-keyword {
    color: #ff6347; /* Красный цвет для подсветки */
    font-weight: bold;
  }
`

const CodeEditorHelp = styled.div`
  width: 100%;
  display: flex;
  justify-content: end;
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

const JSLogo = styled(JSIcon)`
  width: 16px;
  height: 16px;
  margin-right: 4px;
  margin-bottom: 2px;
`

const ExampleText = styled(Text)`
  display: flex;
  flex-grow: 1;
  justify-content: space-between;
  min-width: 300px;
`

const ExampleDoc = styled.a`
  margin-left: ${unit(2)};
`

export interface ScriptCandlesSubscriptionProps {
  error?: string
  onSet(subscription: DXLinkIndiChartSubscription, indicator: DXLinkIndiChartIndicator): void
  onReset(): void
}


export function ScriptCandlesSubscription({
  onSet,
  onReset,
  error,
}: ScriptCandlesSubscriptionProps) {
  const [symbol, setSymbol] = useState('AAPL{=d}')
  const [fromTime, setFromTime] = useState('0')

  const [exampleId, setExampleId] = useState<string>(INDICHART_INDICATOR_EXAMPLES[0]!.id)
  const lang: Lang = 'js'
  const [script, setScript] = useState<string>(INDICHART_INDICATROS[lang][exampleId]!)
  const [search, setSearch] = useState('')

  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null)

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

  const examples = search
    ? INDICHART_INDICATOR_EXAMPLES.filter((item) =>
        item.id.toLowerCase().includes(search.toLowerCase())
      )
    : INDICHART_INDICATOR_EXAMPLES

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

        <TopPanel>
          <LangWrapper>
            <LangButton pressed={true}>
              <JSLogo /> JavaScript
            </LangButton>
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
              mode="javascript"
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
              height="320px"
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
            <ExampleButton color="secondary" onClick={(event) => setAnchorEl(event.currentTarget)}>
              Try examples
            </ExampleButton>
            <Menu
              anchorEl={anchorEl}
              isOpen={!!anchorEl}
              placement="left-end"
              onClose={() => setAnchorEl(null)}
              head={
                <TextInput
                  size="medium"
                  leftIcon={<Search />}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              }
            >
              {examples.length > 0 ? (
                examples.map((example) => (
                  <ExampleItem
                    onClick={() => {
                      setAnchorEl(null)
                      setExampleId(example.id)
                      setScript(INDICHART_INDICATROS[lang][example.id] ?? '')
                    }}
                    key={example.id}
                  >
                    <ExampleText color="inherit">
                      <Text color="inherit">{example.id}</Text>
                      {example.docUrl && (
                        <ExampleDoc href={example.docUrl} target="blank" rel="noreferrer">
                          [Docs]
                        </ExampleDoc>
                      )}
                    </ExampleText>
                  </ExampleItem>
                ))
              ) : (
                <ExampleText color="inherit">
                  <Notification>Nothing found</Notification>
                </ExampleText>
              )}
            </Menu>
          </CodeEditorHelp>
        </CodeEditorGroup>

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
