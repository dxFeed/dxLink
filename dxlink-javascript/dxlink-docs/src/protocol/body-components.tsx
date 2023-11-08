import { unit } from '@dxfeed/ui-kit/utils'
import styled, { css } from 'styled-components'

import {
  NewsContent,
  NewsImg,
  NewsTable,
  NewsTableCell,
  NewsTableHeadCell,
  NewsTableRow,
  NewsText,
} from './styled'

type Element<HTMLElement> = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>

export function Paragraph({ children, id }: Element<HTMLParagraphElement>) {
  return <NewsText id={id}>{children}</NewsText>
}

const linkStyles = css`
  cursor: pointer;
  color: ${({ theme }) => theme.palette.accent.main};
  text-decoration: underline;

  display: inline-block;
  align-items: center;
  transition: color 300ms;

  ${NewsImg} {
    width: auto;
  }

  &:hover {
    color: ${({ theme }) => theme.palette.accent.dark};
  }
`

const Anchor = styled.a`
  ${linkStyles}
`

export function Link({
  children,
  href = '',
}: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>) {
  if (href.startsWith('#')) {
    return (
      <Anchor
        href={href}
        onClick={(e) => {
          e.preventDefault()

          document.querySelector(href)?.scrollIntoView()
        }}
      >
        {children}
      </Anchor>
    )
  }

  return (
    <Anchor target={'_blank'} rel={'noopener noreferrer'} href={href}>
      {children}
    </Anchor>
  )
}

export function Table({ children }: Element<HTMLTableElement>) {
  return <NewsTable>{children}</NewsTable>
}

export function TableRow({ children }: Element<HTMLTableRowElement>) {
  return <NewsTableRow>{children}</NewsTableRow>
}

export function TableCell({ children }: Element<HTMLTableCellElement>) {
  return <NewsTableCell>{children}</NewsTableCell>
}

export function TableHeadCell({ children }: Element<HTMLTableHeaderCellElement>) {
  return <NewsTableHeadCell>{children}</NewsTableHeadCell>
}

export function Img({ children }: Element<HTMLImageElement>) {
  return <NewsImg>{children}</NewsImg>
}

export function Div({ children }: Element<HTMLDivElement>) {
  return <NewsContent>{children}</NewsContent>
}

export const Pre = styled.pre`
  border: 1px solid ${({ theme }) => theme.palette.separator.primary};
  padding: ${unit(1)} ${unit(1.5)};
  color: ${({ theme }) => theme.palette.primary.main};
  background-color: ${({ theme }) => theme.background.secondary.main};
`
