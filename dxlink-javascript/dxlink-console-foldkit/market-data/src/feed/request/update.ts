import { Option } from 'effect'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { RadioGroup } from '@foldkit/ui'

import type { Feed } from '../domain'
import type { FeedServices } from '../live/service'
import { Message } from './message'
import { type Model, ViewRadioGroup, initialModel } from './model'

export const init = (): Update.Return<Model, Message, FeedServices> => ({
  model: initialModel(),
})

const foldViewRadioGroupOutMessage = RadioGroup.OutMessage.match<
  Update.Step<Model, Message>,
  RadioGroup.OutMessage<Feed.FeedView>
>({
  Selected:
    ({ value }) =>
    (model) => ({ model: modifyFields(model, { view: () => value }) }),
})

const foldViewRadioGroup = Update.foldChild({
  update: ViewRadioGroup.update,
  read: (model: Model) => Option.some(model.viewRadioGroup),
  write: (model, nextViewRadioGroup) =>
    modifyFields(model, { viewRadioGroup: () => nextViewRadioGroup }),
  toParentMessage: (message) => Message.GotViewRadioGroupMessage({ message }),
  foldOutMessage: foldViewRadioGroupOutMessage,
})

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message, FeedServices>>(message, {
    GotViewRadioGroupMessage: ({ message }) => foldViewRadioGroup(model, message),
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
