import { type DepthOfMarketOrder } from '@dxfeed/dxlink-api'
import { Table, TableCell, TableHeadCell, TableRow } from '@dxfeed/ui-kit/Table'
import { Text } from '@dxfeed/ui-kit/Text'
import { unit } from '@dxfeed/ui-kit/utils'
import styled from 'styled-components'

import { ContentTemplate } from '../common/content-template'

const EventGroup = styled.div`
  padding: ${unit(1)} 0;
`
const TableGroup = styled.div`
  display: flex;
  flex-direction: row;
`

export const DataTable = styled(Table)`
  display: table;
  width: 50%;
`

export const DataTableRow = styled(TableRow)`
  display: table-row;
`

const DataTableHeadCell = styled(TableHeadCell)`
  display: table-cell;
  padding: ${unit(1.5)};
`

const DataTableCell = styled(TableCell)`
  display: table-cell;
  padding: ${unit(1.5)};
`

const NoData = styled(Text)`
  display: flex;
  min-height: 120px;
  padding: ${unit(2)};
  justify-content: center;
  align-items: center;
`

export interface DomSnapshotData {
  time: number
  bids: DepthOfMarketOrder[]
  asks: DepthOfMarketOrder[]
}

export interface DomSnapshotProps {
  data?: DomSnapshotData
}

export function DomSnapshot({ data }: DomSnapshotProps) {
  if (data === undefined) {
    return (
      <EventGroup>
        <ContentTemplate title={`SNAPSHOT`} kind="primary">
          <NoData type="bodyWideMedium" level={3}>
            Nothing to display
          </NoData>
        </ContentTemplate>
      </EventGroup>
    )
  }

  const { time, bids, asks } = data
  return (
    <>
      <EventGroup>
        <ContentTemplate
          title={`SNAPSHOT - Last update: ${new Date(time).toLocaleTimeString()}`}
          kind="primary"
        >
          <TableGroup>
            <DataTable>
              <DataTableRow>
                <DataTableHeadCell>Bid</DataTableHeadCell>
                <DataTableHeadCell>Bid Price</DataTableHeadCell>
              </DataTableRow>
              {bids.map((order, idx) => (
                <DataTableRow key={idx}>
                  <DataTableCell>{order.size}</DataTableCell>
                  <DataTableCell>{order.price}</DataTableCell>
                </DataTableRow>
              ))}
            </DataTable>
            <DataTable>
              <DataTableRow>
                <DataTableHeadCell>Ask Price</DataTableHeadCell>
                <DataTableHeadCell>Ask</DataTableHeadCell>
              </DataTableRow>
              {asks.map((order, idx) => (
                <DataTableRow key={idx}>
                  <DataTableCell>{order.price}</DataTableCell>
                  <DataTableCell>{order.size}</DataTableCell>
                </DataTableRow>
              ))}
            </DataTable>
          </TableGroup>
        </ContentTemplate>
      </EventGroup>
    </>
  )
}
