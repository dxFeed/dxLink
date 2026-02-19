# DXLink WebSocket Client Specification

## Table of Contents

1. [Introduction](#1-introduction)
2. [Client Lifecycle and Connection Management](#2-client-lifecycle-and-connection-management)
3. [Authentication Flow](#3-authentication-flow)
4. [Channel Management](#4-channel-management)
5. [Message Handling](#5-message-handling)
6. [Protocol to API Mapping](#6-protocol-to-api-mapping)
7. [Error Handling](#7-error-handling)
8. [Configuration and Customization](#8-configuration-and-customization)
9. [Usage Patterns](#9-usage-patterns)
10. [Development Guidelines](#10-development-guidelines)

## 1. Introduction

The `@dxfeed/dxlink-websocket-client` is a WebSocket-based client implementation for the dxLink protocol. It provides a high-level API for connecting to dxLink WebSocket endpoints, managing connections, authenticating, and opening channels to various services.

### Purpose

The client abstracts the low-level WebSocket protocol details and provides a clean, event-driven API for applications to interact with dxLink services. It handles connection lifecycle, authentication, channel management, keepalive, reconnection, and error handling automatically.

### Protocol Version

The client uses protocol version `1.0` (exported as `DXLINK_WS_PROTOCOL_VERSION`). This version is included in the SETUP message during connection establishment.

### Architecture

The client consists of three main components:

- **Client**: The main `DXLinkWebSocketClient` class that manages the overall connection and provides the public API
- **Connector**: A `DXLinkWebSocketConnector` implementation that handles the low-level WebSocket transport layer
- **Channels**: `DXLinkChannel` instances that represent isolated virtual connections to specific services within a single WebSocket connection

The client uses a connector abstraction, allowing custom WebSocket implementations to be plugged in. By default, it uses the browser's native `WebSocket` API through `DefaultDXLinkWebSocketConnector`.

## 2. Client Lifecycle and Connection Management

### Connection Workflow

To establish a connection, call `connect()` with a WebSocket URL. The client immediately transitions to `CONNECTING` state and initiates the WebSocket connection through the connector.

When the WebSocket transport opens:

1. The client automatically sends a SETUP message to the server
2. If an auth token was previously set, it sends an AUTH message
3. The client waits for the server's SETUP response
4. The client waits for the server's AUTH_STATE message
5. Once both messages are received and authorization is complete (if required), the connection transitions to `CONNECTED`

If the server doesn't respond with SETUP or AUTH_STATE within the configured `actionTimeout`, the client treats this as a timeout error and attempts to reconnect.

### Connection States

The client maintains a connection state that can be queried via `getConnectionState()`:

- **NOT_CONNECTED**: Initial state or after explicit disconnection. The client is not connected to any endpoint.
- **CONNECTING**: The client is in the process of establishing a connection. This state occurs:
  - Immediately after calling `connect()`
  - During reconnection attempts
  - After WebSocket transport opens, while waiting for SETUP and AUTH_STATE messages
- **CONNECTED**: The connection is fully established and ready to use. Channels can be opened and messages can be sent.

State changes are notified to registered listeners via `addConnectionStateChangeListener()`. Listeners receive both the new state and the previous state.

### Setup Phase

The setup phase occurs automatically when the WebSocket transport opens. The client sends a SETUP message containing:

- Protocol version and client version
- Client's keepalive timeout preferences
- Acceptable server keepalive timeout

The server responds with its own SETUP message containing its version and keepalive timeout preferences. This exchange establishes the protocol version and connection parameters.

If no SETUP response is received within `actionTimeout` seconds, the client publishes a TIMEOUT error and attempts to reconnect.

### Keepalive Mechanism

The client automatically maintains the connection through keepalive messages. This prevents the connection from being closed due to inactivity.

**Client-side keepalive**: The client sends KEEPALIVE messages at regular intervals (configured via `keepaliveInterval`). If no other messages have been sent for `keepaliveInterval` seconds, a KEEPALIVE message is automatically sent.

**Server-side keepalive monitoring**: The client monitors for incoming messages from the server. If no messages are received from the server for the server's keepalive timeout period, the client detects this as a connection failure and attempts to reconnect.

Keepalive messages are handled automatically and are not exposed in the public API. They use channel 0 (the connection channel) and are sent/received transparently.

### Reconnection Behavior

The client automatically attempts to reconnect when the WebSocket connection is closed unexpectedly. Reconnection occurs when:

- The WebSocket transport closes and the client was previously authorized
- A keepalive timeout is detected
- A connection error occurs

Reconnection does not occur if:

- The client was not authorized (UNAUTHORIZED state) - in this case, the client disconnects completely
- `disconnect()` was called explicitly
- Maximum reconnect attempts have been reached (if configured)

**Reconnection process**:

1. The client stops the current connector
2. All scheduled timeouts are cleared
3. Connection details are reset to defaults
4. Connection state transitions to `CONNECTING`
5. All active channels (not closed) transition to `REQUESTED` state
6. After a delay (based on reconnect attempt count: `attemptNumber * 1000ms`), a new connection attempt is made
7. Once reconnected, all previously opened channels are automatically re-requested

The reconnect attempt counter is reset to 0 after a successful connection is established.

**Reconnection limits**: You can configure `maxReconnectAttempts` to limit reconnection attempts. If set to `-1` (default), reconnection attempts are unlimited. If set to `0` or a positive number, the client will stop attempting to reconnect after that many failed attempts and will disconnect completely.

### Disconnection

Explicit disconnection occurs when calling `disconnect()` or `close()`. The client:

1. Stops the WebSocket connector
2. Clears all scheduled timeouts
3. Resets connection details to defaults
4. Resets keepalive tracking
5. Resets reconnect attempt counter
6. Transitions connection state to `NOT_CONNECTED`
7. Transitions auth state to `UNAUTHORIZED`
8. Clears the stored auth token

After disconnection, the client is in a clean state and can be connected to a new endpoint.

## 3. Authentication Flow

### Authentication Workflow

Authentication is optional and depends on server requirements. To authenticate:

1. Set an auth token using `setAuthToken()` before or after connecting
2. If set before connecting, the token is sent automatically when the connection is established
3. If set after connecting, the token is sent immediately
4. The server responds with an AUTH_STATE message indicating authorization status
5. Auth state listeners are notified of the state change

### Auth States

The client maintains an authentication state that can be queried via `getAuthState()`:

- **UNAUTHORIZED**: Initial state or when authentication failed. The client cannot use the connection for service channels until authorized.
- **AUTHORIZING**: The client has sent an AUTH message and is waiting for the server's AUTH_STATE response.
- **AUTHORIZED**: Authentication was successful. The connection is fully ready and channels can be opened.

State changes are notified to registered listeners via `addAuthStateChangeListener()`. Listeners receive both the new state and the previous state.

### Token Management

When you call `setAuthToken()`, the token is stored internally. The behavior depends on connection state:

- **If not connected**: The token is stored and will be sent automatically when `connect()` is called
- **If connected**: The token is sent immediately via an AUTH message

The stored token persists across reconnections. When the client reconnects, it automatically sends the stored token again.

If the server rejects a token (sends AUTH_STATE with `UNAUTHORIZED`), the client clears the stored token. You must call `setAuthToken()` again with a new token.

### First Auth State

The server sends an initial AUTH_STATE message during the setup phase, even if no authentication was requested. This initial message is ignored by the client (not reported to listeners) because it's part of the protocol handshake. Subsequent AUTH_STATE messages are processed normally and trigger state change notifications.

This allows the server to indicate whether authentication is required or optional without the client having to attempt authentication first.

### Token Rejection

If the server rejects a token (sends AUTH_STATE with `UNAUTHORIZED`), the client:

1. Clears the stored auth token
2. Transitions auth state to `UNAUTHORIZED`
3. Notifies auth state change listeners
4. If the connection was previously authorized, it remains in `CONNECTED` state but channels cannot be opened until re-authentication succeeds

The connection remains open, allowing you to retry authentication with a different token.

## 4. Channel Management

### Channel Creation

Channels are created by calling `openChannel()` with a service name and parameters. The client:

1. Assigns a unique channel ID (odd numbers starting from 1: 1, 3, 5, 7, ...)
2. Creates a channel instance
3. Stores the channel internally
4. If the connection is already `CONNECTED` and `AUTHORIZED`, immediately sends a CHANNEL_REQUEST message
5. Returns the channel instance

Channel IDs are assigned sequentially using odd numbers to avoid conflicts and provide a clear pattern for identification.

### Channel Lifecycle

Channels have three states:

- **REQUESTED**: The channel has been created and a CHANNEL_REQUEST message has been sent (or will be sent when connection is ready). The channel cannot send service messages yet.
- **OPENED**: The server has responded with CHANNEL_OPENED. The channel is ready to send and receive service-specific messages.
- **CLOSED**: The channel has been closed, either by calling `close()` or by receiving CHANNEL_CLOSED from the server. The channel cannot be used anymore.

State changes are notified to registered listeners via `addStateChangeListener()` on the channel instance.

### Channel Opening

When `openChannel()` is called:

- If the connection is `CONNECTED` and `AUTHORIZED`, the CHANNEL_REQUEST is sent immediately
- If the connection is not ready, the channel is created but remains in `REQUESTED` state until the connection becomes ready
- Once the connection becomes ready, all pending channels are automatically requested

This allows channels to be created before the connection is established, providing a more flexible API.

### Channel on Reconnect

When the client reconnects, all active channels (not in `CLOSED` state) are automatically re-requested. The client:

1. Transitions all active channels back to `REQUESTED` state
2. Once the connection is re-established and authorized, sends CHANNEL_REQUEST messages for all active channels
3. Channels transition back to `OPENED` when the server responds with CHANNEL_OPENED

This ensures that channel subscriptions are preserved across reconnections without requiring application code to manage channel state.

### Channel Cleanup

Channels are automatically cleaned up when:

- They are explicitly closed via `close()`
- They receive a CHANNEL_CLOSED message from the server
- They are in `CLOSED` state during reconnection (removed from internal tracking)

When a channel is closed, its message and state listeners are cleared, but error listeners remain to handle any late-arriving error messages.

## 5. Message Handling

### Message Types

Messages are categorized into two groups:

**Connection messages** (channel 0): These messages manage the connection itself:

- SETUP: Protocol negotiation
- AUTH: Authentication
- AUTH_STATE: Authentication status
- KEEPALIVE: Connection maintenance
- ERROR: Connection-level errors

**Channel messages** (channel > 0): These messages are for service channels:

- CHANNEL_REQUEST: Request to open a channel
- CHANNEL_CANCEL: Request to close a channel
- CHANNEL_OPENED: Channel opened confirmation
- CHANNEL_CLOSED: Channel closed notification
- Service-specific payload messages (e.g., FEED_SUBSCRIPTION, FEED_DATA, DOM_SETUP, DOM_SNAPSHOT)
- ERROR: Channel-level errors

### Message Flow

**Outgoing messages**: When you call channel `send()` or the client sends protocol messages internally:

1. The message is serialized to JSON
2. Sent through the connector to the WebSocket
3. Keepalive scheduling is updated

**Incoming messages**: When a message is received from the WebSocket:

1. The connector parses the JSON
2. Validates basic structure (type, channel fields)
3. Routes to the appropriate handler based on channel ID
4. Connection messages (channel 0) are handled by the client
5. Channel messages (channel > 0) are routed to the appropriate channel instance

### Channel 0

Channel 0 is the "connection channel" used for protocol-level communication. All connection management messages use this channel:

- SETUP messages
- AUTH and AUTH_STATE messages
- KEEPALIVE messages
- Connection-level ERROR messages

This channel is managed internally by the client and is not exposed in the public API.

### Service Channels

Channels with IDs greater than 0 are service channels. Each channel is isolated and handles its own messages:

- Messages are routed to channels based on the `channel` field in the message
- Channels process their own lifecycle messages (CHANNEL_OPENED, CHANNEL_CLOSED, ERROR)
- Channels deliver payload messages to registered message listeners
- If a message arrives for an unknown channel ID, it is logged as a warning and ignored

### Message Protocol

All messages are JSON objects with at minimum:

- `type`: String identifying the message type
- `channel`: Number identifying the channel (0 for connection, >0 for service channels)
- Additional fields specific to the message type

The protocol version is negotiated during the SETUP exchange. The client sends its protocol version and the server responds with its version. Both versions are stored in connection details for debugging purposes.

## 6. Protocol to API Mapping

This section describes how protocol-level operations map to the client's public API and behavior.

### Connection Establishment

**API**: `connect(url)`

**Protocol mapping**:

1. Creates a WebSocket connection via the connector
2. When transport opens, automatically sends SETUP message with:
   - Protocol version (`0.1`)
   - Client version
   - Keepalive timeout preferences
3. Waits for server SETUP response
4. Waits for server AUTH_STATE message
5. If auth token is set, sends AUTH message automatically
6. Transitions to `CONNECTED` state when ready

**What's hidden**: The SETUP message exchange, timeout handling, and protocol negotiation are all automatic. The API user only needs to call `connect()` and listen for connection state changes.

### Authentication

**API**: `setAuthToken(token)`, `getAuthState()`, `addAuthStateChangeListener()`

**Protocol mapping**:

- `setAuthToken()` stores the token and sends an AUTH message (if connected)
- Server responds with AUTH_STATE message
- Client updates internal auth state
- Auth state listeners are notified

**What's hidden**: The AUTH message format, AUTH_STATE message parsing, and the distinction between the first AUTH_STATE (during setup) and subsequent ones are handled internally.

### Channel Opening

**API**: `openChannel(service, parameters)`

**Protocol mapping**:

1. Client assigns channel ID
2. Creates channel instance
3. Sends CHANNEL_REQUEST message with service name and parameters
4. Server responds with CHANNEL_OPENED message
5. Channel transitions to OPENED state
6. Channel state listeners are notified

**What's hidden**: The CHANNEL_REQUEST message format, channel ID assignment strategy, and automatic retry on reconnect are handled internally.

### Channel Communication

**API**: Channel `send(message)`, `addMessageListener()`

**Protocol mapping**:

- `send()` serializes the message and adds the channel ID, sending it as a channel payload message
- Incoming payload messages are routed to the channel based on channel ID
- Message listeners receive the payload (without channel ID)

**What's hidden**: The channel ID is automatically added to outgoing messages and stripped from incoming messages before delivery to listeners. The JSON serialization/deserialization is handled by the connector.

### Keepalive

**API**: Not exposed (automatic)

**Protocol mapping**:

- Client automatically sends KEEPALIVE messages at configured intervals
- Client monitors for incoming messages to detect server keepalive
- If no messages received within server timeout, connection is considered lost

**What's hidden**: Keepalive is completely automatic. The API user doesn't need to manage keepalive messages or timeouts.

### Error Handling

**API**: `addErrorListener()`, Channel `addErrorListener()`

**Protocol mapping**:

- Protocol ERROR messages (channel 0) trigger client error listeners
- Protocol ERROR messages (channel > 0) trigger channel error listeners
- Error type and message are extracted from protocol message
- Errors are published to listeners

**What's hidden**: The protocol ERROR message format is abstracted. Listeners receive a simplified error object with type and message fields.

### Reconnection

**API**: `reconnect()`, automatic on connection loss

**Protocol mapping**:

- WebSocket close event triggers reconnection logic
- Client resets protocol state
- Re-establishes WebSocket connection
- Re-sends SETUP and AUTH messages
- Re-sends CHANNEL_REQUEST for all active channels

**What's hidden**: The reconnection backoff strategy, attempt counting, and automatic channel restoration are handled internally. The API user only needs to handle connection state changes.

### State Synchronization

**API**: `getConnectionState()`, `getAuthState()`, Channel `getState()`, various `add*Listener()` methods

**Protocol mapping**:

- Connection state is driven by SETUP/AUTH_STATE protocol messages
- Auth state is driven by AUTH_STATE protocol messages
- Channel state is driven by CHANNEL_OPENED/CHANNEL_CLOSED protocol messages
- State listeners are invoked when protocol messages cause state transitions

**What's hidden**: The mapping between protocol messages and state transitions is internal. The API provides a clean state machine abstraction.

### Protocol Abstraction

The client hides many protocol details from API users:

- **Message serialization**: JSON encoding/decoding is automatic
- **Channel ID management**: IDs are assigned and managed internally
- **Protocol version**: Included automatically in SETUP messages
- **Keepalive**: Completely automatic, not exposed in API
- **Timeout handling**: Internal timeouts for SETUP, AUTH_STATE, and keepalive
- **Message routing**: Automatic routing based on channel ID
- **Reconnection logic**: Automatic with configurable limits

The API focuses on high-level operations: connecting, authenticating, opening channels, sending/receiving messages, and handling errors. Protocol-level details are abstracted away.

## 7. Error Handling

### Error Sources

Errors can originate from several sources:

1. **Connection errors**: WebSocket connection failures, protocol violations, timeouts during setup
2. **Channel errors**: Service-specific errors, invalid channel operations, channel-level timeouts
3. **Timeout errors**: Keepalive timeouts, action timeouts (SETUP, AUTH_STATE)
4. **Protocol errors**: Invalid messages, unsupported protocol versions, authentication failures

### Error Types

The client uses standardized error types:

- **UNKNOWN**: Generic error that doesn't fit other categories
- **UNSUPPORTED_PROTOCOL**: Server doesn't support the client's protocol version
- **TIMEOUT**: Expected message not received within timeout period
- **UNAUTHORIZED**: Authentication failed or authorization required
- **INVALID_MESSAGE**: Message format is invalid or cannot be parsed
- **BAD_ACTION**: Protocol violation detected

### Error Propagation

Errors are reported through error listeners:

- **Client-level errors**: Registered via `addErrorListener()` on the client instance. These handle connection-level errors and protocol errors.
- **Channel-level errors**: Registered via `addErrorListener()` on channel instances. These handle service-specific errors.

When an error occurs:

1. The error is published to the appropriate listeners
2. If no listeners are registered, the error is logged but not propagated
3. Listeners are called synchronously
4. If a listener throws an exception, it's caught and logged, but doesn't prevent other listeners from being called

### Unhandled Errors

If no error listeners are registered when an error occurs:

- The error is logged at ERROR level
- The error is not propagated to application code
- The client continues operating normally

This allows the client to be used without mandatory error handling, but it's recommended to register error listeners for production applications.

### Timeout Errors

Timeout errors occur in several scenarios:

1. **SETUP timeout**: Server doesn't respond with SETUP message within `actionTimeout` seconds after transport opens
2. **AUTH_STATE timeout**: Server doesn't respond with AUTH_STATE message within `actionTimeout` seconds after transport opens
3. **Keepalive timeout**: No messages received from server within the server's keepalive timeout period

When a timeout occurs:

- A TIMEOUT error is published to error listeners
- The client attempts to reconnect (for keepalive and setup timeouts)
- For AUTH_STATE timeout, the client also attempts to reconnect

Timeout detection uses the configured `actionTimeout` for protocol actions and the server's `keepaliveTimeout` (from SETUP response) for keepalive monitoring.

## 8. Configuration and Customization

### Configuration Options

The client can be configured via `DXLinkWebSocketClientConfig` passed to the constructor:

- **keepaliveInterval**: Interval (in seconds) between keepalive messages sent to the server. Default: 30 seconds.
- **keepaliveTimeout**: Timeout (in seconds) for the server to detect client disconnection. Default: 60 seconds.
- **acceptKeepaliveTimeout**: Preferred timeout (in seconds) for the client to detect server disconnection. Default: 60 seconds.
- **actionTimeout**: Timeout (in seconds) for protocol actions requiring server response (SETUP, AUTH_STATE). Default: 10 seconds.
- **logLevel**: Logging level for internal logger. Default: WARN.
- **maxReconnectAttempts**: Maximum reconnection attempts. `-1` means unlimited (default). `0` or positive number limits attempts.
- **connectorFactory**: Factory function to create custom WebSocket connectors. Default: Creates `DefaultDXLinkWebSocketConnector`.

All configuration options are optional. If not provided, defaults are used.

### Default Behavior

With default configuration:

- Keepalive messages are sent every 30 seconds
- Server timeout is 60 seconds
- Action timeout is 10 seconds
- Reconnection attempts are unlimited
- Uses browser's native WebSocket API
- Logs at WARN level

This configuration works well for most use cases. Adjust timeouts based on your network conditions and server requirements.

### Custom Connector

You can provide a custom WebSocket connector implementation by passing a `connectorFactory` function in the configuration. This is useful for:

- Using WebSocket libraries other than the browser's native API
- Adding custom connection logic (proxies, authentication headers, etc.)
- Testing with mock WebSocket implementations
- Supporting environments without native WebSocket support

The factory function receives the WebSocket URL and must return a `DXLinkWebSocketConnector` instance.

### Connector Interface

A connector must implement the `DXLinkWebSocketConnector` interface:

- **getUrl()**: Returns the WebSocket URL
- **start()**: Initiates the WebSocket connection
- **stop()**: Closes the connection and cleans up
- **sendMessage()**: Sends a JSON-serialized message
- **setOpenListener()**: Registers callback for connection open
- **setCloseListener()**: Registers callback for connection close (with reason and error flag)
- **setMessageListener()**: Registers callback for incoming messages

The connector is responsible for:

- Managing the WebSocket connection lifecycle
- Serializing/deserializing JSON messages
- Handling WebSocket events and converting them to connector callbacks
- Validating incoming message structure (basic validation)

The default connector (`DefaultDXLinkWebSocketConnector`) uses the browser's `WebSocket` API and handles JSON serialization automatically.

## 9. Usage Patterns

### Basic Usage

The typical workflow for using the client:

```typescript
// Create client instance
const client = new DXLinkWebSocketClient()

// Listen for connection state changes
client.addConnectionStateChangeListener((state, prev) => {
  console.log(`Connection: ${prev} -> ${state}`)
})

// Connect to server
client.connect('wss://demo.dxfeed.com/dxlink-ws')

// Open a channel when connected
client.addConnectionStateChangeListener((state) => {
  if (state === DXLinkConnectionState.CONNECTED) {
    const channel = client.openChannel('FEED', { contract: 'AUTO' })

    // Listen for channel state changes
    channel.addStateChangeListener((state) => {
      if (state === DXLinkChannelState.OPENED) {
        // Channel is ready to use
      }
    })

    // Listen for messages
    channel.addMessageListener((message) => {
      console.log('Received:', message)
    })
  }
})
```

### With Authentication

When authentication is required:

```typescript
const client = new DXLinkWebSocketClient()

// Set token before or after connecting
client.setAuthToken('your-auth-token')

// Listen for auth state changes
client.addAuthStateChangeListener((state, prev) => {
  if (state === DXLinkAuthState.AUTHORIZED) {
    // Now channels can be opened
  } else if (state === DXLinkAuthState.UNAUTHORIZED) {
    // Authentication failed, may need to refresh token
  }
})

client.connect('wss://demo.dxfeed.com/dxlink-ws')
```

### Channel Management

Best practices for managing channels:

```typescript
// Create channels early (before connection is ready)
const feedChannel = client.openChannel('FEED', { contract: 'AUTO' })
const domChannel = client.openChannel('DOM', { symbol: 'AAPL', sources: ['ntv'] })

// Channels will be requested automatically when connection is ready
// Listen for state changes to know when channels are ready
feedChannel.addStateChangeListener((state) => {
  if (state === DXLinkChannelState.OPENED) {
    // Channel is ready, can send messages
    feedChannel.send({
      type: 'FEED_SUBSCRIPTION',
      add: [{ type: 'Quote', symbol: 'AAPL' }],
    })
  }
})

// Clean up channels when done
feedChannel.close()
```

### Error Handling

How to handle errors in your application:

```typescript
const client = new DXLinkWebSocketClient()

// Handle connection-level errors
client.addErrorListener((error) => {
  console.error('Connection error:', error.type, error.message)

  if (error.type === 'UNAUTHORIZED') {
    // May need to refresh auth token
  } else if (error.type === 'TIMEOUT') {
    // Connection may be slow or lost
  }
})

// Handle channel-level errors
const channel = client.openChannel('FEED', { contract: 'AUTO' })
channel.addErrorListener((error) => {
  console.error('Channel error:', error.type, error.message)
})
```

### Reconnection Handling

The client handles reconnection automatically, but you may want to react to reconnection events:

```typescript
const client = new DXLinkWebSocketClient({
  maxReconnectAttempts: 10, // Limit reconnection attempts
})

let reconnectCount = 0

client.addConnectionStateChangeListener((state, prev) => {
  if (state === DXLinkConnectionState.CONNECTING && prev === DXLinkConnectionState.CONNECTED) {
    // Reconnection in progress
    reconnectCount++
    console.log(`Reconnecting (attempt ${reconnectCount})...`)
  } else if (
    state === DXLinkConnectionState.CONNECTED &&
    prev === DXLinkConnectionState.CONNECTING
  ) {
    // Reconnected successfully
    console.log('Reconnected!')
    reconnectCount = 0
  }
})
```

### Custom Connector

When to use a custom connector:

```typescript
// Example: Custom connector with additional headers
const customConnectorFactory = (url: string) => {
  // This is a conceptual example - actual implementation depends on WebSocket library
  return new CustomWebSocketConnector(url, {
    headers: {
      'X-Custom-Header': 'value',
    },
  })
}

const client = new DXLinkWebSocketClient({
  connectorFactory: customConnectorFactory,
})
```

Use custom connectors when you need:

- Custom WebSocket libraries (e.g., for Node.js environments)
- Additional connection parameters (headers, protocols)
- Mock implementations for testing
- Connection middleware or proxies

## 10. Development Guidelines

### Extending the Client

The client is designed to be extended through configuration rather than inheritance. Key extension points:

1. **Custom connectors**: Implement `DXLinkWebSocketConnector` for custom transport layers
2. **Configuration**: Adjust timeouts, reconnection behavior, and logging
3. **Event listeners**: React to state changes and errors through the listener API

The client class itself is not designed for inheritance. Instead, compose the client with your own wrapper if you need additional functionality.

### Implementing Connectors

To implement a custom connector:

1. Implement the `DXLinkWebSocketConnector` interface
2. Handle WebSocket connection lifecycle in `start()` and `stop()`
3. Convert WebSocket events to connector callbacks
4. Serialize messages to JSON in `sendMessage()`
5. Parse JSON and validate structure in message handler
6. Call the appropriate listeners when events occur

The connector should handle:

- Connection state management
- Message serialization/deserialization
- Basic message validation (type, channel fields)
- Error handling and conversion to close events

See `DefaultDXLinkWebSocketConnector` for a reference implementation.

### Testing Considerations

Important behaviors to test:

1. **Connection lifecycle**: Connect, disconnect, reconnect scenarios
2. **State transitions**: Verify state listeners are called correctly
3. **Authentication**: Token setting, rejection, re-authentication
4. **Channel management**: Opening, closing, reconnection behavior
5. **Error handling**: Various error types and propagation
6. **Timeout scenarios**: SETUP timeout, AUTH_STATE timeout, keepalive timeout
7. **Message routing**: Correct routing to channels based on channel ID
8. **Reconnection**: Channel restoration after reconnection

Use a mock connector for testing to control WebSocket behavior and simulate various scenarios.

### Integration Points

The client integrates with other dxLink packages:

- **@dxfeed/dxlink-core**: Implements `DXLinkClient` and `DXLinkChannel` interfaces, uses core types and enums
- **@dxfeed/dxlink-feed**: Uses the client to open FEED service channels
- **@dxfeed/dxlink-dom**: Uses the client to open DOM service channels
- **@dxfeed/dxlink-indichart**: Uses the client to open IndiChart service channels

The client provides the transport layer, while service-specific packages provide higher-level APIs for working with specific services. This separation allows the WebSocket client to be protocol-focused while service packages handle service-specific logic.
