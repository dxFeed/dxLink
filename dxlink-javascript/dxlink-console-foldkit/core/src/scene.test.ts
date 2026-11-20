import { Option, Redacted } from 'effect'
import {
  Command,
  Mount,
  click,
  expect,
  given,
  inside,
  label,
  role,
  scene,
  text,
  type,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { DXLinkAuthState, DXLinkConnectionState } from '@dxfeed/dxlink-api'
import { Popover } from '@foldkit/ui'

import { builtinConsoleConfig } from './domain/config'
import { type ErrorLog, emptyErrorLog } from './domain/error'
import { echoPlugin } from './echoPlugin.fixture'
import { ChannelCard, type Model, Session } from './model'
import { channelErrorPopoverId, makeUpdate } from './update'
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

const twoErrors: ErrorLog = {
  errors: [
    { id: 2, type: 'BAD_ACTION', message: 'second failure', time: '10:00:02' },
    { id: 1, type: 'TIMEOUT', message: 'first failure', time: '10:00:01' },
  ],
  nextId: 3,
}

/** The panel is positioned and its backdrop portaled by Mounts, which a Scene has to answer. */
const acknowledgeErrorListMounts = Mount.resolveAll(
  [Popover.AnchorPopover, Popover.Message.CompletedAnchorPopover()],
  [Popover.PortalPopoverBackdrop, Popover.Message.CompletedPortalPopoverBackdrop()]
)

describe('error list', () => {
  test('the connection errors open under their button and are cleared from there', () => {
    scene(
      { update, view },
      given(modifyFields(authorizedModel, { errorLog: () => twoErrors })),
      expect(role('button', { name: '2 errors' })).toHaveAttr('aria-expanded', 'false'),
      expect(text('Connection errors')).toBeAbsent(),
      click(role('button', { name: '2 errors' })),
      acknowledgeErrorListMounts,
      expect(role('button', { name: '2 errors' })).toHaveAttr('aria-expanded', 'true'),
      expect(text('Connection errors')).toExist(),
      expect(text('TIMEOUT')).toExist(),
      expect(text('first failure')).toExist(),
      expect(text('second failure')).toExist(),
      click(role('button', { name: 'Clear' })),
      Command.resolve(Popover.FocusButton, Popover.Message.CompletedFocusButton()),
      Mount.expectEnded(Popover.AnchorPopover, Popover.PortalPopoverBackdrop),
      expect(text('Connection errors')).toBeAbsent(),
      expect(role('button', { name: '2 errors' })).toBeAbsent()
    )
  })

  test('the connection error list closes on a second press of its button', () => {
    scene(
      { update, view },
      given(modifyFields(authorizedModel, { errorLog: () => twoErrors })),
      click(role('button', { name: '2 errors' })),
      acknowledgeErrorListMounts,
      expect(text('Connection errors')).toExist(),
      click(role('button', { name: '2 errors' })),
      Command.resolve(Popover.FocusButton, Popover.Message.CompletedFocusButton()),
      Mount.expectEnded(Popover.AnchorPopover, Popover.PortalPopoverBackdrop),
      expect(text('Connection errors')).toBeAbsent(),
      expect(role('button', { name: '2 errors' })).toHaveAttr('aria-expanded', 'false')
    )
  })

  test("a card's errors open in a list of its own and are cleared from there", () => {
    const echoChannel = (id: string, errorLog: ErrorLog) => ({
      id,
      kind: 'echo',
      card: ChannelCard.Open({
        isExpanded: true,
        errorPopover: Popover.init({ id: channelErrorPopoverId(id) }),
      }),
      model: { channelId: id, text: `echo ${id}`, isClosed: false, errorLog },
    })

    scene(
      { update, view },
      given(
        modifyFields(authorizedModel, {
          channels: () => [echoChannel('1', emptyErrorLog()), echoChannel('2', twoErrors)],
        })
      ),
      inside(
        role('region', { name: 'Echo #1' }),
        expect(role('button', { name: /error/ })).toBeAbsent()
      ),
      inside(role('region', { name: 'Echo #2' }), click(role('button', { name: '2 errors' }))),
      acknowledgeErrorListMounts,
      expect(text('Channel errors')).toExist(),
      expect(text('BAD_ACTION')).toExist(),
      expect(text('second failure')).toExist(),
      click(role('button', { name: 'Clear' })),
      Command.resolve(Popover.FocusButton, Popover.Message.CompletedFocusButton()),
      Mount.expectEnded(Popover.AnchorPopover, Popover.PortalPopoverBackdrop),
      expect(text('Channel errors')).toBeAbsent(),
      expect(role('button', { name: '2 errors' })).toBeAbsent(),
      expect(role('heading', { name: 'Echo #2' })).toExist()
    )
  })
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
              card: ChannelCard.Open({
                isExpanded: true,
                errorPopover: Popover.init({ id: channelErrorPopoverId('1') }),
              }),
              model: {
                channelId: '1',
                text: 'hello there',
                isClosed: false,
                errorLog: emptyErrorLog(),
              },
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
