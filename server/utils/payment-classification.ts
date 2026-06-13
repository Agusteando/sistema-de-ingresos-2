export const normalizePaymentMethod = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const truthyFlag = (value: unknown) => {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true'
}

export const isOtherCampusPayment = (payment: any) => {
  if (truthyFlag(payment?.pago_otro_plantel ?? payment?.pagoOtroPlantel)) return true

  const method = normalizePaymentMethod(payment?.formaDePago)
  if (method === 'pago realizado en otro plantel') return true

  const depurado = truthyFlag(payment?.depurado)
  return depurado && method !== 'depuracion'
}

export const isDepuradoPayment = (payment: any) => {
  const depuradoFlag = String(payment?.depurado ?? '').trim().toLowerCase()
  if (depuradoFlag === '1' || depuradoFlag === 'true') return true

  const method = normalizePaymentMethod(payment?.formaDePago)
  return method === 'depuracion' || method === 'pago realizado en otro plantel'
}
