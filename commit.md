fix(admin): compact SQL console and surface bridge execution errors

- Reduced SQL Console spacing and textarea height so the page fits inside the main app viewport with internal scrolling.
- Added visible running feedback while SQL is executing.
- Improved client-side error banners for failed execution requests.
- Preserved per-statement feedback for bridge failures and added HTTP/code metadata plus a 503-specific hint.
- Normalized DB bridge HTTP errors so bridge 503 responses are exposed to the SQL console instead of appearing only in logs.
