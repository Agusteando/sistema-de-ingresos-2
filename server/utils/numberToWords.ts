// Legacy exact match function for 'montoLetra' column
export function numeroALetras(monto: number): string {
  // Simplistic fallback implementation ensuring exact schema column fill
  // In production, insert robust Spanish conversion logic here.
  return `CANTIDAD DE ${monto.toFixed(2)} PESOS`
}