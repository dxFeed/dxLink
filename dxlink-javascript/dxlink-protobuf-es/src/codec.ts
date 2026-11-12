import {
  create,
  type DescMessage,
  type DescMethod,
  type DescService,
  fromJson,
  type JsonReadOptions,
  type JsonValue,
  type JsonWriteOptions,
  type MessageShape,
  toJson,
} from '@bufbuild/protobuf'

import type { DXLinkJsonReadOptions } from './service'
import { withUnresolvedAny } from './unresolved-any'

/**
 * `dxlink-rpc` sends payloads inside `CHANNEL_DATA` messages and the WebSocket client is
 * JSON-only, so messages travel as canonical protobuf-JSON — the encoding the server's
 * `dxlink-ws-json` subprotocol expects. Binary protobuf is not part of this binding;
 * `google.protobuf.Any` decodes through the registry in the JSON read options.
 */

const describe = (service: DescService, method: DescMethod) => `${service.typeName}/${method.name}`

/**
 * Convert a request message (or its init shape) to the JSON payload sent on the channel.
 */
export const encodeRequest = (
  service: DescService,
  method: DescMethod,
  request: unknown,
  options?: Partial<JsonWriteOptions>
): JsonValue => {
  const schema: DescMessage = method.input
  try {
    return toJson(schema, create(schema, request as never), options) as JsonValue
  } catch (error) {
    throw new Error(`Failed to encode ${schema.typeName} request of ${describe(service, method)}`, {
      cause: error,
    })
  }
}

/**
 * Read options a service decodes its responses with.
 *
 * Unknown fields and enum values are ignored unless the caller asks otherwise, so a server adding
 * a field or an enum value does not make older clients fail; an unknown enum value reads as the
 * enum's zero value. With `keepUnresolvedAny`, an `Any` of a type missing from the registry
 * decodes to an `Any` carrying only its type URL (see `withUnresolvedAny`).
 */
export const createJsonReadOptions = ({
  keepUnresolvedAny = false,
  ...options
}: DXLinkJsonReadOptions = {}): Partial<JsonReadOptions> => ({
  ignoreUnknownFields: true,
  ...options,
  registry: keepUnresolvedAny ? withUnresolvedAny(options.registry) : options.registry,
})

/**
 * Convert a JSON payload received on the channel back to a response message.
 */
export const decodeResponse = (
  service: DescService,
  method: DescMethod,
  payload: unknown,
  options: Partial<JsonReadOptions>
): MessageShape<DescMessage> => {
  const schema: DescMessage = method.output
  try {
    return fromJson(schema, payload as JsonValue, options)
  } catch (error) {
    throw new Error(
      `Failed to decode ${schema.typeName} response of ${describe(service, method)}`,
      { cause: error }
    )
  }
}
