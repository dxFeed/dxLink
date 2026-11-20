import { Option, Redacted, Schema } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { DXLinkAuthState, DXLinkConnectionState } from '@dxfeed/dxlink-api'

import { ReconnectClient, ScrollToChannel, SetAuthToken, StampAcquireFailure } from './command'
import { builtinConsoleConfig } from './domain/config'
import { emptyErrorLog } from './domain/error'
import { Message } from './message'
import { ChannelCard, type Model, Session } from './model'
import { makeUpdate } from './update'

import { makeConsole } from './console'
import { EchoMessage, echoPlugin } from './echoPlugin.fixture'

const { init, update } = makeUpdate([echoPlugin])

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
      Command.resolve(ReconnectClient, Message.SucceededReconnectClient()),
      model((next) => {
        expect(next.session).toEqual(authorizedModel.session)
      })
    )
  })

  test('a client built for an earlier session does not open the current one', () => {
    const opening = Session.Opening({
      sessionId: 2,
      params: {
        url: 'wss://example.test',
        keepaliveInterval: 30,
        keepaliveTimeout: 60,
        acceptKeepaliveTimeout: 60,
      },
    })

    story(
      update,
      given({ ...initialModel, lastSessionId: 2, session: opening }),
      message(Message.AcquiredClient({ sessionId: 1 })),
      model((next) => {
        expect(next.session).toEqual(opening)
      }),
      message(Message.AcquiredClient({ sessionId: 2 })),
      model((next) => {
        expect(next.session._tag).toBe('Open')
      })
    )
  })

  test('a failure to build the client does not end a session that is already open', () => {
    story(
      update,
      given(authorizedModel),
      message(Message.FailedAcquireClient({ reason: 'late' })),
      Command.resolve(
        StampAcquireFailure,
        Message.CompletedStampAcquireFailure({
          error: { type: 'CONNECT_FAILED', message: 'late', time: '10:00:00' },
        })
      ),
      model((next) => {
        expect(next.session).toEqual(authorizedModel.session)
        expect(next.errorLog.errors).toEqual([
          { id: 1, type: 'CONNECT_FAILED', message: 'late', time: '10:00:00' },
        ])
      })
    )
  })

  test('a reconnect that fails is reported in the connection log', () => {
    story(
      update,
      given(authorizedModel),
      message(Message.ClickedReconnect()),
      Command.resolve(
        ReconnectClient,
        Message.FailedReconnectClient({
          error: { type: 'CONSOLE', message: 'No connection is open.', time: '10:00:00' },
        })
      ),
      model((next) => {
        expect(next.errorLog.errors).toEqual([
          { id: 1, type: 'CONSOLE', message: 'No connection is open.', time: '10:00:00' },
        ])
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
      Command.resolve(SetAuthToken, Message.SucceededSetAuthToken())
    )
  })
})

describe('model schema', () => {
  const Console = makeConsole([echoPlugin])

  test('accepts a channel whose Model is one of the registered plugins', () => {
    expect(
      Schema.is(Console.Model)({
        ...authorizedModel,
        channels: [
          {
            id: '1',
            kind: 'echo',
            card: ChannelCard.Closed(),
            model: { channelId: '1', text: 'hello', isClosed: true },
          },
        ],
      })
    ).toBe(true)
  })

  test('rejects a channel whose Model no registered plugin describes', () => {
    expect(
      Schema.is(Console.Model)({
        ...authorizedModel,
        channels: [{ id: '1', kind: 'echo', card: ChannelCard.Closed(), model: { nope: true } }],
      })
    ).toBe(false)
  })
})

describe('message schema', () => {
  const Console = makeConsole([echoPlugin])

  test('accepts a channel Message a registered plugin declares, and rejects any other', () => {
    expect(
      Schema.is(Console.Message)(
        Message.GotChannelMessage({
          channelId: '1',
          message: EchoMessage.UpdatedText({ value: 'hi' }),
        })
      )
    ).toBe(true)
    expect(
      Schema.is(Console.Message)(Message.GotChannelMessage({ channelId: '1', message: 'hi' }))
    ).toBe(false)
  })

  test('a request Message has to belong to the plugin it is addressed to', () => {
    const message = EchoMessage.UpdatedText({ value: 'hi' })

    expect(
      Schema.is(Console.Message)(Message.GotRequestMessage({ pluginId: 'echo', message }))
    ).toBe(true)
    expect(
      Schema.is(Console.Message)(Message.GotRequestMessage({ pluginId: 'other', message }))
    ).toBe(false)
  })

  test('Messages that carry no plugin payload are unaffected', () => {
    expect(Schema.is(Console.Message)(Message.ClickedConnect())).toBe(true)
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
            card: ChannelCard.Closed(),
            model: { channelId: '1', text: 'world', isClosed: true },
          },
        ])
      })
    )
  })

  test('a closed card cannot be expanded again', () => {
    story(
      update,
      given({ ...authorizedModel, maybeRequestKind: Option.some('echo') }),
      message(requestMessage('hello')),
      message(Message.ClickedOpenChannel()),
      Command.resolve(ScrollToChannel, Message.CompletedScrollToChannel()),
      message(Message.ClickedToggleChannel({ channelId: '1' })),
      model((next) => {
        expect(next.channels[0]?.card).toEqual(
          ChannelCard.Open({ isExpanded: false, isErrorListOpen: false })
        )
      }),
      message(Message.ClickedCloseChannel({ channelId: '1' })),
      message(Message.ClickedToggleChannel({ channelId: '1' })),
      model((next) => {
        expect(next.channels[0]?.card).toEqual(ChannelCard.Closed())
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
