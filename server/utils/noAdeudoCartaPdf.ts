import { generateQrMatrix, type QrMatrix } from './qr'

type PdfTextOptions = {
  size?: number
  font?: 'regular' | 'bold'
  color?: [number, number, number]
  align?: 'left' | 'center' | 'right'
}

export type NoAdeudoCartaPdfInput = {
  student: Record<string, any>
  ciclo: string
  generatedBy: string
  generatedByEmail?: string
  issuedAt: Date
  validationUrl: string
  verificationToken: string
  verificationHash: string
  debtTotal?: number
  preview?: boolean
}

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 46

const sanitizeWinAnsi = (value: unknown) => String(value ?? '')
  .replace(/[\u2010-\u2015]/g, '-')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/\u2026/g, '...')
  .replace(/\u00a0/g, ' ')
  .replace(/[^\x09\x0a\x0d\x20-\xff]/g, '')

const textHex = (value: unknown) => Buffer.from(sanitizeWinAnsi(value), 'latin1').toString('hex')

const formatDate = (date = new Date()) => new Intl.DateTimeFormat('es-MX', {
  day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
}).format(date)

const titleCase = (value: unknown) => String(value || '')
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
  .join(' ')

const compact = (value: unknown) => String(value || '').trim()

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

  raw(op: string) { this.ops.push(op) }

  color([r, g, b]: [number, number, number], stroke = false) {
    this.raw(`${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} ${stroke ? 'RG' : 'rg'}`)
  }

  lineWidth(width: number) { this.raw(`${width.toFixed(2)} w`) }

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

  drawQr(matrix: QrMatrix, x: number, y: number, boxSize: number) {
    const border = 4
    const totalModules = matrix.size + border * 2
    const moduleSize = boxSize / totalModules
    this.rect(x - 7, y - 7, boxSize + 14, boxSize + 14, [255, 255, 255], [205, 218, 210])
    this.color([18, 35, 54])
    for (let row = 0; row < matrix.size; row++) {
      for (let col = 0; col < matrix.size; col++) {
        if (!matrix.modules[row][col]) continue
        const px = x + (col + border) * moduleSize
        const py = y + (totalModules - row - border - 1) * moduleSize
        this.raw(`${px.toFixed(2)} ${py.toFixed(2)} ${(moduleSize + 0.01).toFixed(2)} ${(moduleSize + 0.01).toFixed(2)} re f`)
      }
    }
  }

  toString() { return this.ops.join('\n') }
}

const pdfObject = (id: number, body: string) => `${id} 0 obj\n${body}\nendobj\n`

const drawSecurityBackground = (c: PdfCanvas) => {
  c.rect(0, 0, PAGE_W, PAGE_H, [248, 251, 249])
  c.rect(0, PAGE_H - 122, PAGE_W, 122, [236, 247, 235])
  c.rect(0, PAGE_H - 126, PAGE_W, 4, [58, 132, 62])
  c.rect(0, 0, 18, PAGE_H, [40, 95, 48])
  c.rect(PAGE_W - 18, 0, 18, PAGE_H, [40, 95, 48])

  for (let x = 34; x < PAGE_W - 34; x += 26) c.line(x, 118, x + 88, PAGE_H - 150, [229, 238, 230], 0.38)
  for (let y = 132; y < PAGE_H - 150; y += 34) c.line(MARGIN, y, PAGE_W - MARGIN, y + 16, [233, 240, 234], 0.32)
  for (let i = 0; i < 7; i++) c.circle(PAGE_W / 2, 386, 74 + i * 20, undefined, [232, 240, 233])

  c.text('IECS · IEDIS · DOCUMENTO INTRANSFERIBLE · VALIDACIÓN QR', PAGE_W / 2, 410, {
    size: 18, font: 'bold', color: [222, 232, 224], align: 'center'
  })
}

const buildStudentName = (student: Record<string, any>) => compact(student.nombreCompleto || student.nombreCompletoAlumno) ||
  [student.apellidoPaterno, student.apellidoMaterno, student.nombres || student.nombre].filter(Boolean).join(' ')

