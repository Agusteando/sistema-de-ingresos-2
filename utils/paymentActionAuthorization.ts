const PAYMENT_AUTHORIZATION_CHAT_IDS = ['-4885991203']
const PAYMENT_AUTHORIZATION_ENDPOINT = 'https://tgbot.casitaapps.com/sendMessages'

export const requestPaymentActionAuthorizationCode = async (buildMessage: (code: string) => string) => {
  const code = String(Math.floor(Math.random() * 9000) + 1000)
  const response = await fetch(PAYMENT_AUTHORIZATION_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify({ chatId: PAYMENT_AUTHORIZATION_CHAT_IDS, message: buildMessage(code) }),
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) throw new Error('No se pudo enviar el código')
  return code
}

export const sendPaymentActionAuthorizationNotice = async (message: string) => {
  const response = await fetch(PAYMENT_AUTHORIZATION_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify({ chatId: PAYMENT_AUTHORIZATION_CHAT_IDS, message }),
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) throw new Error('No se pudo enviar la notificación')
}
