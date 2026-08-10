import Link from '@mui/material/Link'
import type { ReactNode } from 'react'

interface DocLinkProps {
  href: string
  children: ReactNode
}

/**
 * External documentation link used inside form helper text. Inherits the
 * surrounding type scale so it does not enlarge a `helperText` line.
 */
export const DocLink = ({ href, children }: DocLinkProps) => (
  <Link href={href} target="_blank" rel="noreferrer" variant="inherit" underline="hover">
    {children}
  </Link>
)
