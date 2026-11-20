import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'

import {
  AddSubscription,
  ConfigureFeed,
  RemoveSubscription,
  SetCandleSubscription,
} from './command'
import { Message, RequestMessage } from './message'
import type { Model } from './model'
import { summarize } from './plugin'
import {
  activeEventType,
  close,
  displayedEvents,
  init,
  initRequest,
  requestToConfig,
  update,
  updateRequest,
} from './update'

const subscriptionsModel = init({
  channelId: '1',
  config: { view: 'Subscriptions', feed: '', space: '' },
}).model

const chartModel = init({
  channelId: '2',
  config: { view: 'Chart', feed: '', space: '' },
}).model

const describeCommands = (
  commands: ReadonlyArray<Readonly<{ name: string; args?: Record<string, unknown> }>> | undefined
) => (commands ?? []).map(({ name, args }) => ({ name, args }))

const subscriptionsOf = (next: Model) =>
  next.view._tag === 'Subscriptions' ? next.view.state.subscriptions : []

const addOrder = (source: string) => [
  message(Message.SelectedSubscriptionKind({ kind: 'Indexed' })),
  message(Message.UpdatedSubscriptionType({ value: 'Order' })),
  message(Message.UpdatedSubscriptionSymbol({ value: ' AAPL ' })),
  message(Message.UpdatedSubscriptionSource({ value: source })),
  message(Message.SubmittedSubscription()),
  Command.resolve(AddSubscription, Message.CompletedAddSubscription()),
]

describe('request', () => {
  test('starts on the subscriptions view and trims feed parameters into the config', () => {
    story(
      updateRequest,
      given(initRequest().model),
      message(RequestMessage.SelectedView({ view: 'Chart' })),
      message(RequestMessage.UpdatedFeed({ value: ' delayed ' })),
      model((request) => {
        expect(requestToConfig(request)).toEqual(
          Option.some({ view: 'Chart', feed: 'delayed', space: '' })
        )
      })
    )
  })
})

