export const isZeroChargeWithoutPayment = (debt: any) =>
  Number(debt?.subtotal || 0) <= 0 &&
  Number(debt?.pagosRegistrados ?? debt?.pagos ?? 0) <= 0 &&
  Number(debt?.pagosDepurados || 0) <= 0

export const zeroChargeLabel = (debt: any) => {
  if (!isZeroChargeWithoutPayment(debt)) return ''
  return Number(debt?.becaPorcentaje ?? debt?.beca ?? 0) >= 100 ? 'Beca 100%' : 'Sin cargo'
}
