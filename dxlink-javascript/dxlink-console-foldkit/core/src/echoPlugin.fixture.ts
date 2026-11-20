import { Option, Schema, Stream } from 'effect'
import { Submodel } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

import { defineChannelPlugin } from './channel/plugin'

/**
 * A channel service with no dxLink behind it: its request is one text field and its channel
 * echoes that text. It stands in for a real plugin wherever the console itself is under test.
 */
const EchoRequest = Schema.Struct({ text: Schema.String })
type EchoRequest = typeof EchoRequest.Type

const EchoChannel = Schema.Struct({
  channelId: Schema.String,
  text: Schema.String,
  isClosed: Schema.Boolean,
})
type EchoChannel = typeof EchoChannel.Type

export const EchoMessage = defineMessageUnion({
  UpdatedText: { value: Schema.String },
})
export type EchoMessage = typeof EchoMessage.Type

export const echoPlugin = defineChannelPlugin<
  EchoRequest,
  EchoMessage,
  string,
  EchoChannel,
  EchoMessage
>({
  kind: 'echo',
  label: 'Echo',
  iconPath: '',
  dialogTitle: 'New Echo channel',
  request: {
    init: () => ({ model: { text: '' } }),
    update: (_request, echoMessage) => ({
      model: { text: echoMessage.value },
    }),
    view: Submodel.defineView<EchoRequest, EchoMessage>((_request, h) => h.div([])),
    toConfig: (request) => Option.liftPredicate(request.text.trim(), (text) => text !== ''),
    isModel: Schema.is(EchoRequest),
    isMessage: Schema.is(EchoMessage),
  },
  channel: {
    init: ({ channelId, config }) => ({
      model: { channelId, text: config, isClosed: false },
    }),
    update: (channel, echoMessage) => ({
      model: { ...channel, text: echoMessage.value },
    }),
    view: Submodel.defineView<EchoChannel, EchoMessage>((_channel, h) => h.div([])),
    summarize: (channel) => ({
      subtitle: channel.text,
      maybeStatus: Option.none(),
      maybeChannelId: Option.none(),
      parameters: {},
      errors: [],
    }),
    close: (channel) => ({ model: { ...channel, isClosed: true } }),
    clearErrors: (channel) => channel,
    isModel: Schema.is(EchoChannel),
    isMessage: Schema.is(EchoMessage),
  },
  events: Stream.empty,
})
