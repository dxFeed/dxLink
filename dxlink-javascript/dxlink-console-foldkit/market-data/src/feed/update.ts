import { Array, Option, Record, Schema, pipe } from 'effect'
import type { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import {
  clearErrors as clearErrorLog,
  emptyErrorLog,
  prependError,
} from '@dxfeed/dxlink-console-foldkit-core'

import {
  AddSubscription,
  ClearSubscriptions,
  CloseChannel,
  ConfigureFeed,
  CopyEvents,
  OpenCandles,
  OpenFeed,
  RemoveSubscription,
  SetCandleSubscription,
} from './command'
import {
  type EventsByType,
  type FeedConfig,
  type FeedEvent,
  type FeedSubscription,
  subscriptionKey,
  upsertEvents,
} from './domain'
import type { FeedServices } from './live'
import { Message, RequestMessage } from './message'
import {
  CHANNEL_MODEL_KIND,
  type ChartState,
  type ConfigurationForm,
  DataFormatChoice,
  type Model,
  type Request,
  type SubscriptionForm,
  type SubscriptionsState,
  View,
  initialRequest,
} from './model'

const DIGITS_ONLY = /[^0-9]/g

const toNumber = (draft: string): number => {
  const parsed = Number(draft)

  return Number.isFinite(parsed) ? parsed : 0
}

// REQUEST

export const initRequest = (): Update.Return<Request, RequestMessage, FeedServices> => ({
  model: initialRequest(),
})

export const updateRequest = (request: Request, message: RequestMessage) =>
  RequestMessage.match<Update.Return<Request, RequestMessage, FeedServices>>(message, {
    SelectedView: ({ view }) => ({
      model: modifyFields(request, { view: () => view }),
    }),
    UpdatedFeed: ({ value }) => ({
      model: modifyFields(request, { feed: () => value }),
    }),
    UpdatedSpace: ({ value }) => ({
      model: modifyFields(request, { space: () => value }),
    }),
  })

export const requestToConfig = (request: Request): Option.Option<FeedConfig> =>
  Option.some({
    view: request.view,
    feed: request.feed.trim(),
    space: request.space.trim(),
  })

// CHANNEL

type UpdateReturn = Update.Return<Model, Message, FeedServices>

const initialSubscriptionsState = (): SubscriptionsState => ({
  form: { kind: 'Regular', type: 'Quote', symbol: '', source: '', fromTime: '0' },
  configuration: {
    aggregationPeriod: '',
    dataFormat: '',
    rows: [{ id: 1, type: 'Quote', fields: 'bidPrice, askPrice, bidSize, askSize' }],
    nextRowId: 2,
  },
  subscriptions: [],
  applied: {
    maybeAggregationPeriod: Option.none(),
    dataFormat: 'FULL',
    eventFields: {},
  },
  events: {},
  maybeFrozenEvents: Option.none(),
  maybeActiveType: Option.none(),
})

const initialChartState = (): ChartState => ({
  symbol: 'AAPL{=d}',
  fromTime: '0',
  maybeSubscription: Option.none(),
  candleCount: 0,
  maybeChartError: Option.none(),
})

export const init = ({
  channelId,
  config,
}: Readonly<{ channelId: string; config: FeedConfig }>): UpdateReturn => {
  const openArgs = { channelId, feed: config.feed, space: config.space }

  return {
    model: {
      kind: CHANNEL_MODEL_KIND,
      channelId,
      channelState: DXLinkChannelState.REQUESTED,
      maybeProtocolChannelId: Option.none(),
      parameters: {},
      errorLog: emptyErrorLog(),
      view:
        config.view === 'Chart'
          ? View.Chart({ state: initialChartState() })
          : View.Subscriptions({ state: initialSubscriptionsState() }),
    },
    commands: [config.view === 'Chart' ? OpenCandles(openArgs) : OpenFeed(openArgs)],
  }
}

/** Apply a change to the subscriptions view; a chart channel is left as it is. */
const mapSubscriptions = (
  model: Model,
  f: (state: SubscriptionsState) => SubscriptionsState
): Model =>
  modifyFields(model, {
    view: (view) =>
      View.match(view, {
        Subscriptions: ({ state }) => View.Subscriptions({ state: f(state) }),
        Chart: () => view,
      }),
  })

/** Apply a change to the chart view; a subscriptions channel is left as it is. */
const mapChart = (model: Model, f: (state: ChartState) => ChartState): Model =>
  modifyFields(model, {
    view: (view) =>
      View.match(view, {
        Subscriptions: () => view,
        Chart: ({ state }) => View.Chart({ state: f(state) }),
      }),
  })

const maybeSubscriptions = (model: Model): Option.Option<SubscriptionsState> =>
  model.view._tag === 'Subscriptions' ? Option.some(model.view.state) : Option.none()

const maybeChart = (model: Model): Option.Option<ChartState> =>
  model.view._tag === 'Chart' ? Option.some(model.view.state) : Option.none()

const mapForm = (model: Model, f: (form: SubscriptionForm) => SubscriptionForm): Model =>
  mapSubscriptions(model, (state) => modifyFields(state, { form: f }))

const mapConfiguration = (
  model: Model,
  f: (configuration: ConfigurationForm) => ConfigurationForm
): Model => mapSubscriptions(model, (state) => modifyFields(state, { configuration: f }))

/**
 * The subscription the form describes, or `None` while it cannot be added: type and symbol
 * are required, and an indexed subscription needs its source.
 */
export const formToSubscription = (form: SubscriptionForm): Option.Option<FeedSubscription> => {
  const type = form.type.trim()
  const symbol = form.symbol.trim()
  const source = form.kind === 'Indexed' ? form.source.trim() : ''
  const isComplete = type !== '' && symbol !== '' && (form.kind !== 'Indexed' || source !== '')

  return isComplete
    ? Option.some({
        kind: form.kind,
        type,
        symbol,
        source,
        fromTime: form.kind === 'TimeSeries' ? toNumber(form.fromTime) : 0,
      })
    : Option.none()
}

/** The events the table shows: the frozen copy while paused, the live ones otherwise. */
export const displayedEvents = (state: SubscriptionsState): EventsByType =>
  Option.getOrElse(state.maybeFrozenEvents, () => state.events)

/** The selected event type if it still has a tab, otherwise the first type received. */
export const activeEventType = (state: SubscriptionsState): Option.Option<string> => {
  const types = Record.keys(displayedEvents(state))

  return pipe(
    state.maybeActiveType,
    Option.filter((type) => Array.contains(types, type)),
    Option.orElse(() => Array.head(types))
  )
}

/** The rows of one event type, in arrival order of their keys. */
export const rowsOf = (
  events: EventsByType,
  type: string
): ReadonlyArray<Readonly<{ key: string; event: FeedEvent }>> =>
  pipe(
    Record.get(events, type),
    Option.match({
      onNone: () => [],
      onSome: (byKey) => Array.map(Record.toEntries(byKey), ([key, event]) => ({ key, event })),
    })
  )

const isDataFormatChoice = Schema.is(DataFormatChoice)

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    SucceededOpenChannel: ({ channelState, protocolChannelId, parameters }) => ({
      model: modifyFields(model, {
        channelState: () => channelState,
        maybeProtocolChannelId: () => Option.some(protocolChannelId),
        parameters: () => parameters,
      }),
    }),

    FailedOpenChannel: ({ error }) => ({
      model: modifyFields(model, {
        channelState: () => DXLinkChannelState.CLOSED,
        errorLog: (errorLog) => prependError(errorLog, error),
      }),
    }),

    CompletedCloseChannel: () => ({ model }),

    ChangedChannelState: ({ channelState }) => ({
      model: modifyFields(model, { channelState: () => channelState }),
    }),

    ReportedChannelError: ({ error }) => ({
      model: modifyFields(model, {
        errorLog: (errorLog) => prependError(errorLog, error),
      }),
    }),

    SelectedSubscriptionKind: ({ kind }) => ({
      model: mapForm(model, (form) => modifyFields(form, { kind: () => kind })),
    }),

    UpdatedSubscriptionType: ({ value }) => ({
      model: mapForm(model, (form) => modifyFields(form, { type: () => value })),
    }),

    UpdatedSubscriptionSymbol: ({ value }) => ({
      model: mapForm(model, (form) => modifyFields(form, { symbol: () => value })),
    }),

    UpdatedSubscriptionSource: ({ value }) => ({
      model: mapForm(model, (form) => modifyFields(form, { source: () => value })),
    }),

    UpdatedSubscriptionFromTime: ({ value }) => ({
      model: mapForm(model, (form) =>
        modifyFields(form, { fromTime: () => value.replace(DIGITS_ONLY, '') })
      ),
    }),

    SubmittedSubscription: () =>
      pipe(
        maybeSubscriptions(model),
        Option.flatMap((state) =>
          pipe(
            formToSubscription(state.form),
            Option.filter(
              (subscription) =>
                !Array.some(
                  state.subscriptions,
                  (existing) => subscriptionKey(existing) === subscriptionKey(subscription)
                )
            )
          )
        ),
        Option.match({
          onNone: (): UpdateReturn => ({ model }),
          onSome: (subscription) => ({
            model: mapSubscriptions(model, (state) =>
              modifyFields(state, {
                subscriptions: Array.append(subscription),
              })
            ),
            commands: [AddSubscription({ channelId: model.channelId, subscription })],
          }),
        })
      ),

    ClickedRemoveSubscription: ({ key }) =>
      pipe(
        maybeSubscriptions(model),
        Option.flatMap((state) =>
          Array.findFirst(
            state.subscriptions,
            (subscription) => subscriptionKey(subscription) === key
          )
        ),
        Option.match({
          onNone: (): UpdateReturn => ({ model }),
          onSome: (subscription) => ({
            model: mapSubscriptions(model, (state) =>
              modifyFields(state, {
                subscriptions: Array.filter((existing) => subscriptionKey(existing) !== key),
              })
            ),
            commands: [RemoveSubscription({ channelId: model.channelId, subscription })],
          }),
        })
      ),

    ClickedClearSubscriptions: () => ({
      model: mapSubscriptions(model, (state) => modifyFields(state, { subscriptions: () => [] })),
      commands: [ClearSubscriptions({ channelId: model.channelId })],
    }),

    CompletedAddSubscription: () => ({ model }),
    CompletedRemoveSubscription: () => ({ model }),
    CompletedClearSubscriptions: () => ({ model }),

    UpdatedAggregationPeriod: ({ value }) => ({
      model: mapConfiguration(model, (configuration) =>
        modifyFields(configuration, { aggregationPeriod: () => value })
      ),
    }),

    SelectedDataFormat: ({ value }) => ({
      model: mapConfiguration(model, (configuration) =>
        modifyFields(configuration, {
          dataFormat: (dataFormat) => (isDataFormatChoice(value) ? value : dataFormat),
        })
      ),
    }),

    UpdatedFieldRowType: ({ rowId, value }) => ({
      model: mapConfiguration(model, (configuration) =>
        modifyFields(configuration, {
          rows: Array.map((row) =>
            row.id === rowId ? modifyFields(row, { type: () => value }) : row
          ),
        })
      ),
    }),

    UpdatedFieldRowFields: ({ rowId, value }) => ({
      model: mapConfiguration(model, (configuration) =>
        modifyFields(configuration, {
          rows: Array.map((row) =>
            row.id === rowId ? modifyFields(row, { fields: () => value }) : row
          ),
        })
      ),
    }),

    ClickedRemoveFieldRow: ({ rowId }) => ({
      model: mapConfiguration(model, (configuration) =>
        modifyFields(configuration, {
          rows: Array.filter((row) => row.id !== rowId),
        })
      ),
    }),

    ClickedAddFieldRow: () => ({
      model: mapConfiguration(model, (configuration) =>
        modifyFields(configuration, {
          rows: Array.append({
            id: configuration.nextRowId,
            type: '',
            fields: '',
          }),
          nextRowId: (nextRowId) => nextRowId + 1,
        })
      ),
    }),

    ClickedApplyConfiguration: () =>
      Option.match(maybeSubscriptions(model), {
        onNone: (): UpdateReturn => ({ model }),
        onSome: ({ configuration }) => ({
          model,
          commands: [
            ConfigureFeed({
              channelId: model.channelId,
              aggregationPeriod: configuration.aggregationPeriod,
              dataFormat: configuration.dataFormat,
              rows: configuration.rows,
            }),
          ],
        }),
      }),

    CompletedConfigureFeed: () => ({ model }),

    ChangedAppliedConfig: ({ applied }) => ({
      model: mapSubscriptions(model, (state) => modifyFields(state, { applied: () => applied })),
    }),

    ReceivedEvents: ({ events }) => ({
      model: mapSubscriptions(model, (state) =>
        modifyFields(state, {
          events: (existing) => upsertEvents(existing, events),
        })
      ),
    }),

    SelectedEventType: ({ type }) => ({
      model: mapSubscriptions(model, (state) =>
        modifyFields(state, { maybeActiveType: () => Option.some(type) })
      ),
    }),

    ClickedTogglePause: () => ({
      model: mapSubscriptions(model, (state) =>
        modifyFields(state, {
          maybeFrozenEvents: (maybeFrozenEvents) =>
            Option.isSome(maybeFrozenEvents) ? Option.none() : Option.some(state.events),
        })
      ),
    }),

    ClickedClearEvents: () => ({
      model: mapSubscriptions(model, (state) => modifyFields(state, { events: () => ({}) })),
    }),

    ClickedCopyEvents: () =>
      pipe(
        maybeSubscriptions(model),
        Option.flatMap((state) =>
          Option.map(activeEventType(state), (type) =>
            Array.map(rowsOf(displayedEvents(state), type), (row) => row.event)
          )
        ),
        Option.match({
          onNone: (): UpdateReturn => ({ model }),
          onSome: (rows) => ({
            model,
            commands: [CopyEvents({ text: JSON.stringify(rows, null, 2) })],
          }),
        })
      ),

    CompletedCopyEvents: () => ({ model }),

    UpdatedCandleSymbol: ({ value }) => ({
      model: mapChart(model, (state) => modifyFields(state, { symbol: () => value })),
    }),

    UpdatedCandleFromTime: ({ value }) => ({
      model: mapChart(model, (state) =>
        modifyFields(state, { fromTime: () => value.replace(DIGITS_ONLY, '') })
      ),
    }),

    SubmittedCandleSubscription: () =>
      pipe(
        maybeChart(model),
        Option.filter((state) => state.symbol.trim() !== ''),
        Option.match({
          onNone: (): UpdateReturn => ({ model }),
          onSome: (state) => {
            const subscription = {
              symbol: state.symbol.trim(),
              fromTime: toNumber(state.fromTime),
            }

            return {
              model: mapChart(model, (chart) =>
                modifyFields(chart, {
                  maybeSubscription: () => Option.some(subscription),
                  candleCount: () => 0,
                  maybeChartError: () => Option.none(),
                })
              ),
              commands: [
                SetCandleSubscription({
                  channelId: model.channelId,
                  subscription,
                }),
              ],
            }
          },
        })
      ),

    CompletedSetCandleSubscription: () => ({ model }),
    CompletedMountChart: () => ({ model }),

    ReceivedCandles: ({ candleCount }) => ({
      model: mapChart(model, (state) => modifyFields(state, { candleCount: () => candleCount })),
    }),

    FailedDrawCandles: ({ reason }) => ({
      model: mapChart(model, (state) =>
        modifyFields(state, { maybeChartError: () => Option.some(reason) })
      ),
    }),
  })

/** Release the live feed. The Model stays as the record of a closed channel. */
export const close = (model: Model): UpdateReturn => ({
  model: modifyFields(model, {
    channelState: () => DXLinkChannelState.CLOSED,
  }),
  commands: [CloseChannel({ channelId: model.channelId })],
})

export const clearErrors = (model: Model): Model => modifyFields(model, { errorLog: clearErrorLog })
