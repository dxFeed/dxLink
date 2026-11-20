import { Predicate, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import { ErrorLog } from '@dxfeed/dxlink-console-foldkit-core'

import { Book, Config } from '../domain'

const TAG = 'DomChannel'

export const ChannelState = Schema.Enum(DXLinkChannelState)

/** The configuration request as typed; a blank field asks for the server's default. */
export const AcceptForm = Schema.Struct({
  aggregationPeriod: Schema.String,
  depthLimit: Schema.String,
  orderFields: Schema.String,
})
export type AcceptForm = typeof AcceptForm.Type

/**
 * Where the channel is between the appearance of its card and the end of it.
 *
 * Everything the live channel reports, and the form that configures it, exists only while
 * there is a live channel to report or to configure: in `Opened`. `Closed` is final, and keeps
 * the protocol channel id as the record of which channel the card was.
 */
export const Lifecycle = defineTaggedUnion({
  Opening: {},
  Opened: {
    /** The protocol's own channel id. */
    protocolChannelId: Schema.Finite,
    /** The parameters the channel was actually opened with. */
    parameters: Schema.Record(Schema.String, Schema.String),
    /** The protocol state of the channel, which the client moves on its own on a reconnect. */
    channelState: ChannelState,
    applied: Config.AppliedConfig,
    /** `None` until the first snapshot arrives. */
    maybeSnapshot: Schema.Option(Book.DomSnapshot),
    acceptForm: AcceptForm,
    /** Whether the Configuration section of the card is disclosed. */
    isConfigurationOpen: Schema.Boolean,
  },
  FailedToOpen: {},
  Closed: { maybeProtocolChannelId: Schema.Option(Schema.Finite) },
})
export type Lifecycle = typeof Lifecycle.Type

export type Opened = typeof Lifecycle.Opened.Type

export const Model = Schema.TaggedStruct(TAG, {
  /** The id of the card, which is also the address of the live channel behind it. */
  channelId: Schema.String,
  config: Config.DomConfig,
  lifecycle: Lifecycle,
  errorLog: ErrorLog,
})
export type Model = typeof Model.Type

/** Only this module builds a value carrying the tag, so the tag identifies the Model. */
export const isModel = (value: unknown): value is Model => Predicate.isTagged(value, TAG)
