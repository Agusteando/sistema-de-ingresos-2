-- Control Escolar verified cache schema.
-- Run manually in the central/external MySQL database that contains matricula.
-- The app does NOT create or alter tables at runtime.

DROP TABLE IF EXISTS control_base_write_queue;
DROP TABLE IF EXISTS control_enrollment_evidence_cache_stage;
DROP TABLE IF EXISTS control_base_cache_stage;
DROP TABLE IF EXISTS control_enrollment_evidence_cache;
DROP TABLE IF EXISTS control_base_cache;
DROP TABLE IF EXISTS control_base_snapshot_runs;
DROP TABLE IF EXISTS control_base_scope_cache_stage;
DROP TABLE IF EXISTS control_base_scope_cache;
DROP TABLE IF EXISTS control_base_scope_validation;
DROP TABLE IF EXISTS control_base_sources;

CREATE TABLE control_base_sources (
  source_id VARCHAR(120) NOT NULL,
  plantel VARCHAR(40) NOT NULL,
  bridge_agent_id VARCHAR(120) NOT NULL,
  machine_id VARCHAR(120) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  refresh_status VARCHAR(30) NOT NULL DEFAULT 'idle',
  refresh_token VARCHAR(80) DEFAULT NULL,
  refresh_started_at DATETIME NULL,
  refresh_finished_at DATETIME NULL,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id),
  KEY idx_control_base_sources_plantel (plantel),
  KEY idx_control_base_sources_agent (bridge_agent_id),
  KEY idx_control_base_sources_refresh_status (refresh_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE control_base_scope_validation (
  source_id VARCHAR(120) NOT NULL,
  scope_key VARCHAR(64) NOT NULL,
  ciclo_key VARCHAR(20) NOT NULL,
  previous_ciclo VARCHAR(20) NOT NULL,
  concept_hash VARCHAR(64) NOT NULL,
  concept_ids TEXT NOT NULL,
  validation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  cache_refreshed_at DATETIME NULL,
  cache_expires_at DATETIME NULL,
  cache_row_count INT NOT NULL DEFAULT 0,
  live_total INT NOT NULL DEFAULT 0,
  cached_total INT NOT NULL DEFAULT 0,
  live_inscritos INT NOT NULL DEFAULT 0,
  cached_inscritos INT NOT NULL DEFAULT 0,
  live_no_inscritos INT NOT NULL DEFAULT 0,
  cached_no_inscritos INT NOT NULL DEFAULT 0,
  live_bajas INT NOT NULL DEFAULT 0,
  cached_bajas INT NOT NULL DEFAULT 0,
  live_baja_inscrita INT NOT NULL DEFAULT 0,
  cached_baja_inscrita INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id, scope_key),
  KEY idx_control_scope_validation_status (validation_status),
  KEY idx_control_scope_validation_ciclo (source_id, ciclo_key),
  KEY idx_control_scope_validation_expires (cache_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE control_base_scope_cache (
  source_id VARCHAR(120) NOT NULL,
  scope_key VARCHAR(64) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  plantel VARCHAR(40) NOT NULL,
  base_payload JSON NOT NULL,
  row_hash VARCHAR(64) NOT NULL,
  refreshed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id, scope_key, matricula),
  KEY idx_control_scope_cache_plantel (plantel),
  KEY idx_control_scope_cache_matricula (matricula),
  KEY idx_control_scope_cache_hash (row_hash),
  KEY idx_control_scope_cache_refreshed (refreshed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE control_base_scope_cache_stage (
  source_id VARCHAR(120) NOT NULL,
  scope_key VARCHAR(64) NOT NULL,
  refresh_token VARCHAR(80) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  plantel VARCHAR(40) NOT NULL,
  base_payload JSON NOT NULL,
  row_hash VARCHAR(64) NOT NULL,
  staged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id, scope_key, refresh_token, matricula),
  KEY idx_control_scope_stage_source (source_id),
  KEY idx_control_scope_stage_scope (source_id, scope_key),
  KEY idx_control_scope_stage_token (refresh_token),
  KEY idx_control_scope_stage_staged (staged_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
