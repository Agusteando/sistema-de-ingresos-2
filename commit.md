Fix Control Escolar student fetch data flow

- Make Control Escolar student listing local base-first and overlay external matricula data only for returned matriculas.
- Remove local ingresos as a hard gate because it can hide valid base students.
- Let read-only Control Escolar lists return base rows even if the external matricula overlay is temporarily unavailable.
- Keep Control Escolar writes dependent on the centralized matricula table.
- Document the base-to-external-overlay data flow.
