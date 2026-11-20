import { Option } from 'effect'
import {
  Command,
  all,
  click,
  expect,
  expectAll,
  given,
  inside,
  label,
  nth,
  role,
  scene,
  text,
  type,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'

import * as Channel from './channel'
import { ConfigureDomChannel } from './command'
import { Message } from './message'
import * as Request from './request'
import { view } from './view'

const config = { symbol: 'AAPL', source: 'AGGREGATE', feed: '', space: '' }

const openingModel = Channel.init({ channelId: '7', config }).model

const openedModel = Channel.update(
  openingModel,
  Message.SucceededOpenDomChannel({
    protocolChannelId: 3,
    parameters: { symbol: 'AAPL', sources: 'AGGREGATE' },
    channelState: DXLinkChannelState.OPENED,
    applied: {
      maybeAggregationPeriod: Option.some(1),
      maybeDepthLimit: Option.none(),
      dataFormat: 'FULL',
      orderFields: ['price', 'size'],
    },
  })
).model

const withBookModel = Channel.update(
  openedModel,
  Message.ReceivedSnapshot({
    snapshot: {
      time: 1,
      bids: [
        { price: 99, maybeSize: Option.some(10) },
        { price: 100, maybeSize: Option.none() },
      ],
      asks: [
        { price: 102, maybeSize: Option.some(30) },
        { price: 101, maybeSize: Option.some(20) },
      ],
    },
  })
).model

const failedModel = Channel.update(
  openingModel,
  Message.FailedOpenDomChannel({
    error: { type: 'UNKNOWN', message: 'no connection', time: '10:00' },
  })
).model

const channel = { update: Channel.update, view }

describe('request', () => {
  test('the form starts at AAPL on the AGGREGATE source, with the feed left to the server', () => {
    scene(
      { update: Request.update, view: Request.view },
      given(Request.init().model),
      expect(label('Symbol *')).toHaveValue('AAPL'),
      expect(label('Sources')).toHaveValue('AGGREGATE'),
      expect(label('Feed qualification')).toHaveValue(''),
      expect(label('Feed space')).toHaveValue(''),
      expect(role('link', { name: 'kb.dxfeed.com' })).toExist()
    )
  })

  test('every field takes what is typed, a blank symbol included', () => {
    scene(
      { update: Request.update, view: Request.view },
      given(Request.init().model),
      type(label('Symbol *'), ''),
      type(label('Sources'), 'ntv, glbx'),
      type(label('Feed qualification'), 'delayed'),
      type(label('Feed space'), 'us'),
      expect(label('Symbol *')).toHaveValue(''),
      expect(label('Symbol *')).toBeEnabled(),
      expect(label('Sources')).toHaveValue('ntv, glbx'),
      expect(label('Feed qualification')).toHaveValue('delayed'),
      expect(label('Feed space')).toHaveValue('us')
    )
  })
})

describe('channel', () => {
  test('an opening channel shows neither the form nor the book', () => {
    scene(
      channel,
      given(openingModel),
      expect(role('note')).toHaveText('Opening the channel…'),
      expect(role('button', { name: 'Apply configuration' })).toBeAbsent(),
      expect(label('Depth limit')).toBeAbsent(),
      expect(role('heading', { name: 'Order book' })).toBeAbsent()
    )
  })

  test('an opened channel shows the form, what the server applied, and waits for a book', () => {
    scene(
      channel,
      given(openedModel),
      expect(label('Aggregation period, s')).toHaveValue(''),
      expect(label('Depth limit')).toHaveValue(''),
      expect(label('Accept order fields (comma-separated)')).toHaveValue('price, size'),
      expect(role('heading', { name: 'Applied by server' })).toExist(),
      expect(text('1 s')).toExist(),
      expect(text('FULL')).toExist(),
      expectAll(all.role('listitem')).toHaveCount(2),
      expect(text('Waiting for the first snapshot…')).toExist(),
      expect(role('table', { name: 'Bids' })).toBeAbsent()
    )
  })

  test('applying sends the typed configuration of the opened channel', () => {
    scene(
      channel,
      given(openedModel),
      type(label('Depth limit'), '5'),
      expect(label('Depth limit')).toHaveValue('5'),
      click(role('button', { name: 'Apply configuration' })),
      Command.expectExact(
        ConfigureDomChannel({
          channelId: '7',
          maybeAggregationPeriod: Option.none(),
          maybeDepthLimit: Option.some(5),
          maybeOrderFields: Option.some(['price', 'size']),
        })
      ),
      Command.resolve(ConfigureDomChannel, Message.SucceededConfigureDomChannel()),
      expect(label('Depth limit')).toHaveValue('5')
    )
  })

  test('a snapshot is the ladder: best levels first, a missing size as a dash', () => {
    scene(
      channel,
      given(withBookModel),
      expect(text('Waiting for the first snapshot…')).toBeAbsent(),
      inside(
        role('table', { name: 'Bids' }),
        expect(nth(all.role('columnheader'), 0)).toHaveText('Bid size'),
        expect(nth(all.role('columnheader'), 1)).toHaveText('Bid'),
        expectAll(all.role('cell')).toHaveCount(4),
        expect(nth(all.role('cell'), 0)).toHaveText('—'),
        expect(nth(all.role('cell'), 1)).toHaveText('100'),
        expect(nth(all.role('cell'), 2)).toHaveText('10'),
        expect(nth(all.role('cell'), 3)).toHaveText('99')
      ),
      inside(
        role('table', { name: 'Asks' }),
        expect(nth(all.role('columnheader'), 0)).toHaveText('Ask'),
        expect(nth(all.role('columnheader'), 1)).toHaveText('Ask size'),
        expectAll(all.role('cell')).toHaveCount(4),
        expect(nth(all.role('cell'), 0)).toHaveText('101'),
        expect(nth(all.role('cell'), 1)).toHaveText('20'),
        expect(nth(all.role('cell'), 2)).toHaveText('102'),
        expect(nth(all.role('cell'), 3)).toHaveText('30')
      )
    )
  })

  test('a snapshot with no levels on either side is an empty book', () => {
    scene(
      channel,
      given(
        Channel.update(
          openedModel,
          Message.ReceivedSnapshot({ snapshot: { time: 1, bids: [], asks: [] } })
        ).model
      ),
      expect(text('Empty book.')).toExist(),
      expect(role('table', { name: 'Bids' })).toBeAbsent()
    )
  })

  test('a channel that failed to open says so and offers no form', () => {
    scene(
      channel,
      given(failedModel),
      expect(role('alert')).toHaveText(
        'The channel could not be opened. See the errors of this channel.'
      ),
      expect(role('button', { name: 'Apply configuration' })).toBeAbsent(),
      expect(role('heading', { name: 'Order book' })).toBeAbsent()
    )
  })

  test('a closed channel shows neither the form nor the book it had', () => {
    scene(
      channel,
      given(Channel.close(withBookModel).model),
      expect(role('note')).toHaveText('The channel is closed.'),
      expect(role('button', { name: 'Apply configuration' })).toBeAbsent(),
      expect(role('table', { name: 'Bids' })).toBeAbsent()
    )
  })
})
