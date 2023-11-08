import { Button } from '@dxfeed/ui-kit/Button'
import { Text } from '@dxfeed/ui-kit/Text'
import { unit } from '@dxfeed/ui-kit/utils'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import styled from 'styled-components'

import { Header } from './header'
import { DebugConsole } from '../debug-console'
// import { Protocol } from '../protocol'
import { AsyncApiProtocol } from '../protocol/asyncapi'

const Content = styled.div`
  display: flex;
  width: 100%;
  max-width: calc(100%);
  padding: ${unit(3)};
  margin: 0 auto;

  @media (min-width: 768px) {
    max-width: 720px;
  }

  @media (min-width: 1024px) {
    max-width: 976px;
  }

  @media (min-width: 1440px) {
    max-width: 1272px;
  }
`

const Menu = styled.div`
  display: flex;
  flex-grow: 1;
  padding-left: ${unit(2)};
`

const MenuItem = styled.div`
  padding: 0 ${unit(1)};
`

const Version = styled(Text)``

export function Layout() {
  const location = useLocation()

  return (
    <>
      <Header right={<Version>v0.1-beta</Version>}>
        <Text level={1}>dxLink.WebSocket</Text>
        <Menu>
          <MenuItem>
            <Link to="/">
              <Button
                kind={'normal'}
                size={'small'}
                color={location.pathname === '/' ? 'accent' : 'primary'}
              >
                Debug Console
              </Button>
            </Link>
          </MenuItem>
          <MenuItem>
            <Link to="/protocol">
              <Button
                kind={'normal'}
                size={'small'}
                color={location.pathname === '/protocol' ? 'accent' : 'primary'}
              >
                Protocol
              </Button>
            </Link>
          </MenuItem>
        </Menu>
      </Header>
      <Content>
        <Routes>
          <Route path="/" element={<DebugConsole />} />
          <Route path="/protocol" element={<AsyncApiProtocol />} />
          {/* <Route path="/protocol" element={<Protocol />} /> */}
        </Routes>
      </Content>
    </>
  )
}
