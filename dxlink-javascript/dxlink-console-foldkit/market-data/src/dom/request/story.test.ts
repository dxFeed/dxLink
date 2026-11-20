import { Option } from 'effect'
import { given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { Message } from './message'
import { init, toConfig, update } from './update'

const initial = init().model

describe('request', () => {
  test('starts at AAPL on the AGGREGATE source, with the Feed section collapsed', () => {
    expect(initial).toEqual({
      _tag: 'DomRequest',
      symbol: 'AAPL',
      source: 'AGGREGATE',
      feed: '',
      space: '',
      isFeedSectionOpen: false,
    })
  })

  test('the config is the trimmed form', () => {
    story(
      update,
      given(initial),
      message(Message.UpdatedSymbol({ value: ' MSFT ' })),
      message(Message.UpdatedSource({ value: ' ntv ' })),
      message(Message.UpdatedFeed({ value: ' feed ' })),
      message(Message.UpdatedSpace({ value: ' space ' })),
      model((next) => {
        expect(toConfig(next)).toEqual(
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
      update,
      given(initial),
      message(Message.UpdatedSymbol({ value: '   ' })),
      model((next) => {
        expect(toConfig(next)).toEqual(Option.none())
      })
    )
  })

  test('the Feed section opens and collapses without touching what was typed', () => {
    story(
      update,
      given(initial),
      message(Message.UpdatedFeed({ value: 'delayed' })),
      message(Message.ToggledFeedSection({ isOpen: true })),
      model((next) => {
        expect(next.isFeedSectionOpen).toBe(true)
        expect(next.feed).toBe('delayed')
      }),
      message(Message.ToggledFeedSection({ isOpen: false })),
      model((next) => {
        expect(next.isFeedSectionOpen).toBe(false)
        expect(next.feed).toBe('delayed')
      })
    )
  })
})
