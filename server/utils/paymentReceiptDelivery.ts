import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { institutionNameForRecord } from '../../shared/utils/institution'
import { numeroALetras } from './numberToWords'

type ReceiptPayment = Record<string, any>

type ReceiptDocumentInput = {
  items: ReceiptPayment[]
  issuedAt?: Date
  sentByName?: string
  sentByEmail?: string
}

type ReceiptDeliveryInput = ReceiptDocumentInput & {
  sentByName: string
  sentByEmail: string
}

type PdfFont = 'regular' | 'bold' | 'mono' | 'italic'
type PdfTextOptions = {
  size?: number
  font?: PdfFont
  color?: [number, number, number]
  align?: 'left' | 'center' | 'right'
}

type PdfJpeg = {
  data: Buffer
  width: number
  height: number
}

const PAGE_W = 612
const PAGE_H = 792
const MARGIN_X = 26
const CONTENT_W = PAGE_W - MARGIN_X * 2
const SINGLE_RECEIPT_BOTTOM = 378

const COLORS = {
  ink: [31, 41, 55] as [number, number, number],
  muted: [92, 104, 121] as [number, number, number],
  line: [219, 225, 232] as [number, number, number],
  table: [247, 248, 250] as [number, number, number],
  green: [55, 132, 91] as [number, number, number],
  greenDark: [48, 112, 76] as [number, number, number],
  greenSoft: [248, 252, 246] as [number, number, number],
  greenLine: [213, 232, 195] as [number, number, number],
  amberSoft: [255, 251, 235] as [number, number, number],
  amberLine: [253, 230, 138] as [number, number, number],
  amberInk: [146, 64, 14] as [number, number, number],
}

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
const fixedMoney = (value: unknown) => `$${Number(value || 0).toFixed(2)}`

const formatDateTime = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return compact(value) || 'Sin fecha registrada'
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).format(date)
}

const formatDate = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return compact(value) || 'Sin fecha registrada'
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: 'numeric', month: 'numeric', year: 'numeric',
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

const institutionName = (payment: ReceiptPayment) => institutionNameForRecord(payment)
const collectorName = (payment: ReceiptPayment) => compact(payment?.usuario) || 'Administrador no identificado'
const folioLabel = (payment: ReceiptPayment) => compact(payment?.folio_plantel || payment?.folio) || 'Sin folio'
const documentLabel = (payment: ReceiptPayment) => compact(payment?.documento)
  ? compact(payment.documento).padStart(7, '0')
  : 'Sin documento'

const uniqueCollectors = (items: ReceiptPayment[]) => Array.from(new Set(items.map(collectorName)))
const receiptTotal = (items: ReceiptPayment[]) => items.reduce((sum, item) => sum + Number(item?.monto || 0), 0)
const amountInWords = (payment: ReceiptPayment) => compact(payment?.montoLetra) || numeroALetras(Number(payment?.monto || 0))
const paymentWordsLabel = (payment: ReceiptPayment) => {
  const words = amountInWords(payment)
  if (/\d{2}\/100/i.test(words)) return words.replace(/M\.N\.?$/i, 'MXN')
  return `${words} 00/100 MXN`
}
const receiptWords = (items: ReceiptPayment[]) => numeroALetras(receiptTotal(items))

const receiptSenderLabel = (input: Pick<ReceiptDocumentInput, 'sentByName' | 'sentByEmail'>) => {
  const name = compact(input.sentByName)
  const email = compact(input.sentByEmail)
  if (name && email && name.toLowerCase() !== email.toLowerCase()) return `${name} <${email}>`
  return name || email
}

export const paymentReceiptFilename = (items: ReceiptPayment[]) => {
  const first = items[0] || {}
  const folios = items.map(folioLabel)
  return `Comprobante-Pago-${compact(first.matricula) || folios[0] || 'recibo'}.pdf`
}

const fontWidthFactor = (font: PdfFont) => font === 'mono' ? 0.6 : font === 'bold' ? 0.54 : 0.51
const measureText = (value: unknown, size: number, font: PdfFont = 'regular') => (
  sanitizeWinAnsi(value).length * size * fontWidthFactor(font)
)

