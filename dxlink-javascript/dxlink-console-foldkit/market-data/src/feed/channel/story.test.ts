import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'

import {
  AddSubscription,
  ClearSubscriptions,
  ConfigureFeed,
  CopyEvents,
  RemoveSubscription,
  SetCandleSubscription,
} from './command'
import { Feed } from '../domain'
import { Message } from './message'
import { Lifecycle, type Model } from './model'
import { summarize } from './summary'
import { activeEventType, close, displayedEvents, init, update } from './update'

const succeededOpen = Message.SucceededOpenChannel({
  channelState: DXLinkChannelState.OPENED,
  protocolChannelId: 7,
  parameters: { contract: 'AUTO' },
})

const openingSubscriptionsModel = init({
  channelId: '1',
  config: { view: 'Subscriptions', feed: '', space: '' },
}).model

const openingChartModel = init({
  channelId: '2',
  config: { view: 'Chart', feed: '', space: '' },
}).model

const subscriptionsModel = update(openingSubscriptionsModel, succeededOpen).model
const chartModel = update(openingChartModel, succeededOpen).model

const failure = (text: string) => ({ type: 'CONSOLE', message: text, time: '10:00' })

const subscriptionsOf = (next: Model) =>
  next.view._tag === 'Subscriptions' ? next.view.state.subscriptions : []

const errorMessagesOf = (next: Model) => next.errorLog.errors.map((error) => error.message)

const order = (source: string) =>
  Feed.FeedSubscription.Indexed({ type: 'Order', symbol: 'AAPL', source })

const submitOrder = (source: string) => [
  message(Message.SelectedSubscriptionKind({ kind: 'Indexed' })),
  message(Message.UpdatedSubscriptionType({ value: 'Order' })),
  message(Message.UpdatedSubscriptionSymbol({ value: ' AAPL ' })),
  message(Message.UpdatedSubscriptionSource({ value: source })),
  message(Message.SubmittedSubscription()),
]

const addOrder = (source: string) => [
  ...submitOrder(source),
  Command.resolve(
    AddSubscription,
    Message.SucceededAddSubscription({ subscription: order(source) })
  ),
]

