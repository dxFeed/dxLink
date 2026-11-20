import { Option, type Stream } from 'effect'
import { Submodel, type Update } from 'foldkit'

import type { TimestampedError } from '../error'

/** How a status chip is coloured. */
export type Tone = 'Neutral' | 'Success' | 'Warning' | 'Danger'

/** The state a channel reports in its card header. */
export type ChannelStatus = Readonly<{ label: string; tone: Tone }>

/**
 * What a channel says about itself in the header of its card.
 *
 * The card belongs to the channels area, which renders every kind the same way; the channel
 * supplies only the facts, so its own view is the body alone.
 */
export type ChannelSummary = Readonly<{
  subtitle: string
  maybeStatus: Option.Option<ChannelStatus>
  /**
   * Protocol channel id, for correlating a card with a protocol log. Distinct from the card's
   * own sequential number, and absent until the channel is opened.
   */
  maybeChannelId: Option.Option<number>
  /**
   * Parameters the channel was actually opened with, as `describeChannelParameters` renders
   * them. Empty until it is opened.
   */
  parameters: Readonly<Record<string, string>>
  /** Errors scoped to this channel — connection errors stay with the connection. */
  errors: ReadonlyArray<TimestampedError>
}>

/** A Message for one open channel, as a plugin's event Stream addresses it. */
export type ChannelEvent<Message> = Readonly<{
  channelId: string
  message: Message
}>

/**
 * One channel service, as the channels area sees it.
 *
 * The area knows nothing about FEED, DOM or RPC: it renders an add-button per registered
 * plugin, holds one request per plugin, asks the plugin to turn that request into a channel,
 * and then delegates the channel's Messages and view back to it.
 *
 * A plugin is two Submodels and a Stream:
 *
 *  - `request` — the form shown in the request dialog. One instance per plugin, created when
 *    the console starts and kept between dialog opens so several similar channels are quick
 *    to create.
 *  - `channel` — one open channel. Created from the request's config, and never removed while
 *    its session lasts: a closed channel stays on screen as a record.
 *  - `events` — every Message the plugin's live channels produce on their own, each addressed
 *    to the channel it belongs to. The plugin owns the live dxLink objects behind it (see
 *    {@link makeChannelHandles}); nothing live is ever stored in a Model.
 *
 * The plugin reaches the connection through `DxLinkClient.get` inside its Commands. That and
 * this contract are the whole host API.
 */
export type ChannelPlugin<
  Request,
  RequestMessage,
  Config,
  Channel,
  ChannelMessage,
  Services = never,
> = Readonly<{
  /**
   * Stable identifier for this service, unique among the registered plugins.
   *
   * Any string: core deliberately holds no list of known kinds, so a host can register a
   * service this package has never heard of. Whoever reads a configured kind name is the one
   * who validates it, against the plugins actually registered.
   */
  kind: string
  /** Add-button label; also the channel title. */
  label: string
  /** SVG path data for a 24×24 outline icon; see `Kit.icon`. */
  iconPath: string
  dialogTitle: string
  /** Widened for forms that need the room — the RPC form carries three panes. */
  dialogWidth?: 'Narrow' | 'Wide'
  request: Readonly<{
    init: () => Update.Return<Request, RequestMessage, Services>
    update: (
      request: Request,
      message: RequestMessage
    ) => Update.Return<Request, RequestMessage, Services>
    view: Submodel.View<Request, RequestMessage>
    /**
     * The config to open a channel with, or `None` while this request cannot produce one.
     * "Open channel" is enabled exactly when this is `Some`.
     */
    toConfig: (request: Request) => Option.Option<Config>
    isModel: (value: unknown) => value is Request
    isMessage: (value: unknown) => value is RequestMessage
  }>
  channel: Readonly<{
    /** `channelId` is the card's own id — the address {@link ChannelEvent} uses. */
    init: (
      input: Readonly<{ channelId: string; config: Config }>
    ) => Update.Return<Channel, ChannelMessage, Services>
    update: (
      channel: Channel,
      message: ChannelMessage
    ) => Update.Return<Channel, ChannelMessage, Services>
    /** The body of the channel's card. The header is rendered from {@link ChannelSummary}. */
    view: Submodel.View<Channel, ChannelMessage>
    summarize: (channel: Channel) => ChannelSummary
    /**
     * Release what the channel holds. Runs once, when the user closes the card or the session
     * it belongs to ends; the Model it returns is the record that stays on screen.
     */
    close: Update.Step<Channel, ChannelMessage, Services>
    clearErrors: (channel: Channel) => Channel
    isModel: (value: unknown) => value is Channel
    isMessage: (value: unknown) => value is ChannelMessage
  }>
  events: Stream.Stream<ChannelEvent<ChannelMessage>, never, Services>
}>

