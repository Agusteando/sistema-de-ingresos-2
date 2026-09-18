import { resolveFinancialAcademicPlacement } from './financial-academic-placement'

const LEGACY_COBRANZA_EMAIL_SUBJECT = 'Recordatorio de pago - {{nombre_alumno}}'

const LEGACY_COBRANZA_EMAIL_TEMPLATE = `<div style="font-family: Inter, Arial, sans-serif; color: #1f2937; max-width: 680px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; background: #ffffff;">
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

export const DEFAULT_COBRANZA_EMAIL_SUBJECT = 'IECS-IEDIS | Estado de cuenta | {{nombre_alumno}}'

export const DEFAULT_COBRANZA_EMAIL_TEMPLATE = `
  <p style="margin:0 0 18px;color:#50535A;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;">
    Estimado(a) <strong style="color:#30343B;">{{tutor}}</strong>:
  </p>

  <p style="margin:0 0 22px;color:#50535A;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;">
    Como parte del seguimiento administrativo de su cuenta escolar, compartimos el estado de cuenta de
    <strong style="color:#30343B;">{{nombre_alumno}}</strong>.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 22px;border-collapse:separate;border-spacing:0;background:#F7F9F8;border:1px solid #E0E5E3;border-radius:12px;">
    <tr>
      <td style="padding:18px 20px;border-bottom:1px solid #E0E5E3;">
        <div style="color:#86888C;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Alumno</div>
        <div style="margin-top:5px;color:#30343B;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.45;">{{nombre_alumno}}</div>
        <div style="margin-top:4px;color:#6B7076;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;">{{ubicacion_academica}}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td width="56%" valign="top" style="padding:0 14px 0 0;border-right:1px solid #E0E5E3;">
              <div style="color:#86888C;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Saldo pendiente</div>
              <div style="margin-top:4px;color:#00692F;font-family:Fredoka,Montserrat,Arial,Helvetica,sans-serif;font-size:27px;font-weight:600;line-height:1.2;">{{saldo_total_formateado}}</div>
            </td>
            <td width="44%" valign="top" style="padding:0 0 0 16px;">
              <div style="color:#86888C;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Periodo</div>
              <div style="margin-top:4px;color:#30343B;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;">{{periodo_cobranza}}</div>
              <div style="margin-top:12px;color:#86888C;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Fecha límite</div>
              <div style="margin-top:4px;color:#30343B;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;">{{fecha_limite_pago}}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  {{desglose_table}}

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:22px 0 0;border-collapse:separate;border-spacing:0;background:#F2F8F4;border-left:4px solid #618B2F;border-radius:8px;">
    <tr>
      <td style="padding:14px 16px;color:#46504A;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:13px;line-height:1.65;">
        Si el pago ya fue realizado, puede omitir este aviso. Si cuenta con un comprobante pendiente de conciliación, compártalo con el área administrativa de su plantel para su revisión.
      </td>
    </tr>
  </table>
