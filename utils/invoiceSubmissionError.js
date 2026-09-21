const text = (value) => String(value || '').trim()

const PROVIDER_FIELD_LABELS = Object.freeze({
  'customer.address.zip': 'Código postal fiscal del receptor',
  'customer.tax_id': 'RFC del receptor',
  'customer.legal_name': 'Razón social del receptor',
  'customer.tax_system': 'Régimen fiscal del receptor',
  'use': 'Uso de CFDI',
  'payment_form': 'Forma de pago',
  'items': 'Conceptos del CFDI',
})

const requestPayload = (error) => error?.data?.data || error?.data || {}

const providerMessage = (payload, error) => text(
  payload?.error
  || payload?.message
  || payload?.providerMessage
  || error?.statusMessage
  || error?.message
)

export const buildInvoiceSubmissionError = (error) => {
  const payload = requestPayload(error)
  const status = Number(payload?.providerStatus || error?.statusCode || error?.status || 0)
  const code = text(payload?.code)
  const providerCode = text(payload?.providerCode)
  const providerPath = text(payload?.providerPath || payload?.path)
  const message = providerMessage(payload, error)
  const mutationUncertain = status >= 500 || /No repitas la operación/i.test(message)
  const validationFailure = (
    (status >= 400 && status < 500)
    || /^CFDI_VALIDATION_ERROR$/i.test(code)
    || /validation/i.test(providerCode)
  )

  return {
    retryableUi: true,
    mutationUncertain,
    title: validationFailure ? 'Revisa los datos fiscales' : 'SAT no respondió',
    message,
    fieldLabel: PROVIDER_FIELD_LABELS[providerPath] || '',
  }
}
