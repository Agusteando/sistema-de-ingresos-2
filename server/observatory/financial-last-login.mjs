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
      FLOOR(UNIX_TIMESTAMP(last_login_at) / 3600) * 3600 + 3600 AS bucket_end,
      COUNT(DISTINCT LOWER(TRIM(email))) AS count
      FROM users
      WHERE last_login_at >= FROM_UNIXTIME(?)
        AND last_login_at < FROM_UNIXTIME(?)
        AND TRIM(COALESCE(email, '')) <> ''
        AND FIND_IN_SET('ROLE_ADMON', UPPER(REPLACE(COALESCE(role, ''), ' ', ''))) > 0
        AND FIND_IN_SET('ROLE_CTRL', UPPER(REPLACE(COALESCE(role, ''), ' ', ''))) = 0
      GROUP BY bucket_end ORDER BY bucket_end`,
    values: [start, end], timeout: 4000
  }
}
