import { Table, TableCell, TableHeadCell, TableRow } from '@dxfeed/ui-kit/Table'
import { Text } from '@dxfeed/ui-kit/Text'
import { unit } from '@dxfeed/ui-kit/utils'
import styled from 'styled-components'

export const NewsImg = styled.img`
  &[referrerpolicy] {
    display: none;
  }
`

export const NewsText = styled(Text).attrs({ as: 'p' })`
  display: block;
  margin: ${unit(3)} 0;
`

export const NewsContent = styled.div`
  margin: ${unit(3)} 0;

  /* Content img selector */
  &#bwbodyimg {
    margin-top: 0;
    margin-right: ${unit(3)};

    ${NewsText} {
      margin-top: ${unit(1)};
    }
  }
`

export const NewsTable = styled(Table).attrs({ as: 'table' })`
  display: table;
`

export const NewsTableRow = styled(TableRow).attrs({ as: 'tr' })`
  display: table-row;
`

export const NewsTableCell = styled(TableCell).attrs({ as: 'td' })`
  display: table-cell;
`

export const NewsTableHeadCell = styled(TableHeadCell).attrs({ as: 'th' })`
  display: table-cell;
`
