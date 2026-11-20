import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Kit } from '@dxfeed/dxlink-console-foldkit-core'

import { ORDER_SOURCES_DOC_URL } from '../../lib/orderSources'
import { Message } from './message'
import type { Model } from './model'

const OPTIONAL_HELPER_TEXT = 'Optional — leave empty to omit from the request.'

/**
 * A link to external documentation, for use inside helper text. Inherits the surrounding type
 * scale so it does not enlarge the line it sits in.
 */
const docLink = (href: string, label: string, h: HtmlBuilder<Message>): Html =>
  h.a(
    [
      h.Href(href),
      h.Target('_blank'),
      h.Rel('noreferrer'),
      h.Class('text-sky-700 underline-offset-2 hover:underline dark:text-sky-400'),
    ],
    [label]
  )

const feedFields = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex flex-col gap-5')],
    [
      Kit.textField(
        {
          id: 'dxlink-dom-request-feed',
          label: 'Feed qualification',
          value: model.feed,
          onInput: (value) => Message.UpdatedFeed({ value }),
          helperText: OPTIONAL_HELPER_TEXT,
        },
        h
      ),
      Kit.textField(
        {
          id: 'dxlink-dom-request-space',
          label: 'Feed space',
          value: model.space,
          onInput: (value) => Message.UpdatedSpace({ value }),
          helperText: OPTIONAL_HELPER_TEXT,
        },
        h
      ),
    ]
  )

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('flex flex-col gap-5 pt-2')],
    [
      Kit.textField(
        {
          id: 'dxlink-dom-request-symbol',
          label: 'Symbol *',
          value: model.symbol,
          onInput: (value) => Message.UpdatedSymbol({ value }),
          helperText: 'Subscription symbol for Depth of Market.',
        },
        h
      ),
      h.div(
        [h.Class('flex flex-col gap-1')],
        [
          Kit.textField(
            {
              id: 'dxlink-dom-request-sources',
              label: 'Sources',
              value: model.source,
              onInput: (value) => Message.UpdatedSource({ value }),
            },
            h
          ),
          h.p(
            [h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)],
            [
              'Price level sources, comma/space separated — ',
              h.code([], ['AGGREGATE']),
              ', ',
              h.code([], ['REGIONAL']),
              ', or a venue in lower case such as ',
              h.code([], ['ntv']),
              ' or ',
              h.code([], ['glbx']),
              '. Full list on ',
              docLink(ORDER_SOURCES_DOC_URL, 'kb.dxfeed.com', h),
              '.',
            ]
          ),
        ]
      ),
      Kit.accordion(
        {
          id: 'dxlink-dom-request-feed-section',
          title: 'Feed',
          isOpen: model.isFeedSectionOpen,
          onToggle: (isOpen) => Message.ToggledFeedSection({ isOpen }),
          content: feedFields(model, h),
        },
        h
      ),
    ]
  )
)
