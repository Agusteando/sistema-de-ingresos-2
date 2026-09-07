const unwrap = (input: unknown) => {
  let value = String(input ?? '').trim()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = value

    if ((value.startsWith('\\"') && value.endsWith('\\"')) || (value.startsWith("\\'") && value.endsWith("\\'"))) {
      value = value.slice(2, -2).trim()
    }

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).trim()
    }

    if (value === before) break
  }

  return value
}

export const getRuntimeGoogleClientId = () => {
  const config = useRuntimeConfig()
  return unwrap(
    process.env.GOOGLE_CLIENT_ID ||
    process.env.NUXT_PUBLIC_GOOGLE_CLIENT_ID ||
    config.public?.googleClientId ||
    ''
  )
}
