import { describe, expect, test } from 'vitest'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'

import { coalesceSnapshots } from './events'
import { DomEvent } from './handles'

const snapshot = (channelId: string, time: number) => ({
  channelId,
  message: DomEvent.Snapshot({ snapshot: { time, bids: [], asks: [] } }),
})

describe('coalesceSnapshots', () => {
  test('keeps only the latest snapshot of each channel', () => {
    expect(
      coalesceSnapshots([
        snapshot('1', 10),
        snapshot('2', 11),
        snapshot('1', 12),
        snapshot('1', 13),
      ])
    ).toEqual([snapshot('2', 11), snapshot('1', 13)])
  })

  test('everything that is not a snapshot keeps its place', () => {
    const opened = {
      channelId: '1',
      message: DomEvent.ChangedState({
        channelState: DXLinkChannelState.OPENED,
      }),
    }
    const failed = {
      channelId: '1',
      message: DomEvent.Failed({ type: 'BAD_ACTION', message: 'no' }),
    }

    expect(coalesceSnapshots([opened, snapshot('1', 10), failed, snapshot('1', 11)])).toEqual([
      opened,
      failed,
      snapshot('1', 11),
    ])
  })
})
