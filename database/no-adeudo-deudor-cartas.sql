CREATE TABLE IF NOT EXISTS no_adeudo_deudor_cartas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plantel VARCHAR(32) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  ciclo VARCHAR(20) NOT NULL,
  folio VARCHAR(64) NOT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_by_name VARCHAR(255) NULL,
  sent_by_email VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_no_adeudo_deudor_control (plantel, matricula, ciclo),
  UNIQUE KEY uq_no_adeudo_deudor_folio (folio),
  KEY idx_no_adeudo_deudor_matricula (matricula),
  KEY idx_no_adeudo_deudor_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
