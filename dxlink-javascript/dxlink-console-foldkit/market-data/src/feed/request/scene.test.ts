import { Command, click, expect, given, keydown, label, role, scene, type } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { RadioGroup } from '@foldkit/ui'

import { init, update } from './update'
import { view } from './view'

const resolveFocusOption = Command.resolve(
  RadioGroup.FocusOption,
  RadioGroup.Message.CompletedFocusOption()
)

describe('request view', () => {
  test('chooses the view to open and takes the optional feed parameters', () => {
    scene(
      { update, view },
      given(init().model),
      expect(role('radio', { name: 'Subscriptions', checked: true })).toExist(),
      click(role('radio', { name: 'Candle chart' })),
      resolveFocusOption,
      expect(role('radio', { name: 'Candle chart', checked: true })).toExist(),
      expect(role('radio', { name: 'Subscriptions', checked: false })).toExist(),
      expect(role('button', { name: 'Feed', expanded: false })).toExist(),
      click(role('button', { name: 'Feed' })),
      expect(role('button', { name: 'Feed', expanded: true })).toExist(),
      type(label('Feed qualification'), 'delayed'),
      expect(label('Feed qualification')).toHaveValue('delayed'),
      type(label('Feed space'), 'us'),
      expect(label('Feed space')).toHaveValue('us')
    )
  })

  test('the arrow keys move the choice of view along the options', () => {
    scene(
      { update, view },
      given(init().model),
      keydown(role('radio', { name: 'Subscriptions' }), 'ArrowRight'),
      Command.expectExact(RadioGroup.FocusOption({ id: 'feed-request-view', index: 1 })),
      resolveFocusOption,
      expect(role('radio', { name: 'Candle chart', checked: true })).toExist(),
      keydown(role('radio', { name: 'Candle chart' }), 'ArrowLeft'),
      resolveFocusOption,
      expect(role('radio', { name: 'Subscriptions', checked: true })).toExist()
    )
  })
})
