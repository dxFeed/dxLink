import { Option, Schema } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'

import type { Config } from '../domain'
import { ConfigureDomChannel } from './command'
import { Message } from './message'
import { Lifecycle } from './model'
import { summarize } from './summary'
import { clearErrors, close, init, update } from './update'

const config = { symbol: 'AAPL', source: 'ntv, glbx', feed: '', space: '' }

const applied: Config.AppliedConfig = {
  maybeAggregationPeriod: Option.some(1),
  maybeDepthLimit: Option.some(10),
  dataFormat: 'FULL',
  orderFields: ['price', 'size'],
}

const channelInit = init({ channelId: '7', config })

const succeededOpen = Message.SucceededOpenDomChannel({
  protocolChannelId: 3,
  parameters: { symbol: 'AAPL', sources: 'ntv, glbx' },
  channelState: DXLinkChannelState.OPENED,
  applied,
})

const opened = Lifecycle.Opened({
  protocolChannelId: 3,
  parameters: { symbol: 'AAPL', sources: 'ntv, glbx' },
  channelState: DXLinkChannelState.OPENED,
  applied,
  maybeSnapshot: Option.none(),
  acceptForm: { aggregationPeriod: '', depthLimit: '', orderFields: 'price, size' },
  isConfigurationOpen: false,
})

const openedModel = update(channelInit.model, succeededOpen).model

const closedModel = close(openedModel)

const snapshot = { time: 2, bids: [], asks: [{ price: 2, maybeSize: Option.some(2) }] }

const failure = { type: 'UNKNOWN', message: 'boom', time: '10:00' }

