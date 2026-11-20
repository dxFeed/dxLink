import { Array, Match, Option, Record, pipe } from 'effect'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import {
  Kit,
  type ReportedError,
  clearErrors as clearErrorLog,
  emptyErrorLog,
  prependError,
} from '@dxfeed/dxlink-console-foldkit-core'
import { Combobox, Listbox, RadioGroup, Tabs } from '@foldkit/ui'

import { Feed } from '../domain'
import type { FeedServices } from '../live/service'
import {
  AddSubscription,
  ClearSubscriptions,
  ConfigureFeed,
  CopyEvents,
  RemoveSubscription,
  SetCandleSubscription,
} from './command'
import { Message } from './message'
import {
  CHANNEL_MODEL_KIND,
  type ChannelLink,
  type ChartState,
  type ConfigurationForm,
  type ConfigurationRow,
  type DataFormatChoice,
  DataFormatListbox,
  EventTypeTabs,
  EventsTable,
  Lifecycle,
  type Model,
  type OpenedChannel,
  type SubscriptionForm,
  SubscriptionKindRadioGroup,
  type SubscriptionsState,
  SuggestionCombobox,
  View,
} from './model'

const DIGITS_ONLY = /[^0-9]/g

const toNumber = (draft: string): number => {
  const parsed = Number(draft)

  return Number.isFinite(parsed) ? parsed : 0
}

type UpdateReturn = Update.Return<Model, Message, FeedServices>

/** A row of the accept-event-fields editor whose event type reads `type`. */
const configurationRow = (
  channelId: string,
  id: number,
  type: string,
  fields: string
): ConfigurationRow => ({
  id,
  typeCombobox: Kit.withComboboxText(
    Combobox.init({ id: `feed-${channelId}-row-${id}-type` }),
    type
  ),
  fields,
})

const initialSubscriptionsState = (channelId: string): SubscriptionsState => ({
  form: {
    kind: 'Regular',
    typeCombobox: Kit.withComboboxText(Combobox.init({ id: `feed-${channelId}-type` }), 'Quote'),
    symbol: '',
    sourceCombobox: Combobox.init({ id: `feed-${channelId}-source` }),
    fromTime: '0',
  },
  subscriptionKindRadioGroup: RadioGroup.init({ id: `feed-${channelId}-subscription-kind` }),
  configuration: {
    aggregationPeriod: '',
    dataFormat: '',
    dataFormatListbox: Listbox.init({ id: `feed-${channelId}-data-format` }),
    rows: [configurationRow(channelId, 1, 'Quote', 'bidPrice, askPrice, bidSize, askSize')],
    nextRowId: 2,
  },
  subscriptions: [],
  isConfigurationOpen: false,
  applied: {
    maybeAggregationPeriod: Option.none(),
    dataFormat: 'FULL',
    eventFields: {},
  },
  table: EventsTable.Live({ events: {} }),
  maybeActiveType: Option.none(),
  eventTypeTabs: Tabs.init({ id: `feed-${channelId}-event-types` }),
})

const initialChartState = (): ChartState => ({
  symbol: 'AAPL{=d}',
  fromTime: '0',
  lastGeneration: 0,
  maybeActive: Option.none(),
  maybeChartError: Option.none(),
})

/** A channel starts out being opened; its live side is connected by the console. */
export const init = ({
  channelId,
  config,
}: Readonly<{ channelId: string; config: Feed.FeedConfig }>): UpdateReturn => ({
  model: {
    kind: CHANNEL_MODEL_KIND,
    channelId,
    feed: config.feed,
    space: config.space,
    lifecycle: Lifecycle.Opening(),
    errorLog: emptyErrorLog(),
    view:
      config.view === 'Chart'
        ? View.Chart({ state: initialChartState() })
        : View.Subscriptions({ state: initialSubscriptionsState(channelId) }),
  },
})

// LIFECYCLE

/** The link a protocol channel state stands for; `None` for a channel that is closed. */
const linkOf = (channelState: DXLinkChannelState): Option.Option<ChannelLink> =>
  Match.value(channelState).pipe(
    Match.withReturnType<Option.Option<ChannelLink>>(),
    Match.when(DXLinkChannelState.OPENED, () => Option.some('Ready')),
    Match.when(DXLinkChannelState.REQUESTED, () => Option.some('Requested')),
    Match.orElse(() => Option.none())
  )

