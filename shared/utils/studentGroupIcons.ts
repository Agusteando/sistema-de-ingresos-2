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

export const studentGroupIconFile = (group: unknown) => GROUP_ICON_FILES[normalizeGroupIconValue(group)] || ''
export const studentGroupIconLabel = (group: unknown) => GROUP_ICON_DISPLAY_LABELS[normalizeGroupIconValue(group)] || ''
export const studentGroupIconUrl = (group: unknown) => {
  const file = studentGroupIconFile(group)
  return file ? `/student-group-icons/${file}` : ''
}
