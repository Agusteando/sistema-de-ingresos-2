fix: compact sql console and surface offline bridge agents

- Move SQL execution controls above the editor so the run button is visible without scrolling.
- Compact the SQL console layout, target card, upload zone, toolbar, textarea, and result panels.
- Add an explicit SQL execution target selector for superadmin plantel agents.
- Skip automatic schema migration during SQL console execution so offline bridge agents do not block structured feedback.
- Return per-statement bridge metadata and clear offline-agent hints when the selected agent returns HTTP 503.
