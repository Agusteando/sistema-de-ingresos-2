// Older Windows managers request /api/system/health without query parameters
// and require central.ok before accepting a new Aurora Local release.
// Modern managers pass ?central=0 so no central connection is needed for startup.
// Local readiness and HTTP status must remain based solely on local MySQL.
export const shouldCheckCentralForLocalHealth = (requested) => {
  const value = Array.isArray(requested) ? requested[0] : requested
  return String(value ?? '').trim() !== '0'
}
