-- Central Control Escolar active cache schema
-- Run this manually on the CENTRAL / external MySQL database used by CONTROL_ESCOLAR_DB_*.
-- This reset keeps Control Escolar writes in matricula only.
-- Cache/base tables are read-only scope filters and keep only one active copy per plantel/source.
-- Staging tables are temporary promotion buffers used during automatic refreshes.

DROP TABLE IF EXISTS control_base_write_queue;
DROP TABLE IF EXISTS control_enrollment_evidence_cache_stage;
DROP TABLE IF EXISTS control_base_cache_stage;
DROP TABLE IF EXISTS control_enrollment_evidence_cache;
DROP TABLE IF EXISTS control_base_cache;
DROP TABLE IF EXISTS control_base_snapshot_runs;
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

  cache_refreshed_at DATETIME NULL,
  cache_expires_at DATETIME NULL,
  cache_row_count INT NOT NULL DEFAULT 0,
  evidence_row_count INT NOT NULL DEFAULT 0,

  last_error TEXT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (source_id),
  KEY idx_control_base_sources_plantel (plantel),
  KEY idx_control_base_sources_agent (bridge_agent_id),
  KEY idx_control_base_sources_refresh_status (refresh_status),
  KEY idx_control_base_sources_cache_expires (cache_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE control_base_cache (
  source_id VARCHAR(120) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  plantel VARCHAR(40) NOT NULL,

  base_payload JSON NOT NULL,
  row_hash VARCHAR(64) NOT NULL,

  refreshed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (source_id, matricula),
  KEY idx_control_base_cache_plantel (plantel),
  KEY idx_control_base_cache_matricula (matricula),
  KEY idx_control_base_cache_hash (row_hash),
  KEY idx_control_base_cache_refreshed (refreshed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE control_enrollment_evidence_cache (
  source_id VARCHAR(120) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  ciclo VARCHAR(20) NOT NULL,

  paid_concept_ids TEXT NULL,
  charged_concept_ids TEXT NULL,
  all_concept_ids TEXT NULL,

  refreshed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (source_id, matricula, ciclo),
  KEY idx_control_evidence_source_ciclo (source_id, ciclo),
  KEY idx_control_evidence_matricula (matricula),
  KEY idx_control_evidence_refreshed (refreshed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE control_base_cache_stage (
  source_id VARCHAR(120) NOT NULL,
  refresh_token VARCHAR(80) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  plantel VARCHAR(40) NOT NULL,

  base_payload JSON NOT NULL,
  row_hash VARCHAR(64) NOT NULL,

  staged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (source_id, refresh_token, matricula),
  KEY idx_control_base_stage_source (source_id),
  KEY idx_control_base_stage_token (refresh_token),
  KEY idx_control_base_stage_plantel (plantel),
  KEY idx_control_base_stage_staged (staged_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE control_enrollment_evidence_cache_stage (
  source_id VARCHAR(120) NOT NULL,
  refresh_token VARCHAR(80) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  ciclo VARCHAR(20) NOT NULL,

  paid_concept_ids TEXT NULL,
  charged_concept_ids TEXT NULL,
  all_concept_ids TEXT NULL,

  staged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (source_id, refresh_token, matricula, ciclo),
  KEY idx_control_evidence_stage_source (source_id),
  KEY idx_control_evidence_stage_token (refresh_token),
  KEY idx_control_evidence_stage_ciclo (source_id, ciclo),
  KEY idx_control_evidence_stage_staged (staged_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