const wrapTextWidth = (value: unknown, maxWidth: number, size: number, font: PdfFont = 'regular', maxLines = 99) => {
  const words = sanitizeWinAnsi(value).split(/\s+/).filter(Boolean)
  if (!words.length) return ['—']
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (measureText(candidate, size, font) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
    if (lines.length >= maxLines) break
  }
  if (current && lines.length < maxLines) lines.push(current)

  if (words.length && lines.length === maxLines) {
    const joined = lines.join(' ')
    const original = words.join(' ')
    if (joined.length < original.length) {
      let last = lines[lines.length - 1] || ''
      while (last && measureText(`${last}...`, size, font) > maxWidth) last = last.slice(0, -1)
      lines[lines.length - 1] = `${last}...`
    }
  }
  return lines
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

  line(x1: number, y1: number, x2: number, y2: number, color: [number, number, number] = COLORS.line, width = 0.65, dashed = false) {
    this.color(color, true)
    this.lineWidth(width)
    if (dashed) this.raw('[3 3] 0 d')
    this.raw(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`)
    if (dashed) this.raw('[] 0 d')
  }

  text(value: unknown, x: number, y: number, opts: PdfTextOptions = {}) {
    const size = opts.size || 9
    const font = opts.font || 'regular'
    const fontKey = font === 'bold' ? 'F2' : font === 'mono' ? 'F3' : font === 'italic' ? 'F4' : 'F1'
    const color = opts.color || COLORS.ink
    const text = sanitizeWinAnsi(value)
    const approxWidth = measureText(text, size, font)
    let tx = x
    if (opts.align === 'center') tx = x - approxWidth / 2
    if (opts.align === 'right') tx = x - approxWidth
    this.color(color)
    this.raw(`BT /${fontKey} ${size} Tf ${tx.toFixed(2)} ${y.toFixed(2)} Td <${textHex(text)}> Tj ET`)
  }

  image(name: string, x: number, y: number, w: number, h: number) {
    this.raw(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q`)
  }

  toString() { return this.ops.join('\n') }
}

const readJpegDimensions = (data: Buffer) => {
  let offset = 2
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) { offset += 1; continue }
    const marker = data[offset + 1]
    const length = data.readUInt16BE(offset + 2)
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) }
    }
    offset += Math.max(length + 2, 2)
  }
  return { width: 171, height: 109 }
}

let cachedLogo: PdfJpeg | null | undefined
const loadReceiptLogo = (): PdfJpeg | null => {
  if (cachedLogo !== undefined) return cachedLogo
  const candidates = [
    resolve(process.cwd(), 'public/brand/iecs-iedis-logo.jpg'),
    resolve(process.cwd(), '.output/public/brand/iecs-iedis-logo.jpg'),
    resolve(process.cwd(), '../public/brand/iecs-iedis-logo.jpg'),
  ]
  const filepath = candidates.find(candidate => existsSync(candidate))
  if (!filepath) return (cachedLogo = null)
  const data = readFileSync(filepath)
  const dimensions = readJpegDimensions(data)
  return (cachedLogo = { data, ...dimensions })
}

const pdfObject = (id: number, body: string | Buffer) => {
  const prefix = Buffer.from(`${id} 0 obj\n`, 'latin1')
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1')
  const suffix = Buffer.from('\nendobj\n', 'latin1')
  return Buffer.concat([prefix, content, suffix])
}

