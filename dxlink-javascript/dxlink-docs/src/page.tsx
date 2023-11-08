import { CssBaseline } from '@dxfeed/ui-kit/CssBaseline'
import { ThemeProvider } from '@dxfeed/ui-kit/theme'
import { light as LIGHT_THEME } from '@dxfeed/ui-kit/theme/light'
import styled, { createGlobalStyle } from 'styled-components'

import { DebugConsole } from './debug-console'

const Container = styled(CssBaseline)`
  min-height: 100%;
  width: 100%;
`

const GlobalStyles = createGlobalStyle`
  body {
    background-color: ${({ theme }) => theme.background.base};
  }
`

export const Page = () => {
  return (
    <ThemeProvider theme={LIGHT_THEME}>
      <Container>
        <GlobalStyles />
        <DebugConsole />
      </Container>
    </ThemeProvider>
  )
}
