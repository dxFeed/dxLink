import { Array, Option, Record, Redacted, String, pipe } from 'effect'
import { Command, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { DXLinkAuthState, DXLinkConnectionState } from '@dxfeed/dxlink-api'
import { Dialog } from '@foldkit/ui'

import type { RegisteredChannelPlugin } from './channel/plugin'
import type { DxLinkClientService } from './client'
import { ReconnectClient, ReportAcquireFailure, ScrollToChannel, SetAuthToken } from './command'
import type { ConsoleConfig } from './config'
import { clearErrors, emptyErrorLog, prependError } from './error'
import { Message } from './message'
import {
  type ChannelEntry,
  type ClientParams,
  type ClientStatus,
  type ConnectionField,
  type ConnectionForm,
  type Model,
  Session,
} from './model'

export const REQUEST_DIALOG_ID = 'dxlink-channel-request'

const DIGITS_ONLY = /[^0-9]/g

const toNumber = (draft: string): number => {
  const parsed = Number(draft)

  return Number.isFinite(parsed) ? parsed : 0
}

const toClientParams = (form: ConnectionForm): ClientParams => ({
  url: form.url.trim(),
  keepaliveInterval: toNumber(form.keepaliveInterval),
  keepaliveTimeout: toNumber(form.keepaliveTimeout),
  acceptKeepaliveTimeout: toNumber(form.acceptKeepalive),
})

/** The keepalive fields take seconds, so anything but a digit is dropped as it is typed. */
const updateForm = (
  form: ConnectionForm,
  field: ConnectionField,
  value: string
): ConnectionForm => {
  const digits = value.replace(DIGITS_ONLY, '')

  return modifyFields(form, {
    url: (url) => (field === 'Url' ? value : url),
    keepaliveInterval: (interval) => (field === 'KeepaliveInterval' ? digits : interval),
    keepaliveTimeout: (timeout) => (field === 'KeepaliveTimeout' ? digits : timeout),
    acceptKeepalive: (accept) => (field === 'AcceptKeepalive' ? digits : accept),
  })
}

const isAuthorized = (status: ClientStatus): boolean =>
  Option.contains(status.maybeAuth, DXLinkAuthState.AUTHORIZED)

const withStatus = (session: Session, status: ClientStatus): Session =>
  Session.match(session, {
    Idle: () => session,
    Opening: () => session,
    Open: (open) =>
      Session.Open({
        sessionId: open.sessionId,
        params: open.params,
        status,
        hasAuthorized: open.hasAuthorized || isAuthorized(status),
      }),
  })

const findPlugin = <Services>(
  plugins: ReadonlyArray<RegisteredChannelPlugin<Services>>,
  kind: string
): Option.Option<RegisteredChannelPlugin<Services>> =>
  Array.findFirst(plugins, (plugin) => plugin.kind === kind)

const findChannel = (model: Model, channelId: string): Option.Option<ChannelEntry> =>
  Array.findFirst(model.channels, (channel) => channel.id === channelId)

const writeChannel = (model: Model, nextChannel: ChannelEntry): Model =>
  modifyFields(model, {
    channels: Array.map((channel) => (channel.id === nextChannel.id ? nextChannel : channel)),
  })

const toChannelMessage =
  (channelId: string) =>
  (message: unknown): Message =>
    Message.GotChannelMessage({ channelId, message })

const toRequestMessage =
  (pluginId: string) =>
  (message: unknown): Message =>
    Message.GotRequestMessage({ pluginId, message })

export const makeConsole = <Services>(
  plugins: ReadonlyArray<RegisteredChannelPlugin<Services>>
) => {
  type UpdateReturn = Update.Return<Model, Message, Services | DxLinkClientService>
  type Commands = Update.Commands<Message, Services | DxLinkClientService>

  const foldRequestDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
    Opened: () => (model) => ({ model }),
    Closed: () => (model) => ({ model }),
  })

  const readRequestDialog = (model: Model) => Option.some(model.requestDialog)
  const writeRequestDialog = (model: Model, nextRequestDialog: Dialog.Model): Model =>
    modifyFields(model, { requestDialog: () => nextRequestDialog })
  const toRequestDialogMessage = (message: Dialog.Message): Message =>
    Message.GotRequestDialogMessage({ message })

  const foldRequestDialog = Update.foldChild({
    update: Dialog.update,
    read: readRequestDialog,
    write: writeRequestDialog,
    toParentMessage: toRequestDialogMessage,
    foldOutMessage: foldRequestDialogOutMessage,
  })

  const foldRequestDialogOpen = Update.foldChildStep({
    update: Dialog.open,
    read: readRequestDialog,
    write: writeRequestDialog,
    toParentMessage: toRequestDialogMessage,
    foldOutMessage: foldRequestDialogOutMessage,
  })

  const foldRequestDialogClose = Update.foldChildStep({
    update: Dialog.close,
    read: readRequestDialog,
    write: writeRequestDialog,
    toParentMessage: toRequestDialogMessage,
    foldOutMessage: foldRequestDialogOutMessage,
  })

  /**
   * Close one channel through its plugin. The card stays, marked closed; a channel that is
   * already closed, or whose plugin is not registered, is left as it is.
   */
  const closeChannel = (
    channel: ChannelEntry
  ): Readonly<{ channel: ChannelEntry; commands?: Commands }> =>
    pipe(
      findPlugin(plugins, channel.kind),
      Option.filter(() => !channel.isClosed),
      Option.match({
        onNone: () => ({ channel }),
        onSome: (plugin) => {
          const channelClose = plugin.close(channel.model)

          return {
            channel: modifyFields(channel, {
              isClosed: () => true,
              model: () => channelClose.model,
            }),
            commands: Command.mapMessages(
              channelClose.commands ?? [],
              toChannelMessage(channel.id)
            ),
          }
        },
      })
    )

  /**
   * End the current session's channels: every open one is closed through its plugin and the
   * cards are dropped, so the next session starts with none.
   */
  const dropChannels = (model: Model): Readonly<{ model: Model; commands: Commands }> => ({
    model: modifyFields(model, { channels: () => [] }),
    commands: Array.flatMap(model.channels, (channel) => closeChannel(channel).commands ?? []),
  })

  const init = (config: ConsoleConfig): UpdateReturn => {
    const requestInits = Array.map(plugins, (plugin) => ({
      kind: plugin.kind,
      requestInit: plugin.initRequest(),
    }))

    return {
      model: {
        config,
        form: {
          url: config.wsUrl,
          keepaliveInterval: globalThis.String(config.keepalive.interval),
          keepaliveTimeout: globalThis.String(config.keepalive.timeout),
          acceptKeepalive: globalThis.String(config.keepalive.acceptTimeout),
        },
        session: Session.Idle(),
        lastSessionId: 0,
        errorLog: emptyErrorLog(),
        authToken: Redacted.make(''),
        channels: [],
        nextChannelId: 1,
        requests: Record.fromEntries(
          Array.map(requestInits, ({ kind, requestInit }) => [kind, requestInit.model])
        ),
        maybeRequestKind: Option.none(),
        requestDialog: Dialog.init({ id: REQUEST_DIALOG_ID }),
      },
      commands: Array.flatMap(requestInits, ({ kind, requestInit }) =>
        Command.mapMessages(requestInit.commands ?? [], toRequestMessage(kind))
      ),
    }
  }

  const update = (model: Model, message: Message) =>
    Message.match<UpdateReturn>(message, {
      UpdatedConnectionField: ({ field, value }) => ({
        model: modifyFields(model, {
          form: (form) => updateForm(form, field, value),
        }),
      }),

      ClickedConnect: () => {
        const channelsDrop = dropChannels(model)
        const sessionId = model.lastSessionId + 1

        return {
          model: modifyFields(channelsDrop.model, {
            session: () =>
              Session.Opening({
                sessionId,
                params: toClientParams(model.form),
              }),
            lastSessionId: () => sessionId,
            errorLog: () => emptyErrorLog(),
          }),
          commands: channelsDrop.commands,
        }
      },

      ClickedReconnect: () => ({ model, commands: [ReconnectClient()] }),

      ClickedDisconnect: () => {
        const channelsDrop = dropChannels(model)

        return {
          model: modifyFields(channelsDrop.model, {
            session: () => Session.Idle(),
          }),
          commands: channelsDrop.commands,
        }
      },

      AcquiredClient: () => ({
        model: modifyFields(model, {
          session: (session) =>
            Session.match(session, {
              Idle: () => session,
              Open: () => session,
              Opening: ({ sessionId, params }) =>
                Session.Open({
                  sessionId,
                  params,
                  status: {
                    connection: DXLinkConnectionState.CONNECTING,
                    maybeAuth: Option.none(),
                    maybeDetails: Option.none(),
                  },
                  hasAuthorized: false,
                }),
            }),
        }),
      }),

      ReleasedClient: () => ({ model }),

      FailedAcquireClient: ({ reason }) => ({
        model: modifyFields(model, { session: () => Session.Idle() }),
        commands: [ReportAcquireFailure({ reason })],
      }),

      CompletedReportAcquireFailure: ({ error }) => ({
        model: modifyFields(model, {
          errorLog: (errorLog) => prependError(errorLog, error),
        }),
      }),

      ChangedClientStatus: ({ status }) => ({
        model: modifyFields(model, {
          session: (session) => withStatus(session, status),
        }),
      }),

      ChangedAuthState: ({ auth }) => ({
        model: modifyFields(model, {
          session: (session) =>
            Session.match(session, {
              Idle: () => session,
              Opening: () => session,
              Open: ({ status }) =>
                withStatus(
                  session,
                  modifyFields(status, {
                    maybeAuth: () => Option.some(auth),
                  })
                ),
            }),
        }),
      }),

      ReportedConnectionError: ({ error }) => ({
        model: modifyFields(model, {
          errorLog: (errorLog) => prependError(errorLog, error),
        }),
      }),

      ClickedClearConnectionErrors: () => ({
        model: modifyFields(model, { errorLog: clearErrors }),
      }),

      CompletedReconnectClient: () => ({ model }),

      UpdatedAuthToken: ({ value }) => ({
        model: modifyFields(model, { authToken: () => value }),
      }),

      SubmittedAuthToken: () => {
        const token = Redacted.value(model.authToken).trim()

        return String.isEmpty(token)
          ? { model }
          : { model, commands: [SetAuthToken({ token: Redacted.make(token) })] }
      },

      CompletedSetAuthToken: () => ({ model }),

      ClickedAddChannel: ({ kind }) =>
        foldRequestDialogOpen(modifyFields(model, { maybeRequestKind: () => Option.some(kind) })),

      GotRequestDialogMessage: ({ message: dialogMessage }) =>
        foldRequestDialog(model, dialogMessage),

      GotRequestMessage: ({ pluginId: kind, message: requestMessage }) =>
        pipe(
          findPlugin(plugins, kind),
          Option.match({
            onNone: (): UpdateReturn => ({ model }),
            onSome: (plugin) => {
              const requestUpdate = plugin.updateRequest(
                Record.get(model.requests, kind).pipe(Option.getOrUndefined),
                requestMessage
              )

              return {
                model: modifyFields(model, {
                  requests: Record.set(kind, requestUpdate.model),
                }),
                commands: Command.mapMessages(requestUpdate.commands ?? [], toRequestMessage(kind)),
              }
            },
          })
        ),

      ClickedOpenChannel: () =>
        pipe(
          model.maybeRequestKind,
          Option.flatMap((kind) => findPlugin(plugins, kind)),
          Option.flatMap((plugin) => {
            const channelId = globalThis.String(model.nextChannelId)

            return Option.map(
              plugin.open(
                Record.get(model.requests, plugin.kind).pipe(Option.getOrUndefined),
                channelId
              ),
              (channelInit) => ({ plugin, channelId, channelInit })
            )
          }),
          Option.match({
            onNone: (): UpdateReturn => ({ model }),
            onSome: ({ plugin, channelId, channelInit }) => {
              const dialogClose = foldRequestDialogClose(
                modifyFields(model, {
                  channels: Array.append({
                    id: channelId,
                    kind: plugin.kind,
                    title: `${plugin.label} #${channelId}`,
                    isExpanded: true,
                    isClosed: false,
                    model: channelInit.model,
                  }),
                  nextChannelId: (nextChannelId) => nextChannelId + 1,
                })
              )

              return {
                model: dialogClose.model,
                commands: [
                  ...(dialogClose.commands ?? []),
                  ...Command.mapMessages(channelInit.commands ?? [], toChannelMessage(channelId)),
                  ScrollToChannel({ channelId }),
                ],
              }
            },
          })
        ),

      GotChannelMessage: ({ channelId, message: channelMessage }) =>
        pipe(
          findChannel(model, channelId),
          Option.flatMap((channel) =>
            Option.map(findPlugin(plugins, channel.kind), (plugin) => ({
              channel,
              plugin,
            }))
          ),
          Option.match({
            onNone: (): UpdateReturn => ({ model }),
            onSome: ({ channel, plugin }) => {
              const channelUpdate = plugin.updateChannel(channel.model, channelMessage)

              return {
                model: writeChannel(
                  model,
                  modifyFields(channel, { model: () => channelUpdate.model })
                ),
                commands: Command.mapMessages(
                  channelUpdate.commands ?? [],
                  toChannelMessage(channelId)
                ),
              }
            },
          })
        ),

      ClickedToggleChannel: ({ channelId }) => ({
        model: modifyFields(model, {
          channels: Array.map((channel) =>
            channel.id === channelId
              ? modifyFields(channel, {
                  isExpanded: (isExpanded) => !isExpanded,
                })
              : channel
          ),
        }),
      }),

      ClickedCloseChannel: ({ channelId }) =>
        Option.match(findChannel(model, channelId), {
          onNone: (): UpdateReturn => ({ model }),
          onSome: (channel) => {
            const channelClose = closeChannel(channel)
            const nextModel = writeChannel(model, channelClose.channel)

            return channelClose.commands === undefined
              ? { model: nextModel }
              : { model: nextModel, commands: channelClose.commands }
          },
        }),

      ClickedClearChannelErrors: ({ channelId }) => ({
        model: modifyFields(model, {
          channels: Array.map((channel) =>
            channel.id === channelId
              ? modifyFields(channel, {
                  model: (channelModel) =>
                    Option.match(findPlugin(plugins, channel.kind), {
                      onNone: () => channelModel,
                      onSome: (plugin) => plugin.clearErrors(channelModel),
                    }),
                })
              : channel
          ),
        }),
      }),

      CompletedScrollToChannel: () => ({ model }),
    })

  return { init, update }
}
