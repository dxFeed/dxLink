import { DXLinkDepthOfMarket, DXLinkLogLevel } from '@dxfeed/dxlink-api'
import type {
  DepthOfMarketAcceptConfig,
  DepthOfMarketConfig,
  DepthOfMarketOrder,
  DXLinkClient,
} from '@dxfeed/dxlink-api'
import { channelSession, command, makeChannelAtoms, on, onBatch } from '@dxfeed/dxlink-console-core'
import type { ChannelAtoms, Session } from '@dxfeed/dxlink-console-core'
import { Effect } from 'effect'
import * as Atom from 'effect/reactivity/Atom'

export interface DomSnapshot {
  time: number
  bids: DepthOfMarketOrder[]
  asks: DepthOfMarketOrder[]
}

/** One DOM (Depth of Market) channel — wraps {@link DXLinkDepthOfMarket}. */
export interface DomModel {
  readonly channel: ChannelAtoms
  readonly session: Session<DXLinkDepthOfMarket | null>
  readonly config: Atom.Atom<DepthOfMarketConfig | null>
  readonly snapshot: Atom.Atom<DomSnapshot | null>
  readonly configure: Atom.Writable<void, DepthOfMarketAcceptConfig>
}

/**
 * The model for one DOM channel. Snapshots are full replacements, so a flush window keeps only
 * the latest one.
 */
export const makeDomModel = (
  client: DXLinkClient,
  params: { symbol: string; sources: string[]; feed?: string; space?: string }
): DomModel => {
  const channel = makeChannelAtoms()
  const config = Atom.make<DepthOfMarketConfig | null>(null)
  const snapshot = Atom.make<DomSnapshot | null>(null)

  const domSession = channelSession(channel, {
    state: [config, snapshot],
    open: () =>
      new DXLinkDepthOfMarket(
        client,
        { symbol: params.symbol, sources: params.sources },
        {
          feed: params.feed,
          space: params.space,
          // A debug console wants the protocol traffic in the browser log.
          logLevel: DXLinkLogLevel.DEBUG,
        }
      ),
    close: (dom) => dom.close(),
    channel: (dom) => dom.getChannel(),
    wire: (dom, registry) =>
      Effect.gen(function* () {
        registry.set(config, dom.getConfig())
        yield* on(dom, 'ConfigChange', (next) => registry.set(config, next))

        yield* onBatch(
          dom,
          'Snapshot',
          (batch) => {
            const latest = batch[batch.length - 1]
            if (latest === undefined) return Effect.void
            const [time, bids, asks] = latest

            return Atom.set(snapshot, { time, bids, asks })
          },
          // Each snapshot replaces the last, so a window holds only the newest.
          { latest: true }
        )
      }),
  })

  return {
    channel,
    session: domSession,
    config,
    snapshot,
    configure: command((_ctx, accept: DepthOfMarketAcceptConfig) => {
      domSession.current()?.configure(accept)
    }),
  }
}
