import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { buildInvoiceSubmissionError } from '../utils/invoiceSubmissionError.js'

test('CFDI validation errors keep retry CTA and expose the SAT message cleanly', () => {
  const state = buildInvoiceSubmissionError({
    data: {
      code: 'CFDI_VALIDATION_ERROR',
      error: 'El campo DomicilioFiscalReceptor del receptor, debe pertenecer al nombre asociado al RFC registrado en el campo Rfc del Receptor.',
      message: 'El campo DomicilioFiscalReceptor del receptor, debe pertenecer al nombre asociado al RFC registrado en el campo Rfc del Receptor.',
      mutationUncertain: false,
      providerCode: 'invoice_stamping_validation_error',
      providerPath: 'customer.address.zip',
      providerStatus: 400,
      retryable: false,
      success: false,
    },
  })

  assert.equal(state.retryableUi, true)
  assert.equal(state.mutationUncertain, false)
  assert.equal(state.title, 'Revisa los datos fiscales')
  assert.match(state.message, /DomicilioFiscalReceptor/)
  assert.equal(state.fieldLabel, 'Código postal fiscal del receptor')
})

test('nested Nuxt error payloads preserve provider validation detail', () => {
  const state = buildInvoiceSubmissionError({
    data: {
      data: {
        providerStatus: 400,
        providerMessage: 'El régimen fiscal no corresponde al receptor.',
        providerPath: 'customer.tax_system',
      },
    },
  })

  assert.equal(state.title, 'Revisa los datos fiscales')
  assert.equal(state.message, 'El régimen fiscal no corresponde al receptor.')
  assert.equal(state.fieldLabel, 'Régimen fiscal del receptor')
})

test('transport failures preserve uncertain-write recovery behavior and CTA', () => {
  const state = buildInvoiceSubmissionError({
    statusCode: 502,
    data: {
      providerStatus: 502,
      providerMessage: 'Falló la comunicación directa con Facturapi. No repitas la operación sin verificar primero el estado de la factura en Facturas.',
    },
  })

  assert.equal(state.retryableUi, true)
  assert.equal(state.mutationUncertain, true)
  assert.equal(state.title, 'SAT no respondió')
  assert.match(state.message, /No repitas la operación/)
  assert.equal(state.fieldLabel, '')
})

test('InvoiceModal renders provider detail without removing the green retry CTA', async () => {
  const source = await readFile(new URL('../components/InvoiceModal.vue', import.meta.url), 'utf8')

  assert.match(source, /Detalle del SAT/)
  assert.match(source, /\{\{ submissionError\.message \}\}/)
  assert.match(source, /class="btn btn-primary mt-3" type="button" @click="retrySubmission"/)
  assert.match(source, /Haz click aquí para intentarlo de nuevo/)
})
