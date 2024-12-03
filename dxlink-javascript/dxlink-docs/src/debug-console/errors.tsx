import { type DXLinkError } from '@dxfeed/dxlink-api'
import { ControlLabel } from '@dxfeed/ui-kit/ControlLabel'
import { IconButton } from '@dxfeed/ui-kit/IconButton'
import { Menu, MenuItem } from '@dxfeed/ui-kit/Menu'
import { useCallback, useRef, useState } from 'react'
import styled from 'styled-components'

import { ErrorIcon } from './icons'

export interface ErrorProps {
  errors: DXLinkError[]
}

const ErrorButton = styled(IconButton)`
  color: ${({ theme }) => theme.palette.red.main};
`

export function Errors({ errors }: ErrorProps) {
  const anchorEl = useRef<HTMLButtonElement>(null)

  const [isOpen, setIsOpen] = useState(false)

  const handleDropdownOpen = useCallback(() => {
    setIsOpen(true)
  }, [])

  const handleDropdownClose = () => {
    setIsOpen(false)
  }

  if (errors.length === 0) {
    return null
  }

  return (
    <>
      <ErrorButton type="button" ref={anchorEl} kind="ghost" onClick={handleDropdownOpen}>
        <ErrorIcon />
      </ErrorButton>

      <Menu
        size={'large'}
        anchorEl={anchorEl.current}
        isOpen={isOpen}
        onClose={handleDropdownClose}
      >
        {errors.map((error, idx) => (
          <MenuItem key={idx}>
            <ControlLabel description={error.message} label={error.type} />
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
