import { Submodel } from 'foldkit'

import { Kit } from '@dxfeed/dxlink-console-foldkit-core'

import { segmented } from '../viewKit'
import { Message } from './message'
import type { Model } from './model'

/** Feed channel request form: which view to open, and the optional feed parameters. */
export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('flex flex-col gap-5 pt-1')],
    [
      h.div(
        [h.Class('flex flex-col gap-2')],
        [
          h.span([h.Class('text-sm font-semibold')], ['View']),
          h.div(
            [],
            [
              segmented(
                {
                  label: 'View',
                  value: model.view,
                  options: [
                    { value: 'Subscriptions', label: 'Subscriptions' },
                    { value: 'Chart', label: 'Candle chart' },
                  ],
                  onSelect: (selected) => Message.SelectedView({ view: selected }),
                },
                h
              ),
            ]
          ),
        ]
      ),
      Kit.accordion(
        {
          id: 'feed-request-feed-section',
          title: 'Feed',
          isOpen: model.isFeedSectionOpen,
          onToggle: (isOpen) => Message.ToggledFeedSection({ isOpen }),
          content: h.div(
            [h.Class('flex flex-col gap-5')],
            [
              Kit.textField(
                {
                  id: 'feed-request-feed',
                  label: 'Feed qualification',
                  value: model.feed,
                  onInput: (value) => Message.UpdatedFeed({ value }),
                  helperText: 'Optional — leave empty to omit from the request.',
                },
                h
              ),
              Kit.textField(
                {
                  id: 'feed-request-space',
                  label: 'Feed space',
                  value: model.space,
                  onInput: (value) => Message.UpdatedSpace({ value }),
                  helperText: 'Optional — leave empty to omit from the request.',
                },
                h
              ),
            ]
          ),
        },
        h
      ),
    ]
  )
)
