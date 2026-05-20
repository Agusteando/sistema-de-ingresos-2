export const STUDENT_GROUP_ICON_LABELS = [
  'MATERNAL A',
  'MATERNAL B',
  'LACTANTES B',
  'LACTANTES C',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'ÁFRICA',
  'AMÉRICA',
  'ANTÁRTIDA',
  'ASIA',
  'EUROPA',
  'OCEANÍA',
  'ABEJAS',
  'BORREGOS',
  'BUHOS',
  'CANGUROS',
  'CEBRAS',
  'COCODRILOS',
  'CONEJOS',
  'DINOS',
  'ELEFANTES',
  'FOCAS',
  'JIRAFAS',
  'KOALAS',
  'LEONES',
  'LEOPARDOS',
  'OSOS',
  'PANDAS',
  'PANTERAS',
  'PATOS',
  'TIGRES',
  'UNICORNIOS'
] as const

export type StudentGroupIconLabel = typeof STUDENT_GROUP_ICON_LABELS[number]

const normalizeGroupIconValue = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase()

const toIconFileName = (label: string) => `${label
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')}.png`

const GROUP_ICON_FILES = Object.fromEntries(
  STUDENT_GROUP_ICON_LABELS.map(label => [normalizeGroupIconValue(label), toIconFileName(label)])
) as Record<string, string>

const GROUP_ICON_DISPLAY_LABELS = Object.fromEntries(
  STUDENT_GROUP_ICON_LABELS.map(label => [normalizeGroupIconValue(label), label])
) as Record<string, StudentGroupIconLabel>

const GROUP_ICON_RENDER_TUNING: Record<string, { artSize: string; offsetX: string; offsetY: string }> = {
  'MATERNAL A': { artSize: '98.00%', offsetX: '-0.39%', offsetY: '-2.34%' },
  'MATERNAL B': { artSize: '104.26%', offsetX: '0.78%', offsetY: '0%' },
  'LACTANTES B': { artSize: '103.16%', offsetX: '0.39%', offsetY: '0%' },
  'LACTANTES C': { artSize: '97.03%', offsetX: '0%', offsetY: '-1.95%' },
  'AFRICA': { artSize: '102.08%', offsetX: '0.39%', offsetY: '0%' },
  'AMERICA': { artSize: '98.99%', offsetX: '0%', offsetY: '-1.17%' },
  'ANTARTIDA': { artSize: '102.08%', offsetX: '0%', offsetY: '0.39%' },
  'ASIA': { artSize: '101.03%', offsetX: '0.39%', offsetY: '0%' },
  'EUROPA': { artSize: '102.08%', offsetX: '0%', offsetY: '0.39%' },
  'OCEANIA': { artSize: '101.03%', offsetX: '-0.39%', offsetY: '0.39%' },
  'ABEJAS': { artSize: '102.08%', offsetX: '0%', offsetY: '0.39%' },
  'BORREGOS': { artSize: '101.03%', offsetX: '-0.39%', offsetY: '0%' },
  'BUHOS': { artSize: '102.08%', offsetX: '0.39%', offsetY: '0%' },
  'CANGUROS': { artSize: '102.08%', offsetX: '0%', offsetY: '0.39%' },
  'CEBRAS': { artSize: '96.08%', offsetX: '-1.56%', offsetY: '0.39%' },
  'COCODRILOS': { artSize: '96.08%', offsetX: '1.56%', offsetY: '0%' },
  'CONEJOS': { artSize: '102.08%', offsetX: '0%', offsetY: '0%' },
  'DINOS': { artSize: '98.99%', offsetX: '-1.17%', offsetY: '0%' },
  'ELEFANTES': { artSize: '102.08%', offsetX: '0%', offsetY: '0.39%' },
  'FOCAS': { artSize: '102.08%', offsetX: '0%', offsetY: '0.39%' },
  'JIRAFAS': { artSize: '100.00%', offsetX: '0%', offsetY: '0.78%' },
  'KOALAS': { artSize: '102.08%', offsetX: '0.39%', offsetY: '0%' },
  'LEONES': { artSize: '102.08%', offsetX: '0.39%', offsetY: '0%' },
  'LEOPARDOS': { artSize: '100.00%', offsetX: '0%', offsetY: '0.39%' },
  'OSOS': { artSize: '102.08%', offsetX: '0%', offsetY: '0%' },
  'PANDAS': { artSize: '102.08%', offsetX: '0%', offsetY: '0%' },
  'PANTERAS': { artSize: '100.00%', offsetX: '0%', offsetY: '0.39%' },
  'PATOS': { artSize: '102.08%', offsetX: '0%', offsetY: '0.39%' },
  'TIGRES': { artSize: '102.08%', offsetX: '0%', offsetY: '0.78%' },
  'UNICORNIOS': { artSize: '104.26%', offsetX: '0.39%', offsetY: '0%' }
}


export const studentGroupIconLetter = (group: unknown) => {
  const normalized = normalizeGroupIconValue(group)
  return /^[A-H]$/.test(normalized) ? normalized : ''
}

export const studentGroupIconFile = (group: unknown) => GROUP_ICON_FILES[normalizeGroupIconValue(group)] || ''
export const studentGroupIconLabel = (group: unknown) => GROUP_ICON_DISPLAY_LABELS[normalizeGroupIconValue(group)] || ''
export const studentGroupIconUrl = (group: unknown) => {
  const file = studentGroupIconFile(group)
  return file ? `/student-group-icons/${file}` : ''
}

export const studentGroupIconRenderStyle = (group: unknown) => {
  const url = studentGroupIconUrl(group)
  if (!url) return {}

  const tuning = GROUP_ICON_RENDER_TUNING[normalizeGroupIconValue(group)]
  return {
    '--group-icon-mask': `url("${url}")`,
    '--group-icon-art-size': tuning?.artSize || '100%',
    '--group-icon-art-offset-x': tuning?.offsetX || '0%',
    '--group-icon-art-offset-y': tuning?.offsetY || '0%'
  }
}
