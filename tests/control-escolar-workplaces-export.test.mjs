import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  CONTROL_ESCOLAR_REPORT_DEFAULT_FIELDS,
  CONTROL_ESCOLAR_REPORT_FIELDS,
  CONTROL_ESCOLAR_REPORT_FIELD_KEYS,
} from '../shared/constants/controlEscolarReport.ts'

const root = resolve('.')
const workplaceFields = [
  ['lugarTrabajoPadre', 'Lugar de trabajo del padre', 'lugar_trabajo_padre'],
  ['lugarTrabajoMadre', 'Lugar de trabajo de la madre', 'lugar_trabajo_madre'],
]

test('Excel customizer offers both parent workplaces separately without changing defaults', () => {
  for (const [key, label] of workplaceFields) {
    const field = CONTROL_ESCOLAR_REPORT_FIELDS.find(item => item.key === key)
    assert.ok(field, `${key} is available in Personalizar Excel`)
    assert.equal(field.label, label)
    assert.equal(field.group, 'family')
    assert.equal(field.width, 30)
    assert.equal(field.default, undefined)
    assert.ok(CONTROL_ESCOLAR_REPORT_FIELD_KEYS.has(key), `${key} is allowed by export endpoint`)
  }
  assert.deepEqual(CONTROL_ESCOLAR_REPORT_DEFAULT_FIELDS, [
    'fullName', 'matricula', 'nivel', 'grado', 'group', 'seccion',
    'huskyPassUsername', 'huskyPassPlaintext',
  ])
})

test('existing normalized matricula fields flow through selected Excel columns', async () => {
  const [normalizer, exporter, endpoint, modal] = await Promise.all([
    readFile(resolve(root, 'server/utils/control-escolar.ts'), 'utf8'),
    readFile(resolve(root, 'server/utils/control-escolar-export.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/control-escolar/export.get.ts'), 'utf8'),
    readFile(resolve(root, 'components/students/ControlEscolarReportModal.vue'), 'utf8'),
  ])

  for (const [key, label, databaseColumn] of workplaceFields) {
    assert.ok(normalizer.includes(`${key}: normalizeText(overlay?.${databaseColumn})`))
    assert.ok(exporter.includes(`['${key}', '${label}', 30]`))
  }

  assert.match(exporter, /selected\.has\(field\.key\)/)
  assert.match(exporter, /row\?\.\[column\.key\]/)
  assert.match(endpoint, /CONTROL_ESCOLAR_REPORT_FIELD_KEYS\.has\(field\)/)
  assert.match(modal, /CONTROL_ESCOLAR_REPORT_FIELDS\.filter\(\(field\) => field\.group === group\)/)
})
