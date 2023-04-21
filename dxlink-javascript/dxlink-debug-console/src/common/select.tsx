import { Dropdown, DropdownItem } from '@dxfeed/ui-kit/Dropdown'
import { Text } from '@dxfeed/ui-kit/Text'
import { useCallback, useState } from 'react'

export interface SelectProps {
  value: string
  onChange?: (value: string) => void
  options: string[]
  label: string
  className?: string
  disabled?: boolean
}

export function Select({ value, onChange, options, label, className, disabled }: SelectProps) {
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

  return (
    <Dropdown
      className={className}
      selectedValue={value}
      isOpen={isOpen}
      onOpen={handleDropdownOpen}
      onClose={handleDropdownClose}
      head={label}
    >
      {options.map((item) => (
        <DropdownItem key={item} onClick={handleItemClick} value={item}>
          <Text>{item}</Text>
        </DropdownItem>
      ))}
    </Dropdown>
  )
}
