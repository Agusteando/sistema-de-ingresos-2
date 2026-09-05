import { Buffer } from 'node:buffer'

type Student = { nombre?: unknown; grado?: unknown; grupo?: unknown }
type Group = { clave?: unknown; nombre?: unknown; totalAlumnos?: unknown; planteles?: Array<{ plantel?: unknown; students?: Student[] }> }
type Options = { plantel: string; plantelNombre: string; cicloLabel: string; groups: Group[]; generatedAt?: string }
type ZipEntry = { name: string; data: Buffer }
type Sheet = { name: string; title: string; subtitle: string; headers: string[]; rows: Array<Array<string | number>>; widths: number[]; total?: Array<string | number> }

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const clean = (v: unknown) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim()
const xml = (v: unknown) => clean(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const col = (i: number) => { let n = i + 1; let s = ''; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) } return s }
const sheetName = (v: unknown) => clean(v).replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').slice(0, 31) || 'Reporte'
const uniqueName = (v: unknown, used: Set<string>) => { const base = sheetName(v); let out = base; let i = 2; while (used.has(out.toLowerCase())) { const suffix = ` ${i++}`; out = base.slice(0, 31 - suffix.length) + suffix } used.add(out.toLowerCase()); return out }

const crcTable = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0 } return t })()
const crc32 = (b: Buffer) => { let c = 0xFFFFFFFF; for (const x of b) c = crcTable[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
const zip = (entries: ZipEntry[]) => {
  const local: Buffer[] = [], central: Buffer[] = []; let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'), crc = crc32(e.data), h = Buffer.alloc(30)
    h.writeUInt32LE(0x04034B50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(33, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(e.data.length, 18); h.writeUInt32LE(e.data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28)
    local.push(h, name, e.data)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014B50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(33, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(e.data.length, 20); c.writeUInt32LE(e.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42)
    central.push(c, name); offset += h.length + name.length + e.data.length
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, cd, end])
}

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${MAIN}"><fonts count="4"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="16"/><color rgb="FF111827"/><name val="Aptos Display"/></font><font><b/><sz val="10"/><color rgb="FF111827"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF12AFE0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC5D9EE"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B6D8A"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF202020"/></left><right style="thin"><color rgb="FF202020"/></right><top style="thin"><color rgb="FF202020"/></top><bottom style="thin"><color rgb="FF202020"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`

const cell = (ref: string, value: string | number, style: number) => typeof value === 'number'
  ? `<c r="${ref}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`
  : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
const row = (r: number, values: Array<string | number>, stylesForRow: number[], height = 20) => `<row r="${r}" ht="${height}" customHeight="1">${values.map((v, i) => cell(`${col(i)}${r}`, v, stylesForRow[i] ?? 4)).join('')}</row>`
const worksheet = (s: Sheet) => {
  const lastCol = col(s.headers.length - 1), body: string[] = [row(1, [s.title], [1], 29), row(2, [s.subtitle], [2], 21), row(3, s.headers, s.headers.map(() => 3), 25)]
  s.rows.forEach((r, i) => body.push(row(i + 4, r, r.map((_, c) => c === 1 && s.name === 'TOTAL' ? 5 : 4), 21)))
  let lastRow = Math.max(3, s.rows.length + 3)
  if (s.total) { lastRow++; body.push(row(lastRow, s.total, s.total.map(() => 6), 23)) }
  const cols = s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${MAIN}" xmlns:r="${REL}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastCol}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${body.join('')}</sheetData><mergeCells count="2"><mergeCell ref="A1:${lastCol}1"/><mergeCell ref="A2:${lastCol}2"/></mergeCells><printOptions horizontalCentered="1" headings="0" gridLines="0"/><pageMargins left="0.3" right="0.3" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`
}

export const buildTalleresInstitutionalXlsxV2 = (o: Options) => {
  const plantel = clean(o.plantel).toUpperCase(), used = new Set<string>()
  const groups = [...(o.groups || [])].sort((a, b) => clean(a.nombre).localeCompare(clean(b.nombre), 'es', { sensitivity: 'base' }))
  const totalRows = groups.map((g, i) => [i + 1, clean(g.nombre) || clean(g.clave) || 'Taller', Number(g.totalAlumnos || 0)] as Array<string | number>)
  const sheets: Sheet[] = [{ name: uniqueName('TOTAL', used), title: `SERVICIOS CICLO ESCOLAR ${clean(o.cicloLabel)}`.toUpperCase(), subtitle: `IECS · IEDIS | ${clean(o.plantelNombre)} · ${plantel}`, headers: ['NO.', 'TALLER', 'ALUMNOS'], rows: totalRows, widths: [8, 42, 14], total: ['', 'TOTAL', totalRows.reduce((n, r) => n + Number(r[2] || 0), 0)] }]
  for (const g of groups) {
    const name = clean(g.nombre) || clean(g.clave) || 'Taller'
    const campus = (g.planteles || []).find(p => clean(p.plantel).toUpperCase() === plantel)
    const students = Array.isArray(campus?.students) ? campus!.students! : []
    sheets.push({ name: uniqueName(name, used), title: name.toUpperCase(), subtitle: `IECS · IEDIS | ${clean(o.plantelNombre)} · CICLO ESCOLAR ${clean(o.cicloLabel)}`, headers: ['NO.', 'GRADO Y GRUPO', 'NOMBRE'], rows: students.map((s, i) => [i + 1, [clean(s.grado), clean(s.grupo)].filter(Boolean).join(' ') || '—', clean(s.nombre) || '—']), widths: [8, 20, 52] })
  }
  const sheetXml = sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(worksheet(s), 'utf8') }))
  const overrides = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  const workbookSheets = sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
  const rels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
  const titles = sheets.map(s => `<vt:lpstr>${xml(s.name)}</vt:lpstr>`).join(''), styleId = sheets.length + 1
  const created = o.generatedAt && !Number.isNaN(Date.parse(o.generatedAt)) ? new Date(o.generatedAt).toISOString() : new Date().toISOString()
  return zip([
    { name: '[Content_Types].xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`) },
    { name: '_rels/.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`) },
    { name: 'docProps/app.xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Sistema Aurora</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${titles}</vt:vector></TitlesOfParts><Company>IECS-IEDIS</Company><AppVersion>16.0300</AppVersion></Properties>`) },
    { name: 'docProps/core.xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Sistema Aurora</dc:creator><cp:lastModifiedBy>Sistema Aurora</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified><dc:title>Reporte institucional de Talleres</dc:title></cp:coreProperties>`) },
    { name: 'xl/workbook.xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${MAIN}" xmlns:r="${REL}"><fileVersion appName="xl"/><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${workbookSheets}</sheets><calcPr calcId="191029"/></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${styleId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'xl/styles.xml', data: Buffer.from(styles) },
    ...sheetXml,
  ])
}
