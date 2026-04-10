# Polymarket CLOB API Reference

## REST Endpoints

Base URL: `https://clob.polymarket.com`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/markets` | List all active markets |
| GET | `/markets/{condition_id}` | Get a single market by condition ID |
| GET | `/prices` | Get current prices for markets |
| POST | `/orders` | Place an order (requires L1/L2 auth headers) |
| DELETE | `/orders/{order_id}` | Cancel an order |
| GET | `/trades` | Get recent trades, filterable by market |
| GET | `/positions` | Get positions for an address |

## WebSocket Feed

URL: `wss://ws-subscriptions-clob.polymarket.com/ws/market`

### Subscribing

Send after connection opens:
```json
{
  "type": "subscribe",
  "channel": "trades",
  "assets_id": "<condition_id>"
}
```

### Trade Event Shape

```json
{
  "event_type": "trade",
  "asset_id": "0x...",
  "market": "<condition_id>",
  "side": "BUY" | "SELL",
  "price": "0.65",
  "size": "100.0",
  "outcome": "Yes" | "No",
  "timestamp": "2026-04-10T12:00:00Z",
  "transaction_hash": "0x...",
  "maker_address": "0x...",
  "taker_address": "0x..."
}
```

### Connection Behavior
- Server sends periodic ping frames; respond with pong to stay alive
- If no message received in 30s, assume disconnect and reconnect
- Implement exponential backoff: start at `wsReconnectIntervalMs`, cap at `wsMaxRetries`

## Authentication (ethers.js L1/L2 Signing)

Polymarket uses a two-layer auth model:
1. **L1 Auth** — Standard Ethereum signature (EIP-712) using the wallet's private key via `ethers.Wallet.signTypedData()`
2. **L2 Auth** — API key derived from L1 signature, used as `POLY_API_KEY` / `POLY_API_SECRET` / `POLY_PASSPHRASE` headers

Headers required on authenticated endpoints:
```
POLY_ADDRESS: <wallet_address>
POLY_SIGNATURE: <eip712_signature>
POLY_TIMESTAMP: <unix_timestamp>
POLY_NONCE: <incrementing_nonce>
```

**Important**: Auth is only needed for placing/canceling orders. Reading trades, markets, and prices is unauthenticated.

## Rate Limits

- REST: 100 requests/minute per IP for unauthenticated, 300/minute for authenticated
- WebSocket: No explicit message rate limit, but subscribing to >50 markets per connection may cause dropped messages — use multiple connections if needed
- Order placement: 10 orders/second per API key

## Usage Rules for This Project

- Always normalize `"BUY"`/`"SELL"` to lowercase `"buy"`/`"sell"` in trade-parser.ts
- Always normalize `"Yes"`/`"No"` to lowercase `"yes"`/`"no"` in trade-parser.ts
- Parse `price` and `size` from strings to numbers in trade-parser.ts
- Use `taker_address` to match against watched wallet addresses
- The `transaction_hash` maps to `sourceHash` in our Trade interface
