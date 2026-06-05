-- Aurora / external read-only API warm view schema.
-- Run manually in the central/external MySQL database that contains matricula.
-- The app does NOT create or alter this table at runtime.

CREATE TABLE IF NOT EXISTS control_external_student_view (
  scope_key VARCHAR(64) NOT NULL,
  plantel VARCHAR(40) NOT NULL,
  ciclo_key VARCHAR(20) NOT NULL,
  previous_ciclo VARCHAR(20) NOT NULL,
  concept_hash VARCHAR(64) NOT NULL,
  concept_ids TEXT NOT NULL,
  view_version VARCHAR(80) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  nombre_completo VARCHAR(255) NOT NULL DEFAULT '',
  nivel VARCHAR(80) NOT NULL DEFAULT '',
  grado VARCHAR(80) NOT NULL DEFAULT '',
  grupo VARCHAR(80) NOT NULL DEFAULT '',
  status VARCHAR(80) NOT NULL DEFAULT '',
  enrollment_state VARCHAR(80) NOT NULL DEFAULT '',
  tipo_ingreso VARCHAR(80) NOT NULL DEFAULT '',
  search_text TEXT NOT NULL,
  payload_json JSON NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  generated_at DATETIME NOT NULL,
  payload_changed_at DATETIME NOT NULL,
  stale_after DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (scope_key, matricula),
  KEY idx_external_student_view_plantel_ciclo (plantel, ciclo_key),
  KEY idx_external_student_view_scope (plantel, scope_key),
  KEY idx_external_student_view_grade (plantel, ciclo_key, grado, grupo),
  KEY idx_external_student_view_status (plantel, ciclo_key, status, enrollment_state),
  KEY idx_external_student_view_generated (generated_at),
  KEY idx_external_student_view_payload_changed (payload_changed_at),
  KEY idx_external_student_view_expires (expires_at),
  KEY idx_external_student_view_updated (updated_at),
  FULLTEXT KEY ft_external_student_view_search (search_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
