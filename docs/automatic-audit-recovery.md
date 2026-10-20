# Aurora-owned historical recovery

The collector is owned, packaged and started by Aurora. It has no runtime dependency on migration-monitor, its APIs, credentials, filesystem, host commands or Podman socket. MySQL and Loki remain data sources. The deployment controller may be retired without stopping audit recovery.

## Runtime

`server/plugins/08.audit-recovery.ts` starts the worker after production startup and closes it with Nitro. Failures are recorded independently and never block ordinary application startup or student writes. A MySQL named lease serializes Aurora generations during blue/green overlap. Every minute the worker discovers retained binlogs through its own direct MySQL connection, reads them remotely with the official pinned MySQL reader, and processes four files per pass.

Aurora's own named volume `aurora-audit-recovery`, mounted at `/app/audit-data`, holds durable checkpoints and verified spools. These files do not live in MM's volume. Files are checksum-verified, fsynced and atomically marked verified before capture; failed captures preserve evidence for replay after source expiration. Source identity, full images, transaction commits and column ordinals are validated. Raw Query events are inspected before database filtering; historical schema boundaries stop ordinal-dependent recovery.

Verified source records enter the durable operational inbox in Aurora's existing audit table. Verified records are projected independently in batches of 1,000, including while other source files fail or the source is temporarily unavailable. Incomplete coverage publishes proven values without assigning an account. Once coverage is complete, the same derived projection may be linked to its original audit observation; source facts and original audit rows are not modified. Original student rows and original audit records remain untouched. Repeated reads are idempotent. Multiple same-second source writes cannot borrow a single account observation. Binlogs establish committed database values, not a physical person's identity.

Loki recovery remains automatic when historical field details open. Missing values in interleaved console messages are never inferred from neighboring lines. The field drawer continues refreshing stored results without resetting its student/field scope, date focus, scroll or loaded history. The main grid also refreshes stored recovery results. Partial historical queries expose a request reference for diagnosis.

## Source permissions

Reading binlogs remotely requires `REPLICATION CLIENT` and `REPLICATION SLAVE`. The previously observed application account cannot list binlogs. This is a one-time MySQL access requirement, not a control-plane dependency. The app cannot grant itself privileges and never receives root credentials.

By default the reader uses Aurora's existing central connection. Optional `AUDIT_SOURCE_MYSQL_USER` and `AUDIT_SOURCE_MYSQL_PASSWORD` select a separately provisioned reader on that same database server. That reader needs SELECT on the central schema and the two replication read privileges. MySQL's binlog protocol exposes server-wide source logs; those grants cannot be restricted to one schema. Provision this identity through the existing database administration procedure.

The packaged Aurora CLI prints the exact grant for its authenticated reader account without displaying passwords or executing it:

```sh
node /app/scripts/audit-source-access.mjs --print-grant-sql
node /app/scripts/audit-source-access.mjs --check
node /app/scripts/audit-source-access.mjs --diagnose
```

Until access is granted, coverage reports `AUDIT_SOURCE_READ_PERMISSION_REQUIRED`, the worker retries, and ordinary Aurora functionality continues. `--print-grant-sql` only prints SQL: a database administrator must execute it. `--check` verifies access after setup. `--diagnose` reports source access, worker state and pending inbox counts without student values or credentials. No manual evidence bundle or selected student import is required.

## Packaging and operation

The official reader needs glibc. Aurora's build and runtime use Node 22 on Debian trixie, with upgraded OS packages and the existing JS security overlay preserved. Prisma is generated on the matching platform and checked in the runtime image. No MySQL server, Git, container engine or administrative daemon is installed. The reader package is downloaded only at build, verified against its pinned SHA-256, and extracted without installing server packages.

Set `AUDIT_RECOVERY_ENABLED=false` to pause. The persistent volume, durable inbox and original audits remain intact. Rollback preserves ordinary reads/writes and previously recovered evidence. A deployment must preserve `/app/audit-data` when moving away from the current deployment tool.

Both authenticated audit read APIs return coverage. `caught-up` applies to retained inventory, not all historical time. Expired logs, unsupported schema history and unknown actors remain explicit gaps. Existing evidence already captured through the former MM collector remains valid; no original audit or MM data directory is deleted during the ownership change.

## Verification and limits

Tests cover ownership/lifecycle, source permission failure, credential-file isolation, native CRC rejection, all-student decoding, raw qualified DDL, checkpoints, retries, source epochs, real MySQL inbox/projection and direct remote MySQL read through the packaged reader. The direct-source test creates an isolated schema, generates a real row update and verifies the resulting before/after values through Aurora's projection without a control plane.

Production `--check` returned `ER_SPECIFIC_ACCESS_DENIED_ERROR`; source access must be granted and checked again. The running casita01 recovery still requires production verification. A merge or local build alone does not establish successful production recovery.


## Live progress and audit fields

Every source pass retains inventory and completed-file counts instead of replacing them with zero at startup. Each completed source file checkpoints and publishes its verified values independently. Status reports the active phase and file; `--diagnose` counts pending records directly from the inbox, including projected records awaiting attribution. These counters describe source processing, not proof of full historical coverage.

The audit matrix separates CURP and Foto, retains Estatus and removes Grado (including its existing level/cycle category). Original audit records, student records, source capture policy and sensitive-value redaction remain unchanged. Existing photo/CURP observations are classified consistently across ledger and Loki sources; unavailable historical values are not fabricated.


## False schema-boundary remediation (2026-10-20)

Production `mysql-bin.000373` contained `CREATE TABLE IF NOT EXISTS talleres_student_evaluations (...)` with a column named `matricula`. Both old guards searched for the word anywhere in DDL, incorrectly treating that unrelated table as a student schema change. The raw and decoded readers now share a DDL target parser that resolves the modified object, schema qualification, table lists, renames, comments and identifier quoting. Columns, foreign-key references and strings do not become table targets. A genuine DDL operation on the student table still blocks ordinal-dependent imports.

Checkpoint `schemaGuardVersion: 2` automatically revalidates boundaries created by the old word detector. Successfully verified file checkpoints are retained; blocked files are rescanned in descending order, and their old errors are removed only through the corrected policy and verified processing. No operator deletion, evidence import or database setting change is required. Internal source error messages that carry an AUDIT_* code now retain that code rather than collapsing to a generic source failure. Diagnosis includes the guard revision and any genuine remaining boundary.

Regression uses the exact operator-supplied talleres DDL, real MySQL 8.4.11 native CRC-checked binlogs, committed row values, a persisted legacy boundary and automatic worker replay. Production acceptance remains the actual historical chain through the authenticated read API; local tests are not that proof.
