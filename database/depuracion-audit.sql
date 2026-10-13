-- Aurora · Depuración del saldo
-- Aplicar una vez en cada base financiera que atiende a Aurora antes de habilitar
-- /api/payments/audit. La API rechaza la operación si falta esta columna.
-- MySQL 8.0.30 (sin depender de ADD COLUMN IF NOT EXISTS).

SET @aurora_depuration_column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referenciasdepago'
    AND COLUMN_NAME = 'depurado_motivo'
);
SET @aurora_depuration_sql := IF(
  @aurora_depuration_column_exists = 0,
  'ALTER TABLE referenciasdepago ADD COLUMN depurado_motivo VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE aurora_depuration_stmt FROM @aurora_depuration_sql;
EXECUTE aurora_depuration_stmt;
DEALLOCATE PREPARE aurora_depuration_stmt;

SELECT COUNT(*) AS depurado_motivo_disponible
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referenciasdepago'
  AND COLUMN_NAME = 'depurado_motivo';
