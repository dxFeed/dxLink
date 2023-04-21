import { ReactNode } from 'react'

import styled from 'styled-components'

import { Text } from '@dxfeed/ui-kit/Text'
import { unit } from '@dxfeed/ui-kit/utils'

export interface ContentTemplateProps {
  title: ReactNode
  className?: string
  children?: ReactNode
  actions?: ReactNode
  kind?: 'primary' | 'secondary' | 'tertiary'
}

const Wrapper = styled.div<{ kind: Required<ContentTemplateProps>['kind'] }>`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background-color: ${({ theme, kind }) => theme.background[kind].main};
`

const Header = styled.div`
  display: flex;
  justify-content: space-between;
`

const Title = styled(Text)`
  display: flex;
  padding: ${unit(1)} ${unit(1.5)};
  color: ${({ theme }) => theme.palette.secondary.main};
`

const Content = styled.div`
  display: flex;
  flex-direction: column;
  border-top: 1px solid ${({ theme }) => theme.palette.separator.primary};
  padding: ${unit(2)} ${unit(1.5)};
  flex-grow: 1;
`

const Actions = styled.div`
  display: flex;
  align-items: flex-end;
`

export function ContentTemplate({
  title,
  children,
  actions,
  className,
  kind = 'primary',
}: ContentTemplateProps) {
  return (
    <Wrapper className={className} kind={kind}>
      <Header>
        <Title level={5}>{title}</Title>
        <Actions>{actions}</Actions>
      </Header>
      {children && <Content>{children}</Content>}
    </Wrapper>
  )
}
