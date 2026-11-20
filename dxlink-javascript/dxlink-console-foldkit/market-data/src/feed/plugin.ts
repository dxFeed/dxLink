import { Schema } from 'effect'

import { defineChannelPlugin } from '@dxfeed/dxlink-console-foldkit-core'

import * as Channel from './channel'
import * as Request from './request'

const ICON_FEED =
  'M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941'

/** The FEED service: subscribe to symbols and watch events arrive, or chart candles. */
export const feedChannelPlugin = defineChannelPlugin({
  kind: 'feed',
  label: 'Feed',
  iconPath: ICON_FEED,
  dialogTitle: 'New Feed channel',
  request: {
    init: Request.init,
    update: Request.update,
    view: Request.view,
    toConfig: Request.toConfig,
    Model: Request.Model,
    Message: Request.Message,
    isModel: Schema.is(Request.Model),
    isMessage: Schema.is(Request.Message),
  },
  channel: {
    init: Channel.init,
    update: Channel.update,
    view: Channel.view,
    summarize: Channel.summarize,
    close: Channel.close,
    connect: Channel.connect,
    Model: Channel.Model,
    Message: Channel.Message,
    clearErrors: Channel.clearErrors,
    isModel: Channel.isModel,
    isMessage: Schema.is(Channel.Message),
  },
})
