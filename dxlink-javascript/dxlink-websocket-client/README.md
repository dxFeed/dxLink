# @dxfeed/dxlink-websocket-client

Client implementation for the dxLink WebSocket transport protocol.

## Install

```bash
npm install @dxfeed/dxlink-websocket-client
```

## Usage

Import library into your project.

```typescript
import { DXLinkWebSocket } from '@dxfeed/dxlink-websocket-client'
```

### Client

Create instance of the client.

```typescript
const client = new DXLinkWebSocketClient()
```

Connect to the server.

```typescript
client.connect('wss://demo.dxfeed.com/dxlink-ws')
```

Provide auth token if required by the server.

```typescript
client.setAuthToken(token)
```

### Channels

Open isolated channel to service within single connection.

```typescript
const channel = await client.openChannel('FEED', {
  contract: 'AUTO',
})
```

Send message to the channel.

```typescript
channel.send({
  type: 'FEED_SUBSCRIPTION',
  add: [
    {
      type: 'Quote',
      symbol: 'AAPL',
    },
  ],
})
```

Add subscription to the channel.

```typescript
const sub1 = {
  type: 'Quote',
  symbol: 'AAPL',
}

channel.subscription({
  add: [sub1],
})
```

Remove subscription from the channel.

```typescript
channel.subscription({
  remove: [sub1],
})
```

Receive messages from the channel.

```typescript
channel.addMessageListener((message) => {
  if (message.type === 'FEED_DATA') {
    console.log(message.data)
  }
})
```
