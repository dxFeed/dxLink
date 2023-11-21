import { type ReactNode } from 'react'

import { Content, Head, HeaderContainer, Logo, LogoLink, SideContent, Wrapper } from './styled'

export function Header({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return (
    <Wrapper>
      <Head>
        <HeaderContainer>
          <LogoLink to="/">
            <Logo />
          </LogoLink>
          <Content>{children}</Content>
        </HeaderContainer>
        <SideContent>{right}</SideContent>
      </Head>
    </Wrapper>
  )
}
