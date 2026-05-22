export const DEFAULT_COBRANZA_EMAIL_SUBJECT = 'Recordatorio de pago - {{nombre_alumno}}'

export const DEFAULT_COBRANZA_EMAIL_TEMPLATE = `<div style="font-family: Inter, Arial, sans-serif; color: #1f2937; max-width: 680px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; background: #ffffff;">
  <div style="background:#0f766e;color:#fff;padding:18px 24px;">
    <h2 style="margin:0;font-size:18px;">Recordatorio de pago</h2>
    <p style="margin:4px 0 0;font-size:13px;opacity:.9;">Estado de cuenta escolar</p>
  </div>
  <div style="padding:24px;">
    <p style="margin-top:0;">Estimado(a) <strong>{{tutor}}</strong>,</p>
    <p>Le informamos que el estado de cuenta del alumno <strong>{{nombre_alumno}}</strong> presenta un saldo pendiente por <strong>{{saldo_total_formateado}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;">
      <tbody>
        <tr><td style="padding:8px 0;color:#64748b;">Matrícula</td><td style="padding:8px 0;text-align:right;font-weight:700;">{{matricula}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Ciclo</td><td style="padding:8px 0;text-align:right;font-weight:700;">{{ciclo}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Periodo de cobranza</td><td style="padding:8px 0;text-align:right;font-weight:700;">{{periodo_cobranza}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Fecha límite</td><td style="padding:8px 0;text-align:right;font-weight:700;">{{fecha_limite_pago}}</td></tr>
      </tbody>
    </table>
    {{desglose_table}}
    <p>Le solicitamos regularizar el pago o comunicarse con Administración si ya cuenta con un comprobante en proceso de conciliación.</p>
    <p style="margin-bottom:0;">Atentamente,<br><strong>Administración y Cobranza</strong></p>
  </div>
</div>`

export type CobranzaEmailTemplateInput = {
  subject?: unknown
  htmlTemplate?: unknown
  html_template?: unknown
  includeDesglose?: unknown
  include_desglose?: unknown
}

export type CobranzaEmailRenderInput = {
  student: Record<string, any>
  deudor?: Record<string, any> | null
  matricula: string
  ciclo: string
  mes: number | string
  subject?: string
  htmlTemplate?: string
  includeDesglose?: boolean
}

type BreakdownRow = {
  documento: string
  concepto: string
  periodo: string
  cargo: number
  pagado: number
  saldo: number
}

export const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

export const normalizeTemplateInput = (template?: CobranzaEmailTemplateInput | null) => {
  const includeRaw = template?.includeDesglose ?? template?.include_desglose
  return {
    subject: String(template?.subject || DEFAULT_COBRANZA_EMAIL_SUBJECT),
    htmlTemplate: String(template?.htmlTemplate || template?.html_template || DEFAULT_COBRANZA_EMAIL_TEMPLATE),
    includeDesglose: includeRaw === undefined || includeRaw === null ? true : Boolean(Number(includeRaw) || includeRaw === true || String(includeRaw).toLowerCase() === 'true')
  }
}

export const formatCobranzaMoney = (value: unknown) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2
})

