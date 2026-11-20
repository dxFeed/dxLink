/**
 * The RPC channel service: call a method of a protobuf service over a dxLink channel.
 *
 * Deliberately does not export the channel body or the request form — a host registers the
 * plugin, provides `rpcLayer` among the runtime's resources, and core renders what the
 * plugin names.
 */
export { rpcChannelPlugin } from './plugin'
export type { RpcChannelPluginOptions } from './plugin'
export { rpcLayer } from './service'
export type { RpcServices } from './service'
