import { Effect, Option, Schema } from 'effect'
import { ManagedResource } from 'foldkit'

import { DXLinkLogLevel, DXLinkWebSocketClient } from '@dxfeed/dxlink-api'

import { DxLinkClient } from './client'
import { Message } from './message'
import { ClientParams, type Model, Session } from './model'

const ClientRequirements = Schema.Struct({
  sessionId: Schema.Number,
  params: ClientParams,
})
type ClientRequirements = typeof ClientRequirements.Type

const sessionToMaybeRequirements = (session: Session): Option.Option<ClientRequirements> =>
  Session.match(session, {
    Idle: () => Option.none(),
    Opening: ({ sessionId, params }) => Option.some({ sessionId, params }),
    Open: ({ sessionId, params }) => Option.some({ sessionId, params }),
  })

/**
 * The client exists exactly while the Model holds a session.
 *
 * A debug console deliberately limits reconnection to one attempt and logs at DEBUG: what
 * the protocol does is the thing being looked at.
 */
export const managedResources = ManagedResource.make<Model, Message>()((entry) => ({
  client: entry(Schema.Option(ClientRequirements), {
    resource: DxLinkClient,
    modelToMaybeRequirements: (model) => sessionToMaybeRequirements(model.session),
    acquire: ({ params }) =>
      Effect.try({
        try: () => {
          const client = new DXLinkWebSocketClient({
            keepaliveInterval: params.keepaliveInterval,
            keepaliveTimeout: params.keepaliveTimeout,
            acceptKeepaliveTimeout: params.acceptKeepaliveTimeout,
            logLevel: DXLinkLogLevel.DEBUG,
            maxReconnectAttempts: 1,
          })
          client.connect(params.url)

          return client
        },
        catch: (error) => (error instanceof Error ? error.message : 'Failed to create client'),
      }),
    release: (client) =>
      Effect.sync(() => {
        client.close()
      }),
    onAcquired: () => Message.AcquiredClient(),
    onReleased: () => Message.ReleasedClient(),
    onAcquireError: (error) => Message.FailedAcquireClient({ reason: String(error) }),
  }),
}))
