import styled from 'styled-components'

import { unit } from '@dxfeed/ui-kit/utils'
import { DxFeedLogo } from './dx-feed-logo'
import { Link } from 'react-router-dom'

export const Wrapper = styled.div`
  display: flex;
  align-items: center;
  background-color: ${({ theme }) => theme.background.primary.main};
  height: ${unit(6)};
  color: ${({ theme }) => theme.palette.primary.main};
`

export const HeaderContainer = styled.div`
  display: flex;
  align-items: center;
`

export const Content = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-left: ${unit(3)};
  width: 100%;
`

export const Head = styled.header`
  display: flex;
  padding: 0 ${unit(3)};
  width: 100%;
  margin: 0 auto;
  justify-content: space-between;
`

export const SideContent = styled.header`
  display: flex;
  align-items: center;
`

export const LogoLink = styled(Link)`
  height: 100%;
`

export const Logo = styled(DxFeedLogo)`
  color: ${({ theme }) => theme.palette.primary.main};
  height: 100%;
`
