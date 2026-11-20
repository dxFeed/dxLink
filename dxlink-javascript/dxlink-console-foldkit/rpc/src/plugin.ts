import {
  type RegisteredChannelPlugin,
  defineChannelPlugin,
} from '@dxfeed/dxlink-console-foldkit-core'

import * as Channel from './channel'
import * as Request from './request'
import type { RpcServices } from './service'

export type RpcChannelPluginOptions = Readonly<{
  /**
   * Descriptor-set endpoint the request form starts with.
   *
   * Supplied at composition rather than read from the console profile, which is why neither
   * the channels area nor the profile has to know that descriptor sets exist.
   */
  descriptorSetUrl?: string
  /**
   * Pin that endpoint: the field renders read-only, as a locked WebSocket URL does.
   *
   * Belongs here rather than in the profile's `locked` list for the same reason as the URL
   * itself — it is this service's setting, and core has no vocabulary for it.
   */
  locked?: boolean
}>

const ICON_SWAP_HORIZONTAL =
  'M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5'

/** The RPC service: call a method from a protobuf descriptor set. */
export const rpcChannelPlugin = (
  options: RpcChannelPluginOptions = {}
): RegisteredChannelPlugin<RpcServices> => {
  const requestOptions: Request.RequestOptions = {
    descriptorSetUrl: options.descriptorSetUrl ?? '',
    isUrlLocked: options.locked ?? false,
  }

  return defineChannelPlugin<
    Request.Model,
    Request.Message,
    Request.Config,
    Channel.Model,
    Channel.Message,
    RpcServices
  >({
    kind: 'rpc',
    label: 'RPC',
    iconPath: ICON_SWAP_HORIZONTAL,
    dialogTitle: 'New RPC channel',
    // NOTE: a service picker, a method picker, generated fields and a JSON editor; the other
    // services' forms are a handful of fields.
    dialogWidth: 'Wide',
    request: {
      init: Request.makeInit(requestOptions),
      update: Request.makeUpdate(requestOptions),
      view: Request.makeView(requestOptions),
      toConfig: Request.toConfig,
      Model: Request.Model,
      Message: Request.Message,
      isModel: Request.isModel,
      isMessage: Request.isMessage,
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
      isMessage: Channel.isMessage,
    },
  })
}
