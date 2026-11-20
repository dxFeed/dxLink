import { Option, Predicate, Schema } from 'effect'
import { Submodel, type Update } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import { Kit } from '@dxfeed/dxlink-console-foldkit-core'

import { ORDER_SOURCES_DOC_URL } from '../lib/orderSources'
import { docLink } from './docLink'
import type { DomConfig } from './types'

const TAG = 'DomRequest'

// MODEL

/**
 * The values entered in the DOM request form. Kept between dialog opens, so several channels
 * of the same kind are quick to open.
 */
export const Model = Schema.TaggedStruct(TAG, {
  symbol: Schema.String,
  source: Schema.String,
  feed: Schema.String,
  space: Schema.String,
})
export type Model = typeof Model.Type

/** Only this module builds a value carrying the tag, so the tag identifies the Model. */
export const isModel = (value: unknown): value is Model => Predicate.isTagged(value, TAG)

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedSymbol: { value: Schema.String },
  UpdatedSource: { value: Schema.String },
  UpdatedFeed: { value: Schema.String },
  UpdatedSpace: { value: Schema.String },
})
export type Message = typeof Message.Type

// INIT

/** AGGREGATE is the price-level source that works without picking a venue. */
export const init = (): Update.Return<Model, Message> => ({
  model: Model.make({
    symbol: 'AAPL',
    source: 'AGGREGATE',
    feed: '',
    space: '',
  }),
})

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    UpdatedSymbol: ({ value }) => ({
      model: modifyFields(model, { symbol: () => value }),
    }),
    UpdatedSource: ({ value }) => ({
      model: modifyFields(model, { source: () => value }),
    }),
    UpdatedFeed: ({ value }) => ({
      model: modifyFields(model, { feed: () => value }),
    }),
    UpdatedSpace: ({ value }) => ({
      model: modifyFields(model, { space: () => value }),
    }),
  })

/** A channel needs a symbol; everything else may be left to the server. */
export const toConfig = (model: Model): Option.Option<DomConfig> => {
  const symbol = model.symbol.trim()

  return symbol === ''
    ? Option.none()
    : Option.some({
        symbol,
        source: model.source.trim(),
        feed: model.feed.trim(),
        space: model.space.trim(),
      })
}

// VIEW

const OPTIONAL_HELPER_TEXT = 'Optional — leave empty to omit from the request.'

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
      h.details(
        [h.Class(`rounded-lg border ${Kit.DIVIDER_CLASS}`)],
        [
          h.summary([h.Class('cursor-pointer px-4 py-3 font-semibold select-none')], ['Feed']),
          h.div(
            [h.Class('flex flex-col gap-5 px-4 pb-4')],
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
          ),
        ]
      ),
    ]
  )
)
