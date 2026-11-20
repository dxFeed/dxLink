import { Option, Redacted } from 'effect'
import { click, expect, given, label, role, scene, text, type } from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { DXLinkAuthState, DXLinkConnectionState } from '@dxfeed/dxlink-api'

import { builtinConsoleConfig } from './config'
import { echoPlugin } from './echoPlugin.fixture'
import { ChannelCard, type Model, Session } from './model'
import { makeUpdate } from './update'
import { makeView } from './view/view'

const { init, update } = makeUpdate([echoPlugin])
const view = makeView([echoPlugin])

const idleModel = init(builtinConsoleConfig()).model

const openSession = (auth: DXLinkAuthState, hasAuthorized: boolean): Session =>
  Session.Open({
    sessionId: 1,
    params: {
      url: 'wss://example.test',
      keepaliveInterval: 30,
      keepaliveTimeout: 60,
      acceptKeepaliveTimeout: 60,
    },
    status: {
      connection: DXLinkConnectionState.CONNECTED,
      maybeAuth: Option.some(auth),
      maybeDetails: Option.some({
        clientVersion: 'DXF-JS/test',
        maybeServerVersion: Option.some('1.0-test'),
        maybeServerKeepaliveTimeout: Option.some(60),
      }),
    },
    hasAuthorized,
  })

const authorizedModel: Model = modifyFields(idleModel, {
  session: () => openSession(DXLinkAuthState.AUTHORIZED, true),
})

describe('connection panel', () => {
  test('an idle console offers Connect and nothing below the panel', () => {
    scene(
      { update, view },
      given(idleModel),
      expect(text('Not connected')).toExist(),
      expect(role('button', { name: 'Connect' })).toBeEnabled(),
      expect(role('button', { name: 'Disconnect' })).toBeDisabled(),
      expect(role('heading', { name: 'Channels' })).toBeAbsent(),
      expect(role('heading', { name: 'Authorization' })).toBeAbsent()
    )
  })

  test('a pinned URL is shown but cannot be edited', () => {
    scene(
      { update, view },
      given(
        init({ ...builtinConsoleConfig(), wsUrl: 'wss://pinned.test', locked: ['wsUrl'] }).model
      ),
      expect(label('WebSocket URL')).toBeDisabled(),
      expect(text('Fixed by this deployment.')).toExist()
    )
  })

  test('a connected console shows the versions and offers Reconnect', () => {
    scene(
      { update, view },
      given(authorizedModel),
      expect(text('Connected')).toExist(),
      expect(text(': DXF-JS/test')).toExist(),
      expect(role('button', { name: 'Reconnect' })).toBeEnabled(),
      expect(label('WebSocket URL')).toBeDisabled()
    )
  })
})

describe('authorization', () => {
  test('a server that asks for a token gets the auth panel, not the channels', () => {
    scene(
      { update, view },
      given(
        modifyFields(idleModel, {
          session: () => openSession(DXLinkAuthState.UNAUTHORIZED, false),
        })
      ),
      expect(role('heading', { name: 'Authorization' })).toExist(),
      expect(role('heading', { name: 'Channels' })).toBeAbsent(),
      expect(role('button', { name: 'Authorize' })).toBeDisabled(),
      type(label('Token'), 'secret'),
      expect(role('button', { name: 'Authorize' })).toBeEnabled()
    )
  })

  test('channels stay on screen while an authorized session re-authorizes', () => {
    scene(
      { update, view },
      given(
        modifyFields(idleModel, {
          session: () => openSession(DXLinkAuthState.AUTHORIZING, true),
          authToken: () => Redacted.make('secret'),
        })
      ),
      expect(role('heading', { name: 'Channels' })).toExist(),
      expect(role('heading', { name: 'Authorization' })).toBeAbsent()
    )
  })
})

describe('channels area', () => {
  test('an authorized console offers every registered service', () => {
    scene(
      { update, view },
      given(authorizedModel),
      expect(role('button', { name: 'Echo' })).toExist(),
      expect(text('No channels open. Use the buttons above to open an Echo channel.')).toExist()
    )
  })

  test('a deployment that offers no services says so', () => {
    scene(
      { update, view },
      given(
        modifyFields(authorizedModel, {
          config: (config) => modifyFields(config, { maybeChannelKinds: () => Option.some([]) }),
        })
      ),
      expect(role('button', { name: 'Echo' })).toBeAbsent(),
      expect(text('This console is configured with no channel services.')).toExist()
    )
  })

  test('closing a channel keeps its card as a record without a body', () => {
    scene(
      { update, view },
      given(
        modifyFields(authorizedModel, {
          channels: () => [
            {
              id: '1',
              kind: 'echo',
              card: ChannelCard.Open({ isExpanded: true }),
              model: { channelId: '1', text: 'hello there', isClosed: false },
            },
          ],
        })
      ),
      expect(role('heading', { name: 'Echo #1' })).toExist(),
      expect(text('hello there', { exact: false })).toExist(),
      click(role('button', { name: 'Close channel' })),
      expect(text('closed')).toExist(),
      expect(role('button', { name: 'Close channel' })).toBeAbsent()
    )
  })
})