/**
 * A plugin as the registry stores it: its Request, Config, Channel and Message types gone.
 *
 * Every value that crosses this boundary is `unknown`, and the plugin narrows each one with
 * its own guard before touching it. That makes the erasure checked rather than assumed: a
 * value a plugin does not recognise is left alone instead of being trusted. Config never
 * crosses at all — `open` goes from a request straight to a channel.
 */
export type RegisteredChannelPlugin<Services = never> = Readonly<{
  kind: string
  label: string
  iconPath: string
  dialogTitle: string
  dialogWidth: 'Narrow' | 'Wide'
  initRequest: () => Update.Return<unknown, unknown, Services>
  updateRequest: (request: unknown, message: unknown) => Update.Return<unknown, unknown, Services>
  requestView: Submodel.View<unknown, unknown>
  canOpen: (request: unknown) => boolean
  open: (
    request: unknown,
    channelId: string
  ) => Option.Option<Update.Return<unknown, unknown, Services>>
  updateChannel: (channel: unknown, message: unknown) => Update.Return<unknown, unknown, Services>
  channelView: Submodel.View<unknown, unknown>
  summarize: (channel: unknown) => Option.Option<ChannelSummary>
  close: Update.Step<unknown, unknown, Services>
  clearErrors: (channel: unknown) => unknown
  events: Stream.Stream<ChannelEvent<unknown>, never, Services>
}>

/**
 * Declare a channel plugin.
 *
 * Type-checks the descriptor against its own types — the form, the config builder and the
 * channel all have to agree — and then erases them for the registry. This is the only place
 * the erasure happens.
 */
export const defineChannelPlugin = <
  Request,
  RequestMessage,
  Config,
  Channel,
  ChannelMessage,
  Services = never,
>(
  plugin: ChannelPlugin<Request, RequestMessage, Config, Channel, ChannelMessage, Services>
): RegisteredChannelPlugin<Services> => {
  const { request, channel } = plugin

  return {
    kind: plugin.kind,
    label: plugin.label,
    iconPath: plugin.iconPath,
    dialogTitle: plugin.dialogTitle,
    dialogWidth: plugin.dialogWidth ?? 'Narrow',
    initRequest: request.init,
    updateRequest: (model, message) =>
      request.isModel(model) && request.isMessage(message)
        ? request.update(model, message)
        : { model },
    requestView: Submodel.defineView<unknown, unknown>((model, h) =>
      request.isModel(model)
        ? h.submodel({
            slotId: 'request',
            model,
            view: request.view,
            toParentMessage: (message) => message,
          })
        : h.empty
    ),
    canOpen: (model) => request.isModel(model) && Option.isSome(request.toConfig(model)),
    open: (model, channelId) =>
      request.isModel(model)
        ? Option.map(request.toConfig(model), (config) => channel.init({ channelId, config }))
        : Option.none(),
    updateChannel: (model, message) =>
      channel.isModel(model) && channel.isMessage(message)
        ? channel.update(model, message)
        : { model },
    channelView: Submodel.defineView<unknown, unknown>((model, h) =>
      channel.isModel(model)
        ? h.submodel({
            slotId: 'channel',
            model,
            view: channel.view,
            toParentMessage: (message) => message,
          })
        : h.empty
    ),
    summarize: (model) =>
      channel.isModel(model) ? Option.some(channel.summarize(model)) : Option.none(),
    close: (model) => (channel.isModel(model) ? channel.close(model) : { model }),
    clearErrors: (model) => (channel.isModel(model) ? channel.clearErrors(model) : model),
    events: plugin.events,
  }
}
