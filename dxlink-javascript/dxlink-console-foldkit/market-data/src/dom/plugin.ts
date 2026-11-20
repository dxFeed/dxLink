import { Schema } from 'effect'

import { defineChannelPlugin } from '@dxfeed/dxlink-console-foldkit-core'

import * as Channel from './channel'
import { events } from './events'
import { Message as ChannelMessage } from './message'
import * as Request from './request'
import { view } from './view'

/** A four-column grid, read as a ladder. */
const ICON_PATH =
  'M9 4.5v15m6-15v15M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V6a1.5 1.5 0 0 1 1.5-1.5Z'

/** The DOM service: a price-level ladder for one symbol. */
export const domChannelPlugin = defineChannelPlugin({
  kind: 'dom',
  label: 'DOM',
  iconPath: ICON_PATH,
  dialogTitle: 'New DOM channel',
  request: {
    init: Request.init,
    update: Request.update,
    view: Request.view,
    toConfig: Request.toConfig,
    isModel: Request.isModel,
    isMessage: Schema.is(Request.Message),
  },
  channel: {
    init: Channel.init,
    update: Channel.update,
    view,
    summarize: Channel.summarize,
    close: Channel.close,
    clearErrors: Channel.clearErrors,
    isModel: Channel.isModel,
    isMessage: Schema.is(ChannelMessage),
  },
  events,
})
