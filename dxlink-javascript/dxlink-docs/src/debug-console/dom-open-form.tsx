import { Button } from '@dxfeed/ui-kit/Button'
import { Paper } from '@dxfeed/ui-kit/Paper'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { useState } from 'react'
import styled from 'styled-components'

import { FieldWrapper, FormActions } from './forms'
import { ContentTemplate } from '../common/content-template'

const Form = styled.form`
  display: flex;
`

export interface DomOpenFormProps {
  onOpen: (symbol: string, source: string) => void
}

export const DomOpenForm = (props: DomOpenFormProps) => {
  const [domSymbol, setDomSymbol] = useState('')
  const [domSources, setDomSources] = useState('')

  const handleOpenDom = () => {
    props.onOpen(domSymbol, domSources)
  }

  return (
    <Paper type="outlined">
      <Form
        onSubmit={(e) => {
          e.preventDefault()
          handleOpenDom()
        }}
      >
        <ContentTemplate title={'DOM parameters'} kind="primary">
          <FieldWrapper>
            <TextField
              label={'Symbol'}
              value={domSymbol}
              fullWidth={true}
              onChange={(e) => {
                setDomSymbol(e.target.value)
              }}
            />
          </FieldWrapper>
          <FieldWrapper>
            <TextField
              label={'Sources'}
              value={domSources}
              fullWidth={true}
              onChange={(e) => {
                setDomSources(e.target.value)
              }}
            />
          </FieldWrapper>

          <FormActions>
            <Button type="submit" color={'primary'} kind={'outline'} onClick={handleOpenDom}>
              Open
            </Button>
          </FormActions>
        </ContentTemplate>
      </Form>
    </Paper>
  )
}
