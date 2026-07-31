import { numeroALetras } from './numberToWords'

type ReceiptPayment = Record<string, any>

type ReceiptDeliveryInput = {
  items: ReceiptPayment[]
  sentByName: string
  sentByEmail: string
  issuedAt?: Date
}

type PdfTextOptions = {
  size?: number
  font?: 'regular' | 'bold'
  color?: [number, number, number]
  align?: 'left' | 'center' | 'right'
}

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 42
const CONTENT_W = PAGE_W - MARGIN * 2

const compact = (value: unknown) => String(value ?? '').trim()
const escapeHtml = (value: unknown) => compact(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const sanitizeWinAnsi = (value: unknown) => String(value ?? '')
  .replace(/[\u2010-\u2015]/g, '-')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/\u2026/g, '...')
  .replace(/\u00a0/g, ' ')
  .replace(/[^\x09\x0a\x0d\x20-\xff]/g, '')

const textHex = (value: unknown) => Buffer.from(sanitizeWinAnsi(value), 'latin1').toString('hex')
const money = (value: unknown) => `$${Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fixedMoney = (value: unknown) => `$${Number(value || 0).toFixed(2)}`

const formatDateTime = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return compact(value) || 'Sin fecha registrada'
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date)
}

const formatDate = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return compact(value) || 'Sin fecha registrada'
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(date)
}

const formatCiclo = (value: unknown) => {
  const key = compact(value).match(/\d{4}/)?.[0] || compact(value) || 'Sin ciclo'
  const year = Number(key)
  return Number.isFinite(year) && key.length === 4 ? `${key}-${year + 1}` : key
}

const normalizedMethod = (value: unknown) => compact(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

const truthyFlag = (value: unknown) => ['1', 'true'].includes(compact(value).toLowerCase())
const isOtherCampusPayment = (payment: ReceiptPayment) => {
  if (truthyFlag(payment?.pago_otro_plantel)) return true
  const method = normalizedMethod(payment?.formaDePago)
  if (method === 'pago realizado en otro plantel') return true
  return truthyFlag(payment?.depurado) && method !== 'depuracion'
}

const paymentMethodLabel = (payment: ReceiptPayment) => {
  const method = compact(payment?.formaDePago)
  return normalizedMethod(method) === 'pago realizado en otro plantel'
    ? 'Método no registrado'
    : (method || 'Sin método registrado')
}

const paymentCampusLabel = (payment: ReceiptPayment) => {
  const plantel = compact(payment?.plantel_pago).toUpperCase()
  return plantel ? `Plantel ${plantel}` : 'Plantel no especificado'
}

const monthReference = (payment: ReceiptPayment) => payment?.mes === 'ev'
  ? formatDate(payment?.fecha)
  : compact(payment?.mesReal || payment?.mes) || 'Sin referencia'

const institutionName = (payment: ReceiptPayment) => payment?.nivel === 'Secundaria'
  ? 'INSTITUTO EDUCATIVO PARA EL DESARROLLO INTEGRAL DEL SABER SC'
  : 'INSTITUTO EDUCATIVO LA CASITA DEL SABER SC'

const collectorName = (payment: ReceiptPayment) => compact(payment?.usuario) || 'Administrador no identificado'
const folioLabel = (payment: ReceiptPayment) => compact(payment?.folio_plantel || payment?.folio) || 'Sin folio'
const documentLabel = (payment: ReceiptPayment) => compact(payment?.documento)
  ? compact(payment.documento).padStart(7, '0')
  : 'Sin documento'

const uniqueCollectors = (items: ReceiptPayment[]) => Array.from(new Set(items.map(collectorName)))
const receiptTotal = (items: ReceiptPayment[]) => items.reduce((sum, item) => sum + Number(item?.monto || 0), 0)
const amountInWords = (payment: ReceiptPayment) => compact(payment?.montoLetra) || numeroALetras(Number(payment?.monto || 0))
const receiptWords = (items: ReceiptPayment[]) => numeroALetras(receiptTotal(items))

const wrapText = (value: unknown, maxChars: number) => {
  const words = sanitizeWinAnsi(value).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  })

  if (current) lines.push(current)
  return lines.length ? lines : ['—']
}

class PdfCanvas {
  private ops: string[] = []

  raw(op: string) { this.ops.push(op) }

  color([r, g, b]: [number, number, number], stroke = false) {
    this.raw(`${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} ${stroke ? 'RG' : 'rg'}`)
  }

  lineWidth(width: number) { this.raw(`${width.toFixed(2)} w`) }

  rect(x: number, y: number, w: number, h: number, fill?: [number, number, number], stroke?: [number, number, number]) {
    if (fill) this.color(fill)
    if (stroke) this.color(stroke, true)
    this.raw(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`)
  }

  line(x1: number, y1: number, x2: number, y2: number, color: [number, number, number] = [210, 218, 226], width = 0.7) {
    this.color(color, true)
    this.lineWidth(width)
    this.raw(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`)
  }

  text(value: unknown, x: number, y: number, opts: PdfTextOptions = {}) {
    const size = opts.size || 9
    const font = opts.font === 'bold' ? 'F2' : 'F1'
    const color = opts.color || [31, 45, 63]
    const text = sanitizeWinAnsi(value)
    const approxWidth = text.length * size * 0.5
    let tx = x
    if (opts.align === 'center') tx = x - approxWidth / 2
    if (opts.align === 'right') tx = x - approxWidth
    this.color(color)
    this.raw(`BT /${font} ${size} Tf ${tx.toFixed(2)} ${y.toFixed(2)} Td <${textHex(text)}> Tj ET`)
  }

  toString() { return this.ops.join('\n') }
}

const pdfObject = (id: number, body: string) => `${id} 0 obj\n${body}\nendobj\n`

class ReceiptPdfDocument {
  pages: PdfCanvas[] = []
  page!: PdfCanvas
  y = PAGE_H - MARGIN
  pageNumber = 0
  readonly first: ReceiptPayment
  readonly sentByName: string
  readonly sentByEmail: string
  readonly issuedAt: Date

  constructor(input: ReceiptDeliveryInput) {
    this.first = input.items[0] || {}
    this.sentByName = compact(input.sentByName) || compact(input.sentByEmail) || 'Usuario del sistema'
    this.sentByEmail = compact(input.sentByEmail)
    this.issuedAt = input.issuedAt || new Date()
    this.page = this.addPage(false)
  }

  addPage(continuation = true) {
    const page = new PdfCanvas()
    this.pages.push(page)
    this.page = page
    this.pageNumber = this.pages.length
    this.y = PAGE_H - MARGIN

    page.rect(0, PAGE_H - 82, PAGE_W, 82, [239, 247, 239])
    page.rect(0, PAGE_H - 85, PAGE_W, 3, [76, 132, 76])
    page.text(institutionName(this.first), MARGIN, PAGE_H - 35, { size: 10, font: 'bold', color: [38, 80, 48] })
    page.text(continuation ? 'COMPROBANTE DE PAGO · CONTINUACIÓN' : 'COMPROBANTE DE PAGO INSTITUCIONAL', MARGIN, PAGE_H - 55, { size: 17, font: 'bold', color: [22, 41, 61] })
    page.text(`Página ${this.pageNumber}`, PAGE_W - MARGIN, PAGE_H - 38, { size: 8, color: [85, 100, 119], align: 'right' })
    page.text(`Emisión: ${formatDateTime(this.issuedAt)}`, PAGE_W - MARGIN, PAGE_H - 54, { size: 8, color: [85, 100, 119], align: 'right' })
    this.y = PAGE_H - 105

    if (continuation) {
      page.text(`${compact(this.first.nombreCompleto) || 'Alumno no identificado'} · ${compact(this.first.matricula) || 'Sin matrícula'}`, MARGIN, this.y, { size: 9, font: 'bold' })
      this.y -= 20
    }

    return page
  }

  ensure(height: number) {
    if (this.y - height < 52) this.addPage(true)
  }

  labelValue(label: string, value: unknown, opts: { bold?: boolean; maxChars?: number } = {}) {
    const lines = wrapText(value, opts.maxChars || 76)
    const needed = Math.max(16, lines.length * 12 + 3)
    this.ensure(needed)
    this.page.text(label, MARGIN, this.y, { size: 8, font: 'bold', color: [88, 104, 122] })
    lines.forEach((line, index) => {
      this.page.text(line, MARGIN + 132, this.y - index * 12, {
        size: 9,
        font: opts.bold ? 'bold' : 'regular',
        color: [27, 42, 60]
      })
    })
    this.y -= needed
  }

  section(title: string) {
    this.ensure(32)
    this.page.rect(MARGIN, this.y - 19, CONTENT_W, 25, [247, 249, 251], [220, 226, 232])
    this.page.text(title, MARGIN + 10, this.y - 11, { size: 10, font: 'bold', color: [47, 84, 57] })
    this.y -= 35
  }

  payment(item: ReceiptPayment, index: number, totalItems: number) {
    const details: Array<[string, unknown, boolean?]> = [
      ['Administrador que cobró', collectorName(item), true],
      ['Fecha del pago', formatDateTime(item.fecha)],
      ['Método de pago', paymentMethodLabel(item)],
      ['Documento', documentLabel(item)],
      ['Concepto', compact(item.conceptoNombre) || 'Sin concepto'],
      ['Mes / referencia', monthReference(item)],
      ['Pago recibido', fixedMoney(item.monto), true],
      ['Total del documento', fixedMoney(item.importeTotal)],
      ['Saldo previo', fixedMoney(item.saldoAntes)],
      ['Acumulado previo', fixedMoney(item.pagos)],
      ['Nuevo acumulado', fixedMoney(item.pagosDespues)],
      ['Saldo después del pago', fixedMoney(item.saldoDespues)],
      ['Importe en letra', amountInWords(item)],
    ]

    if (isOtherCampusPayment(item)) details.push(['Pago realizado en', paymentCampusLabel(item), true])

    const estimatedHeight = 58 + details.reduce((height, [label, value]) => {
      const maxChars = label === 'Concepto' || label === 'Importe en letra' ? 70 : 78
      return height + Math.max(16, wrapText(value, maxChars).length * 12 + 3)
    }, 0)
    this.ensure(Math.min(estimatedHeight, PAGE_H - 150))

    this.page.rect(MARGIN, this.y - 24, CONTENT_W, 30, [236, 246, 237], [190, 212, 192])
    this.page.text(`PAGO ${index + 1} DE ${totalItems}`, MARGIN + 10, this.y - 14, { size: 10, font: 'bold', color: [42, 96, 51] })
    this.page.text(`Folio ${folioLabel(item)}`, PAGE_W - MARGIN - 10, this.y - 14, { size: 10, font: 'bold', color: [42, 96, 51], align: 'right' })
    this.y -= 40

    details.forEach(([label, value, bold]) => this.labelValue(label, value, { bold, maxChars: label === 'Concepto' || label === 'Importe en letra' ? 70 : 78 }))
    this.ensure(10)
    this.page.line(MARGIN, this.y, PAGE_W - MARGIN, this.y)
    this.y -= 18
  }

  finalize() {
    this.pages.forEach((page, index) => {
      page.line(MARGIN, 38, PAGE_W - MARGIN, 38, [220, 226, 232], 0.6)
      page.text('Documento informativo; no válido como comprobante fiscal.', MARGIN, 24, { size: 7.5, color: [104, 116, 132] })
      page.text(`Página ${index + 1} de ${this.pages.length}`, PAGE_W - MARGIN, 24, { size: 7.5, color: [104, 116, 132], align: 'right' })
    })
  }
}

const buildPdf = (pages: PdfCanvas[]) => {
  const pageIds = pages.map((_, index) => 5 + index * 2)
  const streamIds = pages.map((_, index) => 6 + index * 2)
  const objects: string[] = [
    pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    pdfObject(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`),
    pdfObject(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    pdfObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
  ]

  pages.forEach((page, index) => {
    const stream = page.toString()
    objects.push(pdfObject(pageIds[index], `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamIds[index]} 0 R >>`))
    objects.push(pdfObject(streamIds[index], `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`))
  })

  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets = [0]
  let offset = Buffer.byteLength(header, 'latin1')
  const body = objects.map((object) => {
    offsets.push(offset)
    offset += Buffer.byteLength(object, 'latin1')
    return object
  }).join('')

  const xrefOffset = offset
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.slice(1).map((item) => `${String(item).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF'
  ].join('\n')

  return Buffer.from(header + body + xref, 'latin1')
}

export const generatePaymentReceiptPdf = (input: ReceiptDeliveryInput) => {
  const items = input.items || []
  if (!items.length) throw new Error('No hay pagos para generar el PDF del recibo.')

  const doc = new ReceiptPdfDocument(input)
  const first = items[0]
  const collectors = uniqueCollectors(items)

  doc.section('DATOS DEL ENVÍO Y DEL ALUMNO')
  doc.labelValue('Enviado por', `${compact(input.sentByName) || input.sentByEmail} <${compact(input.sentByEmail)}>`, { bold: true })
  doc.labelValue('Administrador(es) que cobraron', collectors.join(', '), { bold: true })
  doc.labelValue('Matrícula', compact(first.matricula) || 'Sin matrícula', { bold: true })
  doc.labelValue('Alumno', compact(first.nombreCompleto) || 'Alumno no identificado', { bold: true })
  doc.labelValue('Ciclo escolar', formatCiclo(first.ciclo))
  doc.labelValue('Grado y grupo', [compact(first.grado), compact(first.grupo)].filter(Boolean).join(' ') || 'Sin grado o grupo registrado')
  doc.labelValue('Nivel', compact(first.nivel) || 'Sin nivel registrado')
  doc.labelValue('Institución', institutionName(first))

  items.forEach((item, index) => doc.payment(item, index, items.length))

  doc.section('RESUMEN DEL RECIBO')
  doc.labelValue('Número de pagos', String(items.length))
  doc.labelValue('Folios incluidos', items.map(folioLabel).join(', '), { maxChars: 72 })
  doc.labelValue('Total abonado', fixedMoney(receiptTotal(items)), { bold: true })
  doc.labelValue('Importe en letra', receiptWords(items), { bold: true, maxChars: 70 })
  doc.labelValue('Leyenda', 'Compartimos contigo la formación integral de tus hijos.')
  doc.finalize()

  return buildPdf(doc.pages)
}

const htmlRow = (label: string, value: unknown, options: { strong?: boolean; tone?: string } = {}) => `
  <tr>
    <th style="width: 42%; padding: 7px 10px; text-align: left; vertical-align: top; color: #667085; font-size: 12px; font-weight: 600; border-bottom: 1px solid #EAECF0;">${escapeHtml(label)}</th>
    <td style="padding: 7px 10px; vertical-align: top; color: ${options.tone || '#1D2939'}; font-size: 12px; font-weight: ${options.strong ? '700' : '400'}; border-bottom: 1px solid #EAECF0;">${escapeHtml(value) || '—'}</td>
  </tr>`

const paymentHtml = (item: ReceiptPayment, index: number, totalItems: number) => {
  const otherCampus = isOtherCampusPayment(item)
    ? htmlRow('Pago realizado en', paymentCampusLabel(item), { strong: true, tone: '#92400E' })
    : ''

  return `
    <section style="margin: 22px 0; border: 1px solid #D0D5DD; border-radius: 10px; overflow: hidden;">
      <div style="display: flex; justify-content: space-between; gap: 12px; padding: 12px 14px; background: #EEF6EE; color: #285D32; font-size: 13px; font-weight: 700;">
        <span>Pago ${index + 1} de ${totalItems}</span>
        <span>Folio ${escapeHtml(folioLabel(item))}</span>
      </div>
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        ${htmlRow('Administrador que cobró', collectorName(item), { strong: true })}
        ${htmlRow('Fecha del pago', formatDateTime(item.fecha))}
        ${htmlRow('Método de pago', paymentMethodLabel(item))}
        ${htmlRow('Documento', documentLabel(item))}
        ${htmlRow('Concepto', compact(item.conceptoNombre) || 'Sin concepto', { strong: true })}
        ${htmlRow('Mes / referencia', monthReference(item))}
        ${htmlRow('Pago recibido', fixedMoney(item.monto), { strong: true, tone: '#285D32' })}
        ${htmlRow('Total del documento', fixedMoney(item.importeTotal))}
        ${htmlRow('Saldo previo', fixedMoney(item.saldoAntes))}
        ${htmlRow('Acumulado previo', fixedMoney(item.pagos))}
        ${htmlRow('Nuevo acumulado', fixedMoney(item.pagosDespues))}
        ${htmlRow('Saldo después del pago', fixedMoney(item.saldoDespues))}
        ${htmlRow('Importe en letra', amountInWords(item))}
        ${otherCampus}
      </table>
    </section>`
}

export const renderPaymentReceiptEmail = (input: ReceiptDeliveryInput) => {
  const items = input.items || []
  if (!items.length) throw new Error('No hay pagos para preparar el correo del recibo.')

  const first = items[0]
  const total = receiptTotal(items)
  const collectors = uniqueCollectors(items)
  const issuedAt = input.issuedAt || new Date()
  const folios = items.map(folioLabel)
  const subject = `Comprobante de pago · ${compact(first.nombreCompleto) || compact(first.matricula) || folios.join(', ')}`

  const html = `<!doctype html>
  <html lang="es">
    <body style="margin: 0; padding: 0; background: #F2F4F7; color: #1D2939; font-family: Arial, Helvetica, sans-serif;">
      <div style="max-width: 720px; margin: 0 auto; padding: 28px 14px;">
        <article style="background: #FFFFFF; border: 1px solid #D0D5DD; border-radius: 14px; overflow: hidden; box-shadow: 0 8px 24px rgba(16,24,40,.06);">
          <header style="padding: 24px; background: #EEF6EE; border-bottom: 3px solid #4E844E;">
            <div style="font-size: 12px; font-weight: 700; color: #4E844E; letter-spacing: .05em; text-transform: uppercase;">${escapeHtml(institutionName(first))}</div>
            <h1 style="margin: 8px 0 6px; color: #1D2939; font-size: 22px; line-height: 1.25;">Comprobante de pago institucional</h1>
            <p style="margin: 0; color: #475467; font-size: 13px; line-height: 1.6;">Se adjunta el recibo completo en formato PDF. Este mensaje conserva el desglose íntegro para consulta y aclaraciones.</p>
          </header>

          <div style="padding: 24px;">
            <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.7;">Estimado padre, madre o tutor:</p>
            <p style="margin: 0 0 22px; font-size: 14px; line-height: 1.7;">Compartimos el comprobante correspondiente a los pagos registrados para <strong>${escapeHtml(compact(first.nombreCompleto) || 'el alumno')}</strong>. El PDF adjunto contiene la misma información detallada que se muestra en el recibo del sistema.</p>

            <section style="margin-bottom: 22px; border: 1px solid #D0D5DD; border-radius: 10px; overflow: hidden;">
              <div style="padding: 11px 14px; background: #F9FAFB; color: #344054; font-size: 13px; font-weight: 700;">Datos de envío y del alumno</div>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                ${htmlRow('Fecha de emisión', formatDateTime(issuedAt))}
                ${htmlRow('Enviado por', `${compact(input.sentByName) || input.sentByEmail} <${compact(input.sentByEmail)}>`, { strong: true })}
                ${htmlRow('Administrador(es) que cobraron', collectors.join(', '), { strong: true })}
                ${htmlRow('Matrícula', compact(first.matricula) || 'Sin matrícula', { strong: true })}
                ${htmlRow('Alumno', compact(first.nombreCompleto) || 'Alumno no identificado', { strong: true })}
                ${htmlRow('Ciclo escolar', formatCiclo(first.ciclo))}
                ${htmlRow('Grado y grupo', [compact(first.grado), compact(first.grupo)].filter(Boolean).join(' ') || 'Sin grado o grupo registrado')}
                ${htmlRow('Nivel', compact(first.nivel) || 'Sin nivel registrado')}
                ${htmlRow('Institución', institutionName(first))}
              </table>
            </section>

            ${items.map((item, index) => paymentHtml(item, index, items.length)).join('')}

            <section style="margin-top: 24px; padding: 18px; border-radius: 10px; border: 1px solid #B7D7B8; background: #F3FAF3;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                ${htmlRow('Número de pagos', String(items.length))}
                ${htmlRow('Folios incluidos', folios.join(', '))}
                ${htmlRow('Total abonado', fixedMoney(total), { strong: true, tone: '#285D32' })}
                ${htmlRow('Importe en letra', receiptWords(items), { strong: true })}
              </table>
            </section>

            <p style="margin: 22px 0 0; color: #667085; font-size: 12px; line-height: 1.65;">Este documento es de carácter informativo y no es válido como comprobante fiscal. Conserve el correo y el PDF adjunto para futuras aclaraciones.</p>
          </div>

          <footer style="padding: 16px 24px; background: #F9FAFB; border-top: 1px solid #EAECF0; color: #667085; font-size: 11px; text-align: center;">“Compartimos contigo la formación integral de tus hijos”</footer>
        </article>
      </div>
    </body>
  </html>`

  const textLines = [
    'COMPROBANTE DE PAGO INSTITUCIONAL',
    institutionName(first),
    '',
    `Fecha de emisión: ${formatDateTime(issuedAt)}`,
    `Enviado por: ${compact(input.sentByName) || input.sentByEmail} <${compact(input.sentByEmail)}>`,
    `Administrador(es) que cobraron: ${collectors.join(', ')}`,
    `Matrícula: ${compact(first.matricula) || 'Sin matrícula'}`,
    `Alumno: ${compact(first.nombreCompleto) || 'Alumno no identificado'}`,
    `Ciclo escolar: ${formatCiclo(first.ciclo)}`,
    `Grado y grupo: ${[compact(first.grado), compact(first.grupo)].filter(Boolean).join(' ') || 'Sin grado o grupo registrado'}`,
    `Nivel: ${compact(first.nivel) || 'Sin nivel registrado'}`,
    '',
    ...items.flatMap((item, index) => [
      `PAGO ${index + 1} DE ${items.length}`,
      `Folio: ${folioLabel(item)}`,
      `Administrador que cobró: ${collectorName(item)}`,
      `Fecha del pago: ${formatDateTime(item.fecha)}`,
      `Método de pago: ${paymentMethodLabel(item)}`,
      `Documento: ${documentLabel(item)}`,
      `Concepto: ${compact(item.conceptoNombre) || 'Sin concepto'}`,
      `Mes / referencia: ${monthReference(item)}`,
      `Pago recibido: ${fixedMoney(item.monto)}`,
      `Total del documento: ${fixedMoney(item.importeTotal)}`,
      `Saldo previo: ${fixedMoney(item.saldoAntes)}`,
      `Acumulado previo: ${fixedMoney(item.pagos)}`,
      `Nuevo acumulado: ${fixedMoney(item.pagosDespues)}`,
      `Saldo después del pago: ${fixedMoney(item.saldoDespues)}`,
      `Importe en letra: ${amountInWords(item)}`,
      ...(isOtherCampusPayment(item) ? [`Pago realizado en: ${paymentCampusLabel(item)}`] : []),
      ''
    ]),
    `Número de pagos: ${items.length}`,
    `Folios incluidos: ${folios.join(', ')}`,
    `Total abonado: ${fixedMoney(total)}`,
    `Importe en letra: ${receiptWords(items)}`,
    '',
    'Se adjunta el recibo completo en PDF.',
    'Documento informativo; no válido como comprobante fiscal.'
  ]

  return {
    subject,
    html,
    text: textLines.join('\n'),
    filename: `Comprobante-Pago-${compact(first.matricula) || folios[0] || 'recibo'}.pdf`
  }
}
