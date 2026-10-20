# Automatic historical recovery

Aurora already queries Loki automatically when field history opens. Exact structured changes and event identifiers can enrich the ledger; interleaved console lines without values cannot reconstruct a before/after pair safely. The MM collector complements that source with committed MySQL row images, across all students and approved editable columns.

## Contract and deployment order

Deploy Aurora first, then migration-monitor. Aurora advertises protocol 1 through `/app/scripts/audit-recovery-service.mjs --describe`. An older Aurora generation causes MM to wait. Aurora receives neither root credentials nor the Podman socket. No server setting, grant or original student/audit row is changed.

MM discovers Aurora's managed running container and actual central schema/column ordinals. Every minute it reads the retained binlog inventory through its existing administrative read channel and streams fixed source files through the checksum-verified, pinned MySQL reader. Each file must finish successfully, retain its source identity, and pass the raw DDL guard before any extracted record is captured. The collector traverses newest to oldest, four files per tick, with durable checkpoints and private verified spools in MM's existing persistent `/data` volume.

Aurora first captures verified records in a durable operational inbox (`audit_recovery_pending`). After the inventory is captured, it retries projection in batches of 1,000. This prevents an early, incomplete scan from falsely treating two same-second writes as one. Applied inbox records retain their provenance. A failed student does not block other queued students; retries survive source-log expiration. Source UUID, normalized file preamble, position, primary key and field identify a record. Repeated sweeps do not append duplicate changes.

Original audit events remain immutable. Separate recovery rows supply the exact before/after images to the existing projection. A unique student/field/second observation may retain its recorded account. Multiple source writes in that second remain unattributed unless a detailed original already verifies the specific transition. Binlogs establish a committed database mutation; they do not independently establish a physical person's identity. Null and empty remain distinct.

The open field drawer refreshes stored changes every 20 seconds while visible, preserving its field/student scope, selected date, loaded history and scroll. No new explanatory UI copy or font/layout change is introduced.

## Coverage and operation

Both audit read endpoints return `recovery` coverage. MM exposes its authenticated `GET /api/audit-recovery/status`. `caught-up` means the inventory snapshot was captured and the queue drained, not that all historical time exists. `retention-gap`, pending count, timestamps and error codes preserve uncertainty. These are operational metadata, not student-facing implementation labels.

Required source: MySQL 8.4.11, ROW/FULL, CRC32, unencrypted retained logs; MM's existing database container and persistent volume. DDL affecting `matricula` stops recovery at that boundary (`AUDIT_SCHEMA_HISTORY_REQUIRED`) rather than applying today's ordinals to an older schema. Expired logs, missing images and ambiguous actors cannot be invented. Files already captured in the durable inbox remain retryable after expiration.

Set `AUDIT_RECOVERY_ENABLED=false` in MM to pause the collector. Original writes and history reads continue. Removing the collector leaves recovery evidence and the inbox intact. Do not truncate audit rows or import a selected student bundle as a deployment step.

## Verification

Aurora's audit workflow runs the service/queue/importer tests against a real MySQL 8.4 service, including original-row immutability, idempotent replay, two same-second writes, projection and status isolation. MM tests exercise the official reader with executable binary fixtures, CRC corruption, actual subprocess cancellation, raw qualified DDL, checkpoint failure, verified-spool replay and tampering. Fixtures are synthetic or explicitly preserved regression evidence; runtime has no student/date/value special cases.

Production acceptance still requires observing the deployed worker and the authenticated API backed by casita01. A local test, successful build or merge alone is not proof that retained production evidence was recovered.
