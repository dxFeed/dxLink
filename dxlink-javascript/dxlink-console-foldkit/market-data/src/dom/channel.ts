import { Match, Option, Predicate, Schema } from 'effect'
import type { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import {
  type ChannelStatus,
  type ChannelSummary,
  ErrorLog,
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

export const Model = Schema.TaggedStruct(TAG, {
  /** The id of the card, which is also the address of the live channel behind it. */
  channelId: Schema.String,
  config: DomConfig,
  channelState: ChannelState,
  /** The protocol's own channel id. `None` until the channel is opened. */
  maybeProtocolChannelId: Schema.Option(Schema.Number),
  /** The parameters the channel was actually opened with. Empty until it is opened. */
  parameters: Schema.Record(Schema.String, Schema.String),
  maybeApplied: Schema.Option(AppliedConfig),
  maybeSnapshot: Schema.Option(DomSnapshot),
  acceptForm: AcceptForm,
  errorLog: ErrorLog,
})
export type Model = typeof Model.Type

/** Only this module builds a value carrying the tag, so the tag identifies the Model. */
export const isModel = (value: unknown): value is Model => Predicate.isTagged(value, TAG)

type UpdateReturn = Update.Return<Model, Message, DomServices>

// INIT

/**
 * The order fields start at what the server returns today, so the request starts from
 * reality. Any other field can be typed in — the server decides, and what it applied is
 * shown beside what was asked.
 */
export const init = ({
  channelId,
  config,
}: Readonly<{ channelId: string; config: DomConfig }>): UpdateReturn => ({
  model: Model.make({
    channelId,
    config,
    channelState: DXLinkChannelState.REQUESTED,
    maybeProtocolChannelId: Option.none(),
    parameters: {},
    maybeApplied: Option.none(),
    maybeSnapshot: Option.none(),
    acceptForm: {
      aggregationPeriod: '',
      depthLimit: '',
      orderFields: 'price, size',
    },
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

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    SucceededOpenDomChannel: ({ protocolChannelId, parameters, channelState, applied }) => ({
      model: modifyFields(model, {
        maybeProtocolChannelId: () => Option.some(protocolChannelId),
        parameters: () => parameters,
        channelState: () => channelState,
        maybeApplied: () => Option.some(applied),
      }),
    }),

    FailedOpenDomChannel: ({ error }) => ({
      model: modifyFields(model, {
        channelState: () => DXLinkChannelState.CLOSED,
        errorLog: (errorLog) => prependError(errorLog, error),
      }),
    }),

    ReceivedSnapshot: ({ snapshot }) => ({
      model: modifyFields(model, {
        maybeSnapshot: () => Option.some(snapshot),
      }),
    }),

    ChangedChannelState: ({ channelState }) => ({
      model: modifyFields(model, { channelState: () => channelState }),
    }),

    ChangedAppliedConfig: ({ applied }) => ({
      model: modifyFields(model, { maybeApplied: () => Option.some(applied) }),
    }),

    ReportedChannelError: ({ error }) => ({
      model: modifyFields(model, {
        errorLog: (errorLog) => prependError(errorLog, error),
      }),
    }),

    UpdatedAcceptAggregationPeriod: ({ value }) => ({
      model: modifyFields(model, {
        acceptForm: (acceptForm) => modifyFields(acceptForm, { aggregationPeriod: () => value }),
      }),
    }),

    UpdatedAcceptDepthLimit: ({ value }) => ({
      model: modifyFields(model, {
        acceptForm: (acceptForm) => modifyFields(acceptForm, { depthLimit: () => value }),
      }),
    }),

    UpdatedAcceptOrderFields: ({ value }) => ({
      model: modifyFields(model, {
        acceptForm: (acceptForm) => modifyFields(acceptForm, { orderFields: () => value }),
      }),
    }),

    // NOTE: any field name is let through, deliberately. The server decides what it returns
    // and may honour none of it — which is the point of asking from a debug console.
    ClickedApplyConfiguration: () => ({
      model,
      commands: [
        ConfigureDomChannel({
          channelId: model.channelId,
          maybeAggregationPeriod: parseOptionalNumber(model.acceptForm.aggregationPeriod),
          maybeDepthLimit: parseOptionalNumber(model.acceptForm.depthLimit),
          maybeOrderFields:
            model.acceptForm.orderFields.trim() === ''
              ? Option.none()
              : Option.some(parseList(model.acceptForm.orderFields)),
        }),
      ],
    }),

    CompletedConfigureDomChannel: () => ({ model }),

    CompletedCloseDomChannel: () => ({ model }),
  })

/** Release the live channel. The Model is kept as the record of what the channel was. */
export const close = (model: Model): UpdateReturn => ({
  model,
  commands: [CloseDomChannel({ channelId: model.channelId })],
})

export const clearErrors = (model: Model): Model => modifyFields(model, { errorLog: clearErrorLog })

// SUMMARY

const statusOf = (channelState: DXLinkChannelState): ChannelStatus =>
  Match.value(channelState).pipe(
    Match.withReturnType<ChannelStatus>(),
    Match.when(DXLinkChannelState.OPENED, () => ({
      label: 'streaming',
      tone: 'Success',
    })),
    Match.when(DXLinkChannelState.CLOSED, () => ({
      label: 'closed',
      tone: 'Neutral',
    })),
    Match.when(DXLinkChannelState.REQUESTED, () => ({
      label: 'opening',
      tone: 'Warning',
    })),
    Match.exhaustive
  )

export const summarize = (model: Model): ChannelSummary => ({
  subtitle: `DOM · ${model.config.symbol === '' ? '—' : model.config.symbol}`,
  maybeStatus: Option.some(statusOf(model.channelState)),
  maybeChannelId: model.maybeProtocolChannelId,
  parameters: model.parameters,
  errors: model.errorLog.errors,
})
