Usa familia de Control Escolar para hermanos

Hace que la lógica de Familia / Hermanos en Alumnos-Financiero use únicamente el campo familiar de la tabla central matricula de Control Escolar, dejando student_family_links y la inferencia por correo fuera del flujo activo. Cuando la matrícula no tiene family_id/familiaId utilizable, no se muestran hermanos y no se aplican fallbacks financieros. También deja la limpieza local como endpoint deprecado, evita migrar familiaId financiero a vínculos locales y mantiene la vista financiera como lectura desde Control Escolar.
