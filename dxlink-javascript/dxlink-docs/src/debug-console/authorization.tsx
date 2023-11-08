import { Button } from '@dxfeed/ui-kit/Button'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { unit } from '@dxfeed/ui-kit/utils'
import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import { ContentTemplate } from '../common/content-template'

const ActionsGroup = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  border-top: 1px solid ${({ theme }) => theme.palette.separator.primary};
  padding-top: ${unit(1)};
`

const Root = styled(ContentTemplate)`
  margin-top: ${unit(1.5)};
`

const FieldsGroup = styled.div`
  display: flex;
  flex-direction: column;
`

const FieldWrapper = styled.div`
  padding: ${unit(1.5)} 0;
`

export interface AuthorizationProps {
  onAuth?: (token: string) => void
}

export function Authorization({ onAuth }: AuthorizationProps) {
  const ref = useRef<HTMLInputElement>(null)
  const [token, setToken] = useState('')
  const [inProgress, setInProgress] = useState(false)

  const handleAuth = () => {
    if (onAuth === undefined) {
      return
    }

    setInProgress(true)
    onAuth(token)
  }

  useEffect(() => {
    // Focus on first render
    if (ref.current) {
      ref.current.focus()
    }
  }, [])

  return (
    <Root title="Authorization">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleAuth()
        }}
      >
        <FieldsGroup>
          <FieldWrapper>
            <TextField
              ref={ref}
              label={'Token'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={inProgress}
            />
          </FieldWrapper>
        </FieldsGroup>
        <ActionsGroup>
          <Button type="submit" disabled={inProgress}>
            Authorize
          </Button>
        </ActionsGroup>
      </form>
    </Root>
  )
}
