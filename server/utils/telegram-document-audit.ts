// Uses the same institutional audit group as payment action notifications.
const TELEGRAM_ENDPOINT = 'https://tgbot.casitaapps.com/sendMessages'
const AUDIT_CHAT_IDS = ['-4885991203']

export const notifyDocumentAmountCorrection = async (message: string) => {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5500)
      let response: Response
      try {
        response = await fetch(TELEGRAM_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: AUDIT_CHAT_IDS, message }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }
      if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`)
      return { delivered: true }
    } catch (error) {
      lastError = error
    }
  }
  return { delivered: false, errorCode: String((lastError as any)?.name || 'TELEGRAM_DELIVERY_FAILED').slice(0, 60) }
}
