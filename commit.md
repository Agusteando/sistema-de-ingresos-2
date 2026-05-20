fix: restore bounded student loading while preserving enrollment priority

- Remove unbounded all-cycle concept aggregation from student and KPI fetches.
- Add bounded historical enrollment evidence lookup filtered by visible students and configured enrollment conceptos.
- Pass configured enrollment conceptos to the student fetch so the interno priority rule can still resolve when both enrollment conceptos exist across any ciclo escolar.
- Restore plantel login default to the first concrete plantel instead of GLOBAL to match the working student-fetch behavior in bridge mode.