describe('opening', () => {
  test('each view opens its own kind of feed', () => {
    const openArgs = { feed: 'f', space: 's' }

    expect(
      describeCommands(
        init({ channelId: '1', config: { view: 'Subscriptions', ...openArgs } }).commands
      )
    ).toEqual([{ name: 'OpenFeed', args: { channelId: '1', ...openArgs } }])
    expect(
      describeCommands(init({ channelId: '2', config: { view: 'Chart', ...openArgs } }).commands)
    ).toEqual([{ name: 'OpenCandles', args: { channelId: '2', ...openArgs } }])
  })

  test('the header reports the opened channel', () => {
    story(
      update,
      given(subscriptionsModel),
      message(
        Message.SucceededOpenChannel({
          channelState: DXLinkChannelState.OPENED,
          protocolChannelId: 7,
          parameters: { contract: 'AUTO' },
        })
      ),
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

  test('a failed open is recorded on the channel and closes it', () => {
    story(
      update,
      given(subscriptionsModel),
      message(
        Message.FailedOpenChannel({
          error: { type: 'CONSOLE', message: 'no client', time: '10:00' },
        })
      ),
      model((next) => {
        expect(next.channelState).toBe(DXLinkChannelState.CLOSED)
        expect(next.errorLog.errors).toHaveLength(1)
      })
    )
  })
})

describe('subscriptions', () => {
  test('keeps two sources of one symbol as separate subscriptions', () => {
    story(
      update,
      given(subscriptionsModel),
      ...addOrder('NTV'),
      ...addOrder('DEX'),
      model((next) => {
        expect(subscriptionsOf(next)).toEqual([
          { kind: 'Indexed', type: 'Order', symbol: 'AAPL', source: 'NTV', fromTime: 0 },
          { kind: 'Indexed', type: 'Order', symbol: 'AAPL', source: 'DEX', fromTime: 0 },
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

  test('accepts an event type that is not on the list, and keeps from time numeric', () => {
    story(
      update,
      given(subscriptionsModel),
      message(Message.SelectedSubscriptionKind({ kind: 'TimeSeries' })),
      message(Message.UpdatedSubscriptionType({ value: 'DailyCandle' })),
      message(Message.UpdatedSubscriptionSymbol({ value: 'AAPL{=d}' })),
      message(Message.UpdatedSubscriptionFromTime({ value: '12ab3' })),
      message(Message.SubmittedSubscription()),
      Command.resolve(AddSubscription, Message.CompletedAddSubscription()),
      model((next) => {
        expect(subscriptionsOf(next)).toEqual([
          {
            kind: 'TimeSeries',
            type: 'DailyCandle',
            symbol: 'AAPL{=d}',
            source: '',
            fromTime: 123,
          },
        ])
      })
    )
  })

  test('removing sends the subscription that was added', () => {
    story(
      update,
      given(subscriptionsModel),
      ...addOrder('NTV'),
      message(Message.ClickedRemoveSubscription({ key: 'Order#NTV:AAPL' })),
      Command.expectHas(RemoveSubscription),
      Command.resolve(RemoveSubscription, Message.CompletedRemoveSubscription()),
      model((next) => {
        expect(subscriptionsOf(next)).toEqual([])
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
      Command.resolve(ConfigureFeed, Message.CompletedConfigureFeed())
    )
  })
})

describe('events', () => {
  const quote = (bidPrice: number) => ({
    eventType: 'Quote',
    eventSymbol: 'AAPL',
    bidPrice,
  })

  test('pausing freezes what is shown while events keep arriving', () => {
    story(
      update,
      given(subscriptionsModel),
      message(Message.ReceivedEvents({ events: [quote(1)] })),
      message(Message.ClickedTogglePause()),
      message(Message.ReceivedEvents({ events: [quote(2)] })),
      model((next) => {
        const state = next.view._tag === 'Subscriptions' ? next.view.state : undefined
        expect(state && displayedEvents(state)['Quote']?.['AAPL']).toEqual(quote(1))
        expect(state?.events['Quote']?.['AAPL']).toEqual(quote(2))
      }),
      message(Message.ClickedTogglePause()),
      model((next) => {
        const state = next.view._tag === 'Subscriptions' ? next.view.state : undefined
        expect(state && displayedEvents(state)['Quote']?.['AAPL']).toEqual(quote(2))
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
        expect(next.view._tag === 'Subscriptions' && activeEventType(next.view.state)).toEqual(
          Option.some('Quote')
        )
      }),
      message(Message.SelectedEventType({ type: 'Trade' })),
      model((next) => {
        expect(next.view._tag === 'Subscriptions' && activeEventType(next.view.state)).toEqual(
          Option.some('Trade')
        )
      }),
      message(Message.ClickedClearEvents()),
      model((next) => {
        expect(next.view._tag === 'Subscriptions' && activeEventType(next.view.state)).toEqual(
          Option.none()
        )
      })
    )
  })
})

describe('candle chart', () => {
  test('subscribing resets the count and clears an earlier chart error', () => {
    story(
      update,
      given(chartModel),
      message(Message.FailedDrawCandles({ reason: 'boom' })),
      message(Message.ReceivedCandles({ candleCount: 5 })),
      message(Message.UpdatedCandleFromTime({ value: '10x' })),
      message(Message.SubmittedCandleSubscription()),
      Command.expectExact(
        SetCandleSubscription({
          channelId: '2',
          subscription: { symbol: 'AAPL{=d}', fromTime: 10 },
        })
      ),
      Command.resolve(SetCandleSubscription, Message.CompletedSetCandleSubscription()),
      model((next) => {
        expect(next.view).toEqual({
          _tag: 'Chart',
          state: {
            symbol: 'AAPL{=d}',
            fromTime: '10',
            maybeSubscription: Option.some({ symbol: 'AAPL{=d}', fromTime: 10 }),
            candleCount: 0,
            maybeChartError: Option.none(),
          },
        })
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
})

describe('closing', () => {
  test('releases the live feed and leaves a closed record', () => {
    const channelClose = close(subscriptionsModel)

    expect(channelClose.model.channelState).toBe(DXLinkChannelState.CLOSED)
    expect(describeCommands(channelClose.commands)).toEqual([
      { name: 'CloseChannel', args: { channelId: '1' } },
    ])
  })
})