const buildPdf = (pages: PdfCanvas[], logo: PdfJpeg | null) => {
  const objects = new Map<number, Buffer>()
  objects.set(1, pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'))

  const regularFontId = 3
  const boldFontId = 4
  const monoFontId = 5
  const italicFontId = 6
  const logoId = logo ? 7 : 0
  const firstPageId = logo ? 8 : 7
  const pageIds = pages.map((_, index) => firstPageId + index * 2)
  const streamIds = pages.map((_, index) => firstPageId + index * 2 + 1)

  objects.set(2, pdfObject(2, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`))
  objects.set(regularFontId, pdfObject(regularFontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'))
  objects.set(boldFontId, pdfObject(boldFontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'))
  objects.set(monoFontId, pdfObject(monoFontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'))
  objects.set(italicFontId, pdfObject(italicFontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>'))

  if (logo) {
    const imageHeader = Buffer.from(
      `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.data.length} >>\nstream\n`,
      'latin1',
    )
    objects.set(logoId, pdfObject(logoId, Buffer.concat([imageHeader, logo.data, Buffer.from('\nendstream', 'latin1')])))
  }

  pages.forEach((page, index) => {
    const stream = Buffer.from(page.toString(), 'latin1')
    const xObject = logo ? ` /XObject << /Logo ${logoId} 0 R >>` : ''
    objects.set(pageIds[index], pdfObject(pageIds[index], `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R /F3 ${monoFontId} 0 R /F4 ${italicFontId} 0 R >>${xObject} >> /Contents ${streamIds[index]} 0 R >>`))
    const streamBody = Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'),
      stream,
      Buffer.from('\nendstream', 'latin1'),
    ])
    objects.set(streamIds[index], pdfObject(streamIds[index], streamBody))
  })

  const maxId = Math.max(...objects.keys())
  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')
  const chunks: Buffer[] = [header]
  const offsets = new Array(maxId + 1).fill(0)
  let offset = header.length

  for (let id = 1; id <= maxId; id += 1) {
    const object = objects.get(id)
    if (!object) continue
    offsets[id] = offset
    chunks.push(object)
    offset += object.length
  }

  const xrefOffset = offset
  const xrefLines = ['xref', `0 ${maxId + 1}`, '0000000000 65535 f ']
  for (let id = 1; id <= maxId; id += 1) {
    xrefLines.push(offsets[id]
      ? `${String(offsets[id]).padStart(10, '0')} 00000 n `
      : '0000000000 00000 f ')
  }
  xrefLines.push('trailer', `<< /Size ${maxId + 1} /Root 1 0 R >>`, 'startxref', String(xrefOffset), '%%EOF')
  chunks.push(Buffer.from(xrefLines.join('\n'), 'latin1'))
  return Buffer.concat(chunks)
}

class LegacyReceiptPdf {
  readonly pages: PdfCanvas[] = []
  readonly items: ReceiptPayment[]
  readonly first: ReceiptPayment
  readonly issuedAt: Date
  readonly sender: string
  readonly collectors: string
  readonly logo: PdfJpeg | null
  page!: PdfCanvas
  y = 0

  constructor(input: ReceiptDocumentInput) {
    this.items = input.items
    this.first = input.items[0] || {}
    this.issuedAt = input.issuedAt || new Date()
    this.sender = receiptSenderLabel(input)
    this.collectors = uniqueCollectors(input.items).join(', ')
    this.logo = loadReceiptLogo()
    this.addPage(false)
  }

  addPage(continuation: boolean) {
    this.page = new PdfCanvas()
    this.pages.push(this.page)
    this.drawHeader(continuation)
    this.y = this.drawStudentSummary(continuation ? 690 : 686)
  }

  drawHeader(continuation: boolean) {
    if (this.logo) this.page.image('Logo', MARGIN_X, 710, 58, 38)
    const textX = this.logo ? 84 : MARGIN_X
    const nameLines = wrapTextWidth(institutionName(this.first), 300, 7.2, 'bold', 2)
    nameLines.forEach((line, index) => this.page.text(line, textX, 751 - index * 9, { size: 7.2, font: 'bold', color: [15, 23, 42] }))
    this.page.text(continuation ? 'COMPROBANTE DE PAGO · CONTINUACIÓN' : 'COMPROBANTE DE PAGO', textX, 730 - Math.max(0, nameLines.length - 1) * 4, { size: 10.5, font: 'bold', color: COLORS.green })
    this.page.text('Documento no válido como comprobante fiscal.', textX, 713 - Math.max(0, nameLines.length - 1) * 4, { size: 8.2, color: COLORS.muted })

    this.page.rect(402, 716, 176, 52, COLORS.table, COLORS.line)
    this.page.text('EMISIÓN:', 410, 750, { size: 8, font: 'bold', color: COLORS.muted })
    this.page.text(formatDateTime(this.issuedAt), 570, 750, { size: 8, font: 'mono', align: 'right' })
    this.page.text('ADMINISTRADOR:', 410, 728, { size: 8, font: 'bold', color: COLORS.muted })
    this.page.text(collectorName(this.first), 570, 728, { size: 8.5, font: 'bold', align: 'right' })
    this.page.line(MARGIN_X, 699, PAGE_W - MARGIN_X, 699, [197, 205, 216], 0.8)
  }

  drawStudentSummary(top: number) {
    const x = MARGIN_X
    const widths = [105, 176, 142, CONTENT_W - 423]
    const labels = ['MATRÍCULA', 'ALUMNO', 'CICLO ESCOLAR', 'GRADO Y GRUPO']
    this.page.rect(x, top - 16, CONTENT_W, 16, COLORS.table)
    let cursor = x
    labels.forEach((label, index) => {
      this.page.text(label, cursor + 11, top - 11, { size: 8, font: 'bold', color: [105, 116, 132] })
      cursor += widths[index]
    })

    const valuesTop = top - 35
    this.page.text(compact(this.first.matricula) || 'N/A', x + 11, valuesTop, { size: 9.5, font: 'bold' })
    const nameLines = wrapTextWidth(compact(this.first.nombreCompleto) || '—', widths[1] - 20, 10.2, 'bold', 2)
    nameLines.forEach((line, index) => this.page.text(line, x + widths[0] + 11, valuesTop - index * 13, { size: 10.2, font: 'bold' }))
    this.page.text(formatCiclo(this.first.ciclo), x + widths[0] + widths[1] + 11, valuesTop, { size: 10.2, font: 'bold', color: [55, 65, 81] })
    const placement = [compact(this.first.grado), compact(this.first.grupo)].filter(Boolean).join(' ') || '—'
    const placementLines = wrapTextWidth(placement, widths[3] - 20, 10.2, 'regular', 2)
    placementLines.forEach((line, index) => this.page.text(line, x + widths[0] + widths[1] + widths[2] + 11, valuesTop - index * 13, { size: 10.2, color: [55, 65, 81] }))
    this.page.line(x, top - 55, x + CONTENT_W, top - 55, [229, 233, 239], 0.65)
    return top - 62
  }

  ensure(height: number) {
    if (this.y - height < 88) this.addPage(true)
  }

  drawTableHeader(labels: string[], y: number) {
    const colW = CONTENT_W / labels.length
    this.page.rect(MARGIN_X, y - 15, CONTENT_W, 15, COLORS.table)
    labels.forEach((label, index) => this.page.text(label, MARGIN_X + index * colW + 6, y - 10.5, { size: 7.8, font: 'bold', color: [105, 116, 132] }))
  }

  drawPayment(item: ReceiptPayment, index: number) {
    const conceptLines = wrapTextWidth(compact(item.conceptoNombre) || 'Sin concepto', CONTENT_W / 5 - 12, 9.5, 'bold', 3)
    const wordsLines = wrapTextWidth(paymentWordsLabel(item), CONTENT_W * 3 / 5 - 18, 9.2, 'italic', 3)
    const conceptHeight = Math.max(34, 10 + Math.max(conceptLines.length, wordsLines.length) * 12)
    const otherCampusHeight = isOtherCampusPayment(item) ? 24 : 0
    const needed = 15 + (this.items.length > 1 ? 16 : 0) + 22 + 15 + 22 + 15 + conceptHeight + otherCampusHeight + 12
    this.ensure(needed)

    if (this.items.length > 1) {
      this.page.text(`PAGO ${index + 1} DE ${this.items.length}`, MARGIN_X + 6, this.y - 7, { size: 7, font: 'bold', color: COLORS.muted })
      this.y -= 16
    }

    const colW = CONTENT_W / 5
    this.drawTableHeader(['FOLIO', 'MÉTODO', 'SALDO', 'TOTAL DOC.', 'PAGO'], this.y)
    const firstValueY = this.y - 31
    const firstValues = [folioLabel(item), paymentMethodLabel(item), fixedMoney(item.saldoDespues), fixedMoney(item.importeTotal), fixedMoney(item.monto)]
    firstValues.forEach((value, column) => this.page.text(value, MARGIN_X + column * colW + 6, firstValueY, {
      size: column === 0 ? 8.8 : 9.3,
      font: column === 0 ? 'mono' : column === 4 ? 'bold' : 'regular',
      color: column === 4 ? COLORS.greenDark : COLORS.ink,
    }))
    this.y -= 37

    this.drawTableHeader(['DOCUMENTO', 'SALDO PREVIO', 'ACUMULADO', 'NUEVO ACUM.', 'MES/REF'], this.y)
    const secondValueY = this.y - 31
    const secondValues = [documentLabel(item), fixedMoney(item.saldoAntes), fixedMoney(item.pagos), fixedMoney(item.pagosDespues), monthReference(item)]
    secondValues.forEach((value, column) => this.page.text(value, MARGIN_X + column * colW + 6, secondValueY, {
      size: column === 0 ? 8.7 : 9.2,
      font: column === 0 ? 'mono' : 'regular',
      color: [55, 65, 81],
    }))
    this.y -= 37

    this.page.rect(MARGIN_X, this.y - 15, CONTENT_W, 15, COLORS.table)
    this.page.text('CONCEPTO:', MARGIN_X + 6, this.y - 10.5, { size: 7.8, font: 'bold', color: [105, 116, 132] })
    this.page.text('DETALLE', MARGIN_X + colW + 6, this.y - 10.5, { size: 7.8, font: 'bold', color: [105, 116, 132] })
    const bodyTop = this.y - 29
    conceptLines.forEach((line, lineIndex) => this.page.text(line, MARGIN_X + 6, bodyTop - lineIndex * 12, { size: 9.5, font: 'bold' }))
    this.page.text(formatDate(item.fecha), MARGIN_X + colW + 6, bodyTop, { size: 9.1, color: [55, 65, 81] })
    wordsLines.forEach((line, lineIndex) => this.page.text(line, MARGIN_X + colW * 2 + 6, bodyTop - lineIndex * 12, { size: 9.2, font: 'italic', color: [71, 85, 105] }))
    this.y -= 15 + conceptHeight

    if (isOtherCampusPayment(item)) {
      this.page.rect(MARGIN_X, this.y - 20, CONTENT_W, 20, COLORS.amberSoft, COLORS.amberLine)
      this.page.text('Pago realizado en otro plantel', MARGIN_X + 8, this.y - 13, { size: 7.6, font: 'bold', color: COLORS.amberInk })
      this.page.text(paymentCampusLabel(item), PAGE_W - MARGIN_X - 8, this.y - 13, { size: 7.6, font: 'bold', color: COLORS.amberInk, align: 'right' })
      this.y -= 26
    }

    this.page.line(MARGIN_X, this.y, PAGE_W - MARGIN_X, this.y, [226, 232, 240], 0.6)
    this.y -= 10
  }

  drawSummary(single: boolean) {
    const height = 42
    if (!single) this.ensure(height + 32)
    const top = single ? Math.min(this.y - 8, 486) : this.y - 8
    const bottom = top - height
    this.page.rect(MARGIN_X, bottom, CONTENT_W, height, COLORS.greenSoft, COLORS.greenLine)
    this.page.text('IMPORTE EN LETRA', MARGIN_X + 7, top - 14, { size: 7.2, font: 'bold', color: COLORS.green })
    const words = wrapTextWidth(receiptWords(this.items), CONTENT_W - 155, 8.8, 'regular', 2)
    words.forEach((line, index) => this.page.text(line, MARGIN_X + 7, top - 29 - index * 10, { size: 8.8, color: [55, 65, 81] }))
    const dividerX = PAGE_W - MARGIN_X - 91
    this.page.line(dividerX, bottom + 7, dividerX, top - 7, COLORS.greenLine, 0.7)
    this.page.text('TOTAL ABONADO', PAGE_W - MARGIN_X - 7, top - 14, { size: 7.2, font: 'bold', color: COLORS.greenDark, align: 'right' })
    this.page.text(fixedMoney(receiptTotal(this.items)), PAGE_W - MARGIN_X - 7, bottom + 10, { size: 12, font: 'mono', color: COLORS.greenDark, align: 'right' })
    this.y = bottom - 10
  }

  drawAuditAndFooter(single: boolean) {
    let footerY = single ? SINGLE_RECEIPT_BOTTOM : Math.max(42, this.y - 34)
    if (!single && footerY < 54) {
      this.addPage(true)
      footerY = 82
    }

    const auditLines: Array<[string, string]> = []
    if (this.sender) auditLines.push(['Enviado por', this.sender])
    if (this.collectors) auditLines.push(['Administrador(es) que cobraron', this.collectors])
    const auditStart = footerY + 34 + (auditLines.length - 1) * 10
    auditLines.forEach(([label, value], index) => {
      const y = auditStart - index * 11
      this.page.text(label, MARGIN_X + 7, y, { size: 6.7, font: 'bold', color: [116, 126, 140] })
      const lines = wrapTextWidth(value, CONTENT_W - 160, 6.7, 'regular', 1)
      this.page.text(lines[0], MARGIN_X + 153, y, { size: 6.7, color: [71, 85, 105] })
    })

    this.page.line(MARGIN_X, footerY + 12, PAGE_W - MARGIN_X, footerY + 12, [203, 213, 225], 0.65, true)
    this.page.text('“Compartimos contigo la formación integral de tus hijos”', PAGE_W / 2, footerY - 3, { size: 7.2, font: 'italic', color: [148, 158, 174], align: 'center' })
  }

  render() {
    this.items.forEach((item, index) => this.drawPayment(item, index))
    const single = this.items.length === 1 && this.pages.length === 1
    this.drawSummary(single)
    this.drawAuditAndFooter(single)
    return buildPdf(this.pages, this.logo)
  }
}

export const generatePaymentReceiptPdf = (input: ReceiptDocumentInput) => {
  const items = input.items || []
  if (!items.length) throw new Error('No hay pagos para generar el PDF del recibo.')
  return new LegacyReceiptPdf({ ...input, items }).render()
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
  const sender = receiptSenderLabel(input)
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
                ${htmlRow('Enviado por', sender, { strong: true })}
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
    `Enviado por: ${sender}`,
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
    filename: paymentReceiptFilename(items)
  }
}
