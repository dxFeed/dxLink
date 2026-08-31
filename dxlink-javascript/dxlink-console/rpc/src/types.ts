import type { DescMethod, DescService, FileRegistry, Message } from '@bufbuild/protobuf'

/** Config an RPC channel is opened with. */
export interface RpcConfig {
  service: DescService
  method: DescMethod
  /**
   * The request to open the channel with, already parsed against `method.input`.
   *
   * Parsing happens in the request form, where a malformed request can still be corrected;
   * by the time a channel is opened the message is known to be valid.
   */
  request: Message
}

/**
 * RPC channel-request parameters.
 *
 * The registry is held here rather than re-fetched per dialog open, so a descriptor set is
 * loaded once and several channels can be opened against it.
 */
export interface RpcRequest {
  /** Descriptor-set endpoint, kept between opens. */
  url: string
  /** Registry built from the loaded descriptor set; null until one is loaded. */
  registry: FileRegistry | null
  /** Where the loaded registry came from — a URL or a file name. */
  source: string | null
  /** Fully qualified name of the selected service. */
  serviceName: string
  /** ECMAScript name of the selected method, as `DescService.method` keys it. */
  methodName: string
  /** The request message being edited, as protobuf-JSON. */
  json: string
}