/** The lifecycle of an opened channel that reports `channelState`. */
const lifecycleOf = (channel: OpenedChannel, channelState: DXLinkChannelState): Lifecycle =>
  Option.match(linkOf(channelState), {
    onNone: () => Lifecycle.Closed({ maybeChannel: Option.some(channel) }),
    onSome: (link) => Lifecycle.Opened({ channel, link }),
  })

/**
 * Handle input to the live channel. A channel accepts it only while it is opened: before
 * that, and after it failed or closed, there is no feed behind it to act on.
 */
const whenOpened = (model: Model, onOpened: () => UpdateReturn): UpdateReturn =>
  model.lifecycle._tag === 'Opened' ? onOpened() : { model }

const withError = (model: Model, error: ReportedError): Model =>
  modifyFields(model, { errorLog: (errorLog) => prependError(errorLog, error) })

// VIEW STATE

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

const mapTable = (model: Model, f: (table: EventsTable) => EventsTable): Model =>
  mapSubscriptions(model, (state) => modifyFields(state, { table: f }))

const isListed = (state: SubscriptionsState, key: string): boolean =>
  Array.some(state.subscriptions, (existing) => Feed.subscriptionKey(existing) === key)

/** Apply a change to the candle subscription `generation` names; any other is left as it is. */
const mapActiveCandles = (
  model: Model,
  generation: number,
  f: (state: ChartState) => ChartState
): Model =>
  mapChart(model, (state) =>
    Option.exists(state.maybeActive, (active) => active.generation === generation)
      ? f(state)
      : state
  )

/**
 * The subscription the form describes, or `None` while it cannot be added: type and symbol
 * are required, and an indexed subscription needs its source.
 */
export const formToSubscription = (
  form: SubscriptionForm
): Option.Option<Feed.FeedSubscription> => {
  const type = form.typeCombobox.inputValue.trim()
  const symbol = form.symbol.trim()
  const source = form.sourceCombobox.inputValue.trim()
  if (type === '' || symbol === '') {
    return Option.none()
  }

  return Match.value(form.kind).pipe(
    Match.withReturnType<Option.Option<Feed.FeedSubscription>>(),
    Match.when('Regular', () => Option.some(Feed.FeedSubscription.Regular({ type, symbol }))),
    Match.when('Indexed', () =>
      source === ''
        ? Option.none()
        : Option.some(Feed.FeedSubscription.Indexed({ type, symbol, source }))
    ),
    Match.when('TimeSeries', () =>
      Option.some(
        Feed.FeedSubscription.TimeSeries({ type, symbol, fromTime: toNumber(form.fromTime) })
      )
    ),
    Match.exhaustive
  )
}

/** The events the table shows: the frozen rows while paused, the live ones otherwise. */
export const displayedEvents = (state: SubscriptionsState): Feed.EventsByType =>
  EventsTable.match(state.table, {
    Live: ({ events }) => events,
    Paused: ({ frozen }) => frozen,
  })

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
  events: Feed.EventsByType,
  type: string
): ReadonlyArray<Readonly<{ key: string; event: Feed.FeedEvent }>> =>
  pipe(
    Record.get(events, type),
    Option.match({
      onNone: () => [],
      onSome: (byKey) => Array.map(Record.toEntries(byKey), ([key, event]) => ({ key, event })),
    })
  )

// SUBMODELS

const foldSubscriptionKindRadioGroupOutMessage = RadioGroup.OutMessage.match<
  Update.Step<Model, Message>,
  RadioGroup.OutMessage<Feed.SubscriptionKind>
>({
  Selected:
    ({ value }) =>
    (model) => ({
      model: mapForm(model, (form) => modifyFields(form, { kind: () => value })),
    }),
})

