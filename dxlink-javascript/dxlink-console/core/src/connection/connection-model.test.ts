import { DXLinkAuthState, DXLinkConnectionState } from '@dxfeed/dxlink-api'
import type { DXLinkError } from '@dxfeed/dxlink-api'
import * as AsyncResult from 'effect/reactivity/AsyncResult'
import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeConnectionModel } from './connection-model'

// `vi.mock` is hoisted above the imports, so the fake it installs has to be hoisted with it.
const { FakeClient, clients } = vi.hoisted(() => {
  /** Every client the model has built, newest last. */
  const clients: Array<InstanceType<typeof FakeClient>> = []

  class FakeClient {
    readonly config: unknown
    url: string | null = null
    closed = false
    reconnects = 0
    token: string | null = null
    // Literals rather than the enums: this class is hoisted above every import.
    connectionState = 'NOT_CONNECTED' as DXLinkConnectionState
    authState = 'UNAUTHORIZED' as DXLinkAuthState
    readonly connectionListeners = new Set<(state: DXLinkConnectionState) => void>()
    readonly authListeners = new Set<(state: DXLinkAuthState) => void>()
    readonly errorListeners = new Set<(error: DXLinkError) => void>()

    constructor(config: unknown) {
      this.config = config
      clients.push(this)
    }

    addConnectionStateChangeListener(l: (state: DXLinkConnectionState) => void) {
      this.connectionListeners.add(l)
    }
    removeConnectionStateChangeListener(l: (state: DXLinkConnectionState) => void) {
      this.connectionListeners.delete(l)
    }
    addAuthStateChangeListener(l: (state: DXLinkAuthState) => void) {
      this.authListeners.add(l)
    }
    removeAuthStateChangeListener(l: (state: DXLinkAuthState) => void) {
      this.authListeners.delete(l)
    }
    addErrorListener(l: (error: DXLinkError) => void) {
      this.errorListeners.add(l)
    }
    removeErrorListener(l: (error: DXLinkError) => void) {
      this.errorListeners.delete(l)
    }

    connect(url: string) {
      this.url = url
      this.setConnection(DXLinkConnectionState.CONNECTING)
      // As the real one does: the state is CONNECTING before `new WebSocket` rejects the URL.
      if (!/^wss?:\/\//.test(url)) {
        throw new SyntaxError(`The URL '${url}' is invalid.`)
      }
    }
    reconnect() {
      this.reconnects += 1
    }
    close() {
      this.closed = true
      if (this.connectionState === DXLinkConnectionState.NOT_CONNECTED) return
      this.setConnection(DXLinkConnectionState.NOT_CONNECTED)
      this.setAuth(DXLinkAuthState.UNAUTHORIZED)
    }
    setAuthToken(token: string) {
      this.token = token
    }
    getConnectionState() {
      return this.connectionState
    }
    getAuthState() {
      return this.authState
    }
    getConnectionDetails() {
      return { protocolVersion: '1.0', clientVersion: 'test', serverVersion: 'fake' }
    }

    setConnection(state: DXLinkConnectionState) {
      this.connectionState = state
      for (const l of this.connectionListeners) l(state)
    }
    setAuth(state: DXLinkAuthState) {
      this.authState = state
      for (const l of this.authListeners) l(state)
    }
    fail(error: DXLinkError) {
      for (const l of this.errorListeners) l(error)
    }
    get listenerCount() {
      return this.connectionListeners.size + this.authListeners.size + this.errorListeners.size
    }
  }

  return { FakeClient, clients }
})

vi.mock('@dxfeed/dxlink-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dxfeed/dxlink-api')>()),
  DXLinkWebSocketClient: FakeClient,
}))

const PARAMS = { keepaliveInterval: 30, keepaliveTimeout: 60, acceptKeepaliveTimeout: 60 }

let registry: AtomRegistry.AtomRegistry
let release: () => void
let model: ReturnType<typeof makeConnectionModel>

beforeEach(() => {
  clients.length = 0
  registry = AtomRegistry.make()
  model = makeConnectionModel()
  // ConsolePage holds the session open the same way.
  release = registry.mount(model.session.atom)
})

afterEach(() => {
  release()
  registry.dispose()
})

const latestClient = () => {
  const client = clients[clients.length - 1]
  if (client === undefined) throw new Error('no client built')
  return client
}

