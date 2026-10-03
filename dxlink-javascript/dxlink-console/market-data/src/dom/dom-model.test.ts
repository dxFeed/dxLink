import type { DepthOfMarketOrder, DXLinkClient } from '@dxfeed/dxlink-api'
import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeDomModel } from './dom-model'
import type { DomModel } from './dom-model'
import type { FakeDom as FakeDomType } from '../test/fake-dxlink'

const { FakeDom } = await vi.hoisted(async () => import('../test/fake-dxlink'))

vi.mock('@dxfeed/dxlink-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dxfeed/dxlink-api')>()),
  DXLinkDepthOfMarket: (await import('../test/fake-dxlink')).FakeDom,
}))

const level = (price: number, size: number) => ({ price, size }) as DepthOfMarketOrder

let registry: AtomRegistry.AtomRegistry
let release: () => void
let model: DomModel

const openDom = (): FakeDomType => {
  release = registry.mount(model.session.atom)
  const dom = FakeDom.instances[FakeDom.instances.length - 1]
  if (dom === undefined) throw new Error('no DOM opened')
  return dom
}

beforeEach(() => {
  FakeDom.instances.length = 0
  registry = AtomRegistry.make()
  model = makeDomModel({} as DXLinkClient, { symbol: 'AAPL', sources: ['NTV'] })
  release = () => undefined
})

afterEach(() => {
  release()
  registry.dispose()
})

describe('DOM model session', () => {
  it('starts from the configuration the channel opened with, and follows changes', () => {
    const dom = openDom()

    expect(registry.get(model.config)).toBe(dom.config)
    expect(registry.get(model.channel.parameters)).toEqual({ symbol: 'AAPL', sources: ['NTV'] })

    const next = { ...dom.config, depthLimit: 5 }
    dom.configListeners.emit(next)
    expect(registry.get(model.config)).toBe(next)

    registry.set(model.configure, { acceptDepthLimit: 5 })
    expect(dom.accepted).toEqual([{ acceptDepthLimit: 5 }])
  })

  it('keeps only the latest snapshot of each flush', async () => {
    const dom = openDom()

    dom.snapshotListeners.emit(1, [level(10, 1)], [level(11, 1)])
    dom.snapshotListeners.emit(2, [level(10, 2)], [level(11, 2)])
    expect(registry.get(model.snapshot)).toBeNull()

    await vi.waitFor(() =>
      expect(registry.get(model.snapshot)).toEqual({
        time: 2,
        bids: [level(10, 2)],
        asks: [level(11, 2)],
      })
    )
  })

  it('closes the channel when the user does', () => {
    const dom = openDom()

    registry.set(model.channel.close, undefined)

    expect(dom.closed).toBe(true)
    expect(dom.snapshotListeners.set.size + dom.configListeners.set.size).toBe(0)
  })
})
