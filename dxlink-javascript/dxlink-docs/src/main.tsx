import './styles.css'
import { StrictMode } from 'react'
import * as ReactDOM from 'react-dom/client'
import { CssBaseline } from '@dxfeed/ui-kit/CssBaseline'
import { ThemeProvider } from '@dxfeed/ui-kit/theme'
import { light as LIGHT_THEME } from '@dxfeed/ui-kit/theme/light'
import { Layout } from './layout/layout'
import styled, { createGlobalStyle } from 'styled-components'
import { HashRouter } from 'react-router-dom'

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

const Container = styled(CssBaseline)`
  min-height: 100%;
  width: 100%;
`

const GlobalStyles = createGlobalStyle`
  body {
    background-color: ${({ theme }) => theme.background.base};
  }
`

root.render(
  <StrictMode>
    <ThemeProvider theme={LIGHT_THEME}>
      <HashRouter>
        <Container>
          <GlobalStyles />
          <Layout />
        </Container>
      </HashRouter>
    </ThemeProvider>
  </StrictMode>
)
