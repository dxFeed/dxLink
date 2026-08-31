import { defineChannelPlugin } from '@dxfeed/dxlink-console-core'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'

import { parseRequest } from './descriptors'
import { RpcChannel } from './rpc-channel'
import { canOpenRpcChannel, RpcChannelRequest } from './rpc-channel-request'
import type { RpcConfig, RpcRequest } from './types'

export interface RpcChannelPluginOptions {
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
}

/** The RPC service: call a method from a protobuf descriptor set. */
export const rpcChannelPlugin = ({
  descriptorSetUrl = '',
  locked = false,
}: RpcChannelPluginOptions = {}) =>
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
    RequestForm: ({ value, onChange }) => (
      <RpcChannelRequest value={value} onChange={onChange} urlLocked={locked} />
    ),
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
