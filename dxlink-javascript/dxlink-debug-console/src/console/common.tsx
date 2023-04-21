import { unit } from '@dxfeed/ui-kit/utils'
import styled from 'styled-components'

export const Group = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.palette.separator.primary};
  padding: ${unit(2)} ${unit(1.5)};
`

export const GroupItem = styled.div`
  display: flex;
  padding: ${unit(1)};
`
