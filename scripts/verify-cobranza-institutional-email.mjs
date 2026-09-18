const { DEFAULT_COBRANZA_EMAIL_SUBJECT, DEFAULT_COBRANZA_EMAIL_TEMPLATE, normalizeTemplateInput, renderCobranzaEmail } = await import('../server/utils/cobranzaEmail.ts')

const sample = {
  student: {
    nombreCompleto: 'Alumno Ejemplo',
    padre: 'Familia Ejemplo',
    correo: 'familia@example.com',
    plantel: 'PM',
    grado: '4',
    grupo: 'A',
  },
  deudor: {
    saldoPendiente: 3250,
    fechaLimitePago: '2026-09-20',
    desglose: [
      {
        documento: 'TEST-1',
        conceptoNombre: 'Colegiatura',
        mesLabel: 'Septiembre',
        mesCargo: '9',
        subtotal: 3250,
        pagado: 0,
        saldo: 3250,
      }
    ],
  },
  matricula: '0000000000',
  ciclo: '2026-2027',
  mes: 9,
}

const rendered = renderCobranzaEmail(sample)
const checks = [
  [rendered.subject.startsWith('IECS-IEDIS | Estado de cuenta |'), 'subject is institutional'],
  [rendered.html.includes('data-iecs-iedis-email="cobranza-v2"'), 'institutional wrapper marker is present'],
  [rendered.html.includes('https://aurora.casitaiedis.edu.mx/brand/iecs-iedis-logo.png'), 'official IECS-IEDIS logo is present'],
  [rendered.html.includes('#00692F') && rendered.html.includes('#007F92'), 'IECS and IEDIS institutional colors are present'],
  [rendered.html.includes('Montserrat') && rendered.html.includes('Fredoka'), 'institutional typography families are present'],
  [rendered.html.includes('Alumno Ejemplo') && rendered.html.includes('$3,250.00'), 'student and financial context render correctly'],
  [rendered.html.includes('Colegiatura') && rendered.html.includes('Septiembre'), 'breakdown renders correctly'],
  [rendered.html.includes('Administración y Cobranza · IECS-IEDIS'), 'institutional footer is present'],
]

const custom = renderCobranzaEmail({
  ...sample,
  subject: 'Aviso personalizado - {{nombre_alumno}}',
  htmlTemplate: '<p>Contenido administrativo personalizado para {{nombre_alumno}}.</p>',
})
checks.push(
  [custom.subject === 'Aviso personalizado - Alumno Ejemplo', 'custom subject remains supported'],
  [custom.html.includes('Contenido administrativo personalizado para Alumno Ejemplo.'), 'custom body remains supported'],
  [custom.html.includes('data-iecs-iedis-email="cobranza-v2"'), 'custom body is still institutionally wrapped'],
)

const normalized = normalizeTemplateInput({
  subject: 'Recordatorio de pago - {{nombre_alumno}}',
})
checks.push(
  [normalized.subject === DEFAULT_COBRANZA_EMAIL_SUBJECT, 'legacy default subject migrates in memory'],
  [normalized.htmlTemplate === DEFAULT_COBRANZA_EMAIL_TEMPLATE, 'empty legacy body falls back to new institutional body'],
)

const failures = checks.filter(([ok]) => !ok)
for (const [ok, label] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
if (failures.length) process.exit(1)
console.log('COBRANZA_INSTITUTIONAL_EMAIL_OK')
