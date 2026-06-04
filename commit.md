Corrige detección de familia y hermanos con Control Escolar

Hace que la relación de hermanos use family_id de Control Escolar como fuente autoritativa cuando existe la matrícula, ignorando valores vacíos o marcadores como null, undefined, nan, sin datos o 0 para evitar que alumnos sin familiaId queden agrupados entre sí. Además limpia vínculos familiares locales inválidos heredados, evita migrar familiaId nulos desde base y mantiene el fallback local/correo solo cuando Control Escolar no tiene registro disponible.
