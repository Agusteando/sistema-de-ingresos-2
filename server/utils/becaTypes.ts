export const BECA_TYPE_OPTIONS = [
  'Colaborador',
  'DRES',
  'Hermanos',
  'Promoción',
  'SEP',
  'Mercadotecnia'
] as const

const normalizeBecaTypeKey = (value: unknown) => String(value || '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\s_/-]+/g, ' ')
  .toLowerCase()

const BECA_TYPE_ALIASES: Record<string, string[]> = {
  colaborador: ['Colaborador'],
  coaborador: ['Colaborador'],
  dres: ['DRES'],
  hermanos: ['Hermanos'],
  promocion: ['Promoción'],
  sep: ['SEP'],
  mercadotecnia: ['Mercadotecnia'],
  'sep mercadotecnia': ['SEP', 'Mercadotecnia']
}

const splitBecaTypes = (value: unknown) => Array.isArray(value)
  ? value
  : String(value || '').split(',')

export const normalizeBecaTypes = (value: unknown) => {
  const selected: string[] = []
  const invalid: string[] = []

  splitBecaTypes(value).forEach((item) => {
    const raw = String(item || '').trim()
    if (!raw) return

    const normalized = BECA_TYPE_ALIASES[normalizeBecaTypeKey(raw)]
    if (!normalized) {
      invalid.push(raw)
      return
    }

    selected.push(...normalized)
  })

  return {
    selected: [...new Set(selected)],
    invalid
  }
}
