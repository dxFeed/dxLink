import { click, expect, given, label, role, scene, type } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { init, update } from './update'
import { view } from './view'

describe('request view', () => {
  test('chooses the view to open and takes the optional feed parameters', () => {
    scene(
      { update, view },
      given(init().model),
      expect(role('radio', { name: 'Subscriptions', checked: true })).toExist(),
      click(role('radio', { name: 'Candle chart' })),
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
})
