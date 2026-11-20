import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { DXLinkAuthState, DXLinkConnectionState } from '@dxfeed/dxlink-api'
import { Dialog } from '@foldkit/ui'

import * as ErasedChannel from './channel/erasedChannel'
import * as ErasedRequest from './channel/erasedRequest'
import { ConsoleConfig } from './domain/config'
import { ErrorLog } from './domain/error'

export const ConnectionState = Schema.Enum(DXLinkConnectionState)
export const AuthState = Schema.Enum(DXLinkAuthState)

/** What the client reports about an established connection. */
export const ConnectionDetails = Schema.Struct({
  clientVersion: Schema.String,
  maybeServerVersion: Schema.Option(Schema.String),
  maybeServerKeepaliveTimeout: Schema.Option(Schema.Finite),
})
export type ConnectionDetails = typeof ConnectionDetails.Type

/** Everything a client is built from. A session's parameters never change. */
export const ClientParams = Schema.Struct({
  url: Schema.String,
  keepaliveInterval: Schema.Finite,
  keepaliveTimeout: Schema.Finite,
  acceptKeepaliveTimeout: Schema.Finite,
})
export type ClientParams = typeof ClientParams.Type

/** The client's own view of its connection, as its listeners last reported it. */
export const ClientStatus = Schema.Struct({
  connection: ConnectionState,
  /**
   * `None` until the server has said: a server that needs no authorization must not flash a
   * token form while the connection is still being established.
   */
  maybeAuth: Schema.Option(AuthState),
  maybeDetails: Schema.Option(ConnectionDetails),
})
export type ClientStatus = typeof ClientStatus.Type

/**
 * One client, from the Connect that created it to the Disconnect — or the next Connect —
 * that ends it. Reconnecting keeps the session: the same client re-opens its own channels.
 *
 * `sessionId` is what makes two sessions with identical parameters different, so connecting
 * again always builds a fresh client.
 */
export const Session = defineTaggedUnion({
  Idle: {},
  /** The client is being built; nothing is listening to it yet. */
  Opening: { sessionId: Schema.Finite, params: ClientParams },
  Open: {
    sessionId: Schema.Finite,
    params: ClientParams,
    status: ClientStatus,
    /**
     * Whether this client has ever been authorized. Stays `true` through a reconnect, so the
     * channels area survives the connection and auth flicker.
     */
    hasAuthorized: Schema.Boolean,
  },
})
export type Session = typeof Session.Type

export const ConnectionField = Schema.Literals([
  'Url',
  'KeepaliveInterval',
  'KeepaliveTimeout',
  'AcceptKeepalive',
])
export type ConnectionField = typeof ConnectionField.Type

/** The connection form, as typed: drafts stay strings until Connect reads them. */
export const ConnectionForm = Schema.Struct({
  url: Schema.String,
  keepaliveInterval: Schema.String,
  keepaliveTimeout: Schema.String,
  acceptKeepalive: Schema.String,
})
export type ConnectionForm = typeof ConnectionForm.Type

/**
 * What the user did with a channel's card.
 *
 * Closing is terminal: the card stays as a header-only record and cannot be reopened, so a
 * closed card has no expansion to remember. A collapsed card keeps its body, hidden.
 */
export const ChannelCard = defineTaggedUnion({
  Open: { isExpanded: Schema.Boolean, isErrorListOpen: Schema.Boolean },
  Closed: {},
})
export type ChannelCard = typeof ChannelCard.Type

/**
 * One channel card.
 *
 * `model` is opaque: it was produced by the plugin named by `kind` and is only ever handed
 * back to that same plugin, so the channels area never needs to know what is in it — which
 * is what keeps every service's types, and dependencies, out of core.
 */
export const ChannelEntry = Schema.Struct({
  /** The card's own id, unique for the lifetime of the console. Not the protocol channel id. */
  id: Schema.String,
  kind: Schema.String,
  card: ChannelCard,
  model: ErasedChannel.Model,
})
export type ChannelEntry = typeof ChannelEntry.Type

export const Model = Schema.Struct({
  config: ConsoleConfig,
  form: ConnectionForm,
  session: Session,
  lastSessionId: Schema.Finite,
  errorLog: ErrorLog,
  /** Whether the connection's error list is disclosed. */
  isErrorListOpen: Schema.Boolean,
  authToken: Schema.Redacted(Schema.String),
  channels: Schema.Array(ChannelEntry),
  nextChannelId: Schema.Finite,
  /** One request per registered plugin, keyed by kind. Opaque for the same reason as a channel. */
  requests: Schema.Record(Schema.String, ErasedRequest.Model),
  /** The plugin whose request the dialog is showing. */
  maybeRequestKind: Schema.Option(Schema.String),
  requestDialog: Dialog.Model,
})
export type Model = typeof Model.Type
