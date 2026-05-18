Implement cache-first student loading flow

- Add reusable student cache/sync state backed by localStorage per plantel, role, ciclo, and search query.
- Load cached students immediately when available, then fetch fresh students in the background.
- Apply fresh student data without blocking the current workspace and keep filters, search, selection, open panels, and active workflow state intact.
- Keep cached/current student data usable when background sync fails and surface the stale/failed state through a subtle sidebar indicator.
- Refresh from the server after student mutations and bulk payment refreshes so local cache is updated without reverting to stale cached data.

Validation:
- Ran `npm ci --ignore-scripts` to install dependencies in the sandbox.
- Ran `npm run build` successfully.
