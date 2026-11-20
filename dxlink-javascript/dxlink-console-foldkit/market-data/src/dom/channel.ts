import { Match, Option, Predicate, Schema } from 'effect'
import type { Update } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import {
  type ChannelStatus,
  type ChannelSummary,
  ErrorLog,
  type ReportedError,
  clearErrors as clearErrorLog,
  emptyErrorLog,
  prependError,
} from '@dxfeed/dxlink-console-foldkit-core'

import { CloseDomChannel, ConfigureDomChannel, OpenDomChannel } from './command'
import { AppliedConfig, ChannelState, type DomServices, DomSnapshot } from './handles'
import { parseList, parseOptionalNumber } from './ladder'
import { Message } from './message'
import { DomConfig } from './types'

const TAG = 'DomChannel'

// MODEL

/** The configuration request as typed; a blank field asks for the server's default. */
export const AcceptForm = Schema.Struct({
  aggregationPeriod: Schema.String,
  depthLimit: Schema.String,
  orderFields: Schema.String,
})
export type AcceptForm = typeof AcceptForm.Type

/**
 * Where the channel is between its Open Command and the end of its card.
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
    applied: AppliedConfig,
    /** `None` until the first snapshot arrives. */
    maybeSnapshot: Schema.Option(DomSnapshot),
    acceptForm: AcceptForm,
  },
  FailedToOpen: {},
  Closed: { maybeProtocolChannelId: Schema.Option(Schema.Finite) },
})
export type Lifecycle = typeof Lifecycle.Type

export type Opened = typeof Lifecycle.Opened.Type

export const Model = Schema.TaggedStruct(TAG, {
  /** The id of the card, which is also the address of the live channel behind it. */
  channelId: Schema.String,
  config: DomConfig,
  lifecycle: Lifecycle,
  errorLog: ErrorLog,
})
export type Model = typeof Model.Type

/** Only this module builds a value carrying the tag, so the tag identifies the Model. */
export const isModel = (value: unknown): value is Model => Predicate.isTagged(value, TAG)

type UpdateReturn = Update.Return<Model, Message, DomServices>

// INIT

export const init = ({
  channelId,
  config,
}: Readonly<{ channelId: string; config: DomConfig }>): UpdateReturn => ({
  model: Model.make({
    channelId,
    config,
    lifecycle: Lifecycle.Opening(),
    errorLog: emptyErrorLog(),
  }),
  commands: [
    OpenDomChannel({
      channelId,
      symbol: config.symbol,
      sources: parseList(config.source),
      feed: config.feed,
      space: config.space,
    }),
  ],
})

// UPDATE

/**
 * The order fields start at what the server returns today, so the request starts from
 * reality. Any other field can be typed in — the server decides, and what it applied is
 * shown beside what was asked.
 */
const INITIAL_ACCEPT_FORM: AcceptForm = {
  aggregationPeriod: '',
  depthLimit: '',
  orderFields: 'price, size',
}

/** Change what an opened channel holds. In every other state the Model is returned as it is. */
const modifyOpened = (model: Model, modify: (opened: Opened) => Opened): Model =>
  modifyFields(model, {
    lifecycle: (lifecycle) =>
      Lifecycle.matchOrElse(lifecycle, { Opened: modify }, (other): Lifecycle => other),
  })

const modifyAcceptForm = (model: Model, modify: (acceptForm: AcceptForm) => AcceptForm): Model =>
  modifyOpened(model, (opened) => modifyFields(opened, { acceptForm: modify }))

const logError = (model: Model, error: ReportedError): Model =>
  modifyFields(model, { errorLog: (errorLog) => prependError(errorLog, error) })

