import { Option } from 'effect'
import type { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import type { Config } from '../domain'
import { Message } from './message'
import { Model } from './model'

// INIT

/** AGGREGATE is the price-level source that works without picking a venue. */
export const init = (): Update.Return<Model, Message> => ({
  model: Model.make({
    symbol: 'AAPL',
    source: 'AGGREGATE',
    feed: '',
    space: '',
    isFeedSectionOpen: false,
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
    ToggledFeedSection: ({ isOpen }) => ({
      model: modifyFields(model, { isFeedSectionOpen: () => isOpen }),
    }),
  })

/** A channel needs a symbol; everything else may be left to the server. */
export const toConfig = (model: Model): Option.Option<Config.DomConfig> => {
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
