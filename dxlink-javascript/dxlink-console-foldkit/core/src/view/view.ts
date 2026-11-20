import { Option } from 'effect'
import { Submodel } from 'foldkit'

import { DXLinkAuthState, DXLinkConnectionState } from '@dxfeed/dxlink-api'

import type { RegisteredChannelPlugin } from '../channel/plugin'
import type { Message } from '../message'
import { type Model, Session } from '../model'
import { authPanel } from './authPanel'
import { channelsArea } from './channelsArea'
import { connectionPanel } from './connectionPanel'

type Gate = Readonly<{
  maybeAuthPanel: Option.Option<Readonly<{ isAuthorizing: boolean }>>
  hasChannelsArea: boolean
}>

/**
 * What the page shows below the connection panel:
 *  - connected and the server asks for authorization → the auth panel,
 *  - authorized, now or earlier in this session → the channels area.
 *
 * The channels area is gated on "has ever been authorized" rather than on the live state, so
 * it stays through a reconnect: the same client re-opens its channels itself, and the open
 * cards are kept instead of being torn down on the brief connection and auth flicker. While
 * the auth state is not yet known neither is shown, which keeps a token form from flashing on
 * a server that needs no authorization.
 */
const gateOf = (session: Session): Gate =>
  Session.match(session, {
    Idle: () => ({ maybeAuthPanel: Option.none(), hasChannelsArea: false }),
    Opening: () => ({ maybeAuthPanel: Option.none(), hasChannelsArea: false }),
    Open: ({ status, hasAuthorized }) => ({
      hasChannelsArea: hasAuthorized,
      maybeAuthPanel:
        !hasAuthorized &&
        status.connection === DXLinkConnectionState.CONNECTED &&
        Option.exists(status.maybeAuth, (auth) => auth !== DXLinkAuthState.AUTHORIZED)
          ? Option.some({
              isAuthorizing: Option.contains(status.maybeAuth, DXLinkAuthState.AUTHORIZING),
            })
          : Option.none(),
    }),
  })

export const makeView = <Services>(plugins: ReadonlyArray<RegisteredChannelPlugin<Services>>) =>
  Submodel.defineView<Model, Message>((model, h) => {
    const gate = gateOf(model.session)

    return h.div(
      [h.Class('flex flex-col gap-6 text-zinc-900 dark:text-zinc-100')],
      [
        connectionPanel(model, h),
        Option.match(gate.maybeAuthPanel, {
          onNone: () => h.empty,
          onSome: ({ isAuthorizing }) => authPanel(model, isAuthorizing, h),
        }),
        gate.hasChannelsArea ? channelsArea(model, plugins, h) : h.empty,
      ]
    )
  })
