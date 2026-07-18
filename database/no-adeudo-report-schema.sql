-- Historial central de cartas de no adeudo.
-- Ejecutar en la misma base MySQL central que contiene la tabla matricula.

CREATE TABLE IF NOT EXISTS no_adeudo_deudor_cartas (
  plantel VARCHAR(40) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  ciclo VARCHAR(20) NOT NULL,
  folio VARCHAR(64) NOT NULL DEFAULT '',
  sent_at DATETIME NOT NULL,
  sent_by_name VARCHAR(255) NOT NULL DEFAULT '',
  sent_by_email VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (plantel, matricula, ciclo),
  KEY idx_no_adeudo_mark_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS no_adeudo_cartas_envios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plantel VARCHAR(40) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  student_name VARCHAR(255) NOT NULL DEFAULT '',
  tutor_name VARCHAR(255) NOT NULL DEFAULT '',
  nivel VARCHAR(120) NOT NULL DEFAULT '',
  grado VARCHAR(80) NOT NULL DEFAULT '',
  grupo VARCHAR(40) NOT NULL DEFAULT '',
  ciclo VARCHAR(20) NOT NULL,
  folio VARCHAR(64) NOT NULL,
  recipient_emails TEXT NOT NULL,
  recipient_mode VARCHAR(40) NOT NULL DEFAULT '',
  had_debt TINYINT(1) NOT NULL DEFAULT 0,
  debt_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  sent_at DATETIME NOT NULL,
  sent_by_name VARCHAR(255) NOT NULL DEFAULT '',
  sent_by_email VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_no_adeudo_envio_folio (folio),
  KEY idx_no_adeudo_envios_scope (plantel, ciclo, sent_at),
  KEY idx_no_adeudo_envios_matricula (matricula, sent_at),
  KEY idx_no_adeudo_envios_sender (sent_by_email, sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
