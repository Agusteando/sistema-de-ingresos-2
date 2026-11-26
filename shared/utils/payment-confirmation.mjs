// Keep the displayed, spoken and submitted amounts tied to the same payment.
export const paymentAmountCents = amount => {
  const value = Number(amount)
  if (!Number.isFinite(value)) return NaN
  return Math.round(Number(value.toFixed(2)) * 100)
}

export const createPaymentConfirmation = payload => {
  const serialized = JSON.stringify(payload)
  const totalCents = payload.pagos.reduce((total, row) => total + paymentAmountCents(row.montoPagado), 0)
  return { serialized, totalCents }
}

export const confirmationPayloadMatches = (confirmation, payload) =>
  Boolean(confirmation && confirmation.serialized === JSON.stringify(payload))

export const confirmedPaymentMatches = (requested, canonical) => {
  const cents = paymentAmountCents(requested)
  return Number.isSafeInteger(cents) && cents > 0 && cents === paymentAmountCents(canonical)
}

export const preserveManualPaymentAmounts = (fresh, previous, keyOf) => {
  const edits = new Map(previous.filter(row => row.montoTouched).map(row => [keyOf(row), row]))
  return fresh.map(row => {
    const edited = edits.get(keyOf(row))
    return edited ? { ...row, montoTouched: true, montoPagado: edited.montoPagado } : row
  })
}

export const speakPaymentConfirmation = (device, cents) => {
  // Only installed/local voices: no cloud TTS, API keys, network or US IP dependency.
  try {
    const synthesis = device?.speechSynthesis
    const VoiceUtterance = device?.SpeechSynthesisUtterance
    if (!synthesis || !VoiceUtterance) return () => {}
    const spanish = synthesis.getVoices().filter(voice => voice.localService && /^es(?:[-_]|$)/i.test(voice.lang))
    const voice = spanish.find(voice => /^es[-_]MX$/i.test(voice.lang)) || spanish[0]
    if (!voice) return () => {}
    const pesos = Math.floor(cents / 100)
    const centavos = cents % 100
    const utterance = new VoiceUtterance(`Confirma pago por ${pesos} pesos con ${centavos} centavos.`)
    utterance.voice = voice
    utterance.lang = voice.lang
    synthesis.speak(utterance)
    return () => { try { synthesis.cancel() } catch {} }
  } catch {
    return () => {}
  }
}
