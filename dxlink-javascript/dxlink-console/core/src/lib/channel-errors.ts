import type { DXLinkChannel, DXLinkError } from '@dxfeed/dxlink-api'
import type { StoreApi } from 'zustand'

import { prependError } from './timestamped-error'
import type { TimestampedError } from './timestamped-error'

/**
 * The slice of a channel ViewModel's state that describes its channel and what went
 * wrong on it. Every channel VM's state extends this.
 *
 * `channelParameters` is optional: INDICHART's parameters carry the full source of every
 * indicator, so that VM omits the field rather than retaining a third copy of them.
 */
export interface ChannelErrorState {
  /** Protocol channel id, for correlating with a protocol log. Null until opened. */
  channelId: number | null
  /** Errors scoped to THIS channel — connection errors live on the connection VM. */
  errors: TimestampedError[]
  /** Parameters this channel was actually opened with. Null until opened. */
  channelParameters?: Readonly<Record<string, unknown>> | null
}

/** Initial values for the slice, for a VM's store initializer. */
export const initialChannelErrorState = (): Required<ChannelErrorState> => ({
  channelId: null,
  channelParameters: null,
  errors: [],
})

/**
 * Tracks one channel's identity and errors on behalf of a ViewModel.
 *
 * Every channel VM needs the same three things — register an error listener, record the
 * channel id and parameters on open, and expose a clear command. Keeping it here means
 * one place to change, instead of four copies that drift.
 *
 * The `Partial<S>` casts are needed because TypeScript cannot prove a literal is a
 * partial of the generic `S`; the constraint on `S` guarantees the keys exist.
 */
export class ChannelErrorTracker<S extends ChannelErrorState> {
  constructor(private readonly store: StoreApi<S>) {}

  /**
   * Start collecting errors from a freshly opened channel and record its identity.
   *
   * `withParameters: false` skips recording the parameters, for services whose
   * parameters are large and already available elsewhere (INDICHART).
   */
  attach = (channel: DXLinkChannel, { withParameters = true } = {}): void => {
    channel.addErrorListener(this.handleError)
    this.store.setState({
      channelId: channel.id,
      ...(withParameters ? { channelParameters: channel.parameters } : {}),
    } as Partial<S>)
  }

  /** Stop collecting. Errors already recorded are kept — they are a log. */
  detach = (channel: DXLinkChannel): void => {
    channel.removeErrorListener(this.handleError)
  }

  clear = (): void => {
    const errors: TimestampedError[] = []
    this.store.setState({ errors } as Partial<S>)
  }

  private handleError = (error: DXLinkError): void => {
    this.store.setState((state) => ({ errors: prependError(state.errors, error) }) as Partial<S>)
  }
}
