import { type DepthOfMarketOrder } from '@dxfeed/dxlink-api'
import { Table, TableCell, TableColumn, TableHeadCell, TableRow } from '@dxfeed/ui-kit/Table'
import { Text } from '@dxfeed/ui-kit/Text'
import { unit } from '@dxfeed/ui-kit/utils'
import styled from 'styled-components'

import { ContentTemplate } from '../common/content-template'

const EventGroup = styled.div`
  padding: ${unit(1)} 0;
`
const TableGroup = styled.div`
  display: flex;
`

export const DataTable = styled(Table)`
  width: 100%;
`

export const DataTableRow = styled(TableRow)`
  display: table-row;
`

const DataTableHeadCell = styled(TableHeadCell)`
  padding: ${unit(1)};
`

const DataTableCell = styled(TableCell)`
  padding: ${unit(1)};
`

const NoData = styled(Text)`
  display: flex;
  min-height: 120px;
  padding: ${unit(2)};
  justify-content: center;
  align-items: center;
`

const Ask = styled(TableColumn)`
  flex: 1;
`

const Bid = styled(TableColumn)`
  flex: 1;
`

const Price = styled(TableColumn)`
  width: 20%;
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
            <DataTable basedOrientation="column">
              <Bid>
                <DataTableHeadCell align="right">Bid Size</DataTableHeadCell>
                {bids.map((order, idx) => (
                  <DataTableCell align="right" key={idx}>
                    {order.size}
                  </DataTableCell>
                ))}
              </Bid>
              <Price>
                <DataTableHeadCell>Bid Price</DataTableHeadCell>
                {bids.map((order, idx) => (
                  <DataTableCell key={idx}>{order.price}</DataTableCell>
                ))}
              </Price>

              <Price>
                <DataTableHeadCell>Ask Price</DataTableHeadCell>
                {asks.map((order, idx) => (
                  <DataTableCell key={idx}>{order.price}</DataTableCell>
                ))}
              </Price>
              <Ask>
                <DataTableHeadCell align="left">Ask Size</DataTableHeadCell>
                {asks.map((order, idx) => (
                  <DataTableCell align="left" key={idx}>
                    {order.size}
                  </DataTableCell>
                ))}
              </Ask>
            </DataTable>
          </TableGroup>
        </ContentTemplate>
      </EventGroup>
    </>
  )
}
