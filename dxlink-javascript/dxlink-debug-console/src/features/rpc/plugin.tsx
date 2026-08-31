import SwapHorizIcon from '@mui/icons-material/SwapHoriz'

import { parseRequest } from './descriptors'
import { RpcChannel } from './rpc-channel'
import { canOpenRpcChannel, RpcChannelRequest } from './rpc-channel-request'
import type { RpcConfig, RpcRequest } from './types'
import { defineChannelPlugin } from '../channels/plugin'

export interface RpcChannelPluginOptions {
  /**
   * Descriptor-set endpoint the request form starts with.
   *
   * The only per-plugin option any service has, which is why this one is a factory and the
   * other three are plain descriptors. It is supplied at composition rather than read from
   * the console profile, so the channels area does not have to know that descriptor sets
   * exist.
   */
  descriptorSetUrl?: string
}

/** The RPC service: call a method from a protobuf descriptor set. */
export const rpcChannelPlugin = ({ descriptorSetUrl = '' }: RpcChannelPluginOptions = {}) =>
  defineChannelPlugin<RpcConfig, RpcRequest>({
    kind: 'rpc',
    label: 'RPC',
    icon: <SwapHorizIcon />,
    dialogTitle: 'New RPC channel',
    // A service picker, a method picker and a JSON editor; the other three forms are a
    // handful of fields.
    dialogMaxWidth: 'md',
    createRequest: () => ({
      url: descriptorSetUrl,
      registry: null,
      source: null,
      serviceName: '',
      methodName: '',
      json: '{}',
    }),
    RequestForm: RpcChannelRequest,
    canOpen: canOpenRpcChannel,
    buildConfig: (request) => {
      const service = request.registry?.getService(request.serviceName)
      const method = service?.method[request.methodName]
      if (service === undefined || method === undefined) {
        return null
      }
      const parsed = parseRequest(method.input, request.json)

      return 'error' in parsed ? null : { service, method, request: parsed.message }
    },
    Channel: RpcChannel,
  })
