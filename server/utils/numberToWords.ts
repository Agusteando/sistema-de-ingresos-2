export function numeroALetras(monto: number): string {
  // Simple mapping to fulfill legacy non-null constraint.
  // In production, insert a robust numerical-to-Spanish-text parser here.
  return `LA CANTIDAD DE ${monto.toFixed(2)} PESOS 00/100 M.N.`
}