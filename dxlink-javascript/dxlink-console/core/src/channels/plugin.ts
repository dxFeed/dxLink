import type { ComponentType, ReactNode } from 'react'

/**
 * One channel service, as the channels area sees it.
 *
 * The area knows nothing about FEED, DOM, INDICHART or RPC: it renders an add-button per
 * registered plugin, holds one request value per plugin, and asks the plugin to turn that
 * request into a channel config and then to render the channel. Everything that used to be
 * a four-way switch is a lookup on this descriptor.
 *
 * Plugins reach the connection the same way the channel components always have —
 * `useConnectionVM()` for the view model, `useVM` to read its state. Those two are the
 * whole host API; there is no plugin-specific context.
 */
export interface ChannelPlugin<Config, Request> {
  /**
   * Stable identifier for this service, unique among the registered plugins.
   *
   * Any string: core deliberately holds no list of known kinds, so a host can register a
   * service this package has never heard of. Whoever reads a configured kind name is the one
   * who validates it, against the plugins actually registered.
   */
  kind: string
  /** Add-button label; also the channel title and the error-boundary name. */
  label: string
  icon: ReactNode
  dialogTitle: string
  /** Widened for forms that need the room — the RPC form carries three panes. */
  dialogMaxWidth?: 'sm' | 'md'
  /**
   * The value the request form starts from.
   *
   * Called once per plugin when the area mounts, never again: request values are kept
   * between dialog opens so several similar channels are quick to create.
   */
  createRequest: () => Request
  RequestForm: ComponentType<{ value: Request; onChange: (next: Request) => void }>
  /** Whether "Open channel" is enabled. Omitted means always. */
  canOpen?: (request: Request) => boolean
  /**
   * The config to open a channel with, or null when this request cannot produce one.
   *
   * Only RPC can fail here: its service, method and message are resolved out of a
   * descriptor set, and a stale selection must not open a broken channel.
   */
  buildConfig: (request: Request) => Config | null
  Channel: ComponentType<{ title: string; config: Config }>
}

/**
 * A plugin with its `Request` and `Config` types erased, as the registry stores them.
 *
 * The erasure is sound because of one invariant the area upholds: a plugin is only ever
 * handed values that came from that same plugin. A request starts at its own
 * `createRequest()` and is only ever replaced by its own `RequestForm`; a config comes from
 * its own `buildConfig()` and goes to its own `Channel`. Neither type crosses a plugin
 * boundary, so the area can treat both as `unknown` without ever being wrong.
 *
 * The cost is that the area cannot type-check the pairing — that is what
 * {@link defineChannelPlugin} is for, and it is the trade a registry makes in exchange for
 * not naming its plugins.
 */
export type ErasedChannelPlugin = ChannelPlugin<unknown, unknown>

/**
 * Declare a channel plugin.
 *
 * Type-checks the descriptor against its own `Config` and `Request` — the form, the
 * builder and the channel component all have to agree — and then erases them for the
 * registry. This is the only place the erasure happens.
 */
export const defineChannelPlugin = <Config, Request>(
  plugin: ChannelPlugin<Config, Request>
): ErasedChannelPlugin => plugin as unknown as ErasedChannelPlugin