export const generateNoAdeudoCartaPdf = ({
  student,
  ciclo,
  generatedBy,
  generatedByEmail,
  issuedAt,
  validationUrl,
  verificationToken,
  verificationHash,
  preview = false
}: NoAdeudoCartaPdfInput) => {
  const c = new PdfCanvas()
  const studentName = titleCase(buildStudentName(student))
  const matricula = compact(student.matricula)
  const plantel = compact(student.plantel)
  const nivelGrado = [student.nivel || student.nivelBase, student.grado || student.gradoBase, student.grupo].filter(Boolean).join(' · ')
  const qr = generateQrMatrix(validationUrl, { ecc: 'M', maxVersion: 24 })
  const shortHash = verificationHash.slice(0, 18).toUpperCase()

  drawSecurityBackground(c)

  c.circle(72, PAGE_H - 62, 25, [255, 255, 255], [158, 208, 156])
  c.circle(122, PAGE_H - 62, 25, [255, 255, 255], [123, 183, 198])
  c.text('IECS', 72, PAGE_H - 66, { size: 13, font: 'bold', color: [52, 116, 46], align: 'center' })
  c.text('IEDIS', 122, PAGE_H - 66, { size: 13, font: 'bold', color: [32, 103, 128], align: 'center' })
  c.text('AURORA · ADMINISTRACIÓN ESCOLAR', 166, PAGE_H - 49, { size: 10, font: 'bold', color: [45, 90, 61] })
  c.text('Carta de No Adeudo', 166, PAGE_H - 69, { size: 21, font: 'bold', color: [18, 35, 54] })
  c.text(`Ciclo escolar ${ciclo}`, 166, PAGE_H - 88, { size: 10, color: [90, 104, 122] })
  c.text(formatDate(issuedAt), PAGE_W - MARGIN, PAGE_H - 53, { size: 9, color: [90, 104, 122], align: 'right' })
  c.text(`Folio QR ${shortHash}`, PAGE_W - MARGIN, PAGE_H - 70, { size: 8, color: [90, 104, 122], align: 'right' })

  if (preview) {
    c.rect(MARGIN, PAGE_H - 152, PAGE_W - MARGIN * 2, 26, [255, 246, 224], [234, 187, 88])
    c.text('PREVISUALIZACIÓN — no enviar ni validar como documento final', PAGE_W / 2, PAGE_H - 144, {
      size: 10, font: 'bold', color: [151, 91, 18], align: 'center'
    })
  }

  c.text('CONSTANCIA ADMINISTRATIVA', PAGE_W / 2, PAGE_H - 188, { size: 13, font: 'bold', color: [69, 91, 112], align: 'center' })
  c.text('CARTA DE NO ADEUDO', PAGE_W / 2, PAGE_H - 212, { size: 23, font: 'bold', color: [18, 35, 54], align: 'center' })

  c.rect(MARGIN, PAGE_H - 318, PAGE_W - MARGIN * 2, 78, [255, 255, 255], [210, 225, 214])
  c.text('Alumno(a)', MARGIN + 18, PAGE_H - 263, { size: 8, color: [103, 116, 134] })
  c.text(studentName, MARGIN + 18, PAGE_H - 282, { size: 14, font: 'bold', color: [18, 35, 54] })
  c.text('Matrícula', PAGE_W - MARGIN - 180, PAGE_H - 263, { size: 8, color: [103, 116, 134] })
  c.text(matricula, PAGE_W - MARGIN - 18, PAGE_H - 282, { size: 13, font: 'bold', color: [52, 116, 46], align: 'right' })
  c.text('Plantel / nivel / grado', PAGE_W - MARGIN - 180, PAGE_H - 300, { size: 8, color: [103, 116, 134] })
  c.text([plantel, nivelGrado].filter(Boolean).join(' · '), PAGE_W - MARGIN - 18, PAGE_H - 300, { size: 9, color: [18, 35, 54], align: 'right' })

  const body = `Por medio de la presente se hace constar que, de acuerdo con los registros administrativos disponibles al momento de emisión, el/la alumno(a) ${studentName}, con matrícula ${matricula}, no presenta adeudo registrado para el ciclo escolar ${ciclo}.`
  let cursor = c.paragraph(body, MARGIN + 10, PAGE_H - 372, 93, 17, { size: 11.2, color: [37, 51, 70] })
  cursor -= 16
  c.paragraph('Esta constancia es personal e intransferible. Su validez depende de la verificación del código QR y de que los datos escaneados coincidan con los datos visibles del documento.', MARGIN + 10, cursor, 94, 15, { size: 10.2, color: [72, 86, 105] })

  c.rect(MARGIN, PAGE_H - 548, PAGE_W - MARGIN * 2, 88, [247, 251, 247], [215, 229, 218])
  c.text('Elementos de seguridad', MARGIN + 18, PAGE_H - 488, { size: 12, font: 'bold', color: [28, 80, 47] })
  c.text('• QR firmado con identidad del alumno y generador', MARGIN + 20, PAGE_H - 510, { size: 9.2, color: [69, 83, 101] })
  c.text('• Folio criptográfico visible y trazable', MARGIN + 20, PAGE_H - 527, { size: 9.2, color: [69, 83, 101] })
  c.text('• Fondo institucional, microtexto y documento plano sin campos editables', MARGIN + 20, PAGE_H - 544, { size: 9.2, color: [69, 83, 101] })

  const qrX = PAGE_W - MARGIN - 132
  const qrY = 118
  c.drawQr(qr, qrX, qrY, 122)
  c.text('VALIDACIÓN QR', qrX + 61, qrY - 20, { size: 9, font: 'bold', color: [18, 35, 54], align: 'center' })
  c.text('Escanear antes de aceptar', qrX + 61, qrY - 35, { size: 8, color: [91, 104, 121], align: 'center' })

  c.line(MARGIN + 12, 186, MARGIN + 222, 186, [95, 117, 99], 0.8)
  c.text('Administración Escolar', MARGIN + 117, 166, { size: 10, font: 'bold', color: [31, 65, 44], align: 'center' })
  c.text(`Generado por: ${generatedBy || 'Sistema Aurora'}`, MARGIN + 117, 151, { size: 8.2, color: [97, 111, 128], align: 'center' })
  if (generatedByEmail) c.text(generatedByEmail, MARGIN + 117, 138, { size: 7.5, color: [111, 123, 139], align: 'center' })

  c.text('Documento generado por Aurora · Sistema de Ingresos IECS / IEDIS', MARGIN, 72, { size: 8, color: [112, 126, 144] })
  c.text(`Verificación: ${shortHash}`, MARGIN, 58, { size: 7.5, color: [112, 126, 144] })
  c.text(`Token: ${verificationToken.slice(0, 20)}…`, PAGE_W - MARGIN, 58, { size: 7.5, color: [112, 126, 144], align: 'right' })

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
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...xref.slice(1).map((item) => `${String(item).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF'
  ].join('\n')

  return Buffer.from(header + bodyParts.join('') + xrefBody, 'latin1')
}
