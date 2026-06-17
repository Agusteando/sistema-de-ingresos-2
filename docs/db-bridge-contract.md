# DB Bridge contract 2.2

Aurora talks to the HTTP relay. The relay forwards each request to the plantel agent over WebSocket.

## HTTP requests from Aurora

Aurora preserves the established relay body shapes:

```json
{ "sql": "SELECT 1", "params": [] }
```

```json
{ "statements": [{ "sql": "UPDATE ...", "params": [] }] }
```

Aurora also sends these headers when available:

- `X-Aurora-Request-Id`
- `X-DB-Bridge-Protocol: 2.2`

## WebSocket requests accepted by the agent

The agent accepts both legacy and current relay envelopes:

```json
{ "id": "...", "type": "query", "payload": { "sql": "SELECT 1", "params": [] } }
```

```json
{ "id": "...", "type": "query", "sql": "SELECT 1", "params": [] }
```

The same rule applies to `transaction` and `statements`.

## Agent responses

During the migration period the agent returns both representations in one response:

```json
{
  "id": "...",
  "ok": true,
  "protocolVersion": "2.2",
  "agentId": "GM",
  "rows": [{ "online": 1 }],
  "fields": [],
  "result": {
    "rows": [{ "online": 1 }],
    "fields": []
  }
}
```

Transactions expose `results` both at the root and inside `result`.

Aurora accepts flat, nested, double-wrapped, and `data`-wrapped relay responses. It does not depend on the relay flattening the agent result.

## Diagnostics

Agent requests emit two compact lines with the same request ID:

```text
[BridgeRequest] {"phase":"start",...}
[BridgeRequest] {"phase":"finish","ok":true,"ms":12,"rows":4,...}
```

Errors include `code`, duration, agent, operation, and response size without logging SQL values or credentials.

Aurora preserves non-JSON relay error bodies and emits them in the bounded `upstreamBody` diagnostic field together with `upstreamRequestId`, `upstreamStatus`, plantel, and agent.
