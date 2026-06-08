export const normalizePaymentMethod = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

export const isDepuradoPayment = (payment: any) => {
  const depuradoFlag = String(payment?.depurado ?? '').trim().toLowerCase()
  if (depuradoFlag === '1' || depuradoFlag === 'true') return true

  const method = normalizePaymentMethod(payment?.formaDePago)
  return method === 'depuracion' || method === 'pago realizado en otro plantel'
}