describe('lifecycle', () => {
  test('a channel starts out opening, keeps what it is opened with and issues no Command', () => {
    const channelInit = init({ channelId: '1', config: { view: 'Chart', feed: 'f', space: 's' } })

    expect(channelInit.model).toMatchObject({
      channelId: '1',
      feed: 'f',
      space: 's',
      lifecycle: Lifecycle.Opening(),
      view: { _tag: 'Chart' },
    })
    expect(channelInit.commands).toBeUndefined()
  })

  test('a channel being opened has no protocol identity yet', () => {
    expect(summarize(openingSubscriptionsModel)).toEqual({
      subtitle: 'Feed · subscriptions',
      maybeStatus: Option.some({ label: 'opening', tone: 'Warning' }),
      maybeChannelId: Option.none(),
      parameters: {},
      errors: [],
    })
  })

  test('the header reports the opened channel', () => {
    story(
      update,
      given(openingSubscriptionsModel),
      message(succeededOpen),
      model((next) => {
        expect(summarize(next)).toEqual({
          subtitle: 'Feed · subscriptions',
          maybeStatus: Option.some({ label: 'opened', tone: 'Success' }),
          maybeChannelId: Option.some(7),
          parameters: { contract: 'AUTO' },
          errors: [],
        })
      })
    )
  })

  test('an opened channel follows the server through a reconnect', () => {
    story(
      update,
      given(subscriptionsModel),
      message(Message.ChangedChannelState({ channelState: DXLinkChannelState.REQUESTED })),
      model((next) => {
        expect(summarize(next).maybeStatus).toEqual(
          Option.some({ label: 'opening', tone: 'Warning' })
        )
        expect(summarize(next).maybeChannelId).toEqual(Option.some(7))
      }),
      message(Message.ChangedChannelState({ channelState: DXLinkChannelState.OPENED })),
      model((next) => {
        expect(summarize(next).maybeStatus).toEqual(
          Option.some({ label: 'opened', tone: 'Success' })
        )
      })
    )
  })

  test('a failed open is recorded on the channel, which then accepts no input', () => {
    story(
      update,
      given(openingSubscriptionsModel),
      message(Message.FailedOpenChannel({ error: failure('no client') })),
      model((next) => {
        expect(next.lifecycle).toEqual(Lifecycle.FailedToOpen())
        expect(summarize(next).maybeStatus).toEqual(
          Option.some({ label: 'failed', tone: 'Danger' })
        )
        expect(errorMessagesOf(next)).toEqual(['no client'])
      }),
      message(Message.UpdatedSubscriptionSymbol({ value: 'AAPL' })),
      message(Message.SubmittedSubscription()),
      Command.expectNone(),
      message(Message.ClickedApplyConfiguration()),
      Command.expectNone(),
      model((next) => {
        expect(next.view).toEqual(openingSubscriptionsModel.view)
      })
    )
  })

  test('a channel that is still opening accepts no input', () => {
    story(
      update,
      given(openingChartModel),
      message(Message.UpdatedCandleSymbol({ value: 'MSFT{=d}' })),
      message(Message.SubmittedCandleSubscription()),
      Command.expectNone(),
      model((next) => {
        expect(next).toEqual(openingChartModel)
      })
    )
  })

  test('a channel the server closed keeps its identity and accepts no input', () => {
    story(
      update,
      given(subscriptionsModel),
      message(Message.ChangedChannelState({ channelState: DXLinkChannelState.CLOSED })),
      model((next) => {
        expect(summarize(next).maybeStatus).toEqual(
          Option.some({ label: 'closed', tone: 'Neutral' })
        )
        expect(summarize(next).maybeChannelId).toEqual(Option.some(7))
      }),
      message(Message.UpdatedSubscriptionSymbol({ value: 'AAPL' })),
      message(Message.SubmittedSubscription()),
      Command.expectNone()
    )
  })

  test('closing leaves a closed record that keeps the protocol identity', () => {
    expect(close(subscriptionsModel).lifecycle).toEqual(
      Lifecycle.Closed({
        maybeChannel: Option.some({ protocolChannelId: 7, parameters: { contract: 'AUTO' } }),
      })
    )
  })

  test('a channel closed before it opened has no identity', () => {
    expect(close(openingSubscriptionsModel).lifecycle).toEqual(
      Lifecycle.Closed({ maybeChannel: Option.none() })
    )
  })

  test('a late state event does not reopen a closed channel', () => {
    const closed = close(subscriptionsModel)

    story(
      update,
      given(closed),
      message(Message.ChangedChannelState({ channelState: DXLinkChannelState.OPENED })),
      message(Message.ChangedChannelState({ channelState: DXLinkChannelState.REQUESTED })),
      model((next) => {
        expect(next).toEqual(closed)
      })
    )
  })

  test('a late open result does not reopen a closed or failed channel', () => {
    const closed = close(openingSubscriptionsModel)

    story(
      update,
      given(closed),
      message(succeededOpen),
      model((next) => {
        expect(next).toEqual(closed)
      })
    )
    story(
      update,
      given(openingSubscriptionsModel),
      message(Message.FailedOpenChannel({ error: failure('no client') })),
      message(succeededOpen),
      message(Message.ChangedChannelState({ channelState: DXLinkChannelState.OPENED })),
      model((next) => {
        expect(next.lifecycle).toEqual(Lifecycle.FailedToOpen())
      })
    )
  })
})

