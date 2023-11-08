import { Fragment, ReactNode, createElement, useEffect, useState } from 'react'
import rehypeReact, { Options } from 'rehype-react'
import rehypeSlug from 'rehype-slug'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

import {
  Div,
  Link,
  Paragraph,
  Pre,
  Table,
  TableCell,
  TableHeadCell,
  TableRow,
} from './body-components'
import PROTOCOL_MD from './protocol.md?raw'
import { ContentTemplate } from '../common/content-template'

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
