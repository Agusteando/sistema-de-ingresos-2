feat(control-escolar): use centralized matricula overlay connection

- Adds an explicit centralized MySQL connection for Control Escolar matricula data.
- Keeps plantel-local rows driven by base/ingresos through the selected bridge agent.
- Overlays centralized matricula data by matricula, including matricula.foto.
- Upserts edits into the centralized matricula table instead of writing into bridged plantel-local tables.
- Documents required CONTROL_ESCOLAR_MYSQL_* variables in .env.copy.
