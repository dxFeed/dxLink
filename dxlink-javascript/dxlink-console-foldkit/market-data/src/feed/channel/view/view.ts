import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Kit } from '@dxfeed/dxlink-console-foldkit-core'

import type { Message } from '../message'
import { Lifecycle, type Model, View } from '../model'
import { chartView } from './chart'
import { eventsSection, subscriptionsView } from './subscriptions'

const openingView = (h: HtmlBuilder<Message>): Html =>
  Kit.notice('Opening the channel…', 'Neutral', h)

const failedToOpenView = (h: HtmlBuilder<Message>): Html =>
  Kit.notice(
    'The channel could not be opened. The reason is in the errors of this channel.',
    'Danger',
    h
  )

const openedView = (model: Model, h: HtmlBuilder<Message>): Html =>
  View.match(model.view, {
    Subscriptions: ({ state }) => subscriptionsView(model, state, h),
    Chart: ({ state }) => chartView(model, state, h),
  })

/** What a closed channel leaves to read: the events it received, and no form to act on. */
const closedView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex flex-col gap-4')],
    [
      Kit.notice('The channel is closed and accepts no further input.', 'Neutral', h),
      View.match(model.view, {
        Subscriptions: ({ state }) => eventsSection(state, h),
        Chart: () => h.empty,
      }),
    ]
  )

/** The body of a FEED card. The forms that act on the channel exist only while it is opened. */
export const view = Submodel.defineView<Model, Message>((model, h) =>
  Lifecycle.match(model.lifecycle, {
    Opening: () => openingView(h),
    Opened: () => openedView(model, h),
    FailedToOpen: () => failedToOpenView(h),
    Closed: () => closedView(model, h),
  })
)