const foldSubscriptionKindRadioGroup = Update.foldChild({
  update: SubscriptionKindRadioGroup.update,
  read: (model: Model) =>
    Option.map(maybeSubscriptions(model), (state) => state.subscriptionKindRadioGroup),
  write: (model, nextSubscriptionKindRadioGroup) =>
    mapSubscriptions(model, (state) =>
      modifyFields(state, { subscriptionKindRadioGroup: () => nextSubscriptionKindRadioGroup })
    ),
  toParentMessage: (message) => Message.GotSubscriptionKindRadioGroupMessage({ message }),
  foldOutMessage: foldSubscriptionKindRadioGroupOutMessage,
})

const foldEventTypeTabsOutMessage = Tabs.OutMessage.match<
  Update.Step<Model, Message>,
  Tabs.OutMessage<string>
>({
  Selected:
    ({ value }) =>
    (model) => ({
      model: mapSubscriptions(model, (state) =>
        modifyFields(state, { maybeActiveType: () => Option.some(value) })
      ),
    }),
})

const foldEventTypeTabs = Update.foldChild({
  update: EventTypeTabs.update,
  read: (model: Model) => Option.map(maybeSubscriptions(model), (state) => state.eventTypeTabs),
  write: (model, nextEventTypeTabs) =>
    mapSubscriptions(model, (state) =>
      modifyFields(state, { eventTypeTabs: () => nextEventTypeTabs })
    ),
  toParentMessage: (message) => Message.GotEventTypeTabsMessage({ message }),
  foldOutMessage: foldEventTypeTabsOutMessage,
})

// NOTE: a suggestion field keeps its text in its own Combobox, so picking a suggestion and
// clearing the field leave nothing to store here.
const foldSuggestionComboboxOutMessage = Combobox.OutMessage.match<Update.Step<Model, Message>>({
  Selected: () => (model) => ({ model }),
  ClearedSelection: () => (model) => ({ model }),
})

const foldSubscriptionTypeCombobox = Update.foldChild({
  update: SuggestionCombobox.update,
  read: (model: Model) => Option.map(maybeSubscriptions(model), (state) => state.form.typeCombobox),
  write: (model, nextTypeCombobox) =>
    mapForm(model, (form) => modifyFields(form, { typeCombobox: () => nextTypeCombobox })),
  toParentMessage: (message) => Message.GotSubscriptionTypeComboboxMessage({ message }),
  foldOutMessage: foldSuggestionComboboxOutMessage,
})

const foldSubscriptionSourceCombobox = Update.foldChild({
  update: SuggestionCombobox.update,
  read: (model: Model) =>
    Option.map(maybeSubscriptions(model), (state) => state.form.sourceCombobox),
  write: (model, nextSourceCombobox) =>
    mapForm(model, (form) => modifyFields(form, { sourceCombobox: () => nextSourceCombobox })),
  toParentMessage: (message) => Message.GotSubscriptionSourceComboboxMessage({ message }),
  foldOutMessage: foldSuggestionComboboxOutMessage,
})

/** Folds the event-type Combobox of the configuration row `rowId` names; a removed row has none. */
const foldFieldRowTypeCombobox = Update.foldChildAt({
  update: SuggestionCombobox.update,
  readAt: (model: Model, rowId: number) =>
    pipe(
      maybeSubscriptions(model),
      Option.flatMap((state) =>
        Array.findFirst(state.configuration.rows, (row) => row.id === rowId)
      ),
      Option.map((row) => row.typeCombobox)
    ),
  writeAt: (model, rowId, nextTypeCombobox) =>
    mapConfiguration(model, (configuration) =>
      modifyFields(configuration, {
        rows: Array.map((row) =>
          row.id === rowId ? modifyFields(row, { typeCombobox: () => nextTypeCombobox }) : row
        ),
      })
    ),
  toParentMessage: (rowId, message) => Message.GotFieldRowTypeComboboxMessage({ rowId, message }),
  foldOutMessage: () => foldSuggestionComboboxOutMessage,
})