describe('channel', () => {
  test('a new channel is opening, and starts no Command to open itself', () => {
    expect(channelInit.model.lifecycle).toEqual(Lifecycle.Opening())
    expect(channelInit.commands).toBeUndefined()
  })

  test('an opening channel reports that it is opening', () => {
    expect(summarize(channelInit.model)).toEqual({
      subtitle: 'DOM · AAPL',
      maybeStatus: Option.some({ label: 'opening', tone: 'Warning' }),
      maybeChannelId: Option.none(),
      parameters: {},
      errors: [],
    })
  })

  test('a channel that opened holds what the server answered and a fresh form', () => {
    expect(openedModel.lifecycle).toEqual(opened)
  })

  test('an opened channel reports its protocol id, parameters and status', () => {
    expect(summarize(openedModel)).toEqual({
      subtitle: 'DOM · AAPL',
      maybeStatus: Option.some({ label: 'streaming', tone: 'Success' }),
      maybeChannelId: Option.some(3),
      parameters: { symbol: 'AAPL', sources: 'ntv, glbx' },
      errors: [],
    })
  })

  test('a channel that failed to open says so and says why', () => {
    story(
      update,
      given(channelInit.model),
      message(
        Message.FailedOpenDomChannel({
          error: { type: 'UNKNOWN', message: 'no connection', time: '10:00' },
        })
      ),
      model((next) => {
        expect(next.lifecycle).toEqual(Lifecycle.FailedToOpen())
        expect(next.errorLog.errors).toEqual([
          { id: 1, type: 'UNKNOWN', message: 'no connection', time: '10:00' },
        ])
        expect(summarize(next).maybeStatus).toEqual(
          Option.some({ label: 'failed', tone: 'Danger' })
        )
        expect(summarize(next).maybeChannelId).toEqual(Option.none())
      })
    )
  })

  test('a channel that failed to open takes no configuration and no events', () => {
    story(
      update,
      given(channelInit.model),
      message(Message.FailedOpenDomChannel({ error: failure })),
      message(Message.UpdatedAcceptDepthLimit({ value: '5' })),
      message(Message.ReceivedSnapshot({ snapshot })),
      message(Message.ClickedApplyConfiguration()),
      Command.expectNone(),
      model((next) => {
        expect(next.lifecycle).toEqual(Lifecycle.FailedToOpen())
      })
    )
  })

  test('a snapshot replaces the book', () => {
    story(
      update,
      given(openedModel),
      message(
        Message.ReceivedSnapshot({
          snapshot: { time: 1, bids: [{ price: 1, maybeSize: Option.some(1) }], asks: [] },
        })
      ),
      message(Message.ReceivedSnapshot({ snapshot })),
      model((next) => {
        expect(next.lifecycle).toEqual({ ...opened, maybeSnapshot: Option.some(snapshot) })
      })
    )
  })

  test('the protocol state of an opened channel follows the client', () => {
    story(
      update,
      given(openedModel),
      message(Message.ChangedChannelState({ channelState: DXLinkChannelState.REQUESTED })),
      model((next) => {
        expect(next.lifecycle).toEqual({ ...opened, channelState: DXLinkChannelState.REQUESTED })
        expect(summarize(next).maybeStatus).toEqual(
          Option.some({ label: 'opening', tone: 'Warning' })
        )
      })
    )
  })

  test('a number that is not finite is not a Message', () => {
    expect(
      Schema.is(Message)({
        _tag: 'ReceivedSnapshot',
        snapshot: { time: Number.NaN, bids: [], asks: [] },
      })
    ).toBe(false)
  })

  test('errors are logged newest first and can be cleared', () => {
    story(
      update,
      given(openedModel),
      message(
        Message.ReportedChannelError({
          error: { type: 'BAD_ACTION', message: 'first', time: '10:00' },
        })
      ),
      message(
        Message.ReportedChannelError({
          error: { type: 'TIMEOUT', message: 'second', time: '10:01' },
        })
      ),
      model((next) => {
        expect(next.errorLog.errors.map((error) => error.message)).toEqual(['second', 'first'])
        expect(clearErrors(next).errorLog.errors).toEqual([])
      })
    )
  })

  test('applying sends what was typed; blanks ask for the server default', () => {
    story(
      update,
      given(openedModel),
      message(Message.UpdatedAcceptAggregationPeriod({ value: '0' })),
      message(Message.UpdatedAcceptOrderFields({ value: 'price size, time' })),
      message(Message.ClickedApplyConfiguration()),
      Command.expectExact(
        ConfigureDomChannel({
          channelId: '7',
          maybeAggregationPeriod: Option.some(0),
          maybeDepthLimit: Option.none(),
          maybeOrderFields: Option.some(['price', 'size', 'time']),
        })
      ),
      Command.resolve(ConfigureDomChannel, Message.SucceededConfigureDomChannel()),
      model((next) => {
        expect(next.errorLog.errors).toEqual([])
      })
    )
  })

  test('blank order fields are left to the server', () => {
    story(
      update,
      given(openedModel),
      message(Message.UpdatedAcceptOrderFields({ value: '  ' })),
      message(Message.ClickedApplyConfiguration()),
      Command.expectExact(
        ConfigureDomChannel({
          channelId: '7',
          maybeAggregationPeriod: Option.none(),
          maybeDepthLimit: Option.none(),
          maybeOrderFields: Option.none(),
        })
      ),
      Command.resolve(ConfigureDomChannel, Message.SucceededConfigureDomChannel())
    )
  })

  test('a configuration that could not be sent is logged and leaves the channel opened', () => {
    story(
      update,
      given(openedModel),
      message(Message.ClickedApplyConfiguration()),
      Command.resolve(ConfigureDomChannel, Message.FailedConfigureDomChannel({ error: failure })),
      model((next) => {
        expect(next.lifecycle).toEqual(opened)
        expect(next.errorLog.errors).toEqual([{ id: 1, ...failure }])
      })
    )
  })

  test('the server answer replaces the applied configuration', () => {
    const answered = { ...applied, maybeDepthLimit: Option.some(5) }

    story(
      update,
      given(openedModel),
      message(Message.ChangedAppliedConfig({ applied: answered })),
      model((next) => {
        expect(next.lifecycle).toEqual({ ...opened, applied: answered })
      })
    )
  })

  test('closing leaves a closed record', () => {
    const closed = close(openedModel)

    expect(closed.lifecycle).toEqual(Lifecycle.Closed({ maybeProtocolChannelId: Option.some(3) }))
    expect(summarize(closed)).toEqual({
      subtitle: 'DOM · AAPL',
      maybeStatus: Option.some({ label: 'closed', tone: 'Neutral' }),
      maybeChannelId: Option.some(3),
      parameters: {},
      errors: [],
    })
  })

  test('a channel closed before it opened has no protocol id', () => {
    expect(close(channelInit.model).lifecycle).toEqual(
      Lifecycle.Closed({ maybeProtocolChannelId: Option.none() })
    )
  })

  test('closing a closed channel keeps its record', () => {
    expect(close(closedModel)).toEqual(closedModel)
  })

  test('the Configuration section opens and collapses, keeping the form', () => {
    story(
      update,
      given(openedModel),
      message(Message.UpdatedAcceptDepthLimit({ value: '5' })),
      message(Message.ToggledConfiguration({ isOpen: true })),
      model((next) => {
        expect(next.lifecycle).toEqual({
          ...opened,
          acceptForm: { ...opened.acceptForm, depthLimit: '5' },
          isConfigurationOpen: true,
        })
      }),
      message(Message.ToggledConfiguration({ isOpen: false })),
      model((next) => {
        expect(next.lifecycle).toEqual({
          ...opened,
          acceptForm: { ...opened.acceptForm, depthLimit: '5' },
        })
      })
    )
  })

  test('a late event does not move a closed channel back to opened', () => {
    story(
      update,
      given(closedModel),
      message(Message.ChangedChannelState({ channelState: DXLinkChannelState.OPENED })),
      message(Message.ReceivedSnapshot({ snapshot })),
      message(Message.ChangedAppliedConfig({ applied })),
      message(Message.ToggledConfiguration({ isOpen: true })),
      message(Message.UpdatedAcceptDepthLimit({ value: '5' })),
      message(Message.ClickedApplyConfiguration()),
      Command.expectNone(),
      model((next) => {
        expect(next).toEqual(closedModel)
      })
    )
  })

  test('an open result that arrives after the card was closed leaves the record closed', () => {
    story(
      update,
      given(close(channelInit.model)),
      message(succeededOpen),
      Command.expectNone(),
      model((next) => {
        expect(next.lifecycle).toEqual(Lifecycle.Closed({ maybeProtocolChannelId: Option.none() }))
      })
    )
  })

  test('an open that fails after the card was closed is logged and stays closed', () => {
    story(
      update,
      given(close(channelInit.model)),
      message(Message.FailedOpenDomChannel({ error: failure })),
      model((next) => {
        expect(next.lifecycle).toEqual(Lifecycle.Closed({ maybeProtocolChannelId: Option.none() }))
        expect(next.errorLog.errors).toEqual([{ id: 1, ...failure }])
      })
    )
  })
})
