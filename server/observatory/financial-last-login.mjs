// A lower-bound historical witness: users.last_login_at stores only the
// most recent successful login per account. Earlier logins are overwritten.
// It MUST NOT be labeled total logins, sessions or financial page views.
export const app = 'sistema-de-ingresos-2'
export const source = 'users_financial_last_login'
export const kinds = ['financial_account_last_login']

export function activityQuery({ start, end }) {
  return {
    sql: `SELECT /*+ MAX_EXECUTION_TIME(2500) */
      'financial_account_last_login' AS kind,
      FLOOR(UNIX_TIMESTAMP(latest.last_login_at) / 3600) * 3600 + 3600 AS bucket_end,
      COUNT(*) AS count
      FROM (
        SELECT LOWER(TRIM(email)) AS account_key, MAX(last_login_at) AS last_login_at,
          MAX(FIND_IN_SET('ROLE_ADMON', UPPER(REPLACE(COALESCE(role, ''), ' ', '')))) AS finance_role,
          MAX(FIND_IN_SET('ROLE_CTRL', UPPER(REPLACE(COALESCE(role, ''), ' ', '')))) AS control_role,
          MAX(LOWER(TRIM(COALESCE(role, ''))) = 'superadmin') AS superadmin_role
        FROM users
        WHERE TRIM(COALESCE(email, '')) <> ''
        GROUP BY LOWER(TRIM(email))
      ) latest
      WHERE latest.last_login_at >= FROM_UNIXTIME(?)
        AND latest.last_login_at < FROM_UNIXTIME(?)
        AND latest.finance_role > 0 AND latest.control_role = 0 AND latest.superadmin_role = 0
      GROUP BY bucket_end ORDER BY bucket_end`,
    values: [start, end], timeout: 4000
  }
}