const foldDataFormatListbox = Update.foldChild({
  update: DataFormatListbox.update,
  read: (model: Model) =>
    Option.map(maybeSubscriptions(model), (state) => state.configuration.dataFormatListbox),
  write: (model, nextDataFormatListbox) =>
    mapConfiguration(model, (configuration) =>
      modifyFields(configuration, { dataFormatListbox: () => nextDataFormatListbox })
    ),
  toParentMessage: (message) => Message.GotDataFormatListboxMessage({ message }),
  foldOutMessage: Listbox.OutMessage.match<
    Update.Step<Model, Message>,
    Listbox.OutMessage<DataFormatChoice>
  >({
    Selected:
      ({ value }) =>
      (model) => ({
        model: mapConfiguration(model, (configuration) =>
          modifyFields(configuration, { dataFormat: () => value })
        ),
      }),
  }),
})

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    SucceededOpenChannel: ({ channelState, protocolChannelId, parameters }) => ({
      model: modifyFields(model, {
        lifecycle: (lifecycle) =>
          Lifecycle.match(lifecycle, {
            Opening: () => lifecycleOf({ protocolChannelId, parameters }, channelState),
            Opened: () => lifecycle,
            FailedToOpen: () => lifecycle,
            Closed: () => lifecycle,
          }),
      }),
    }),

    FailedOpenChannel: ({ error }) => ({
      model: modifyFields(withError(model, error), {
        lifecycle: (lifecycle) =>
          Lifecycle.match(lifecycle, {
            Opening: () => Lifecycle.FailedToOpen(),
            Opened: () => lifecycle,
            FailedToOpen: () => lifecycle,
            Closed: () => lifecycle,
          }),
      }),
    }),

    // NOTE: only an opened channel follows its protocol state. State changes are gathered
    // into batches, so one can arrive after the channel was closed here, and it must not
    // reopen it. While opening there is nothing to move yet: the open result carries the
    // state the channel had when it was sampled.
    ChangedChannelState: ({ channelState }) => ({
      model: modifyFields(model, {
        lifecycle: (lifecycle) =>
          Lifecycle.match(lifecycle, {
            Opening: () => lifecycle,
            Opened: ({ channel }) => lifecycleOf(channel, channelState),
            FailedToOpen: () => lifecycle,
            Closed: () => lifecycle,
          }),
      }),
    }),

    ReportedChannelError: ({ error }) => ({ model: withError(model, error) }),

    GotSubscriptionKindRadioGroupMessage: ({ message }) =>
      whenOpened(model, () => foldSubscriptionKindRadioGroup(model, message)),

    GotSubscriptionTypeComboboxMessage: ({ message }) =>
      whenOpened(model, () => foldSubscriptionTypeCombobox(model, message)),

    UpdatedSubscriptionSymbol: ({ value }) =>
      whenOpened(model, () => ({
        model: mapForm(model, (form) => modifyFields(form, { symbol: () => value })),
      })),

    GotSubscriptionSourceComboboxMessage: ({ message }) =>
      whenOpened(model, () => foldSubscriptionSourceCombobox(model, message)),

    UpdatedSubscriptionFromTime: ({ value }) =>
      whenOpened(model, () => ({
        model: mapForm(model, (form) =>
          modifyFields(form, { fromTime: () => value.replace(DIGITS_ONLY, '') })
        ),
      })),

    // NOTE: a subscription joins the list when the feed has accepted it, not when it is
    // submitted, so the list never names one that was not sent.
    SubmittedSubscription: () =>
      whenOpened(model, () =>
        pipe(
          maybeSubscriptions(model),
          Option.flatMap((state) =>
            pipe(
              formToSubscription(state.form),
              Option.filter((subscription) => !isListed(state, Feed.subscriptionKey(subscription)))
            )
          ),
          Option.match({
            onNone: (): UpdateReturn => ({ model }),
            onSome: (subscription) => ({
              model,
              commands: [AddSubscription({ channelId: model.channelId, subscription })],
            }),
          })
        )
      ),

    SucceededAddSubscription: ({ subscription }) => ({
      model: mapSubscriptions(model, (state) =>
        isListed(state, Feed.subscriptionKey(subscription))
          ? state
          : modifyFields(state, { subscriptions: Array.append(subscription) })
      ),
    }),

    FailedAddSubscription: ({ error }) => ({ model: withError(model, error) }),

    ClickedRemoveSubscription: ({ key }) =>
      whenOpened(model, () =>
        pipe(
          maybeSubscriptions(model),
          Option.flatMap((state) =>
            Array.findFirst(
              state.subscriptions,
              (subscription) => Feed.subscriptionKey(subscription) === key
            )
          ),
          Option.match({
            onNone: (): UpdateReturn => ({ model }),
            onSome: (subscription) => ({
              model,
              commands: [RemoveSubscription({ channelId: model.channelId, subscription })],
            }),
          })
        )
      ),

    SucceededRemoveSubscription: ({ key }) => ({
      model: mapSubscriptions(model, (state) =>
        modifyFields(state, {
          subscriptions: Array.filter((existing) => Feed.subscriptionKey(existing) !== key),
        })
      ),
    }),

    FailedRemoveSubscription: ({ error }) => ({ model: withError(model, error) }),

    ClickedClearSubscriptions: () =>
      whenOpened(model, () => ({
        model,
        commands: [ClearSubscriptions({ channelId: model.channelId })],
      })),

    SucceededClearSubscriptions: () => ({
      model: mapSubscriptions(model, (state) => modifyFields(state, { subscriptions: () => [] })),
    }),

    FailedClearSubscriptions: ({ error }) => ({ model: withError(model, error) }),

    ToggledConfiguration: ({ isOpen }) => ({
      model: mapSubscriptions(model, (state) =>
        modifyFields(state, { isConfigurationOpen: () => isOpen })
      ),
    }),

    UpdatedAggregationPeriod: ({ value }) =>
      whenOpened(model, () => ({
        model: mapConfiguration(model, (configuration) =>
          modifyFields(configuration, { aggregationPeriod: () => value })
        ),
      })),

    GotDataFormatListboxMessage: ({ message }) =>
      whenOpened(model, () => foldDataFormatListbox(model, message)),

    GotFieldRowTypeComboboxMessage: ({ rowId, message }) =>
      whenOpened(model, () => foldFieldRowTypeCombobox(model, rowId, message)),

    UpdatedFieldRowFields: ({ rowId, value }) =>
      whenOpened(model, () => ({
        model: mapConfiguration(model, (configuration) =>
          modifyFields(configuration, {
            rows: Array.map((row) =>
              row.id === rowId ? modifyFields(row, { fields: () => value }) : row
            ),
          })
        ),
      })),

    ClickedRemoveFieldRow: ({ rowId }) =>
      whenOpened(model, () => ({
        model: mapConfiguration(model, (configuration) =>
          modifyFields(configuration, {
            rows: Array.filter((row) => row.id !== rowId),
          })
        ),
      })),

    ClickedAddFieldRow: () =>
      whenOpened(model, () => ({
        model: mapConfiguration(model, (configuration) =>
          modifyFields(configuration, {
            rows: Array.append(configurationRow(model.channelId, configuration.nextRowId, '', '')),
            nextRowId: (nextRowId) => nextRowId + 1,
          })
        ),
      })),

    ClickedApplyConfiguration: () =>
      whenOpened(model, () =>
        Option.match(maybeSubscriptions(model), {
          onNone: (): UpdateReturn => ({ model }),
          onSome: ({ configuration }) => ({
            model,
            commands: [
              ConfigureFeed({
                channelId: model.channelId,
                aggregationPeriod: configuration.aggregationPeriod,
                dataFormat: configuration.dataFormat,
                rows: Array.map(configuration.rows, (row) => ({
                  id: row.id,
                  type: row.typeCombobox.inputValue,
                  fields: row.fields,
                })),
              }),
            ],
          }),
        })
      ),

    SucceededConfigureFeed: () => ({ model }),

    FailedConfigureFeed: ({ error }) => ({ model: withError(model, error) }),

    ChangedAppliedConfig: ({ applied }) => ({
      model: mapSubscriptions(model, (state) => modifyFields(state, { applied: () => applied })),
    }),

    ReceivedEvents: ({ events }) => ({
      model: mapTable(model, (table) =>
        EventsTable.match(table, {
          Live: (live) => EventsTable.Live({ events: Feed.upsertEvents(live.events, events) }),
          Paused: (paused) =>
            EventsTable.Paused({
              frozen: paused.frozen,
              events: Feed.upsertEvents(paused.events, events),
            }),
        })
      ),
    }),

    GotEventTypeTabsMessage: ({ message }) => foldEventTypeTabs(model, message),

    ClickedTogglePause: () => ({
      model: mapTable(model, (table) =>
        EventsTable.match(table, {
          Live: ({ events }) => EventsTable.Paused({ frozen: events, events }),
          Paused: ({ events }) => EventsTable.Live({ events }),
        })
      ),
    }),

    // NOTE: clearing empties what is on screen and what was gathered underneath it alike,
    // so a paused table goes empty at once and resuming does not bring cleared rows back.
    ClickedClearEvents: () => ({
      model: mapTable(model, (table) =>
        EventsTable.match(table, {
          Live: () => EventsTable.Live({ events: {} }),
          Paused: () => EventsTable.Paused({ frozen: {}, events: {} }),
        })
      ),
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

    SucceededCopyEvents: () => ({ model }),

    FailedCopyEvents: ({ error }) => ({ model: withError(model, error) }),

    UpdatedCandleSymbol: ({ value }) =>
      whenOpened(model, () => ({
        model: mapChart(model, (state) => modifyFields(state, { symbol: () => value })),
      })),

    UpdatedCandleFromTime: ({ value }) =>
      whenOpened(model, () => ({
        model: mapChart(model, (state) =>
          modifyFields(state, { fromTime: () => value.replace(DIGITS_ONLY, '') })
        ),
      })),

    SubmittedCandleSubscription: () =>
      whenOpened(model, () =>
        pipe(
          maybeChart(model),
          Option.filter((state) => state.symbol.trim() !== ''),
          Option.match({
            onNone: (): UpdateReturn => ({ model }),
            onSome: (state) => {
              const generation = state.lastGeneration + 1
              const subscription = {
                symbol: state.symbol.trim(),
                fromTime: toNumber(state.fromTime),
              }

              return {
                model: mapChart(model, (chart) =>
                  modifyFields(chart, {
                    lastGeneration: () => generation,
                    maybeActive: () => Option.some({ generation, subscription, candleCount: 0 }),
                    maybeChartError: () => Option.none(),
                  })
                ),
                commands: [
                  SetCandleSubscription({
                    channelId: model.channelId,
                    generation,
                    subscription,
                  }),
                ],
              }
            },
          })
        )
      ),

    SucceededSetCandleSubscription: () => ({ model }),

    FailedSetCandleSubscription: ({ generation, error }) => ({
      model: mapActiveCandles(withError(model, error), generation, (state) =>
        modifyFields(state, { maybeActive: () => Option.none() })
      ),
    }),

    SucceededMountChart: () => ({ model }),

    FailedMountChart: ({ reason }) => ({
      model: mapChart(model, (state) =>
        modifyFields(state, { maybeChartError: () => Option.some(reason) })
      ),
    }),

    ReceivedCandles: ({ generation, candleCount }) => ({
      model: mapActiveCandles(model, generation, (state) =>
        modifyFields(state, {
          maybeActive: Option.map((active) =>
            modifyFields(active, { candleCount: () => candleCount })
          ),
        })
      ),
    }),

    FailedDrawCandles: ({ generation, reason }) => ({
      model: mapActiveCandles(model, generation, (state) =>
        modifyFields(state, { maybeChartError: () => Option.some(reason) })
      ),
    }),
  })

/**
 * The channel as it reads once its card is closed: a record that keeps the protocol identity
 * it had if it was ever opened.
 */
export const close = (model: Model): Model =>
  modifyFields(model, {
    lifecycle: (lifecycle) =>
      Lifecycle.match(lifecycle, {
        Opening: () => Lifecycle.Closed({ maybeChannel: Option.none() }),
        Opened: ({ channel }) => Lifecycle.Closed({ maybeChannel: Option.some(channel) }),
        FailedToOpen: () => Lifecycle.Closed({ maybeChannel: Option.none() }),
        Closed: () => lifecycle,
      }),
  })

export const clearErrors = (model: Model): Model => modifyFields(model, { errorLog: clearErrorLog })
