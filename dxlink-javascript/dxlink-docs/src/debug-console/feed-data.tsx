import { type FeedEventData, type FeedEventFields } from '@dxfeed/dxlink-api'
import { Table, TableCell, TableHeadCell, TableRow } from '@dxfeed/ui-kit/Table'
import { Tooltip } from '@dxfeed/ui-kit/Tooltip'
import { unit } from '@dxfeed/ui-kit/utils'
import { useMemo } from 'react'
import styled from 'styled-components'

import { ContentTemplate } from '../common/content-template'

const EventGroup = styled.div`
  padding: ${unit(1)} 0;
`

const TableGroup = styled.div`
  display: flex;
  overflow: auto;
`

export const DataTable = styled(Table)`
  display: table;
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

export interface FeedDataProps {
  eventFields: FeedEventFields
  data: Record<string, Record<string, FeedEventData>>
}

export function FeedData({ eventFields, data }: FeedDataProps) {
  const dataFields = useMemo(() => {
    return Object.keys(eventFields).reduce<FeedEventFields>((acc, key) => {
      acc[key] = eventFields[key].reduce<string[]>((acc, value) => {
        if (value === 'eventSymbol') {
          acc.unshift(value)
        } else {
          acc.push(value)
        }
        return acc
      }, [])
      return acc
    }, {})
  }, [eventFields])

  const unknownData = data?.['unknown']?.['unknown']

  return (
    <>
      {Object.keys(dataFields).map((eventType) => {
        const symbols = Object.keys(data[eventType] ?? {})
        const fields = dataFields[eventType]

        if (symbols.length === 0) {
          return null
        }

        return (
          <EventGroup key={eventType}>
            <ContentTemplate title={`DATA - ${eventType}`} kind="primary">
              <TableGroup>
                <DataTable>
                  <DataTableRow>
                    {fields.map((eventField) => (
                      <DataTableHeadCell key={eventField}>
                        <Tooltip content={eventField} placement={'top'}>
                          {eventField}
                        </Tooltip>
                      </DataTableHeadCell>
                    ))}
                  </DataTableRow>
                  {symbols.map((symbol) => (
                    <DataTableRow key={symbol}>
                      {fields.map((eventField) => {
                        const value = data[eventType][symbol][eventField]
                        return (
                          <DataTableCell key={eventField}>
                            <Tooltip content={value} placement={'top'}>
                              {value}
                            </Tooltip>
                          </DataTableCell>
                        )
                      })}
                    </DataTableRow>
                  ))}
                </DataTable>
              </TableGroup>
            </ContentTemplate>
          </EventGroup>
        )
      })}

      {unknownData !== undefined && (
        <EventGroup>
          <ContentTemplate title={`DATA - UNKNOWN`} kind="primary">
            <TableGroup>
              <DataTable>
                <DataTableRow>
                  {Object.keys(unknownData).map((eventField) => (
                    <DataTableHeadCell key={eventField}>
                      <Tooltip content={eventField} placement={'top'}>
                        {eventField}
                      </Tooltip>
                    </DataTableHeadCell>
                  ))}
                </DataTableRow>
                <DataTableRow>
                  {Object.keys(unknownData).map((eventField) => {
                    const value = unknownData[eventField]
                    return (
                      <DataTableCell key={eventField}>
                        <Tooltip content={value} placement={'top'}>
                          {value}
                        </Tooltip>
                      </DataTableCell>
                    )
                  })}
                </DataTableRow>
              </DataTable>
            </TableGroup>
          </ContentTemplate>
        </EventGroup>
      )}
    </>
  )
}
