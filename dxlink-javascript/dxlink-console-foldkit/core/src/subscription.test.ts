import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, test } from 'vitest'

import type { RegisteredChannelPlugin } from './channel/plugin'
import { emptyErrorLog } from './domain/error'
import { echoPlugin } from './echoPlugin.fixture'
import { type OpenChannel, streamChannels } from './subscription'

const channel = (id: string): OpenChannel => ({
  id,
  kind: 'echo',
  model: { channelId: id, text: id, isClosed: false, errorLog: emptyErrorLog() },
})

/** The echo plugin with a live side that records when it is connected and released. */
const recordingPlugin = (log: Array<string>): RegisteredChannelPlugin => ({
  ...echoPlugin,
  connect: (model, emit) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const id = echoPlugin
          .summarize(model)
          .pipe((summary) => (summary._tag === 'Some' ? summary.value.subtitle : '?'))
        log.push(`open ${id}`)
        emit({ _tag: 'UpdatedText', value: `hello from ${id}` })

        return id
      }),
      (id) => Effect.sync(() => log.push(`close ${id}`))
    ),
})

const settle = Effect.sleep('120 millis')

describe('streamChannels', () => {
  test('connects open cards, releases closed ones, and releases the rest with the session', async () => {
    const log: Array<string> = []
    const wanted = { channels: [channel('1')] }
    const messages: Array<unknown> = []

    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Stream.runForEach(
            streamChannels([recordingPlugin(log)], () => wanted.channels),
            (message) => Effect.sync(() => messages.push(message))
          )
        )

        yield* settle
        expect(log).toEqual(['open 1'])

        wanted.channels = [channel('1'), channel('2')]
        yield* settle
        expect(log).toEqual(['open 1', 'open 2'])

        wanted.channels = [channel('2')]
        yield* settle
        expect(log).toEqual(['open 1', 'open 2', 'close 1'])

        yield* Fiber.interrupt(fiber)
        expect(log).toEqual(['open 1', 'open 2', 'close 1', 'close 2'])
      })
    )

    expect(messages).toEqual([
      {
        _tag: 'GotChannelMessage',
        channelId: '1',
        message: { _tag: 'UpdatedText', value: 'hello from 1' },
      },
      {
        _tag: 'GotChannelMessage',
        channelId: '2',
        message: { _tag: 'UpdatedText', value: 'hello from 2' },
      },
    ])
  })

  test('a card of a kind no plugin provides is left unconnected', async () => {
    const log: Array<string> = []

    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Stream.runDrain(
            streamChannels([recordingPlugin(log)], () => [{ ...channel('1'), kind: 'other' }])
          )
        )
        yield* settle
        yield* Fiber.interrupt(fiber)
      })
    )

    expect(log).toEqual([])
  })
})
