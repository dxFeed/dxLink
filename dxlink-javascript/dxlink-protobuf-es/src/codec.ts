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

/**
 * `dxlink-rpc` sends payloads inside `CHANNEL_DATA` messages and the WebSocket client is
 * JSON-only, so messages travel as canonical protobuf-JSON — the encoding the server's
 * `dxlink-ws-json` subprotocol expects. Binary protobuf and `google.protobuf.Any` payloads are
 * not part of this binding.
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
 * Convert a JSON payload received on the channel back to a response message.
 */
export const decodeResponse = (
  service: DescService,
  method: DescMethod,
  payload: unknown,
  options?: Partial<JsonReadOptions>
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