describe('connection model', () => {
  it('opens no socket until asked to connect', () => {
    expect(clients).toHaveLength(0)
    expect(registry.get(model.client)).toBeNull()
    expect(registry.get(model.connection)).toBe(DXLinkConnectionState.NOT_CONNECTED)
  })

  it('connects with the form values and the debug-console client options', () => {
    registry.set(model.connect, { url: 'wss://relay', params: PARAMS })

    const client = latestClient()
    expect(client.url).toBe('wss://relay')
    expect(client.config).toMatchObject({
      keepaliveInterval: 30,
      keepaliveTimeout: 60,
      acceptKeepaliveTimeout: 60,
      maxReconnectAttempts: 1,
    })
    expect(registry.get(model.client)).toBe(client)
    // Read straight off the client, before any listener reported it.
    expect(registry.get(model.connection)).toBe(DXLinkConnectionState.CONNECTING)
  })

  it('reads auth only once connected, and remembers having been authorized', () => {
    registry.set(model.connect, { url: 'wss://relay', params: PARAMS })
    const client = latestClient()

    expect(registry.get(model.auth)).toBeUndefined()

    client.setConnection(DXLinkConnectionState.CONNECTED)
    expect(registry.get(model.auth)).toBe(DXLinkAuthState.UNAUTHORIZED)
    expect(registry.get(model.details)).toMatchObject({ serverVersion: 'fake' })

    client.setAuth(DXLinkAuthState.AUTHORIZED)
    expect(registry.get(model.everAuthorized)).toBe(true)

    // A reconnect drops back through CONNECTING; the channels area must survive it.
    client.setConnection(DXLinkConnectionState.CONNECTING)
    expect(registry.get(model.auth)).toBeUndefined()
    expect(registry.get(model.everAuthorized)).toBe(true)
  })

  it('delegates reconnect and the auth token to the live client', () => {
    registry.set(model.connect, { url: 'wss://relay', params: PARAMS })
    const client = latestClient()

    registry.set(model.reconnect, undefined)
    registry.set(model.setAuthToken, 'secret')

    expect(client.reconnects).toBe(1)
    expect(client.token).toBe('secret')
    expect(registry.get(model.sessionId)).toBe(1)
  })

  it('collects connection errors, newest first, until cleared', () => {
    registry.set(model.connect, { url: 'wss://relay', params: PARAMS })
    latestClient().fail({ type: 'TIMEOUT', message: 'first' })
    latestClient().fail({ type: 'BAD_ACTION', message: 'second' })

    expect(registry.get(model.errors).map((error) => error.message)).toEqual(['second', 'first'])

    registry.set(model.clearErrors, undefined)
    expect(registry.get(model.errors)).toEqual([])
  })

  it('replaces the client on a fresh connect, starting a new session', () => {
    registry.set(model.connect, { url: 'wss://one', params: PARAMS })
    const first = latestClient()
    first.setConnection(DXLinkConnectionState.CONNECTED)
    first.setAuth(DXLinkAuthState.AUTHORIZED)
    first.fail({ type: 'TIMEOUT', message: 'old' })

    registry.set(model.connect, { url: 'wss://two', params: PARAMS })
    const second = latestClient()

    expect(first.closed).toBe(true)
    expect(first.listenerCount).toBe(0)
    expect(second).not.toBe(first)
    expect(registry.get(model.client)).toBe(second)
    expect(registry.get(model.sessionId)).toBe(2)
    expect(registry.get(model.everAuthorized)).toBe(false)
    expect(registry.get(model.errors)).toEqual([])
  })

  it('closes the client and resets the state on disconnect', () => {
    registry.set(model.connect, { url: 'wss://relay', params: PARAMS })
    const client = latestClient()
    client.setConnection(DXLinkConnectionState.CONNECTED)
    client.setAuth(DXLinkAuthState.AUTHORIZED)

    registry.set(model.disconnect, undefined)

    expect(client.closed).toBe(true)
    expect(client.listenerCount).toBe(0)
    expect(registry.get(model.client)).toBeNull()
    expect(registry.get(model.connection)).toBe(DXLinkConnectionState.NOT_CONNECTED)
    expect(registry.get(model.auth)).toBeUndefined()
    expect(registry.get(model.details)).toBeNull()
    expect(registry.get(model.everAuthorized)).toBe(false)
  })

  it('reports a URL the socket cannot parse as a connection error, not a failed session', () => {
    registry.set(model.connect, { url: 'localhost:8080', params: PARAMS })
    const client = latestClient()

    // A failed session would be rethrown over the whole page by `useSession`.
    expect(AsyncResult.isSuccess(registry.get(model.session.atom))).toBe(true)
    expect(client.closed).toBe(true)
    expect(registry.get(model.connection)).toBe(DXLinkConnectionState.NOT_CONNECTED)
    expect(registry.get(model.auth)).toBeUndefined()
    expect(registry.get(model.errors).map((error) => error.message)).toEqual([
      "The URL 'localhost:8080' is invalid.",
    ])

    // Fixing the typo and connecting again starts a fresh client.
    registry.set(model.connect, { url: 'wss://relay', params: PARAMS })
    expect(latestClient()).not.toBe(client)
    expect(registry.get(model.connection)).toBe(DXLinkConnectionState.CONNECTING)
  })

  it('closes the client when the page goes', () => {
    registry.set(model.connect, { url: 'wss://relay', params: PARAMS })
    const client = latestClient()

    release()
    registry.dispose()

    expect(client.closed).toBe(true)
    // afterEach releases again; both are idempotent.
  })
})