describe('subscriptions', () => {
  test('a subscription is listed once the feed accepted it', () => {
    story(
      update,
      given(subscriptionsModel),
      ...submitOrder('NTV'),
      Command.expectExact(AddSubscription({ channelId: '1', subscription: order('NTV') })),
      model((next) => {
        expect(subscriptionsOf(next)).toEqual([])
      }),
      Command.resolve(
        AddSubscription,
        Message.SucceededAddSubscription({ subscription: order('NTV') })
      ),
      model((next) => {
        expect(subscriptionsOf(next)).toEqual([order('NTV')])
      })
    )
  })

  test('a subscription that could not be sent is not listed, and the failure is recorded', () => {
    story(
      update,
      given(subscriptionsModel),
      ...submitOrder('NTV'),
      Command.resolve(
        AddSubscription,
        Message.FailedAddSubscription({ error: failure('The channel has no live feed behind it') })
      ),
      model((next) => {
        expect(subscriptionsOf(next)).toEqual([])
        expect(errorMessagesOf(next)).toEqual(['The channel has no live feed behind it'])
      })
    )
  })

  test('keeps two sources of one symbol as separate subscriptions', () => {
    story(
      update,
      given(subscriptionsModel),
      ...addOrder('NTV'),
      ...addOrder('DEX'),
      model((next) => {
        expect(subscriptionsOf(next)).toEqual([
          { _tag: 'Indexed', type: 'Order', symbol: 'AAPL', source: 'NTV' },
          { _tag: 'Indexed', type: 'Order', symbol: 'AAPL', source: 'DEX' },
        ])
      })
    )
  })

  test('does not add the same subscription twice', () => {
    story(
      update,
      given(subscriptionsModel),
      ...addOrder('NTV'),
      message(Message.SubmittedSubscription()),
      Command.expectNone(),
      message(Message.SucceededAddSubscription({ subscription: order('NTV') })),
      model((next) => {
        expect(subscriptionsOf(next)).toHaveLength(1)
      })
    )
  })

  test('an indexed subscription needs its source', () => {
    story(
      update,
      given(subscriptionsModel),
      message(Message.SelectedSubscriptionKind({ kind: 'Indexed' })),
      message(Message.UpdatedSubscriptionSymbol({ value: 'AAPL' })),
      message(Message.SubmittedSubscription()),
      Command.expectNone()
    )
  })

  test('a regular subscription carries neither a typed source nor a from time', () => {
    story(
      update,
      given(subscriptionsModel),
      message(Message.UpdatedSubscriptionSource({ value: 'NTV' })),
      message(Message.UpdatedSubscriptionFromTime({ value: '5' })),
      message(Message.UpdatedSubscriptionSymbol({ value: 'AAPL' })),
      message(Message.SubmittedSubscription()),
      Command.expectExact(
        AddSubscription({
          channelId: '1',
          subscription: Feed.FeedSubscription.Regular({ type: 'Quote', symbol: 'AAPL' }),
        })
      ),
      Command.resolve(
        AddSubscription,
        Message.SucceededAddSubscription({
          subscription: Feed.FeedSubscription.Regular({ type: 'Quote', symbol: 'AAPL' }),
        })
      )
    )
  })

  test('accepts an event type that is not on the list, and keeps from time numeric', () => {
    const dailyCandle = Feed.FeedSubscription.TimeSeries({
      type: 'DailyCandle',
      symbol: 'AAPL{=d}',
      fromTime: 123,
    })

    story(
      update,
      given(subscriptionsModel),
      message(Message.SelectedSubscriptionKind({ kind: 'TimeSeries' })),
      message(Message.UpdatedSubscriptionType({ value: 'DailyCandle' })),
      message(Message.UpdatedSubscriptionSymbol({ value: 'AAPL{=d}' })),
      message(Message.UpdatedSubscriptionFromTime({ value: '12ab3' })),
      message(Message.SubmittedSubscription()),
      Command.expectExact(AddSubscription({ channelId: '1', subscription: dailyCandle })),
      Command.resolve(
        AddSubscription,
        Message.SucceededAddSubscription({ subscription: dailyCandle })
      ),
      model((next) => {
        expect(subscriptionsOf(next)).toEqual([dailyCandle])
      })
    )
  })

  test('removing sends the subscription that was added and unlists it once removed', () => {
    story(
      update,
      given(subscriptionsModel),
      ...addOrder('NTV'),
      message(Message.ClickedRemoveSubscription({ key: 'Order#NTV:AAPL' })),
      Command.expectExact(RemoveSubscription({ channelId: '1', subscription: order('NTV') })),
      model((next) => {
        expect(subscriptionsOf(next)).toEqual([order('NTV')])
      }),
      Command.resolve(
        RemoveSubscription,
        Message.SucceededRemoveSubscription({ key: 'Order#NTV:AAPL' })
      ),
      model((next) => {
        expect(subscriptionsOf(next)).toEqual([])
      })
    )
  })

  test('a subscription that could not be removed stays listed', () => {
    story(
      update,
      given(subscriptionsModel),
      ...addOrder('NTV'),
      message(Message.ClickedRemoveSubscription({ key: 'Order#NTV:AAPL' })),
      Command.resolve(
        RemoveSubscription,
        Message.FailedRemoveSubscription({ error: failure('remove threw') })
      ),
      model((next) => {
        expect(subscriptionsOf(next)).toEqual([order('NTV')])
        expect(errorMessagesOf(next)).toEqual(['remove threw'])
      })
    )
  })

  test('clearing empties the list once the feed dropped its subscriptions', () => {
    story(
      update,
      given(subscriptionsModel),
      ...addOrder('NTV'),
      ...addOrder('DEX'),
      message(Message.ClickedClearSubscriptions()),
      Command.expectExact(ClearSubscriptions({ channelId: '1' })),
      Command.resolve(ClearSubscriptions, Message.SucceededClearSubscriptions()),
      model((next) => {
        expect(subscriptionsOf(next)).toEqual([])
      })
    )
  })

  test('a failed clear keeps the list and records the failure', () => {
    story(
      update,
      given(subscriptionsModel),
      ...addOrder('NTV'),
      message(Message.ClickedClearSubscriptions()),
      Command.resolve(
        ClearSubscriptions,
        Message.FailedClearSubscriptions({ error: failure('clear threw') })
      ),
      model((next) => {
        expect(subscriptionsOf(next)).toEqual([order('NTV')])
        expect(errorMessagesOf(next)).toEqual(['clear threw'])
      })
    )
  })

  test('the configuration section starts collapsed and follows its toggle', () => {
    const isOpenOf = (next: Model) =>
      next.view._tag === 'Subscriptions' && next.view.state.isConfigurationOpen

    story(
      update,
      given(subscriptionsModel),
      model((next) => {
        expect(isOpenOf(next)).toBe(false)
      }),
      message(Message.ToggledConfiguration({ isOpen: true })),
      model((next) => {
        expect(isOpenOf(next)).toBe(true)
      })
    )
  })

  test('applying sends the requested configuration as typed', () => {
    story(
      update,
      given(subscriptionsModel),
      message(Message.UpdatedAggregationPeriod({ value: '5' })),
      message(Message.SelectedDataFormat({ value: 'COMPACT' })),
      message(Message.ClickedApplyConfiguration()),
      Command.expectExact(
        ConfigureFeed({
          channelId: '1',
          aggregationPeriod: '5',
          dataFormat: 'COMPACT',
          rows: [{ id: 1, type: 'Quote', fields: 'bidPrice, askPrice, bidSize, askSize' }],
        })
      ),
      Command.resolve(ConfigureFeed, Message.SucceededConfigureFeed())
    )
  })

  test('a configuration that could not be sent is recorded on the channel', () => {
    story(
      update,
      given(subscriptionsModel),
      message(Message.ClickedApplyConfiguration()),
      Command.resolve(
        ConfigureFeed,
        Message.FailedConfigureFeed({ error: failure('Aggregation period "x" is not a number') })
      ),
      model((next) => {
        expect(errorMessagesOf(next)).toEqual(['Aggregation period "x" is not a number'])
      })
    )
  })
})

