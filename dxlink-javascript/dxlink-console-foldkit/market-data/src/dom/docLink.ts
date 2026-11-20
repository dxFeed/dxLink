import type { Html, HtmlBuilder } from 'foldkit/html'

/**
 * A link to external documentation, for use inside helper text. Inherits the surrounding type
 * scale so it does not enlarge the line it sits in.
 */
export const docLink = <Message>(href: string, label: string, h: HtmlBuilder<Message>): Html =>
  h.a(
    [
      h.Href(href),
      h.Target('_blank'),
      h.Rel('noreferrer'),
      h.Class('text-sky-700 underline-offset-2 hover:underline dark:text-sky-400'),
    ],
    [label]
  )
