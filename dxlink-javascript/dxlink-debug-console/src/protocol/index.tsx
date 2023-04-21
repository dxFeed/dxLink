import { Fragment, createElement, ReactNode, useState, useEffect } from 'react'
import { Options } from 'rehype-react'
import rehypeReact from 'rehype-react'
import {
  Link,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TableHeadCell,
  Div,
  Pre,
} from './body-components'

import PROTOCOL_MD from './protocol.md?raw'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { ContentTemplate } from '../common/content-template'
import rehypeSlug from 'rehype-slug'

const REHYPE_REACT_OPTIONS: Options = {
  createElement,
  components: {
    a: Link,
    p: Paragraph,
    table: Table,
    tr: TableRow,
    td: TableCell,
    th: TableHeadCell,
    div: Div,
    tbody: Fragment,
    pre: Pre,
  },
}

export function Protocol() {
  const [content, setContent] = useState<ReactNode>()

  useEffect(() => {
    void unified()
      .use(remarkParse)
      .use(remarkRehype)
      .use(rehypeSlug)
      .use(rehypeReact, REHYPE_REACT_OPTIONS)
      .process(PROTOCOL_MD)
      .then((file) => {
        setContent(file.result)
      }, console.error)
  }, [])

  return <ContentTemplate title="Protocol">{content}</ContentTemplate>
}
