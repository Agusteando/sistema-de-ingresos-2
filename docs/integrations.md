# Integraciones (`/dx/api-lab`)

The production screen has one application/campus matrix. Its inventory is not
`DX_API_ENDPOINTS`, `DX_APPS`, or a list of consumer names.

- Every build derives external routes and source references from actual handler
  symbols (`scripts/dx-route-manifest.mjs`). Common transport imports do not
  imply that every handler uses every table.
- Authenticated GitHub discovery lists accessible repositories, reads their
  default-branch commit SHA and streams source archives without extraction or
  execution. It reuses Aurora's existing `GITHUB_TOKEN`. Names come from the
  repository's migration configuration or repository name. Repositories have
  independent results and failures. Credentials, rate limits and incomplete
  scans are visible rather than replaced with a fixed catalog.
- Discovery is refreshed when the screen is open, with a 15-minute repository
  inventory interval and reuse of unchanged repositories. It is not a new
  daemon, deployment service or GitHub Actions workflow.
- Student summaries read published snapshots and structurally compatible
  consumer caches in the existing central database. Each campus/version keeps
  its latest scope; historical scopes are not added together. An absent dataset
  is unknown, whereas a persisted empty marker is a measured zero. A cache with
  no cycle column is explicitly unscoped, never silently assigned this cycle.
- The source selector distinguishes published data, actual consumer storage,
  and observed HTTP responses. Equal producer counts do not prove that two
  applications applied the same data. Other databases are not opened with
  invented credentials.
- `[AuroraIntegration]` response observations retain contract, campus, cycle,
  counts, origin/credential class, status and request ID. They do not log names,
  matriculas, response bodies or tokens. Existing Loki supplies a bounded
  history; current-process observations work while Loki is unavailable.
  Shared credentials and shared routes are not unique application identities.
  An origin match is reported as an origin match, never confirmed processing.
- The overview does not contact Bridge agents. Opening records from a supported
  roster contract explicitly invokes the existing read handler, with bounded
  pagination and concurrency. These reads are marked as DX probes and excluded
  from consumer last-use timestamps. Unsupported campus scopes are not probed.
  Existing canonical campus aliases and user authorization remain authoritative.
- Records can compare stored sources or a current roster response. Requests
  never claim to recover historical response bodies that were not retained.

No student API version, enrollment/group resolver, consumer synchronization,
database schema or alert policy is changed by this explorer. The operator
roster adds safe provenance already computed by Control Escolar; its student
payload is preserved. Reuse these contracts before adding another endpoint.

## Verification

`node scripts/verify-dx-api-lab.mjs` runs discovery, source-inventory, permission,
read-only summary, streaming-archive and usage tests. Run the existing operator
roster tests and `npm run build` as well.

`/__visual-lab/integrations` renders the production component for browser QA.
Supply synthetic API responses in a browser harness, as with the other visual
labs. Never embed sample students, counts, usage dates or consumer catalogs in
production. The existing middleware blocks visual-lab routes outside development.

Rollback: revert this focused change and redeploy through Migration Monitor.
There is no schema or external-consumer rollback to coordinate. The GitHub
discovery scan and in-memory summaries restart with Aurora; no source archives
or new directories persist on the host.
