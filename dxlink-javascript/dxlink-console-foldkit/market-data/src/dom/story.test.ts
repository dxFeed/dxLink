import { Option, Schema } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import type { RegisteredChannelPlugin } from '@dxfeed/dxlink-console-foldkit-core'

import * as Channel from './channel'
import { CloseDomChannel, ConfigureDomChannel, OpenDomChannel } from './command'
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

const openedModel = Channel.update(
  channelInit.model,
  Message.SucceededOpenDomChannel({
    protocolChannelId: 3,
    parameters: { symbol: 'AAPL', sources: 'ntv, glbx' },
    channelState: DXLinkChannelState.OPENED,
    applied,
  })
).model

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
    expect(channelInit.model.channelState).toBe(DXLinkChannelState.REQUESTED)
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

  test('an opened channel reports its protocol id, parameters and status', () => {
    expect(Channel.summarize(openedModel)).toEqual({
      subtitle: 'DOM · AAPL',
      maybeStatus: Option.some({ label: 'streaming', tone: 'Success' }),
      maybeChannelId: Option.some(3),
      parameters: { symbol: 'AAPL', sources: 'ntv, glbx' },
      errors: [],
    })
  })

  test('a channel that failed to open is closed and says why', () => {
    story(
      Channel.update,
      given(channelInit.model),
      message(
        Message.FailedOpenDomChannel({
          error: { type: 'UNKNOWN', message: 'no connection', time: '10:00' },
        })
      ),
      model((next) => {
        expect(next.channelState).toBe(DXLinkChannelState.CLOSED)
        expect(next.errorLog.errors).toEqual([
          { id: 1, type: 'UNKNOWN', message: 'no connection', time: '10:00' },
        ])
      })
    )
  })

  test('a snapshot replaces the book', () => {
    story(
      Channel.update,
      given(openedModel),
      message(
        Message.ReceivedSnapshot({
          snapshot: { time: 1, bids: [{ price: 1, size: 1 }], asks: [] },
        })
      ),
      message(
        Message.ReceivedSnapshot({
          snapshot: { time: 2, bids: [], asks: [{ price: 2, size: 2 }] },
        })
      ),
      model((next) => {
        expect(next.maybeSnapshot).toEqual(
          Option.some({ time: 2, bids: [], asks: [{ price: 2, size: 2 }] })
        )
      })
    )
  })

  test('a snapshot with a size that is not a number is still a Message', () => {
    expect(
      Schema.is(Message)(
        Message.ReceivedSnapshot({
          snapshot: {
            time: 1,
            bids: [{ price: 1, size: Number.NaN }],
            asks: [],
          },
        })
      )
    ).toBe(true)
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
      Command.resolve(ConfigureDomChannel, Message.CompletedConfigureDomChannel())
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
      Command.resolve(ConfigureDomChannel, Message.CompletedConfigureDomChannel())
    )
  })

  test('the server answer replaces the applied configuration', () => {
    story(
      Channel.update,
      given(openedModel),
      message(
        Message.ChangedAppliedConfig({
          applied: { ...applied, maybeDepthLimit: Option.some(5) },
        })
      ),
      model((next) => {
        expect(next.maybeApplied).toEqual(
          Option.some({ ...applied, maybeDepthLimit: Option.some(5) })
        )
      })
    )
  })

  test('closing releases the live channel and keeps the record', () => {
    const channelClose = Channel.close(openedModel)

    expect(channelClose.model).toEqual(openedModel)
    expect(channelClose.commands).toEqual([
      expect.objectContaining({
        name: CloseDomChannel.name,
        args: { channelId: '7' },
      }),
    ])
  })
})
