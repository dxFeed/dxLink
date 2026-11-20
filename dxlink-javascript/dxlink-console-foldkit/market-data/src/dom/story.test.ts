import { Option, Schema } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import type { RegisteredChannelPlugin } from '@dxfeed/dxlink-console-foldkit-core'

import * as Channel from './channel'
import { CloseDomChannel, ConfigureDomChannel, OpenDomChannel, toOrders } from './command'
import type { AppliedConfig, DomServices } from './handles'
import { Message } from './message'
import { domChannelPlugin } from './plugin'
import * as Request from './request'

const config = { symbol: 'AAPL', source: 'ntv, glbx', feed: '', space: '' }

const applied: AppliedConfig = {
  maybeAggregationPeriod: Option.some(1),
  maybeDepthLimit: Option.some(10),
  dataFormat: 'FULL',
  orderFields: ['price', 'size'],
}

const channelInit = Channel.init({ channelId: '7', config })

const succeededOpen = Message.SucceededOpenDomChannel({
  protocolChannelId: 3,
  parameters: { symbol: 'AAPL', sources: 'ntv, glbx' },
  channelState: DXLinkChannelState.OPENED,
  applied,
})

const opened = Channel.Lifecycle.Opened({
  protocolChannelId: 3,
  parameters: { symbol: 'AAPL', sources: 'ntv, glbx' },
  channelState: DXLinkChannelState.OPENED,
  applied,
  maybeSnapshot: Option.none(),
  acceptForm: { aggregationPeriod: '', depthLimit: '', orderFields: 'price, size' },
})

const openedModel = Channel.update(channelInit.model, succeededOpen).model

const closedModel = Channel.close(openedModel).model

const snapshot = { time: 2, bids: [], asks: [{ price: 2, maybeSize: Option.some(2) }] }

const failure = { type: 'UNKNOWN', message: 'boom', time: '10:00' }

describe('plugin', () => {
  test('registers as the DOM service', () => {
    const plugin: RegisteredChannelPlugin<DomServices> = domChannelPlugin

    expect(plugin.kind).toBe('dom')
    expect(plugin.label).toBe('DOM')
    expect(plugin.dialogTitle).toBe('New DOM channel')
    expect(plugin.dialogWidth).toBe('Narrow')
  })

  test('a fresh request can open a channel', () => {
    expect(domChannelPlugin.canOpen(domChannelPlugin.initRequest().model)).toBe(true)
  })

  test('a value of another shape is not taken for a request', () => {
    expect(domChannelPlugin.canOpen({ symbol: 'AAPL' })).toBe(false)
  })
})

describe('request', () => {
  const initial = Request.init().model

  test('starts at AAPL on the AGGREGATE source', () => {
    expect(initial).toEqual({
      _tag: 'DomRequest',
      symbol: 'AAPL',
      source: 'AGGREGATE',
      feed: '',
      space: '',
    })
  })

  test('the config is the trimmed form', () => {
    story(
      Request.update,
      given(initial),
      message(Request.Message.UpdatedSymbol({ value: ' MSFT ' })),
      message(Request.Message.UpdatedSource({ value: ' ntv ' })),
      message(Request.Message.UpdatedFeed({ value: ' feed ' })),
      message(Request.Message.UpdatedSpace({ value: ' space ' })),
      model((next) => {
        expect(Request.toConfig(next)).toEqual(
          Option.some({
            symbol: 'MSFT',
            source: 'ntv',
            feed: 'feed',
            space: 'space',
          })
        )
      })
    )
  })

  test('a blank symbol cannot open a channel', () => {
    story(
      Request.update,
      given(initial),
      message(Request.Message.UpdatedSymbol({ value: '   ' })),
      model((next) => {
        expect(Request.toConfig(next)).toEqual(Option.none())
      })
    )
  })
})

