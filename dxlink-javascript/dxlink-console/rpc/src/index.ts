/**
 * The RPC channel service: call a method of a protobuf service over a dxLink channel.
 *
 * Deliberately does not export the channel body or the request form — a host registers the
 * plugin and the core renders what it names.
 */
export { rpcChannelPlugin } from './plugin'
export type { RpcChannelPluginOptions } from './plugin'
export type { RpcConfig, RpcRequest } from './types'
