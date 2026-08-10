import {
  DXLinkAuthState,
  DXLinkConnectionState,
  DXLinkLogLevel,
  DXLinkWebSocketClient,
} from '@dxfeed/dxlink-api'
import type { DXLinkClient, DXLinkConnectionDetails, DXLinkError } from '@dxfeed/dxlink-api'
import { createStore } from 'zustand/vanilla'

import { prependError } from '../../shared/lib/timestamped-error'
import type { TimestampedError } from '../../shared/lib/timestamped-error'
import type { ViewModel } from '../../shared/view-model'

/** Connection parameters entered in the form and passed to the client config. */
export interface ConnectionParams {
  keepaliveInterval: number
  keepaliveTimeout: number
  acceptKeepaliveTimeout: number
}

export interface ConnectionVMState {
  connection: DXLinkConnectionState
  /**
   * Tri-state auth gating: `undefined` until we know (not connected / connecting),
   * then the server-reported `DXLinkAuthState`. Never seeded to UNAUTHORIZED so a
   * no-auth server doesn't flash a token form.
   */
  auth: DXLinkAuthState | undefined
  details: DXLinkConnectionDetails | null
  errors: TimestampedError[]
  /**
   * Identifies the current client instance. Bumped on each fresh {@link connect}
   * (new client) but NOT on {@link reconnect} (same client). The channels area uses
   * it as a React remount key, so a brand-new connection starts with no channels
   * while a reconnect preserves the open ones.
   */
  sessionId: number
  /**
   * `true` once the current client has reached AUTHORIZED. Stays `true` through a
   * reconnect (the same client re-opens its channels itself), so the channels area
   * survives the connection / auth flicker. Reset on disconnect / fresh connect.
   */
  everAuthorized: boolean
}

const createInitialState = (): ConnectionVMState => ({
  connection: DXLinkConnectionState.NOT_CONNECTED,
  auth: undefined,
  details: null,
  errors: [],
  sessionId: 0,
  everAuthorized: false,
})

/**
 * Page-scoped ViewModel wrapping a single {@link DXLinkWebSocketClient}. Owns the
 * client as a private field (kept off the store), wires its listeners once, and
 * maps connection / auth / error events into the store. Commands: connect,
 * reconnect, disconnect, setAuthToken, clearErrors.
 *
 * Debug-console client opts are preserved from the legacy console: `logLevel:
 * DEBUG` and `maxReconnectAttempts: 1` (a debug console deliberately limits
 * reconnect).
 */
export class ConnectionViewModel implements ViewModel<ConnectionVMState> {
  readonly store = createStore<ConnectionVMState>(() => createInitialState())

  private client: DXLinkWebSocketClient | null = null

  connect = (url: string, params: ConnectionParams): void => {
    this.teardownClient()
    // A fresh client starts a new session: reset errors, bump the session id (so the
    // channels area remounts with no channels) and clear the authorized flag.
    this.store.setState((state) => ({
      errors: [],
      sessionId: state.sessionId + 1,
      everAuthorized: false,
    }))

    const client = new DXLinkWebSocketClient({
      keepaliveInterval: params.keepaliveInterval,
      keepaliveTimeout: params.keepaliveTimeout,
      acceptKeepaliveTimeout: params.acceptKeepaliveTimeout,
      logLevel: DXLinkLogLevel.DEBUG,
      maxReconnectAttempts: 1,
    })
    client.addConnectionStateChangeListener(this.handleConnectionState)
    client.addAuthStateChangeListener(this.handleAuthState)
    client.addErrorListener(this.handleError)
    this.client = client

    client.connect(url)
    this.syncFromClient()
  }

  reconnect = (): void => {
    this.client?.reconnect()
  }

  disconnect = (): void => {
    this.teardownClient()
    this.store.setState({
      connection: DXLinkConnectionState.NOT_CONNECTED,
      auth: undefined,
      details: null,
      everAuthorized: false,
    })
  }

  setAuthToken = (token: string): void => {
    this.client?.setAuthToken(token)
  }

  /**
   * The live client, for opening channels (e.g. building a FeedViewModel). Non-null
   * only while connected — channel views are gated behind the AUTHORIZED state.
   */
  getClient = (): DXLinkClient | null => this.client

  clearErrors = (): void => {
    this.store.setState({ errors: [] })
  }

  /**
   * Release the client + listeners. Idempotent and NON-permanent: after a dispose
   * (e.g. React StrictMode's setup→cleanup→setup, which reuses the same VM via
   * useState) the VM stays usable — the next `connect()` simply builds a fresh
   * client. A real page unmount disposes it for good because nothing calls it again.
   */
  dispose = (): void => {
    this.teardownClient()
  }

  private handleConnectionState = (state: DXLinkConnectionState): void => {
    // Read the server-reported auth state once connected; clear it otherwise.
    const auth = state === DXLinkConnectionState.CONNECTED ? this.client?.getAuthState() : undefined
    this.store.setState((prev) => ({
      connection: state,
      details:
        state === DXLinkConnectionState.NOT_CONNECTED
          ? null
          : (this.client?.getConnectionDetails() ?? null),
      auth,
      everAuthorized: prev.everAuthorized || auth === DXLinkAuthState.AUTHORIZED,
    }))
  }

  private handleAuthState = (state: DXLinkAuthState): void => {
    this.store.setState((prev) => ({
      auth: state,
      everAuthorized: prev.everAuthorized || state === DXLinkAuthState.AUTHORIZED,
    }))
  }

  private handleError = (error: DXLinkError): void => {
    this.store.setState((state) => ({ errors: prependError(state.errors, error) }))
  }

  /** Pull the current state straight off the client (e.g. right after connect()). */
  private syncFromClient = (): void => {
    const client = this.client
    if (client === null) return
    const connection = client.getConnectionState()
    const auth = connection === DXLinkConnectionState.CONNECTED ? client.getAuthState() : undefined
    this.store.setState((prev) => ({
      connection,
      details:
        connection === DXLinkConnectionState.NOT_CONNECTED ? null : client.getConnectionDetails(),
      auth,
      everAuthorized: prev.everAuthorized || auth === DXLinkAuthState.AUTHORIZED,
    }))
  }

  private teardownClient = (): void => {
    const client = this.client
    if (client === null) return
    client.removeConnectionStateChangeListener(this.handleConnectionState)
    client.removeAuthStateChangeListener(this.handleAuthState)
    client.removeErrorListener(this.handleError)
    client.close()
    this.client = null
  }
}