describe('events', () => {
  const quote = (bidPrice: number) => ({
    eventType: 'Quote',
    eventSymbol: 'AAPL',
    bidPrice,
  })

  const stateOf = (next: Model) =>
    next.view._tag === 'Subscriptions' ? Option.some(next.view.state) : Option.none()

  const displayedOf = (next: Model) => Option.map(stateOf(next), displayedEvents)

  test('pausing freezes what is shown while events keep arriving', () => {
    story(
      update,
      given(subscriptionsModel),
      message(Message.ReceivedEvents({ events: [quote(1)] })),
      message(Message.ClickedTogglePause()),
      message(Message.ReceivedEvents({ events: [quote(2)] })),
      model((next) => {
        expect(displayedOf(next)).toEqual(Option.some({ Quote: { AAPL: quote(1) } }))
      }),
      message(Message.ClickedTogglePause()),
      model((next) => {
        expect(displayedOf(next)).toEqual(Option.some({ Quote: { AAPL: quote(2) } }))
      })
    )
  })

  test('clearing a paused table empties what is shown, and resuming does not bring it back', () => {
    story(
      update,
      given(subscriptionsModel),
      message(Message.ReceivedEvents({ events: [quote(1)] })),
      message(Message.ClickedTogglePause()),
      message(Message.ReceivedEvents({ events: [quote(2)] })),
      message(Message.ClickedClearEvents()),
      model((next) => {
        expect(displayedOf(next)).toEqual(Option.some({}))
        expect(Option.map(stateOf(next), (state) => state.table._tag)).toEqual(
          Option.some('Paused')
        )
      }),
      message(Message.ReceivedEvents({ events: [quote(3)] })),
      model((next) => {
        expect(displayedOf(next)).toEqual(Option.some({}))
      }),
      message(Message.ClickedTogglePause()),
      model((next) => {
        expect(displayedOf(next)).toEqual(Option.some({ Quote: { AAPL: quote(3) } }))
      })
    )
  })

  test('the first type received is shown until another is selected, and clear empties the table', () => {
    story(
      update,
      given(subscriptionsModel),
      message(
        Message.ReceivedEvents({
          events: [quote(1), { eventType: 'Trade', eventSymbol: 'AAPL' }],
        })
      ),
      model((next) => {
        expect(Option.flatMap(stateOf(next), activeEventType)).toEqual(Option.some('Quote'))
      }),
      message(Message.SelectedEventType({ type: 'Trade' })),
      model((next) => {
        expect(Option.flatMap(stateOf(next), activeEventType)).toEqual(Option.some('Trade'))
      }),
      message(Message.ClickedClearEvents()),
      model((next) => {
        expect(Option.flatMap(stateOf(next), activeEventType)).toEqual(Option.none())
      })
    )
  })

  test('copying sends the shown rows, and a refused clipboard is recorded', () => {
    story(
      update,
      given(subscriptionsModel),
      message(Message.ReceivedEvents({ events: [quote(1)] })),
      message(Message.ClickedCopyEvents()),
      Command.expectExact(CopyEvents({ text: JSON.stringify([quote(1)], null, 2) })),
      Command.resolve(
        CopyEvents,
        Message.FailedCopyEvents({ error: failure('Could not copy the events: denied') })
      ),
      model((next) => {
        expect(errorMessagesOf(next)).toEqual(['Could not copy the events: denied'])
      })
    )
  })
})

