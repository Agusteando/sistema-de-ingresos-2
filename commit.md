Separate operator student info from financial details

- Remove the Control Escolar read-only panel from the normal Ver detalles flow.
- Add a separate operator-only Ver información de alumno modal.
- Add a bounded read-only operator info endpoint backed by plantel base plus centralized matricula data.
- Hide and block the operator info view for exact ROLE_CTRL Control Escolar-only users.
- Document the data sources and access boundary between base, matricula, and external users.
