import { controlEscolarCentralQuery } from './control-escolar-central'

export const NO_ADEUDO_MARK_TABLE = 'no_adeudo_deudor_cartas'
export const NO_ADEUDO_HISTORY_TABLE = 'no_adeudo_cartas_envios'

const quoteIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``

let historyTablePromise: Promise<void> | null = null

export const isMissingCentralTableError = (error: any, tableName: string) => {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || error?.sqlMessage || '')
  return code === 'ER_NO_SUCH_TABLE' || (message.toLowerCase().includes(tableName.toLowerCase()) && /doesn.?t exist|no existe/i.test(message))
}

export const ensureNoAdeudoHistoryTableAvailable = async () => {
  if (!historyTablePromise) {
    historyTablePromise = controlEscolarCentralQuery(`
      CREATE TABLE IF NOT EXISTS ${quoteIdentifier(NO_ADEUDO_HISTORY_TABLE)} (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).then(() => undefined).catch((error) => {
      console.error('[No Adeudo] No se pudo preparar la tabla de historial:', error?.message || error)
      historyTablePromise = null
      throw createError({
        statusCode: 500,
        message: 'No se pudo preparar el historial de cartas de no adeudo. Ejecuta database/no-adeudo-report-schema.sql en la base central.'
      })
    })
  }

  await historyTablePromise
}
