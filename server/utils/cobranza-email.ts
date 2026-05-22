export const COBRANZA_TEMPLATE_CODE = 'deudores_recordatorio'

export const DEFAULT_COBRANZA_EMAIL_SUBJECT = 'Recordatorio de pago - {{nombre_alumno}}'

export const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const formatMoney = (value: unknown) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2
})

export const DEFAULT_COBRANZA_EMAIL_TEMPLATE = `
<div style="font-family: Inter, Arial, sans-serif; color:#1f2937; max-width:680px; margin:0 auto; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden; background:#ffffff;">
  <div style="background:linear-gradient(135deg,#0f7a3a,#4e844e); color:#ffffff; padding:22px 26px;">
    <p style="margin:0 0 6px; font-size:12px; letter-spacing:.12em; text-transform:uppercase; font-weight:700; opacity:.85;">Cobranza institucional</p>
    <h2 style="margin:0; font-size:21px; line-height:1.25;">Recordatorio de pago</h2>
  </div>
  <div style="padding:26px;">
    <p style="margin:0 0 14px; font-size:15px; line-height:1.55;">Estimado(a) <strong>{{tutor}}</strong>:</p>
    <p style="margin:0 0 14px; font-size:15px; line-height:1.55;">Le compartimos el estado de cuenta de <strong>{{nombre_alumno}}</strong>, matrícula <strong>{{matricula}}</strong>, correspondiente al ciclo <strong>{{ciclo}}</strong>.</p>
    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:14px; padding:16px 18px; margin:18px 0;">
      <p style="margin:0; color:#166534; font-size:12px; text-transform:uppercase; letter-spacing:.08em; font-weight:800;">Saldo pendiente</p>
      <p style="margin:4px 0 0; color:#14532d; font-size:26px; line-height:1; font-weight:900;">{{deuda}}</p>
    </div>
    {{desglose}}
    <p style="margin:18px 0 0; font-size:14px; line-height:1.55; color:#374151;">Si el pago ya fue realizado y está en proceso de conciliación, puede hacer caso omiso a este aviso.</p>
    <p style="margin:18px 0 0; font-size:14px; line-height:1.55; color:#374151;">Quedamos atentos para apoyarle en Administración.</p>
    <p style="margin:22px 0 0; font-size:14px; line-height:1.5;"><strong>Administración y Cobranza</strong><br>IECS · IEDIS</p>
  </div>
</div>`

type BreakdownItem = {
  concepto?: unknown
  conceptoNombre?: unknown
  periodo?: unknown
  mesLabel?: unknown
  mesCargo?: unknown
  saldo?: unknown
}

type CobranzaEmailContext = {
  nombreAlumno?: unknown
  tutor?: unknown
  matricula?: unknown
  mes?: unknown
  ciclo?: unknown
  deuda?: unknown
  plantel?: unknown
  desglose?: BreakdownItem[]
}

export const buildCobranzaBreakdownTable = (items: BreakdownItem[] = []) => {
  const rows = items
    .filter(item => Number(item?.saldo || 0) > 0)
    .map(item => `
      <tr>
        <td style="padding:11px 12px; border-bottom:1px solid #e5e7eb; color:#111827; font-weight:600;">${escapeHtml(item.conceptoNombre ?? item.concepto ?? 'Concepto')}</td>
        <td style="padding:11px 12px; border-bottom:1px solid #e5e7eb; color:#4b5563;">${escapeHtml(item.mesLabel ?? item.periodo ?? item.mesCargo ?? '')}</td>
        <td style="padding:11px 12px; border-bottom:1px solid #e5e7eb; color:#111827; font-weight:700; text-align:right;">${formatMoney(item.saldo)}</td>
      </tr>
    `)
    .join('')

  if (!rows) {
    return `<p style="margin:16px 0 0; padding:13px 14px; border:1px solid #e5e7eb; border-radius:12px; color:#4b5563; background:#f9fafb;">El desglose detallado no está disponible para este aviso. Favor de revisar el estado de cuenta en Administración.</p>`
  }

  return `
    <div style="margin:18px 0;">
      <p style="margin:0 0 8px; color:#374151; font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.06em;">Desglose</p>
      <table style="width:100%; border-collapse:collapse; font-size:13px; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb; color:#6b7280; text-transform:uppercase; letter-spacing:.05em; font-size:11px;">
            <th style="padding:10px 12px; text-align:left; border-bottom:1px solid #e5e7eb;">Concepto</th>
            <th style="padding:10px 12px; text-align:left; border-bottom:1px solid #e5e7eb;">Periodo</th>
            <th style="padding:10px 12px; text-align:right; border-bottom:1px solid #e5e7eb;">Saldo</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

const buildPlainBreakdown = (items: BreakdownItem[] = []) => items
  .filter(item => Number(item?.saldo || 0) > 0)
  .map(item => `${String(item.conceptoNombre ?? item.concepto ?? 'Concepto')} ${String(item.mesLabel ?? item.periodo ?? item.mesCargo ?? '')}: ${formatMoney(item.saldo)}`)
  .join('\n')

export const renderCobranzaEmail = ({
  subject,
  htmlTemplate,
  context
}: {
  subject?: unknown
  htmlTemplate?: unknown
  context: CobranzaEmailContext
}) => {
  const normalizedSubject = String(subject || DEFAULT_COBRANZA_EMAIL_SUBJECT).trim() || DEFAULT_COBRANZA_EMAIL_SUBJECT
  const normalizedTemplate = String(htmlTemplate || DEFAULT_COBRANZA_EMAIL_TEMPLATE).trim() || DEFAULT_COBRANZA_EMAIL_TEMPLATE
  const breakdownTable = buildCobranzaBreakdownTable(context.desglose || [])
  const breakdownText = buildPlainBreakdown(context.desglose || []) || 'Desglose no disponible.'
  const replacements: Record<string, string> = {
    nombre_alumno: escapeHtml(context.nombreAlumno || ''),
    tutor: escapeHtml(context.tutor || 'Padre, madre o tutor'),
    matricula: escapeHtml(context.matricula || ''),
    mes: escapeHtml(context.mes || ''),
    ciclo: escapeHtml(context.ciclo || ''),
    deuda: escapeHtml(formatMoney(context.deuda || 0)),
    deuda_numero: escapeHtml(Number(context.deuda || 0).toFixed(2)),
    plantel: escapeHtml(context.plantel || ''),
    fecha: escapeHtml(new Date().toLocaleDateString('es-MX')),
    desglose: breakdownTable,
    desglose_texto: escapeHtml(breakdownText).replace(/\n/g, '<br>')
  }

  const applyReplacements = (source: string) => source.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => replacements[key] ?? '')

  return {
    subject: applyReplacements(normalizedSubject),
    html: applyReplacements(normalizedTemplate),
    defaultSubject: DEFAULT_COBRANZA_EMAIL_SUBJECT,
    defaultHtmlTemplate: DEFAULT_COBRANZA_EMAIL_TEMPLATE
  }
}