describe('channel', () => {
  test('opening asks for the parsed source list', () => {
    expect(channelInit.model.lifecycle).toEqual(Channel.Lifecycle.Opening())
    expect(channelInit.commands).toEqual([
      expect.objectContaining({
        name: OpenDomChannel.name,
        args: {
          channelId: '7',
          symbol: 'AAPL',
          sources: ['ntv', 'glbx'],
          feed: '',
          space: '',
        },
      }),
    ])
  })

  test('an opening channel reports that it is opening', () => {
    expect(Channel.summarize(channelInit.model)).toEqual({
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
    expect(Channel.summarize(openedModel)).toEqual({
      subtitle: 'DOM · AAPL',
      maybeStatus: Option.some({ label: 'streaming', tone: 'Success' }),
      maybeChannelId: Option.some(3),
      parameters: { symbol: 'AAPL', sources: 'ntv, glbx' },
      errors: [],
    })
  })

  test('a channel that failed to open says so and says why', () => {
    story(
      Channel.update,
      given(channelInit.model),
      message(
        Message.FailedOpenDomChannel({
          error: { type: 'UNKNOWN', message: 'no connection', time: '10:00' },
        })
      ),
      model((next) => {
        expect(next.lifecycle).toEqual(Channel.Lifecycle.FailedToOpen())
        expect(next.errorLog.errors).toEqual([
          { id: 1, type: 'UNKNOWN', message: 'no connection', time: '10:00' },
        ])
        expect(Channel.summarize(next).maybeStatus).toEqual(
          Option.some({ label: 'failed', tone: 'Danger' })
        )
        expect(Channel.summarize(next).maybeChannelId).toEqual(Option.none())
      })
    )
  })

  test('a channel that failed to open takes no configuration and no events', () => {
    story(
      Channel.update,
      given(channelInit.model),
      message(Message.FailedOpenDomChannel({ error: failure })),
      message(Message.UpdatedAcceptDepthLimit({ value: '5' })),
      message(Message.ReceivedSnapshot({ snapshot })),
      message(Message.ClickedApplyConfiguration()),
      Command.expectNone(),
      model((next) => {
        expect(next.lifecycle).toEqual(Channel.Lifecycle.FailedToOpen())
      })
    )
  })

  test('a snapshot replaces the book', () => {
    story(
      Channel.update,
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
      Channel.update,
      given(openedModel),
      message(Message.ChangedChannelState({ channelState: DXLinkChannelState.REQUESTED })),
      model((next) => {
        expect(next.lifecycle).toEqual({ ...opened, channelState: DXLinkChannelState.REQUESTED })
        expect(Channel.summarize(next).maybeStatus).toEqual(
          Option.some({ label: 'opening', tone: 'Warning' })
        )
      })
    )
  })

  test('a level without a finite price is left out, and one without a size keeps its place', () => {
    expect(
      toOrders([
        { price: Number.NaN, size: 1 },
        { price: 1, size: Number.NaN },
        { price: 2, size: 3 },
      ])
    ).toEqual([
      { price: 1, maybeSize: Option.none() },
      { price: 2, maybeSize: Option.some(3) },
    ])
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
      Channel.update,
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
        expect(Channel.clearErrors(next).errorLog.errors).toEqual([])
      })
    )
  })

  test('applying sends what was typed; blanks ask for the server default', () => {
    story(
      Channel.update,
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
      Channel.update,
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
      Channel.update,
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
      Channel.update,
      given(openedModel),
      message(Message.ChangedAppliedConfig({ applied: answered })),
      model((next) => {
        expect(next.lifecycle).toEqual({ ...opened, applied: answered })
      })
    )
  })

  test('closing releases the live channel and leaves a closed record', () => {
    const channelClose = Channel.close(openedModel)

    expect(channelClose.model.lifecycle).toEqual(
      Channel.Lifecycle.Closed({ maybeProtocolChannelId: Option.some(3) })
    )
    expect(channelClose.commands).toEqual([
      expect.objectContaining({
        name: CloseDomChannel.name,
        args: { channelId: '7' },
      }),
    ])
    expect(Channel.summarize(channelClose.model)).toEqual({
      subtitle: 'DOM · AAPL',
      maybeStatus: Option.some({ label: 'closed', tone: 'Neutral' }),
      maybeChannelId: Option.some(3),
      parameters: {},
      errors: [],
    })
  })

  test('a channel closed before it opened has no protocol id', () => {
    expect(Channel.close(channelInit.model).model.lifecycle).toEqual(
      Channel.Lifecycle.Closed({ maybeProtocolChannelId: Option.none() })
    )
  })

  test('a late event does not move a closed channel back to opened', () => {
    story(
      Channel.update,
      given(closedModel),
      message(Message.ChangedChannelState({ channelState: DXLinkChannelState.OPENED })),
      message(Message.ReceivedSnapshot({ snapshot })),
      message(Message.ChangedAppliedConfig({ applied })),
      message(Message.UpdatedAcceptDepthLimit({ value: '5' })),
      message(Message.ClickedApplyConfiguration()),
      Command.expectNone(),
      model((next) => {
        expect(next).toEqual(closedModel)
      })
    )
  })

  test('a channel that opens after its card was closed is released, not shown', () => {
    story(
      Channel.update,
      given(Channel.close(channelInit.model).model),
      message(succeededOpen),
      Command.expectExact(CloseDomChannel({ channelId: '7' })),
      Command.resolve(CloseDomChannel, Message.SucceededCloseDomChannel()),
      model((next) => {
        expect(next.lifecycle).toEqual(
          Channel.Lifecycle.Closed({ maybeProtocolChannelId: Option.none() })
        )
      })
    )
  })

  test('an open that fails after the card was closed is logged and stays closed', () => {
    story(
      Channel.update,
      given(Channel.close(channelInit.model).model),
      message(Message.FailedOpenDomChannel({ error: failure })),
      model((next) => {
        expect(next.lifecycle).toEqual(
          Channel.Lifecycle.Closed({ maybeProtocolChannelId: Option.none() })
        )
        expect(next.errorLog.errors).toEqual([{ id: 1, ...failure }])
      })
    )
  })

  test('a close that failed is logged on the closed record', () => {
    story(
      Channel.update,
      given(closedModel),
      message(Message.FailedCloseDomChannel({ error: failure })),
      model((next) => {
        expect(next.lifecycle).toEqual(closedModel.lifecycle)
        expect(next.errorLog.errors).toEqual([{ id: 1, ...failure }])
      })
    )
  })
})