const closeCommand = (model: Model) => CloseDomChannel({ channelId: model.channelId })

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    SucceededOpenDomChannel: ({ protocolChannelId, parameters, channelState, applied }) =>
      Lifecycle.match<UpdateReturn>(model.lifecycle, {
        Opening: () => ({
          model: modifyFields(model, {
            lifecycle: () =>
              Lifecycle.Opened({
                protocolChannelId,
                parameters,
                channelState,
                applied,
                maybeSnapshot: Option.none(),
                acceptForm: INITIAL_ACCEPT_FORM,
              }),
          }),
        }),
        Opened: () => ({ model }),
        FailedToOpen: () => ({ model }),
        // NOTE: the card was closed while its channel was still opening, so the Close Command
        // found nothing to release and the live channel arrived after it.
        Closed: () => ({ model, commands: [closeCommand(model)] }),
      }),

    FailedOpenDomChannel: ({ error }) => ({
      model: modifyFields(logError(model, error), {
        lifecycle: (lifecycle) =>
          Lifecycle.matchOrElse(
            lifecycle,
            { Opening: () => Lifecycle.FailedToOpen() },
            (other): Lifecycle => other
          ),
      }),
    }),

    ReceivedSnapshot: ({ snapshot }) => ({
      model: modifyOpened(model, (opened) =>
        modifyFields(opened, { maybeSnapshot: () => Option.some(snapshot) })
      ),
    }),

    ChangedChannelState: ({ channelState }) => ({
      model: modifyOpened(model, (opened) =>
        modifyFields(opened, { channelState: () => channelState })
      ),
    }),

    ChangedAppliedConfig: ({ applied }) => ({
      model: modifyOpened(model, (opened) => modifyFields(opened, { applied: () => applied })),
    }),

    ReportedChannelError: ({ error }) => ({ model: logError(model, error) }),

    UpdatedAcceptAggregationPeriod: ({ value }) => ({
      model: modifyAcceptForm(model, (acceptForm) =>
        modifyFields(acceptForm, { aggregationPeriod: () => value })
      ),
    }),

    UpdatedAcceptDepthLimit: ({ value }) => ({
      model: modifyAcceptForm(model, (acceptForm) =>
        modifyFields(acceptForm, { depthLimit: () => value })
      ),
    }),

    UpdatedAcceptOrderFields: ({ value }) => ({
      model: modifyAcceptForm(model, (acceptForm) =>
        modifyFields(acceptForm, { orderFields: () => value })
      ),
    }),

    // NOTE: any field name is let through, deliberately. The server decides what it returns
    // and may honour none of it — which is the point of asking from a debug console.
    ClickedApplyConfiguration: () =>
      Lifecycle.matchOrElse(
        model.lifecycle,
        {
          Opened: ({ acceptForm }): UpdateReturn => ({
            model,
            commands: [
              ConfigureDomChannel({
                channelId: model.channelId,
                maybeAggregationPeriod: parseOptionalNumber(acceptForm.aggregationPeriod),
                maybeDepthLimit: parseOptionalNumber(acceptForm.depthLimit),
                maybeOrderFields:
                  acceptForm.orderFields.trim() === ''
                    ? Option.none()
                    : Option.some(parseList(acceptForm.orderFields)),
              }),
            ],
          }),
        },
        (): UpdateReturn => ({ model })
      ),

    SucceededConfigureDomChannel: () => ({ model }),

    FailedConfigureDomChannel: ({ error }) => ({ model: logError(model, error) }),

    SucceededCloseDomChannel: () => ({ model }),

    FailedCloseDomChannel: ({ error }) => ({ model: logError(model, error) }),
  })

/**
 * Release the live channel and mark the Model closed. What stays is the record of the channel:
 * what it was opened with, its protocol channel id and its errors.
 */
export const close = (model: Model): UpdateReturn => ({
  model: modifyFields(model, {
    lifecycle: (lifecycle) =>
      Lifecycle.Closed({
        maybeProtocolChannelId: Lifecycle.match(lifecycle, {
          Opening: () => Option.none(),
          Opened: ({ protocolChannelId }) => Option.some(protocolChannelId),
          FailedToOpen: () => Option.none(),
          Closed: ({ maybeProtocolChannelId }) => maybeProtocolChannelId,
        }),
      }),
  }),
  commands: [closeCommand(model)],
})

export const clearErrors = (model: Model): Model => modifyFields(model, { errorLog: clearErrorLog })

// SUMMARY

const OPENING_STATUS: ChannelStatus = { label: 'opening', tone: 'Warning' }

const CLOSED_STATUS: ChannelStatus = { label: 'closed', tone: 'Neutral' }

const openedStatus = (channelState: DXLinkChannelState): ChannelStatus =>
  Match.value(channelState).pipe(
    Match.withReturnType<ChannelStatus>(),
    Match.when(DXLinkChannelState.OPENED, () => ({
      label: 'streaming',
      tone: 'Success',
    })),
    Match.when(DXLinkChannelState.CLOSED, () => CLOSED_STATUS),
    Match.when(DXLinkChannelState.REQUESTED, () => OPENING_STATUS),
    Match.exhaustive
  )

type LifecycleSummary = Pick<ChannelSummary, 'maybeStatus' | 'maybeChannelId' | 'parameters'>

export const summarize = (model: Model): ChannelSummary => ({
  subtitle: `DOM · ${model.config.symbol === '' ? '—' : model.config.symbol}`,
  ...Lifecycle.match<LifecycleSummary>(model.lifecycle, {
    Opening: () => ({
      maybeStatus: Option.some(OPENING_STATUS),
      maybeChannelId: Option.none(),
      parameters: {},
    }),
    Opened: ({ channelState, protocolChannelId, parameters }) => ({
      maybeStatus: Option.some(openedStatus(channelState)),
      maybeChannelId: Option.some(protocolChannelId),
      parameters,
    }),
    FailedToOpen: () => ({
      maybeStatus: Option.some({ label: 'failed', tone: 'Danger' }),
      maybeChannelId: Option.none(),
      parameters: {},
    }),
    Closed: ({ maybeProtocolChannelId }) => ({
      maybeStatus: Option.some(CLOSED_STATUS),
      maybeChannelId: maybeProtocolChannelId,
      parameters: {},
    }),
  }),
  errors: model.errorLog.errors,
})
