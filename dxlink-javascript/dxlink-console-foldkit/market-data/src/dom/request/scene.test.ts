import { click, expect, given, label, role, scene, type } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { init, update } from './update'
import { view } from './view'

const request = { update, view }

describe('request', () => {
  test('the form starts at AAPL on the AGGREGATE source, with the feed left to the server', () => {
    scene(
      request,
      given(init().model),
      expect(label('Symbol *')).toHaveValue('AAPL'),
      expect(label('Sources')).toHaveValue('AGGREGATE'),
      expect(role('link', { name: 'kb.dxfeed.com' })).toExist(),
      expect(role('button', { name: 'Feed' })).toHaveAttr('aria-expanded', 'false'),
      click(role('button', { name: 'Feed' })),
      expect(role('button', { name: 'Feed' })).toHaveAttr('aria-expanded', 'true'),
      expect(label('Feed qualification')).toHaveValue(''),
      expect(label('Feed space')).toHaveValue('')
    )
  })

  test('every field takes what is typed, a blank symbol included', () => {
    scene(
      request,
      given(init().model),
      type(label('Symbol *'), ''),
      type(label('Sources'), 'ntv, glbx'),
      click(role('button', { name: 'Feed' })),
      type(label('Feed qualification'), 'delayed'),
      type(label('Feed space'), 'us'),
      expect(label('Symbol *')).toHaveValue(''),
      expect(label('Symbol *')).toBeEnabled(),
      expect(label('Sources')).toHaveValue('ntv, glbx'),
      expect(label('Feed qualification')).toHaveValue('delayed'),
      expect(label('Feed space')).toHaveValue('us')
    )
  })

  test('collapsing the Feed section keeps what was typed in it', () => {
    scene(
      request,
      given(init().model),
      click(role('button', { name: 'Feed' })),
      type(label('Feed qualification'), 'delayed'),
      click(role('button', { name: 'Feed' })),
      expect(role('button', { name: 'Feed' })).toHaveAttr('aria-expanded', 'false'),
      click(role('button', { name: 'Feed' })),
      expect(label('Feed qualification')).toHaveValue('delayed')
    )
  })
})
