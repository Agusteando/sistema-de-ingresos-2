type PdfTextOptions = {
  size?: number
  font?: 'regular' | 'bold'
  color?: [number, number, number]
  align?: 'left' | 'center' | 'right'
}

type CartaBecaInput = {
  student: Record<string, any>
  documento: Record<string, any>
  becaTipos: string[]
  motivo?: string
  ciclo: string
  generatedBy?: string
}

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 48

const sanitizeWinAnsi = (value: unknown) => String(value ?? '')
  .replace(/[\u2010-\u2015]/g, '-')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/\u2026/g, '...')
  .replace(/\u00a0/g, ' ')
  .replace(/[^\x09\x0a\x0d\x20-\xff]/g, '')

const textHex = (value: unknown) => Buffer.from(sanitizeWinAnsi(value), 'latin1').toString('hex')

const money = (value: unknown) => `$${Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatDate = (date = new Date()) => new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'long',
  year: 'numeric'
}).format(date)

const titleCase = (value: unknown) => String(value || '')
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
  .join(' ')

const wrapText = (text: string, maxChars: number) => {
  const words = sanitizeWinAnsi(text).split(/\s+/).filter(Boolean)
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
  return lines
}

class PdfCanvas {
  private ops: string[] = []

  raw(op: string) {
    this.ops.push(op)
  }

  color([r, g, b]: [number, number, number], stroke = false) {
    this.raw(`${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} ${stroke ? 'RG' : 'rg'}`)
  }

  lineWidth(width: number) {
    this.raw(`${width.toFixed(2)} w`)
  }

  rect(x: number, y: number, w: number, h: number, color?: [number, number, number], stroke?: [number, number, number]) {
    if (color) this.color(color)
    if (stroke) this.color(stroke, true)
    this.raw(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${color && stroke ? 'B' : color ? 'f' : 'S'}`)
  }

  line(x1: number, y1: number, x2: number, y2: number, color: [number, number, number] = [18, 59, 45], width = 1) {
    this.color(color, true)
    this.lineWidth(width)
    this.raw(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`)
  }

  circle(x: number, y: number, radius: number, color?: [number, number, number], stroke?: [number, number, number]) {
    const c = radius * 0.5522847498
    if (color) this.color(color)
    if (stroke) this.color(stroke, true)
    this.raw([
      `${(x + radius).toFixed(2)} ${y.toFixed(2)} m`,
      `${(x + radius).toFixed(2)} ${(y + c).toFixed(2)} ${(x + c).toFixed(2)} ${(y + radius).toFixed(2)} ${x.toFixed(2)} ${(y + radius).toFixed(2)} c`,
      `${(x - c).toFixed(2)} ${(y + radius).toFixed(2)} ${(x - radius).toFixed(2)} ${(y + c).toFixed(2)} ${(x - radius).toFixed(2)} ${y.toFixed(2)} c`,
      `${(x - radius).toFixed(2)} ${(y - c).toFixed(2)} ${(x - c).toFixed(2)} ${(y - radius).toFixed(2)} ${x.toFixed(2)} ${(y - radius).toFixed(2)} c`,
      `${(x + c).toFixed(2)} ${(y - radius).toFixed(2)} ${(x + radius).toFixed(2)} ${(y - c).toFixed(2)} ${(x + radius).toFixed(2)} ${y.toFixed(2)} c`,
      `${color && stroke ? 'B' : color ? 'f' : 'S'}`
    ].join('\n'))
  }

  text(value: unknown, x: number, y: number, opts: PdfTextOptions = {}) {
    const size = opts.size || 10
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

  paragraph(value: string, x: number, y: number, maxChars: number, lineHeight: number, opts: PdfTextOptions = {}) {
    let cursor = y
    wrapText(value, maxChars).forEach((line) => {
      this.text(line, x, cursor, opts)
      cursor -= lineHeight
    })
    return cursor
  }

  toString() {
    return this.ops.join('\n')
  }
}

const pdfObject = (id: number, body: string) => `${id} 0 obj\n${body}\nendobj\n`

export const generateBecaCartaPdf = ({ student, documento, becaTipos, motivo, ciclo, generatedBy }: CartaBecaInput) => {
  const c = new PdfCanvas()
  const studentName = student.nombreCompleto || [student.apellidoPaterno, student.apellidoMaterno, student.nombre].filter(Boolean).join(' ')
  const concepto = documento.conceptoNombre || documento.concepto || 'Concepto escolar'
  const costo = Number(documento.costo || 0)
  const montoFinal = Number(documento.montoFinal ?? documento.costo ?? 0)
  const descuento = Math.max(0, costo - montoFinal)
  const descuentoPct = costo > 0 ? (descuento * 100) / costo : 0
  const tipos = becaTipos.length ? becaTipos.join(', ') : 'sin tipo registrado'
  const plantel = student.plantel || documento.plantel || ''

  c.rect(0, 0, PAGE_W, PAGE_H, [248, 251, 248])
  c.rect(0, PAGE_H - 118, PAGE_W, 118, [236, 247, 235])
  c.rect(0, PAGE_H - 121, PAGE_W, 3, [66, 129, 56])

  c.circle(78, PAGE_H - 58, 25, [255, 255, 255], [167, 211, 160])
  c.circle(128, PAGE_H - 58, 25, [255, 255, 255], [134, 188, 203])
  c.text('IECS', 78, PAGE_H - 62, { size: 13, font: 'bold', color: [52, 116, 46], align: 'center' })
  c.text('IEDIS', 128, PAGE_H - 62, { size: 13, font: 'bold', color: [39, 113, 139], align: 'center' })
  c.text('SISTEMA DE INGRESOS', 178, PAGE_H - 45, { size: 11, font: 'bold', color: [45, 90, 61] })
  c.text('Carta oficial de beca', 178, PAGE_H - 63, { size: 20, font: 'bold', color: [21, 37, 61] })
  c.text(`Ciclo escolar ${ciclo}`, 178, PAGE_H - 82, { size: 10, color: [92, 105, 124] })
  c.text(`Emitida: ${formatDate()}`, PAGE_W - MARGIN, PAGE_H - 50, { size: 9, color: [92, 105, 124], align: 'right' })
  c.text(`Documento #${documento.documento}`, PAGE_W - MARGIN, PAGE_H - 66, { size: 9, color: [92, 105, 124], align: 'right' })

  c.text('CARTA DE BECA', PAGE_W / 2, PAGE_H - 160, { size: 19, font: 'bold', color: [26, 48, 81], align: 'center' })
  c.text('Constancia administrativa de apoyo aplicado a cargo escolar', PAGE_W / 2, PAGE_H - 180, { size: 10, color: [93, 108, 128], align: 'center' })

  c.rect(MARGIN, PAGE_H - 278, PAGE_W - MARGIN * 2, 72, [255, 255, 255], [217, 228, 219])
  c.text('Alumno(a)', MARGIN + 18, PAGE_H - 230, { size: 8, color: [102, 116, 137] })
  c.text(studentName, MARGIN + 18, PAGE_H - 248, { size: 13, font: 'bold', color: [20, 35, 57] })
  c.text('Matrícula', PAGE_W - MARGIN - 170, PAGE_H - 230, { size: 8, color: [102, 116, 137] })
  c.text(student.matricula || documento.matricula, PAGE_W - MARGIN - 170, PAGE_H - 248, { size: 12, font: 'bold', color: [52, 116, 46] })
  c.text('Plantel / nivel / grado', PAGE_W - MARGIN - 170, PAGE_H - 263, { size: 8, color: [102, 116, 137] })
  c.text([plantel, student.nivel, student.grado].filter(Boolean).join(' · '), PAGE_W - MARGIN - 70, PAGE_H - 263, { size: 9, color: [20, 35, 57], align: 'right' })

  const body = `Por medio de la presente se hace constar que el/la alumno(a) ${studentName}, con matrícula ${student.matricula || documento.matricula}, cuenta con una beca aplicada al concepto "${concepto}" correspondiente al ciclo escolar ${ciclo}. El tipo de beca registrado es: ${tipos}. El monto final autorizado para cobro es ${money(montoFinal)}.`
  c.paragraph(body, MARGIN + 8, PAGE_H - 323, 96, 16, { size: 11, color: [41, 54, 73] })

  c.rect(MARGIN, PAGE_H - 482, PAGE_W - MARGIN * 2, 108, [255, 255, 255], [217, 228, 219])
  c.text('Resumen financiero autorizado', MARGIN + 18, PAGE_H - 400, { size: 12, font: 'bold', color: [26, 71, 46] })
  c.line(MARGIN + 18, PAGE_H - 414, PAGE_W - MARGIN - 18, PAGE_H - 414, [223, 232, 224], 0.7)
  c.text('Concepto', MARGIN + 18, PAGE_H - 436, { size: 9, color: [102, 116, 137] })
  c.text(concepto, MARGIN + 118, PAGE_H - 436, { size: 10, font: 'bold', color: [20, 35, 57] })
  c.text('Monto base', MARGIN + 18, PAGE_H - 456, { size: 9, color: [102, 116, 137] })
  c.text(money(costo), MARGIN + 118, PAGE_H - 456, { size: 10, color: [20, 35, 57] })
  c.text('Monto final', PAGE_W - MARGIN - 176, PAGE_H - 456, { size: 9, color: [102, 116, 137] })
  c.text(money(montoFinal), PAGE_W - MARGIN - 18, PAGE_H - 456, { size: 12, font: 'bold', color: [41, 112, 45], align: 'right' })
  c.text('Apoyo aplicado', MARGIN + 18, PAGE_H - 476, { size: 9, color: [102, 116, 137] })
  c.text(`${money(descuento)} (${descuentoPct.toFixed(2)}%)`, MARGIN + 118, PAGE_H - 476, { size: 10, color: [20, 35, 57] })

  c.rect(MARGIN, PAGE_H - 578, PAGE_W - MARGIN * 2, 72, [248, 251, 248], [221, 232, 222])
  c.text('Motivo / observación', MARGIN + 18, PAGE_H - 532, { size: 10, font: 'bold', color: [26, 71, 46] })
  c.paragraph(motivo || 'Sin motivo adicional registrado.', MARGIN + 18, PAGE_H - 552, 88, 14, { size: 9, color: [83, 96, 115] })

  c.paragraph('Esta carta se emite como soporte administrativo interno. La aplicación de la beca queda sujeta a las políticas institucionales, vigencia del ciclo escolar y validación del área correspondiente.', MARGIN + 8, PAGE_H - 630, 96, 14, { size: 9, color: [83, 96, 115] })

  c.line(PAGE_W - 230, 138, PAGE_W - MARGIN, 138, [99, 119, 101], 0.8)
  c.text('Administración / Control de ingresos', PAGE_W - 139, 120, { size: 9, font: 'bold', color: [31, 65, 44], align: 'center' })
  if (generatedBy) c.text(`Generado por: ${generatedBy}`, PAGE_W - 139, 104, { size: 8, color: [102, 116, 137], align: 'center' })

  c.text('Documento generado por Sistema de Ingresos IECS / IEDIS', MARGIN, 64, { size: 8, color: [118, 131, 149] })
  c.text('Validar contra el expediente del alumno antes de uso externo.', PAGE_W - MARGIN, 64, { size: 8, color: [118, 131, 149], align: 'right' })

  const stream = c.toString()
  const streamBuffer = Buffer.from(stream, 'latin1')
  const objects = [
    pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    pdfObject(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`),
    pdfObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    pdfObject(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    `6 0 obj\n<< /Length ${streamBuffer.length} >>\nstream\n${stream}\nendstream\nendobj\n`
  ]

  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  let offset = Buffer.byteLength(header, 'latin1')
  const xref: number[] = [0]
  const bodyParts: string[] = []

  objects.forEach((obj) => {
    xref.push(offset)
    bodyParts.push(obj)
    offset += Buffer.byteLength(obj, 'latin1')
  })

  const xrefOffset = offset
  const xrefBody = [
    `xref`,
    `0 ${objects.length + 1}`,
    `0000000000 65535 f `,
    ...xref.slice(1).map((item) => `${String(item).padStart(10, '0')} 00000 n `),
    `trailer`,
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    `startxref`,
    String(xrefOffset),
    `%%EOF`
  ].join('\n')

  return Buffer.from(header + bodyParts.join('') + xrefBody, 'latin1')
}