`.trim()

const INSTITUTIONAL_EMAIL_MARKER = 'data-iecs-iedis-email="cobranza-v2"'
const INSTITUTIONAL_LOGO_URL = 'https://aurora.casitaiedis.edu.mx/brand/iecs-iedis-logo.png'

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

const normalizeComparableHtml = (value: unknown) => String(value || '')
  .replace(/\r/g, '')
  .replace(/>\s+</g, '><')
  .replace(/\s+/g, ' ')
  .trim()

const normalizeLegacyTemplate = (value: unknown) => {
  const raw = String(value || '').trim()
  if (!raw) return DEFAULT_COBRANZA_EMAIL_TEMPLATE
  return normalizeComparableHtml(raw) === normalizeComparableHtml(LEGACY_COBRANZA_EMAIL_TEMPLATE)
    ? DEFAULT_COBRANZA_EMAIL_TEMPLATE
    : raw
}

export const normalizeTemplateInput = (template?: CobranzaEmailTemplateInput | null) => {
  const includeRaw = template?.includeDesglose ?? template?.include_desglose
  const rawSubject = String(template?.subject || '').trim()

  return {
    subject: !rawSubject || rawSubject === LEGACY_COBRANZA_EMAIL_SUBJECT
      ? DEFAULT_COBRANZA_EMAIL_SUBJECT
      : rawSubject,
    htmlTemplate: normalizeLegacyTemplate(template?.htmlTemplate || template?.html_template),
    includeDesglose: includeRaw === undefined || includeRaw === null
      ? true
      : Boolean(Number(includeRaw) || includeRaw === true || String(includeRaw).toLowerCase() === 'true')
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
      <td style="padding:11px 12px;border-bottom:1px solid #E6E9E8;color:#40454A;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;">${escapeHtml(item.concepto)}</td>
      <td style="padding:11px 12px;border-bottom:1px solid #E6E9E8;color:#686D72;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;">${escapeHtml(item.periodo)}</td>
      <td style="padding:11px 12px;border-bottom:1px solid #E6E9E8;color:#30343B;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.45;text-align:right;white-space:nowrap;">${formatCobranzaMoney(item.saldo)}</td>
    </tr>
  `).join('')

  return `
    <div style="margin:0 0 22px;">
      <div style="margin:0 0 9px;color:#50535A;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Desglose del saldo</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid #E0E5E3;border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#F4F7F6;">
            <th style="padding:10px 12px;border-bottom:1px solid #E0E5E3;color:#686D72;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;text-align:left;">Concepto</th>
            <th style="padding:10px 12px;border-bottom:1px solid #E0E5E3;color:#686D72;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;text-align:left;">Periodo</th>
            <th style="padding:10px 12px;border-bottom:1px solid #E0E5E3;color:#686D72;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;text-align:right;">Saldo</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot>
          <tr style="background:#FBFCFC;">
            <td colspan="2" style="padding:12px;text-align:right;color:#50535A;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;">Total pendiente</td>
            <td style="padding:12px;color:#00692F;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;text-align:right;white-space:nowrap;">${formatCobranzaMoney(total)}</td>
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

const extractBodyHtml = (html: string) => {
  const bodyMatch = String(html || '').match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch?.[1]) return bodyMatch[1].trim()

  return String(html || '')
    .replace(/<!doctype[^>]*>/ig, '')
    .replace(/<\/?html[^>]*>/ig, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/ig, '')
    .replace(/<\/?body[^>]*>/ig, '')
    .trim()
}

const wrapInstitutionalEmail = (bodyHtml: string) => {
  if (bodyHtml.includes('data-iecs-iedis-email=')) return bodyHtml

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F1F4F3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#F1F4F3;" ${INSTITUTIONAL_EMAIL_MARKER}>
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:680px;border-collapse:separate;border-spacing:0;background:#FFFFFF;border:1px solid #DDE3E0;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(44,63,53,.07);">
            <tr>
              <td style="height:6px;padding:0;background:#00692F;font-size:0;line-height:0;">&nbsp;</td>
              <td style="height:6px;padding:0;background:#007F92;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:24px 28px 20px;background:#FFFFFF;border-bottom:1px solid #E5E9E7;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td valign="middle">
                      <img src="${INSTITUTIONAL_LOGO_URL}" width="164" alt="IECS IEDIS" style="display:block;width:164px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
                    </td>
                    <td valign="middle" align="right" style="color:#86888C;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;">
                      Administración y Cobranza
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding:26px 28px 0;background:#FFFFFF;">
                <div style="color:#618B2F;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Estado de cuenta escolar</div>
                <h1 style="margin:7px 0 0;color:#50535A;font-family:Fredoka,Montserrat,Arial,Helvetica,sans-serif;font-size:25px;font-weight:600;line-height:1.25;">Seguimiento administrativo</h1>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding:22px 28px 28px;background:#FFFFFF;">
                ${extractBodyHtml(bodyHtml)}
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding:18px 28px;background:#50535A;">
                <div style="color:#FFFFFF;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:1.5;">Administración y Cobranza · IECS-IEDIS</div>
                <div style="margin-top:5px;color:#D9DCDD;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:10px;line-height:1.55;">
                  Instituto Educativo La Casita del Saber S.C. · Instituto Educativo para el Desarrollo Integral del Saber S.C.
                </div>
              </td>
            </tr>
            <tr>
              <td style="height:4px;padding:0;background:#618B2F;font-size:0;line-height:0;">&nbsp;</td>
              <td style="height:4px;padding:0;background:#5FB4A9;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
          </table>
          <div style="max-width:680px;margin:12px auto 0;color:#92979B;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:10px;line-height:1.5;text-align:center;">
            Mensaje institucional generado por AURORA.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim()
}

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
  const academic = resolveFinancialAcademicPlacement({
    matricula,
    basePlantel: student?.plantel || deudor?.plantel,
    gradoBase: student?.gradoBase ?? student?.grado ?? deudor?.grado,
    cicloBase: student?.cicloBase ?? student?.ciclo ?? deudor?.ciclo ?? ciclo,
  }, ciclo)
  const grupo = student?.grupo || deudor?.grupo || ''
  const gradoGrupo = [academic.grado, grupo].filter(Boolean).join(' ')
  const plantel = String(student?.plantel || deudor?.plantel || '')
  const ubicacionAcademica = [academic.nivel, gradoGrupo, plantel].filter(Boolean).join(' · ')

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
    plantel,
    nivel: String(academic.nivel || ''),
    grado: String(academic.grado || ''),
    grupo: String(grupo),
    grado_grupo: gradoGrupo,
    ubicacion_academica: ubicacionAcademica,
    correo: String(student?.correo || deudor?.correo || ''),
    telefono: String(student?.telefono || deudor?.telefono || ''),
    desglose: buildBreakdownText(rows),
    desglose_table: buildBreakdownTable(rows)
  }

  const normalized = normalizeTemplateInput({
    subject: subject || DEFAULT_COBRANZA_EMAIL_SUBJECT,
    htmlTemplate: htmlTemplate || DEFAULT_COBRANZA_EMAIL_TEMPLATE,
    includeDesglose
  })
  const renderedContent = renderHtmlTemplate(
    normalized.htmlTemplate,
    context,
    new Set(['desglose', 'desglose_table'])
  )

  return {
    subject: renderTextTemplate(normalized.subject, context).trim() || DEFAULT_COBRANZA_EMAIL_SUBJECT,
    html: wrapInstitutionalEmail(renderedContent),
    context,
    desglose: rows,
    includeDesglose
  }
}
