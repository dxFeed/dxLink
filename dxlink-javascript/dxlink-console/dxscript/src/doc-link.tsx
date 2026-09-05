import Link from '@mui/material/Link'
import type { ReactNode } from 'react'

interface DocLinkProps {
  href: string
  children: ReactNode
}

/**
 * External documentation link used inside form helper text. Inherits the
 * surrounding type scale so it does not enlarge a `helperText` line.
 *
 * Deliberately duplicated in each channel package rather than hoisted into core: a plugin
 * package is self-contained, and core holds nothing that exists only to serve a channel.
 * Seventeen lines of link is a cheaper thing to repeat than that boundary is to blur.
 */
export const DocLink = ({ href, children }: DocLinkProps) => (
  <Link href={href} target="_blank" rel="noreferrer" variant="inherit" underline="hover">
    {children}
  </Link>
)
