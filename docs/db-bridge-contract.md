# Contrato DB Bridge 3.0

Aurora sends the established flat HTTP query/transaction bodies to the relay and accepts flat, nested, and legacy result envelopes. Correlation uses `X-Aurora-Request-Id` and `X-DB-Relay-Request-Id`.

Agent/MySQL errors retain their original code. `ER_NO_SUCH_TABLE` and `ER_BAD_FIELD_ERROR` trigger one coalesced schema repair per agent and one retry; healthy requests do not execute migrations.
