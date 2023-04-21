It's an **alpha** version and still under active development. **Do not use it in a production environment.**

The protocol **will change** (not conceptually).

---

This protocol is based on simple JS types: _boolean_, _number_, _string_, _array_ and _key-value object_.

Protocol design has no client and server roles. But in most cases client is who initiated the connection.

- [Messages and channels](#messages-and-channels)
  - [ERROR](#error)
  - [AUTH](#auth)
  - [AUTH_STATE](#auth_state)
  - [SETUP](#setup)
  - [KEEPALIVE](#keepalive)
  - [CHANNEL_OPEN](#channel_open)
  - [CHANNEL_STATE](#channel_state)
  - [CHANNEL_CLOSE](#channel_close)
  - [CHANNEL_SETUP](#channel_setup)
  - [CHANNEL_CONFIG](#channel_config)
  - [CHANNEL_SUBSCRIBE](#channel_subscribe)
  - [CHANNEL_DATA](#channel_data)
- [Examples](#examples)

## Messages and channels

Communication is based on messages in channels.

Channels are isolated connections within a single WebSocket connection.  
Channel with number `0` is used for socket messages.

Every message is an object with keys:

- `type` - message discriminator.
- `channel` - _optional_ identifier within which channel the communication is occurring.

```json
{
  "type": "MESSAGE_TYPE", // Message type
  "channel": 0 // channel number
}
```

Possible types:

- [`ERROR`](#error)
- [`AUTH`](#auth)
- [`AUTH_STATE`](#auth-state)
- [`SETUP`](#setup)
- [`KEEPALIVE`](#keepalive)
- [`CHANNEL_OPEN`](#channel-open)
- [`CHANNEL_STATE`](#channel-state)
- [`CHANNEL_CLOSE`](#channel-close)
- [`CHANNEL_SETUP`](#channel-setup)
- [`CHANNEL_CONFIG`](#channel-config)
- [`CHANNEL_SUBSCRIBE`](#channel-subscribe)
- [`CHANNEL_DATA`](#channel-data)

If client received _unknown_ type, should skip this message and continue communication.

In most cases client sends [`AUTH`](#auth) and then [`SETUP`](#setup) to establish connection. If client doesn't do this within a certain period of time, server may disconnect client.

Both sides may send [`SETUP`](#setup), [`KEEPALIVE`](#keepalive), [`ERROR`](#error) messages to each other.

### ERROR

Error message contains error description and error type.

```json
{
  "type": "ERROR",
  "channel": 0,
  "error": "ERROR_TYPE",
  "message": "Error message contains description or reason"
}
```

Possble error types:

- `UNAUTHORIZED` - sent token doesn’t pass authorization.
- `TIMEOUT` - timeout was reached.
- `INVALID_MESSAGE` - message is not valid.
- `BAD_ACTION` - wrong sender behaviour.
- `UNKNOWN` - unknown error type (internal error and etc).

Error message don't suggest an action and are only needed for logging and figure out what's going wrong.

### AUTH

After connection was started some client should send this message to other to be authorized.

```json
{
  "type": "AUTH",
  "channel": 0,
  "token": "123#token"
}
```

`token` must be a string. On invalid token data receiver may send `UNAUTHORIZED` error and close connection.

In most cases client will initiate connection, so client will send `AUTH` and server will response with `AUTH_STATE`.

### AUTH_STATE

Informs receiver of the authorized state:

- `state` - authorization state. Possible values:
  - `AUTHORIZED`
  - `UNAUTHORIZED`
- `userId` - _optional_ user identifier.

```json
{
  "type": "AUTH_STATE",
  "state": "AUTHORIZED",
  "userId": "123"
}
```

In most cases sender will send `AUTH_STATE` message to receiver after received `AUTH` message.

### SETUP

Sender sets his own params and specifies the acceptable parameters for other:

- `keepaliveTimeout` - time to disconnect the sender if no messages are received (in seconds).
- `acceptKeepaliveTimeout` - _optional_ acceptable time to disconnect the receiver if no messages are received (in seconds).

```json
{
  "type": "SETUP",
  "keepaliveTimeout": 60, // in seconds
  "acceptKeepaliveTimeout": 60 // in seconds
}
```

Receiver should check `acceptKeepaliveTimeout`. If timeout satisfies, apply it (send back `SETUP` with specified timeout), otherwise use own one.

Receiver should use `keepaliveTimeout` to disconnect sender when timeout time exceed.

In most cases client will initiate connection, so client should send `SETUP` after a succesful authorization.

Both sides should send this message to each other to establish connection properly.

### KEEPALIVE

Sender should send this message to keep the connection alive if there is no other messages from itself.

```json
{
  "type": "KEEPALIVE",
  "channel": 0
}
```

If sender doesn't send any messages within the time specified in `SETUP` message, receiver may disconnect sender.

Frequency of `KEEPALIVE` messages should be less than `keepaliveTimeout` of sender.
Due to network delays we suggest to send `keepaliveTimeout / 2`. For example: with `keepaliveTimeout: 60` sender should send messages every 30 seconds.

### CHANNEL_OPEN

This message is a request for a new channel:

- `service` - operated service (only `FEED` at the moment).
- `contract` - subscription contract of service `FEED`. Possible values:
  - `HISTORY` - history.
  - `TICKER` - ticker.
  - `STREAM` - stream.
  - `AUTO` - automatic contract selection for subscription.
- `subFormat` - _optional_, type of subscription (by default `LIST`).
  - `LIST` - plain list of subscriptions.
- `space` - _optional_, space of data feed.

```json
{
  "type": "CHANNEL_OPEN",
  "channel": 1, // new channel id
  "service": "FEED",
  "contract": "HISTORY",
  "subFormat": "LIST",
  "space": "OPRA"
}
```

Sender should use a unique `channel` number (within one connection) to avoid invalid behaviour.

Reciver should answer `CHANNEL_STATE` message with the state of the channel.

### CHANNEL_STATE

This message notifies receiver of the current state of the channel.

Possible values of `state`:

- `OPEN` - channel is open.
- `CLOSED` - channel is closed.

Other field are similar to `CHANNEL_OPEN` message.

```json
{
  "type": "CHANNEL_STATE",
  "channel": 1,
  "state": "OPEN",
  "service": "FEED",
  "contract": "HISTORY",
  "subFormat": "LIST"
}
```

Receiver should use this message to update the channel state.

### CHANNEL_CLOSE

This message is a request to close the channel.

```json
{
  "type": "CHANNEL_CLOSE",
  "channel": 1
}
```

Sender must use a `channel` number of the opened channel.

Reciver should answer [`CHANNEL_STATE`](#channel-state) message with the state of channel.

### CHANNEL_SETUP

Sender asks for acceptable channel parameters:

- `acceptAggregationPeriod` - _optional_ aggregation period of events in seconds.
- `acceptEventFields` - _optional_ object where keys are event types and values are an array of event fields.
- `acceptDataFormat` - _optional_ format of data events (by default `JSON_FULL`). Possible values are:
  - `JSON_FULL` - key-value objects.
  - `JSON_COMPACT` - value only arrays.

```json
{
  "type": "CHANNEL_SETUP",
  "channel": 1,
  "acceptAggregationPeriod": 1,
  "acceptEventFields": {
    "Quote": ["eventSymbol", "askPrice", "bidPrice"]
  },
  "acceptDataFormat": "JSON_FULL"
}
```

### CHANNEL_CONFIG

This message notifies receiver of the current configuration of the channel:

- `aggregationPeriod` - applied aggregation period in seconds, _must_ presented.
- `dataFormat` - structure as in [CHANNEL_SETUP#acceptDataFormat](#channel-setup), _must_ presented.
- `eventFields` - structure as in [CHANNEL_SETUP#acceptEventFields](#channel-setup), _may_ presented.

```json
{
  "type": "CHANNEL_CONFIG",
  "channel": 1,
  "aggregationPeriod": 5,
  "eventFields": {
    "Quote": ["eventSymbol", "eventType", "askPrice", "bidPrice"]
  },
  "dataFormat": "JSON_FULL"
}
```

Receiver should use this message to update the channel config.
Sender should send this message with `eventFields` before first `CHANNEL_DATA` message by following `eventType` of sending data.
Sender should send this message with `eventFields` each time when it has been changed by `CHANNEL_SETUP` or server configuration.

### CHANNEL_SUBSCRIBE

This is a message to manage subscriptions in the channel:

- `add` - _optional_ list to add subscriptions.
- `remove` - _optional_ list to remove subscriptions.

```json
{
  "type": "CHANNEL_SUBSCRIBE",
  "channel": 1,
  "add": [{ "type": "Quote", "symbol": "AAPL" }],
  "remove": [{ "type": "Quote", "symbol": "AMZN" }]
}
```

Receiver should check the object of the subscription in accordance with the channel contract and send error [`INVALID_MESSAGE`](#error) if invalid.

There are several types of subscription:

**1. Regular subscription**

This type of subscription is used in a channel with `TICKER`, `STREAM` or `AUTO` contract.

- `type` - type of market data event. Possible values you can find [here](#TODO).
- `symbol` - instrument name. Details [here](https://downloads.dxfeed.com/specifications/dxFeed-Symbol-Guide.pdf).

```json
{
  "type": "Quote",
  "symbol": "AAPL"
}
```

```json
{
  "type": "Quote",
  "symbol": "AAPL&Q"
}
```

**2. Order-book subscription**

This type of subscription is used in a channel with `HISTORY` or `AUTO` contract. Basic fields similar to regular subscription:

- `source` - source of the feed. Possible values [here](https://kb.dxfeed.com/en/data-model/qd-model-of-market-events.html#order-x).

```json
{
  "type": "Order",
  "symbol": "AAPL",
  "source": "NTV"
}
```

**3. TimeSeries subscription**

This type of subscription is used in a channel with `HISTORY` or `AUTO` contract. Basic fields similar to regular subscription:

- `fromTime` - timestamp (U time) from when we want the data.
  - on add, new `fromTime` with pair `type` and `symbol` will overwrite previous subscription.
  - on remove, `fromTime` value is ignored but **mandatory**, pair `type` and `symbol` will remove previous subscription.

```json
{
  "type": "Candle",
  "symbol": "AAPL{=d}",
  "fromTime": 0
}
```

```json
{
  "type": "Candle",
  "symbol": "AAPL&Q{=d}",
  "fromTime": 0
}
```

### CHANNEL_DATA

This is a message about new data in the channel:

- `data` - data output.

Example for `JSON_FULL` data format:

```json
{
  "type": "CHANNEL_DATA",
  "channel": 1,
  "data": [
    {
      "eventSymbol": "AAPL",
      "eventType": "Quote",
      "askPrice": 123,
      "bidPrice": 123
    },
    {
      "eventSymbol": "AAPL",
      "eventType": "Quote",
      "askPrice": 321,
      "bidPrice": 321
    }
  ]
}
```

Example for `JSON_COMPACT` data format:

```json
{
  "type": "CHANNEL_DATA",
  "channel": 1,
  "data": [
    "Quote",
    ["AAPL", "Quote", 123, 123, "AAPL", "Quote", 321, 321],
    "Candle",
    ["AAPL", "Candle", 123, 123],
    "Quote",
    ["AAPL", "Quote", 123, 123]
  ]
}
```

## Examples

For better understanding we have divided the examples into phases.
Client is the one who opened the socket.

### Phase - connection establishment

Without this, connection won't be considered operational.

```json
CONNECTED
CLIENT > { "type": "AUTH", "token": "token#123" }
SERVER < {
    "type": "AUTH_STATE",
    "state": "AUTHORIZED",
    "userId": "123"
}
CLIENT > {
  "type": "SETUP",
  "acceptKeepaliveTimeout": 60,
  "keepaliveTimeout": 60
}
SERVER < {
  "type": "SETUP",
  "acceptKeepaliveTimeout": 60,
  "keepaliveTimeout": 60
}
```

### Phase - connection keepalive

Needed to keep the connection if there are no outgoing messages.

```json
CLIENT > { "type": "KEEPALIVE" }
SERVER < { "type": "KEEPALIVE" }
```

### Phase - channel management

Channels can be managed after the connection has been established.

#### Open channel

```json
CLIENT > {
  "type": "CHANNEL_OPEN",
  "channel": 1,
  "service": "FEED",
  "contract": "TICKER"
}
SERVER < {
  "type": "CHANNEL_STATE",
  "channel": 1,
  "state": "OPEN",
  "service": "FEED",
  "contract": "TICKER"
}
```

#### Close channel

```json
CLIENT > {
  "type": "CHANNEL_CLOSE",
  "channel": 1
}
SERVER < {
  "type": "CHANNEL_STATE",
  "channel": 1,
  "state": "CLOSED",
  "service": "FEED",
  "contract": "TICKER"
}
```

### Phase - Setting Feed channel config

Channel can only be configured after it has been opened.
Params are askable and may not be applied by the server.

```json
CLIENT > {
  "type": "CHANNEL_SETUP",
  "channel": 1,
  "acceptDataFormat": "JSON_FULL",
  "acceptAggregationPeriod": 1,
  "acceptEventFields": {
    "Quote": ["eventSymbol", "eventType", "askPrice", "bidPrice"]
  },
  "acceptDataFormat": "JSON_FULL"
}
SERVER < {
  "type": "CHANNEL_CONFIG",
  "channel": 1,
  "aggregationPeriod": 5
}
```

Server will notify with config only after it has been applied, see phase [subscription management](#phase---subscription-management).

### Phase - Subscription management

Server sends `CHANNEL_CONFIG` with applied params to subscription, but only sends it in first time or when params are changed.

#### Ticker channel with subscription

```json
CLIENT > {
  "type": "CHANNEL_SUBSCRIBE",
  "channel": 1,
  "add": [{ "type": "Quote", "symbol": "AAPL" }]
}
SERVER < {
  "type": "CHANNEL_CONFIG",
  "channel": 1,
  "aggregationPeriod": 5,
  "eventFields": {
    "Quote": ["eventSymbol", "eventType", "askPrice", "bidPrice"]
  },
  "dataFormat": "JSON_FULL"
}
SERVER <
{
  "type": "CHANNEL_DATA",
  "channel": 1,
  "data": [
    {
      "eventSymbol": "AAPL",
      "eventType": "Quote",
      "askPrice": 123,
      "bidPrice": 123
    }
  ]
}
```

#### History channel with subscription

```json
CLIENT > {
  "type": "CHANNEL_SUBSCRIBE",
  "channel": 1,
  "add": [{ "type": "Candle", "symbol": "AAPL{=1D}", "fromTime": 0 }]
}
SERVER < {
  "type": "CHANNEL_CONFIG",
  "channel": 1,
  "aggregationPeriod": 5,
  "eventFields": {
    "Candle": ["eventSymbol", "eventType", "eventFlags", "open", "close"]
  },
  "dataFormat": "JSON_FULL"
}
SERVER <
{
  "type": "CHANNEL_DATA",
  "channel": 1,
  "data": [
    {
      "eventSymbol": "AAPL{=1D}",
      "eventType": "Candle",
      "eventFlags": 0,
      "open": 123.0,
      "close": 123.0
    }
  ]
}
```

### Error handling

### Invalid auth token

```json
CLIENT > {
  "type": "AUTH"
  "token": "ivalid#token"
}
SERVER < {
  "type": "ERROR",
  "channel": 0,
  "errror": "UNAUTHORIZED",
  "message" "..."
}
DISCONNECTED
```

#### Invalid message

```json
CLIENT > {
  "type": "UNKNOWN_TYPE"
}
SERVER < {
  "type": "ERROR",
  "channel": 0,
  "errror": "INVALID_MESSAGE",
  "message" "..."
}
```

#### Wrong behaviour

```json
CLIENT > {
  "type": "CHANNEL_OPEN",
  "channel": -1,
  "service": "FEED",
  "contract": "TICKER"
}
SERVER < {
  "type": "ERROR",
  "channel": 0,
  "errror": "BAD_ACTION",
  "message" "...non-existent channel..."
}
```

#### Timeout

```json
CLIENT > {
  "type": "SETUP",
  "keepaliveTimeout": 60,
  "acceptKeepaliveTimeout": 60
}

NO MESSAGES FOR 60 SECONDS

SERVER < {
  "type": "ERROR",
  "channel": 0,
  "errror": "TIMEOUT",
  "message" "..."
}
```

### Advanced cases

### First setup after subscribe

```json
CLIENT > {
  "type": "CHANNEL_OPEN",
  "channel": 1,
  "service": "FEED",
  "contract": "TICKER"
}
SERVER < {
  "type": "CHANNEL_STATE",
  "channel": 1,
  "state": "OPEN",
  "service": "FEED",
  "contract": "TICKER"
}

CLIENT > {
  "type": "CHANNEL_SUBSCRIBE",
  "channel": 1,
  "add": [{ "type": "Quote", "symbol": "AAPL" }]
}
SERVER < {
  "type": "CHANNEL_CONFIG",
  "channel": 1,
  "aggregationPeriod": 5,
  "eventFields": {
    "Quote": [...]
  },
  "dataFormat": "JSON_FULL"
}
SERVER < {
  "type": "CHANNEL_DATA",
  "channel": 1,
  "data": [
    {
      "eventSymbol": "AAPL",
      "eventType": "Quote",
       ... other fields ...
    }
  ]
}

CLIENT > {
  "type": "CHANNEL_SETUP",
  "channel": 1,
  "acceptEventFields": {
    "Quote": ["eventSymbol"]
  }
}
SERVER < {
  "type": "CHANNEL_CONFIG",
  "channel": 1,
  "aggregationPeriod": 5,
  "eventFields": {
    "Quote": ["eventSymbol"]
  },
  "dataFormat": "JSON_FULL"
}
SERVER < {
  "type": "CHANNEL_DATA",
  "channel": 1,
  "data": [
    {
      "eventSymbol": "AAPL"
    }
  ]
}
```

#### Multiple setups in sigle channel after subscribe

```json
CLIENT > {
  "type": "CHANNEL_OPEN",
  "channel": 1,
  "service": "FEED",
  "contract": "TICKER"
}
SERVER < {
  "type": "CHANNEL_STATE",
  "channel": 1,
  "state": "OPEN",
  "service": "FEED",
  "contract": "TICKER"
}

CLIENT > {
  "type": "CHANNEL_SETUP",
  "channel": 1,
  "acceptDataFormat": "JSON_FULL",
  "acceptAggregationPeriod": 1,
  "acceptEventFields": {
    "Quote": ["eventSymbol", "eventType", "askPrice", "bidPrice"]
  }
}
SERVER < {
  "type": "CHANNEL_CONFIG",
  "channel": 1,
  "aggregationPeriod": 5,
  "dataFormat": "JSON_FULL"
}

CLIENT > {
  "type": "CHANNEL_SUBSCRIBE",
  "channel": 1,
  "add": [{ "type": "Quote", "symbol": "AAPL" }]
}
SERVER < {
  "type": "CHANNEL_CONFIG",
  "channel": 1,
  "aggregationPeriod": 5,
  "dataFormat": "JSON_FULL",
  "eventFields": {
    "Quote": ["eventSymbol", "eventType", "askPrice", "bidPrice"]
  }
}
SERVER < {
  "type": "CHANNEL_DATA",
  "channel": 1,
  "data": [
    {
      "eventSymbol": "AAPL",
      "eventType": "Quote",
      "askPrice": 123,
      "bidPrice": 123
    }
  ]
}

CLIENT > {
  "type": "CHANNEL_SETUP",
  "channel": 1,
  "acceptEventFields": {
    "Quote": ["eventSymbol"]
  }
}
SERVER < {
  "type": "CHANNEL_CONFIG",
  "channel": 1,
  "aggregationPeriod": 5,
  "dataFormat": "JSON_FULL",
  "eventFields": {
    "Quote": ["eventSymbol"]
  }
}
SERVER < {
  "type": "CHANNEL_DATA",
  "channel": 1,
  "data": [
    {
      "eventSymbol": "AAPL"
    }
  ]
}
```

#### Multiple setups in single channel without subscribe

```json
CLIENT > {
  "type": "CHANNEL_OPEN",
  "channel": 1,
  "service": "FEED",
  "contract": "TICKER"
}
SERVER < {
  "type": "CHANNEL_STATE",
  "channel": 1,
  "state": "OPEN",
  "service": "FEED",
  "contract": "TICKER"
}

CLIENT > {
  "type": "CHANNEL_SETUP",
  "channel": 1,
  "acceptDataFormat": "JSON_FULL",
  "acceptAggregationPeriod": 1,
  "acceptEventFields": {
    "Quote": ["eventSymbol", "eventType", "askPrice", "bidPrice"]
  },
  "acceptDataFormat": "JSON_FULL"
}
SERVER < {
  "type": "CHANNEL_CONFIG",
  "channel": 1,
  "aggregationPeriod": 5,
  "dataFormat": "JSON_FULL"
}

CLIENT > {
  "type": "CHANNEL_SETUP",
  "channel": 1,
  "acceptEventFields": {
    "Quote": ["eventSymbol"]
  }
}
SERVER < {
  "type": "CHANNEL_CONFIG",
  "channel": 1,
  "aggregationPeriod": 5,
  "dataFormat": "JSON_FULL"
}
```
