import { Option, Redacted, Schema, Stream } from 'effect'
import { Submodel } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { DXLinkAuthState, DXLinkConnectionState } from '@dxfeed/dxlink-api'

import { defineChannelPlugin } from './channel/plugin'
import { ReconnectClient, ScrollToChannel, SetAuthToken } from './command'
import { builtinConsoleConfig } from './config'
import { emptyErrorLog } from './error'
import { Message } from './message'
import { type Model, Session } from './model'
import { makeConsole } from './update'

const EchoRequest = Schema.Struct({ text: Schema.String })
type EchoRequest = typeof EchoRequest.Type

const EchoChannel = Schema.Struct({
  channelId: Schema.String,
  text: Schema.String,
  isClosed: Schema.Boolean,
})
type EchoChannel = typeof EchoChannel.Type

const EchoMessage = defineMessageUnion({
  UpdatedText: { value: Schema.String },
})
type EchoMessage = typeof EchoMessage.Type

const echoPlugin = defineChannelPlugin<EchoRequest, EchoMessage, string, EchoChannel, EchoMessage>({
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

const { init, update } = makeConsole([echoPlugin])

const initialModel = init(builtinConsoleConfig()).model

const authorizedModel: Model = {
  ...initialModel,
  lastSessionId: 1,
  session: Session.Open({
    sessionId: 1,
    params: {
      url: 'wss://example.test',
      keepaliveInterval: 30,
      keepaliveTimeout: 60,
      acceptKeepaliveTimeout: 60,
    },
    status: {
      connection: DXLinkConnectionState.CONNECTED,
      maybeAuth: Option.some(DXLinkAuthState.AUTHORIZED),
      maybeDetails: Option.none(),
    },
    hasAuthorized: true,
  }),
}

describe('connection', () => {
  test('the form is seeded from the configuration profile', () => {
    expect(initialModel.form).toEqual({
      url: '',
      keepaliveInterval: '30',
      keepaliveTimeout: '60',
      acceptKeepalive: '60',
    })
  })

  test('keepalive fields keep digits only', () => {
    story(
      update,
      given(initialModel),
      message(
        Message.UpdatedConnectionField({
          field: 'KeepaliveInterval',
          value: '1a5s',
        })
      ),
      model((next) => {
        expect(next.form.keepaliveInterval).toBe('15')
      })
    )
  })

  test('Connect starts a new session from the form and clears old errors', () => {
    story(
      update,
      given({
        ...initialModel,
        errorLog: {
          errors: [{ id: 1, type: 'TIMEOUT', message: 'late', time: '10:00' }],
          nextId: 2,
        },
      }),
      message(
        Message.UpdatedConnectionField({
          field: 'Url',
          value: ' wss://example.test ',
        })
      ),
      message(Message.ClickedConnect()),
      model((next) => {
        expect(next.session).toEqual(
          Session.Opening({
            sessionId: 1,
            params: {
              url: 'wss://example.test',
              keepaliveInterval: 30,
              keepaliveTimeout: 60,
              acceptKeepaliveTimeout: 60,
            },
          })
        )
        expect(next.errorLog).toEqual(emptyErrorLog())
      })
    )
  })

  test('a session stays authorized through a reconnect flicker', () => {
    story(
      update,
      given(authorizedModel),
      message(
        Message.ChangedClientStatus({
          status: {
            connection: DXLinkConnectionState.CONNECTING,
            maybeAuth: Option.none(),
            maybeDetails: Option.none(),
          },
        })
      ),
      model((next) => {
        expect(next.session._tag).toBe('Open')
        expect(next.session._tag === 'Open' && next.session.hasAuthorized).toBe(true)
      })
    )
  })

  test('Reconnect keeps the session and asks the same client to reconnect', () => {
    story(
      update,
      given(authorizedModel),
      message(Message.ClickedReconnect()),
      Command.expectExact(ReconnectClient),
      Command.resolve(ReconnectClient, Message.CompletedReconnectClient()),
      model((next) => {
        expect(next.session).toEqual(authorizedModel.session)
      })
    )
  })

  test('an empty token is not submitted', () => {
    story(
      update,
      given({ ...authorizedModel, authToken: Redacted.make('   ') }),
      message(Message.SubmittedAuthToken()),
      Command.expectNone()
    )
  })

  test('a token is trimmed and sent to the client', () => {
    story(
      update,
      given({ ...authorizedModel, authToken: Redacted.make(' secret ') }),
      message(Message.SubmittedAuthToken()),
      Command.expectHas(SetAuthToken),
      Command.resolve(SetAuthToken, Message.CompletedSetAuthToken())
    )
  })
})

describe('channels', () => {
  const requestMessage = (value: string) =>
    Message.GotRequestMessage({
      pluginId: 'echo',
      message: EchoMessage.UpdatedText({ value }),
    })

  test('a request that yields no config opens nothing', () => {
    story(
      update,
      given({ ...authorizedModel, maybeRequestKind: Option.some('echo') }),
      message(Message.ClickedOpenChannel()),
      model((next) => {
        expect(next.channels).toEqual([])
      })
    )
  })

  test('messages reach the plugin they belong to, and a closed card stays', () => {
    story(
      update,
      given({ ...authorizedModel, maybeRequestKind: Option.some('echo') }),
      message(requestMessage('hello')),
      message(Message.ClickedOpenChannel()),
      Command.resolve(ScrollToChannel, Message.CompletedScrollToChannel()),
      message(
        Message.GotChannelMessage({
          channelId: '1',
          message: EchoMessage.UpdatedText({ value: 'world' }),
        })
      ),
      message(Message.ClickedCloseChannel({ channelId: '1' })),
      model((next) => {
        expect(next.requests).toEqual({ echo: { text: 'hello' } })
        expect(next.nextChannelId).toBe(2)
        expect(next.channels).toEqual([
          {
            id: '1',
            kind: 'echo',
            title: 'Echo #1',
            isExpanded: true,
            isClosed: true,
            model: { channelId: '1', text: 'world', isClosed: true },
          },
        ])
      })
    )
  })

  test('a message of another shape is left for nobody', () => {
    story(
      update,
      given({ ...authorizedModel, maybeRequestKind: Option.some('echo') }),
      message(requestMessage('hello')),
      message(Message.ClickedOpenChannel()),
      Command.resolve(ScrollToChannel, Message.CompletedScrollToChannel()),
      message(Message.GotChannelMessage({ channelId: '1', message: 'not a message' })),
      model((next) => {
        expect(next.channels[0]?.model).toEqual({
          channelId: '1',
          text: 'hello',
          isClosed: false,
        })
      })
    )
  })

  test('disconnecting ends the session and drops its channels', () => {
    story(
      update,
      given({ ...authorizedModel, maybeRequestKind: Option.some('echo') }),
      message(requestMessage('hello')),
      message(Message.ClickedOpenChannel()),
      Command.resolve(ScrollToChannel, Message.CompletedScrollToChannel()),
      message(Message.ClickedDisconnect()),
      model((next) => {
        expect(next.session).toEqual(Session.Idle())
        expect(next.channels).toEqual([])
        expect(next.nextChannelId).toBe(2)
      })
    )
  })
})