describe('candle chart', () => {
  const chartOf = (next: Model) =>
    next.view._tag === 'Chart' ? Option.some(next.view.state) : Option.none()

  const activeOf = (next: Model) => Option.flatMap(chartOf(next), (state) => state.maybeActive)

  const candleCountOf = (next: Model) => Option.map(activeOf(next), (active) => active.candleCount)

  const chartErrorOf = (next: Model) =>
    Option.flatMap(chartOf(next), (state) => state.maybeChartError)

  const subscribe = (generation: number) => [
    message(Message.SubmittedCandleSubscription()),
    Command.resolve(SetCandleSubscription, Message.SucceededSetCandleSubscription({ generation })),
  ]

  test('subscribing starts a new generation and clears an earlier chart error', () => {
    story(
      update,
      given(chartModel),
      message(Message.FailedMountChart({ reason: 'boom' })),
      message(Message.UpdatedCandleFromTime({ value: '10x' })),
      message(Message.SubmittedCandleSubscription()),
      Command.expectExact(
        SetCandleSubscription({
          channelId: '2',
          generation: 1,
          subscription: { symbol: 'AAPL{=d}', fromTime: 10 },
        })
      ),
      Command.resolve(
        SetCandleSubscription,
        Message.SucceededSetCandleSubscription({ generation: 1 })
      ),
      model((next) => {
        expect(next.view).toEqual({
          _tag: 'Chart',
          state: {
            symbol: 'AAPL{=d}',
            fromTime: '10',
            lastGeneration: 1,
            maybeActive: Option.some({
              generation: 1,
              subscription: { symbol: 'AAPL{=d}', fromTime: 10 },
              candleCount: 0,
            }),
            maybeChartError: Option.none(),
          },
        })
      })
    )
  })

  test('a candle count of the previous subscription does not reach the next one', () => {
    story(
      update,
      given(chartModel),
      ...subscribe(1),
      message(Message.ReceivedCandles({ generation: 1, candleCount: 5 })),
      model((next) => {
        expect(candleCountOf(next)).toEqual(Option.some(5))
      }),
      ...subscribe(2),
      message(Message.ReceivedCandles({ generation: 1, candleCount: 9 })),
      model((next) => {
        expect(candleCountOf(next)).toEqual(Option.some(0))
      }),
      message(Message.ReceivedCandles({ generation: 2, candleCount: 3 })),
      model((next) => {
        expect(candleCountOf(next)).toEqual(Option.some(3))
      })
    )
  })

  test('a drawing failure of the previous subscription does not reach the next one', () => {
    story(
      update,
      given(chartModel),
      ...subscribe(1),
      ...subscribe(2),
      message(Message.FailedDrawCandles({ generation: 1, reason: 'stale' })),
      model((next) => {
        expect(chartErrorOf(next)).toEqual(Option.none())
      }),
      message(Message.FailedDrawCandles({ generation: 2, reason: 'bad candle' })),
      model((next) => {
        expect(chartErrorOf(next)).toEqual(Option.some('bad candle'))
      })
    )
  })

  test('a subscription that could not be set is not shown as active', () => {
    story(
      update,
      given(chartModel),
      message(Message.SubmittedCandleSubscription()),
      Command.resolve(
        SetCandleSubscription,
        Message.FailedSetCandleSubscription({ generation: 1, error: failure('set threw') })
      ),
      model((next) => {
        expect(activeOf(next)).toEqual(Option.none())
        expect(errorMessagesOf(next)).toEqual(['set threw'])
      })
    )
  })

  test('a failure of the previous subscription leaves the current one active', () => {
    story(
      update,
      given(chartModel),
      ...subscribe(1),
      ...subscribe(2),
      message(Message.FailedSetCandleSubscription({ generation: 1, error: failure('late') })),
      model((next) => {
        expect(Option.map(activeOf(next), (active) => active.generation)).toEqual(Option.some(2))
        expect(errorMessagesOf(next)).toEqual(['late'])
      })
    )
  })

  test('an empty symbol is not subscribed', () => {
    story(
      update,
      given(chartModel),
      message(Message.UpdatedCandleSymbol({ value: '  ' })),
      message(Message.SubmittedCandleSubscription()),
      Command.expectNone()
    )
  })

  test('a chart that could not be mounted says why', () => {
    story(
      update,
      given(chartModel),
      message(Message.FailedMountChart({ reason: 'The channel has no live candle feed to draw' })),
      model((next) => {
        expect(chartErrorOf(next)).toEqual(
          Option.some('The channel has no live candle feed to draw')
        )
      })
    )
  })
})
