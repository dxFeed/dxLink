import { Submodel } from 'foldkit'

import { Kit } from '@dxfeed/dxlink-console-foldkit-core'

import { RequestMessage } from './message'
import type { Request } from './model'
import { accordion, segmented } from './viewKit'

/** Feed channel request form: which view to open, and the optional feed parameters. */
export const requestView = Submodel.defineView<Request, RequestMessage>((request, h) =>
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
                  value: request.view,
                  options: [
                    { value: 'Subscriptions', label: 'Subscriptions' },
                    { value: 'Chart', label: 'Candle chart' },
                  ],
                  onSelect: (view) => RequestMessage.SelectedView({ view }),
                },
                h
              ),
            ]
          ),
        ]
      ),
      accordion(
        'Feed',
        [
          h.div(
            [h.Class('flex flex-col gap-5')],
            [
              Kit.textField(
                {
                  id: 'feed-request-feed',
                  label: 'Feed qualification',
                  value: request.feed,
                  onInput: (value) => RequestMessage.UpdatedFeed({ value }),
                  helperText: 'Optional — leave empty to omit from the request.',
                },
                h
              ),
              Kit.textField(
                {
                  id: 'feed-request-space',
                  label: 'Feed space',
                  value: request.space,
                  onInput: (value) => RequestMessage.UpdatedSpace({ value }),
                  helperText: 'Optional — leave empty to omit from the request.',
                },
                h
              ),
            ]
          ),
        ],
        h
      ),
    ]
  )
)
