import { Option } from 'effect'
import {
  Command,
  Mount,
  Subscription,
  all,
  click,
  expect,
  expectAll,
  given,
  keydown,
  label,
  nth,
  role,
  scene,
  text,
  type,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import { RadioGroup, Tabs } from '@foldkit/ui'

import {
  AddSubscription,
  CopyEvents,
  MountChart,
  RemoveSubscription,
  SetCandleSubscription,
} from './command'
import { Feed } from '../domain'
import { Message } from './message'
import { init, update } from './update'
import { view } from './view'

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

const failure = (message: string) => ({ type: 'CONSOLE', message, time: '10:00' })

const quoteAapl = Feed.FeedSubscription.Regular({ type: 'Quote', symbol: 'AAPL' })

const quote = (bidPrice: number) => ({
  eventType: 'Quote',
  eventSymbol: 'AAPL',
  bidPrice,
  askPrice: 200,
  sequence: 9,
})

const acknowledgeChartMount = Mount.resolve(MountChart, Message.SucceededMountChart())

const resolveFocusOption = Command.resolve(
  RadioGroup.FocusOption,
  RadioGroup.Message.CompletedFocusOption()
)

const resolveFocusTab = Command.resolve(Tabs.FocusTab, Tabs.Message.CompletedFocusTab())

const trade = (price: number) => ({ eventType: 'Trade', eventSymbol: 'AAPL', price })

const columnHeaders = all.role('columnheader')

describe('a channel that is not opened', () => {
  test('a channel being opened shows no form', () => {
    scene(
      { update, view },
      given(openingSubscriptionsModel),
      expect(role('note')).toHaveText('Opening the channel…'),
      expect(label('Symbol')).toBeAbsent(),
      expect(role('button', { name: 'Add' })).toBeAbsent()
    )
  })

  test('a failed open says so and offers nothing to type into', () => {
    scene(
      { update, view },
      given(openingSubscriptionsModel),
      Subscription.emit(Message.FailedOpenChannel({ error: failure('no connection') })),
      expect(role('alert')).toContainText('The channel could not be opened.'),
      expect(label('Symbol')).toBeAbsent(),
      expect(role('button', { name: 'Add' })).toBeAbsent(),
      expect(role('button', { name: 'Apply configuration' })).toBeAbsent()
    )
  })

  test('a failed chart open mounts no chart', () => {
    scene(
      { update, view },
      given(openingChartModel),
      Mount.expectNone(),
      Subscription.emit(Message.FailedOpenChannel({ error: failure('no connection') })),
      Mount.expectNone(),
      expect(role('alert')).toContainText('The channel could not be opened.'),
      expect(label('Candle symbol')).toBeAbsent()
    )
  })

  test('a channel the server closed keeps its events and drops its forms', () => {
    scene(
      { update, view },
      given(subscriptionsModel),
      Subscription.emit(Message.ReceivedEvents({ events: [quote(100)] })),
      Subscription.emit(Message.ChangedChannelState({ channelState: DXLinkChannelState.CLOSED })),
      expect(role('note')).toHaveText('The channel is closed and accepts no further input.'),
      expect(label('Symbol')).toBeAbsent(),
      expect(role('tab', { name: 'Quote (1)' })).toExist(),
      expect(role('cell', { name: '100' })).toExist()
    )
  })
})

describe('subscriptions view', () => {
  test('the configuration section expands and collapses', () => {
    scene(
      { update, view },
      given(subscriptionsModel),
      expect(role('button', { name: 'Configuration', expanded: false })).toExist(),
      click(role('button', { name: 'Configuration' })),
      expect(role('button', { name: 'Configuration', expanded: true })).toExist(),
      click(role('button', { name: 'Configuration' })),
      expect(role('button', { name: 'Configuration', expanded: false })).toExist()
    )
  })

  test('a subscription appears in the active list once the feed accepted it', () => {
    scene(
      { update, view },
      given(subscriptionsModel),
      expect(text('Active subscriptions (0)')).toExist(),
      expect(text('No active subscriptions.')).toExist(),
      expect(role('button', { name: 'Add' })).toBeDisabled(),
      type(label('Symbol'), 'AAPL'),
      expect(role('button', { name: 'Add' })).toBeEnabled(),
      click(role('button', { name: 'Add' })),
      Command.expectExact(AddSubscription({ channelId: '1', subscription: quoteAapl })),
      expect(text('No active subscriptions.')).toExist(),
      Command.resolve(
        AddSubscription,
        Message.SucceededAddSubscription({ subscription: quoteAapl })
      ),
      expect(text('Active subscriptions (1)')).toExist(),
      expect(role('listitem')).toContainText('Quote:AAPL'),
      expect(role('button', { name: 'Remove Quote:AAPL' })).toExist()
    )
  })

  test('a subscription that could not be sent is not listed', () => {
    scene(
      { update, view },
      given(subscriptionsModel),
      type(label('Symbol'), 'AAPL'),
      click(role('button', { name: 'Add' })),
      Command.resolve(
        AddSubscription,
        Message.FailedAddSubscription({ error: failure('The channel has no live feed behind it') })
      ),
      expect(text('Active subscriptions (0)')).toExist(),
      expect(text('No active subscriptions.')).toExist()
    )
  })

  test('an indexed subscription asks for its source, and two sources are two entries', () => {
    const fromSource = (source: string) =>
      Feed.FeedSubscription.Indexed({ type: 'Quote', symbol: 'AAPL', source })

    scene(
      { update, view },
      given(subscriptionsModel),
      expect(label('Order source')).toBeAbsent(),
      click(role('radio', { name: 'Indexed' })),
      resolveFocusOption,
      type(label('Symbol'), 'AAPL'),
      expect(role('button', { name: 'Add' })).toBeDisabled(),
      type(label('Order source'), 'NTV'),
      click(role('button', { name: 'Add' })),
      Command.expectExact(AddSubscription({ channelId: '1', subscription: fromSource('NTV') })),
      Command.resolve(
        AddSubscription,
        Message.SucceededAddSubscription({ subscription: fromSource('NTV') })
      ),
      type(label('Order source'), 'DEX'),
      click(role('button', { name: 'Add' })),
      Command.resolve(
        AddSubscription,
        Message.SucceededAddSubscription({ subscription: fromSource('DEX') })
      ),
      expect(text('Active subscriptions (2)')).toExist(),
      expectAll(all.role('listitem')).toHaveCount(2),
      click(role('button', { name: 'Remove Quote#NTV:AAPL' })),
      Command.resolve(
        RemoveSubscription,
        Message.SucceededRemoveSubscription({ key: 'Quote#NTV:AAPL' })
      ),
      expect(text('Active subscriptions (1)')).toExist(),
      expect(role('button', { name: 'Remove Quote#DEX:AAPL' })).toExist()
    )
  })

  test('events render as columns in the field order the server negotiated', () => {
    scene(
      { update, view },
      given(subscriptionsModel),
      expect(text('No events received yet. Add a subscription to start receiving data.')).toExist(),
      Subscription.emit(
        Message.ChangedAppliedConfig({
          applied: {
            maybeAggregationPeriod: Option.none(),
            dataFormat: 'COMPACT',
            eventFields: { Quote: ['eventType', 'eventSymbol', 'askPrice', 'bidPrice'] },
          },
        })
      ),
      Subscription.emit(Message.ReceivedEvents({ events: [quote(100)] })),
      expect(role('tab', { name: 'Quote (1)', selected: true })).toExist(),
      expectAll(columnHeaders).toHaveCount(5),
      expect(nth(columnHeaders, 0)).toHaveText('eventSymbol'),
      expect(nth(columnHeaders, 1)).toHaveText('eventType'),
      expect(nth(columnHeaders, 2)).toHaveText('askPrice'),
      expect(nth(columnHeaders, 3)).toHaveText('bidPrice'),
      expect(nth(columnHeaders, 4)).toHaveText('sequence'),
      expect(nth(all.role('cell'), 2)).toHaveText('200'),
      expect(nth(all.role('cell'), 3)).toHaveText('100')
    )
  })

  test('the subscription kind follows a click and the arrow keys', () => {
    scene(
      { update, view },
      given(subscriptionsModel),
      expect(role('radio', { name: 'Regular', checked: true })).toExist(),
      click(role('radio', { name: 'Time series' })),
      Command.expectExact(RadioGroup.FocusOption({ id: 'feed-1-subscription-kind', index: 2 })),
      resolveFocusOption,
      expect(role('radio', { name: 'Time series', checked: true })).toExist(),
      expect(role('radio', { name: 'Regular', checked: false })).toExist(),
      expect(label('From time')).toExist(),
      keydown(role('radio', { name: 'Time series' }), 'ArrowLeft'),
      resolveFocusOption,
      expect(role('radio', { name: 'Indexed', checked: true })).toExist(),
      expect(label('Order source')).toExist(),
      expect(label('From time')).toBeAbsent()
    )
  })

  test('each event type with rows has a tab, and the selected one shows its rows', () => {
    scene(
      { update, view },
      given(subscriptionsModel),
      Subscription.emit(Message.ReceivedEvents({ events: [quote(100), trade(55)] })),
      expectAll(all.role('tab')).toHaveCount(2),
      expect(nth(all.role('tab'), 0)).toHaveText('Quote (1)'),
      expect(nth(all.role('tab'), 1)).toHaveText('Trade (1)'),
      expect(role('tab', { name: 'Quote (1)', selected: true })).toExist(),
      expect(role('tabpanel', { name: 'Quote (1)' })).toExist(),
      expect(role('cell', { name: '100' })).toExist(),
      click(role('tab', { name: 'Trade (1)' })),
      Command.expectExact(Tabs.FocusTab({ id: 'feed-1-event-types', index: 1 })),
      resolveFocusTab,
      expect(role('tab', { name: 'Trade (1)', selected: true })).toExist(),
      expect(role('tab', { name: 'Quote (1)', selected: false })).toExist(),
      expect(role('tabpanel', { name: 'Trade (1)' })).toExist(),
      expect(role('cell', { name: '55' })).toExist(),
      expect(role('cell', { name: '100' })).toBeAbsent()
    )
  })

  test('the arrow keys move the selected event type along the tabs and wrap around', () => {
    scene(
      { update, view },
      given(subscriptionsModel),
      Subscription.emit(Message.ReceivedEvents({ events: [quote(100), trade(55)] })),
      keydown(role('tab', { name: 'Quote (1)' }), 'ArrowRight'),
      Command.expectExact(Tabs.FocusTab({ id: 'feed-1-event-types', index: 1 })),
      resolveFocusTab,
      expect(role('tab', { name: 'Trade (1)', selected: true })).toExist(),
      expect(role('cell', { name: '55' })).toExist(),
      keydown(role('tab', { name: 'Trade (1)' }), 'ArrowRight'),
      resolveFocusTab,
      expect(role('tab', { name: 'Quote (1)', selected: true })).toExist(),
      expect(role('cell', { name: '100' })).toExist()
    )
  })

  test('when the selected event type has no rows left, the first remaining type is shown', () => {
    scene(
      { update, view },
      given(subscriptionsModel),
      Subscription.emit(Message.ReceivedEvents({ events: [quote(100), trade(55)] })),
      click(role('tab', { name: 'Trade (1)' })),
      resolveFocusTab,
      click(role('button', { name: 'Pause' })),
      click(role('button', { name: 'Clear' })),
      Subscription.emit(Message.ReceivedEvents({ events: [quote(101)] })),
      click(role('button', { name: 'Resume' })),
      expectAll(all.role('tab')).toHaveCount(1),
      expect(role('tab', { name: 'Quote (1)', selected: true })).toExist(),
      expect(role('cell', { name: '101' })).toExist()
    )
  })

  test('a paused table keeps its rows until it resumes', () => {
    scene(
      { update, view },
      given(subscriptionsModel),
      Subscription.emit(Message.ReceivedEvents({ events: [quote(100)] })),
      click(role('button', { name: 'Pause' })),
      expect(role('button', { name: 'Resume' })).toExist(),
      Subscription.emit(Message.ReceivedEvents({ events: [quote(101)] })),
      expect(role('cell', { name: '100' })).toExist(),
      expect(role('cell', { name: '101' })).toBeAbsent(),
      click(role('button', { name: 'Resume' })),
      expect(role('cell', { name: '101' })).toExist(),
      expect(role('button', { name: 'Pause' })).toExist()
    )
  })

  test('clearing a paused table empties it at once, and it can still be resumed', () => {
    scene(
      { update, view },
      given(subscriptionsModel),
      Subscription.emit(Message.ReceivedEvents({ events: [quote(100)] })),
      click(role('button', { name: 'Pause' })),
      click(role('button', { name: 'Clear' })),
      expect(role('cell', { name: '100' })).toBeAbsent(),
      expect(role('tab', { name: 'Quote (1)' })).toBeAbsent(),
      expect(text('Paused. Events received meanwhile are shown when the table resumes.')).toExist(),
      Subscription.emit(Message.ReceivedEvents({ events: [quote(102)] })),
      expect(role('cell', { name: '102' })).toBeAbsent(),
      click(role('button', { name: 'Resume' })),
      expect(role('cell', { name: '102' })).toExist(),
      expect(role('cell', { name: '100' })).toBeAbsent()
    )
  })

  test('clearing a live table empties it', () => {
    scene(
      { update, view },
      given(subscriptionsModel),
      Subscription.emit(Message.ReceivedEvents({ events: [quote(100)] })),
      click(role('button', { name: 'Clear' })),
      expect(text('No events received yet. Add a subscription to start receiving data.')).toExist()
    )
  })

  test('copying hands the shown rows to the clipboard', () => {
    scene(
      { update, view },
      given(subscriptionsModel),
      Subscription.emit(Message.ReceivedEvents({ events: [quote(100)] })),
      click(role('button', { name: 'Copy as JSON' })),
      Command.expectExact(CopyEvents({ text: JSON.stringify([quote(100)], null, 2) })),
      Command.resolve(CopyEvents, Message.SucceededCopyEvents())
    )
  })
})

describe('candle chart view', () => {
  test('an opened chart waits for a subscription', () => {
    scene(
      { update, view },
      given(chartModel),
      Mount.expectExact(MountChart({ channelId: '2' })),
      acknowledgeChartMount,
      expect(text('Set a subscription to load candles.')).toExist(),
      expect(text('Subscribe to load candles.')).toExist(),
      expect(label('Candle symbol')).toHaveValue('AAPL{=d}'),
      expect(role('button', { name: 'Subscribe' })).toBeEnabled()
    )
  })

  test('subscribing loads candles and then counts them', () => {
    scene(
      { update, view },
      given(chartModel),
      acknowledgeChartMount,
      click(role('button', { name: 'Subscribe' })),
      Command.expectExact(
        SetCandleSubscription({
          channelId: '2',
          generation: 1,
          subscription: { symbol: 'AAPL{=d}', fromTime: 0 },
        })
      ),
      Command.resolve(
        SetCandleSubscription,
        Message.SucceededSetCandleSubscription({ generation: 1 })
      ),
      expect(text('AAPL{=d} · 0 candles')).toExist(),
      expect(text('Loading candles…')).toExist(),
      Subscription.emit(Message.ReceivedCandles({ generation: 1, candleCount: 1 })),
      expect(text('AAPL{=d} · 1 candle')).toExist(),
      expect(text('Loading candles…')).toBeAbsent()
    )
  })

  test('a count that belongs to the previous subscription is not shown for the next', () => {
    scene(
      { update, view },
      given(chartModel),
      acknowledgeChartMount,
      click(role('button', { name: 'Subscribe' })),
      Command.resolve(
        SetCandleSubscription,
        Message.SucceededSetCandleSubscription({ generation: 1 })
      ),
      type(label('Candle symbol'), 'MSFT{=d}'),
      click(role('button', { name: 'Subscribe' })),
      Command.resolve(
        SetCandleSubscription,
        Message.SucceededSetCandleSubscription({ generation: 2 })
      ),
      Subscription.emit(Message.ReceivedCandles({ generation: 1, candleCount: 8000 })),
      expect(text('MSFT{=d} · 0 candles')).toExist(),
      expect(text('Loading candles…')).toExist()
    )
  })

  test('a subscription that could not be set leaves the chart waiting for one', () => {
    scene(
      { update, view },
      given(chartModel),
      acknowledgeChartMount,
      click(role('button', { name: 'Subscribe' })),
      Command.resolve(
        SetCandleSubscription,
        Message.FailedSetCandleSubscription({ generation: 1, error: failure('set threw') })
      ),
      expect(text('Set a subscription to load candles.')).toExist()
    )
  })

  test('an empty symbol cannot be subscribed', () => {
    scene(
      { update, view },
      given(chartModel),
      acknowledgeChartMount,
      type(label('Candle symbol'), ' '),
      expect(role('button', { name: 'Subscribe' })).toBeDisabled()
    )
  })

  test('a chart that could not be built says why', () => {
    scene(
      { update, view },
      given(chartModel),
      Mount.resolve(MountChart, Message.FailedMountChart({ reason: 'canvas unavailable' })),
      expect(role('alert')).toHaveText('canvas unavailable')
    )
  })

  test('a drawing failure is shown over the chart', () => {
    scene(
      { update, view },
      given(chartModel),
      acknowledgeChartMount,
      click(role('button', { name: 'Subscribe' })),
      Command.resolve(
        SetCandleSubscription,
        Message.SucceededSetCandleSubscription({ generation: 1 })
      ),
      Subscription.emit(Message.FailedDrawCandles({ generation: 1, reason: 'bad candle' })),
      expect(role('alert')).toHaveText('bad candle')
    )
  })

  test('the chart is unmounted when the server closes the channel', () => {
    scene(
      { update, view },
      given(chartModel),
      acknowledgeChartMount,
      Subscription.emit(Message.ChangedChannelState({ channelState: DXLinkChannelState.CLOSED })),
      Mount.expectEnded(MountChart),
      expect(role('note')).toHaveText('The channel is closed and accepts no further input.'),
      expect(label('Candle symbol')).toBeAbsent()
    )
  })
})