const formatDate = (value: unknown) => {
  if (!value) return 'Sin fecha registrada'
  const raw = String(value)
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const getBreakdownRows = (deudor?: Record<string, any> | null): BreakdownRow[] => (deudor?.desglose || [])
  .filter((item: any) => Number(item?.saldo || 0) > 0)
  .map((item: any) => ({
    documento: String(item?.documento || ''),
    concepto: String(item?.conceptoNombre || 'Concepto'),
    periodo: String(item?.mesLabel || item?.mesCargo || ''),
    cargo: Number(item?.subtotal || 0),
    pagado: Number(item?.pagado || 0),
    saldo: Number(item?.saldo || 0)
  }))

const buildBreakdownText = (rows: BreakdownRow[]) => {
  if (!rows.length) return ''
  return rows
    .map((item: BreakdownRow) => `${escapeHtml(item.concepto)} (${escapeHtml(item.periodo)}): ${formatCobranzaMoney(item.saldo)}`)
    .join('<br>')
}

const buildBreakdownTable = (rows: BreakdownRow[]) => {
  if (!rows.length) return ''

  const total = rows.reduce((sum: number, item: BreakdownRow) => sum + Number(item.saldo || 0), 0)
  const body = rows.map((item: BreakdownRow) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.concepto)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.periodo)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCobranzaMoney(item.saldo)}</td>
    </tr>
  `).join('')

  return `
    <div style="margin:18px 0;">
      <p style="margin:0 0 8px;font-weight:700;color:#0f766e;">Desglose del saldo pendiente</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f8fafc;color:#64748b;">
            <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb;">Concepto</th>
            <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb;">Periodo</th>
            <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">Saldo</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:12px 10px;text-align:right;font-weight:700;">Total pendiente</td>
            <td style="padding:12px 10px;text-align:right;font-weight:800;color:#0f766e;">${formatCobranzaMoney(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `
}

const renderTextTemplate = (template: string, context: Record<string, string>) => template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => context[key] ?? '')

const renderHtmlTemplate = (template: string, context: Record<string, string>, rawKeys: Set<string>) => template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
  const value = context[key] ?? ''
  return rawKeys.has(key) ? value : escapeHtml(value)
})

export const renderCobranzaEmail = ({
  student,
  deudor,
  matricula,
  ciclo,
  mes,
  subject,
  htmlTemplate,
  includeDesglose = true
}: CobranzaEmailRenderInput) => {
  const saldo = Number(deudor?.saldoPendiente ?? deudor?.saldoColegiatura ?? 0)
  const rows = includeDesglose ? getBreakdownRows(deudor) : []
  const tutor = student?.padre || student?.['Nombre del padre o tutor'] || deudor?.padre || 'Padre, madre o tutor'
  const alumno = student?.nombreCompleto || deudor?.nombreCompleto || matricula
  const gradoGrupo = [student?.grado || deudor?.grado, student?.grupo || deudor?.grupo].filter(Boolean).join(' ')

  const context: Record<string, string> = {
    tutor: String(tutor),
    nombre_alumno: String(alumno),
    alumno: String(alumno),
    matricula: String(matricula),
    ciclo: String(ciclo),
    mes: String(mes),
    periodo_cobranza: `${mes}/${ciclo}`,
    deuda: saldo.toFixed(2),
    saldo_total: saldo.toFixed(2),
    saldo_total_formateado: formatCobranzaMoney(saldo),
    fecha_limite_pago: formatDate(deudor?.fechaLimitePago),
    fecha_limite_especial: deudor?.fechaLimiteEspecial ? formatDate(deudor.fechaLimiteEspecial) : '',
    fecha_actual: formatDate(new Date()),
    plantel: String(student?.plantel || deudor?.plantel || ''),
    nivel: String(student?.nivel || deudor?.nivel || ''),
    grado: String(student?.grado || deudor?.grado || ''),
    grupo: String(student?.grupo || deudor?.grupo || ''),
    grado_grupo: gradoGrupo,
    correo: String(student?.correo || deudor?.correo || ''),
    telefono: String(student?.telefono || deudor?.telefono || ''),
    desglose: buildBreakdownText(rows),
    desglose_table: buildBreakdownTable(rows)
  }

  return {
    subject: renderTextTemplate(subject || DEFAULT_COBRANZA_EMAIL_SUBJECT, context).trim() || DEFAULT_COBRANZA_EMAIL_SUBJECT,
    html: renderHtmlTemplate(htmlTemplate || DEFAULT_COBRANZA_EMAIL_TEMPLATE, context, new Set(['desglose', 'desglose_table'])),
    context,
    desglose: rows,
    includeDesglose
  }
}
