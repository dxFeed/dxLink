import type { ChannelKind } from '../../shared/lib/channel-kinds'

/**
 * One open channel.
 *
 * `config` is opaque. It was produced by the plugin named by `kind` and is only ever handed
 * back to that same plugin, so the channels area never needs to know what is in it — which
 * is what keeps the four services' types (and their dependencies) out of this feature.
 */
export interface DraftChannel {
  id: string
  kind: ChannelKind
  config: unknown
}
