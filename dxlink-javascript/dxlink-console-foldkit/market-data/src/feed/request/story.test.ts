import { Option } from 'effect'
import { given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { Message } from './message'
import { init, toConfig, update } from './update'

describe('request', () => {
  test('starts on the subscriptions view and trims feed parameters into the config', () => {
    story(
      update,
      given(init().model),
      message(Message.SelectedView({ view: 'Chart' })),
      message(Message.UpdatedFeed({ value: ' delayed ' })),
      model((request) => {
        expect(toConfig(request)).toEqual(
          Option.some({ view: 'Chart', feed: 'delayed', space: '' })
        )
      })
    )
  })

  test('the feed section starts collapsed and follows its toggle', () => {
    story(
      update,
      given(init().model),
      model((request) => {
        expect(request.isFeedSectionOpen).toBe(false)
      }),
      message(Message.ToggledFeedSection({ isOpen: true })),
      model((request) => {
        expect(request.isFeedSectionOpen).toBe(true)
      })
    )
  })
})
