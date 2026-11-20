import { Option } from 'effect'
import type { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import type { Feed } from '../domain'
import type { FeedServices } from '../live/service'
import { Message } from './message'
import { type Model, initialModel } from './model'

export const init = (): Update.Return<Model, Message, FeedServices> => ({
  model: initialModel(),
})

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message, FeedServices>>(message, {
    SelectedView: ({ view }) => ({
      model: modifyFields(model, { view: () => view }),
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

/** The config the form describes. Every request can open a channel, so it is always `Some`. */
export const toConfig = (model: Model): Option.Option<Feed.FeedConfig> =>
  Option.some({
    view: model.view,
    feed: model.feed.trim(),
    space: model.space.trim(),
  })
