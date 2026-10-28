export const app = 'sistema-de-ingresos-2'
export const source = 'control_escolar_audit_events'
export const kinds = ['control_login', 'page_snapshot', 'student_update', 'husky_family_profile']
const auroraFlows = [
  'aurora_control_escolar_write', 'aurora_control_escolar_csv',
  'financial_parent_email_update', 'husky_pass_users_write', 'husky_pass_bulk_generate_missing'
]
export function activityQuery({ start, end }) {
  return {
    // The two husky_pass_* user-management flows above are Aurora operator actions.
    // Family profile edits are written by Husky Pass in the same DB transaction.
    sql: `SELECT /*+ MAX_EXECUTION_TIME(2500) */
      CASE WHEN event_type = 'student_update' AND source_flow = 'husky_pass_family_profile'
           THEN 'husky_family_profile' ELSE event_type END AS kind,
      FLOOR(UNIX_TIMESTAMP(created_at) / 3600) * 3600 + 3600 AS bucket_end,
      COUNT(*) AS count
      FROM control_escolar_audit_events
      WHERE created_at >= FROM_UNIXTIME(?) AND created_at < FROM_UNIXTIME(?)
        AND TRIM(COALESCE(actor_email, '')) <> ''
        AND (event_type IN ('control_login', 'page_snapshot') OR
          (event_type = 'student_update' AND source_flow IN (${[...auroraFlows, 'husky_pass_family_profile'].map(() => '?').join(',')})))
      GROUP BY kind, bucket_end ORDER BY bucket_end, kind`,
    values: [start, end, ...auroraFlows, 'husky_pass_family_profile'], timeout: 4000
  }
}

