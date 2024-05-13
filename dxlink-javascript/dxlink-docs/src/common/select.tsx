import { Dropdown, DropdownItem } from '@dxfeed/ui-kit/Dropdown'
import type { PopoverPlacement } from '@dxfeed/ui-kit/Popover/types'
import { Text } from '@dxfeed/ui-kit/Text'
import { unit } from '@dxfeed/ui-kit/utils'
import { useCallback, useState, type ReactNode } from 'react'
import styled from 'styled-components'

const Description = styled.div`
  padding: ${unit(1)} ${unit(2)};
  ${(p) => p.theme.typography.body.regular[3]};
`

export interface SelectProps {
  value: string
  onChange?: (value: string) => void
  options: string[]
  label: string
  description?: ReactNode
  className?: string
  disabled?: boolean
  placement?: PopoverPlacement
}

export function Select({
  value,
  onChange,
  options,
  label,
  description,
  className,
  placement,
  disabled,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleDropdownOpen = useCallback(() => {
    setIsOpen(true)
  }, [])

  const handleDropdownClose = () => {
    setIsOpen(false)
  }

  const handleItemClick = (value: string) => {
    onChange?.(value)
    handleDropdownClose()
  }

  if (disabled) {
    return (
      <Dropdown
        className={className}
        selectedValue={value}
        isOpen={false}
        head={label}
        onOpen={() => {}}
        onClose={() => {}}
      >
        <DropdownItem onClick={() => {}} value={value} selected={true}>
          <Text>{value}</Text>
        </DropdownItem>
      </Dropdown>
    )
  }

  return (
    <Dropdown
      className={className}
      selectedValue={value}
      isOpen={isOpen}
      onOpen={handleDropdownOpen}
      onClose={handleDropdownClose}
      head={label}
      footer={description && <Description>{description}</Description>}
      placement={placement}
      overflowMode="tethered"
      paperProps={{
        maxHeight: unit(55),
      }}
    >
      {options.map((item) => (
        <DropdownItem key={item} onClick={handleItemClick} value={item} selected={item === value}>
          <Text>{item}</Text>
        </DropdownItem>
      ))}
    </Dropdown>
  )
}
