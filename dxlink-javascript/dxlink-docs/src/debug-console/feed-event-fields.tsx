import { type FeedEventFields } from '@dxfeed/dxlink-api'
import { Dropdown } from '@dxfeed/ui-kit/Dropdown'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { unit } from '@dxfeed/ui-kit/utils'
import { useCallback, useState } from 'react'
import styled from 'styled-components'

import { EVENT_TYPES } from './feed-event-type'

export interface FeedEventFieldsViewProps {
  value?: FeedEventFields
  onChange?: (value: FeedEventFields) => void
  readOnly?: boolean
  label: string
  description?: string
}

const Root = styled(Dropdown)`
  width: 100%;
`

const Field = styled.div`
  padding: ${unit(0.5)} ${unit(1.5)};
`

export interface FeedEventFieldsProps {
  label: string
  description?: string
  value?: FeedEventFields
  onChange?: (value: FeedEventFields) => void
  readOnly?: boolean
}

export function FeedEventFieldsView({
  label,
  description,
  value,
  onChange,
  readOnly,
}: FeedEventFieldsProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleDropdownOpen = useCallback(() => {
    setIsOpen(true)
  }, [])

  const handleDropdownClose = () => {
    setIsOpen(false)
  }

  const handleChange = (type: string, fields: string) => {
    onChange?.({ ...value, [type]: fields.trim().split(',') })
  }

  return (
    <Root
      isOpen={isOpen}
      selectedValue={label}
      onOpen={handleDropdownOpen}
      onClose={handleDropdownClose}
      head={description}
    >
      {!readOnly && (
        <Field>
          <TextField
            state={'success'}
            label={'Example'}
            value={'eventSymbol,eventType,bidPrice,askPrice'}
            readOnly
          />
        </Field>
      )}
      {EVENT_TYPES.map((type) => (
        <Field key={type}>
          <TextField
            label={type}
            value={(value?.[type] ?? []).join(',')}
            onChange={(e) => handleChange(type, e.target.value)}
            readOnly={readOnly}
          />
        </Field>
      ))}
    </Root>
  )
}
