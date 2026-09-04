import { Buffer } from 'node:buffer'

type StudentRow = {
  matricula?: unknown
  nombre?: unknown
  grado?: unknown
  grupo?: unknown
}

type TallerGroup = {
  clave?: unknown
  nombre?: unknown
  totalAlumnos?: unknown
  planteles?: Array<{
    plantel?: unknown
    alumnos?: unknown
    students?: StudentRow[]
  }>
}

type InstitutionalWorkbookOptions = {
  plantel: string
  plantelNombre: string
  cicloLabel: string
  groups: TallerGroup[]
  generatedAt?: string
}

type ZipEntry = { name: string; data: Buffer }
type SheetModel = {
  name: string
  title: string
  subtitle: string
  headers: string[]
  rows: Array<Array<string | number>>
  columnWidths: number[]
  numericColumns?: number[]
  totalRow?: Array<string | number>
  summaryStyle?: boolean
}

const XML_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const escapeXml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const text = (value: unknown) => String(value ?? '').trim()

const columnName = (index: number) => {
  let value = index + 1
  let output = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    output = String.fromCharCode(65 + remainder) + output
    value = Math.floor((value - 1) / 26)
  }
  return output
}

const sanitizeSheetName = (value: string) => text(value)
  .replace(/[\[\]:*?/\\]/g, ' ')
  .replace(/\s+/g, ' ')
  .slice(0, 31) || 'Reporte'

const uniqueSheetName = (candidate: string, used: Set<string>) => {
  const base = sanitizeSheetName(candidate)
  let name = base
  let index = 2
  while (used.has(name.toLocaleLowerCase('es'))) {
    const suffix = ` ${index}`
    name = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
    index += 1
  }
  used.add(name.toLocaleLowerCase('es'))
  return name
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1)
    }
    table[index] = value >>> 0
  }
  return table
})()

const crc32 = (data: Buffer) => {
  let crc = 0xFFFFFFFF
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

const createZip = (entries: ZipEntry[]) => {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let localOffset = 0

  for (const entry of entries) {
    const fileName = Buffer.from(entry.name, 'utf8')
    const checksum = crc32(entry.data)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034B50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(33, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(entry.data.length, 18)
    localHeader.writeUInt32LE(entry.data.length, 22)
    localHeader.writeUInt16LE(fileName.length, 26)
    localHeader.writeUInt16LE(0, 28)
    localParts.push(localHeader, fileName, entry.data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014B50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(33, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(entry.data.length, 20)
    centralHeader.writeUInt32LE(entry.data.length, 24)
    centralHeader.writeUInt16LE(fileName.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(localOffset, 42)
    centralParts.push(centralHeader, fileName)
    localOffset += localHeader.length + fileName.length + entry.data.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(localOffset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, centralDirectory, end])
}

const inlineCell = (reference: string, value: unknown, style: number) => (
  `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
)

const numberCell = (reference: string, value: unknown, style: number) => {
  const numeric = Number(value)
  return `<c r="${reference}" s="${style}"><v>${Number.isFinite(numeric) ? numeric : 0}</v></c>`
}

const renderRow = (
  rowIndex: number,
  values: Array<string | number>,
  styles: number[],
  numericColumns: Set<number>,
  height = 20,
) => {
  const cells = values.map((value, columnIndex) => {
    const reference = `${columnName(columnIndex)}${rowIndex}`
    return numericColumns.has(columnIndex) && typeof value === 'number'
      ? numberCell(reference, value, styles[columnIndex] ?? 4)
      : inlineCell(reference, value, styles[columnIndex] ?? 4)
  }).join('')
  return `<row r="${rowIndex}" ht="${height}" customHeight="1">${cells}</row>`
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${XML_NS}">
  <fonts count="6">
    <font><sz val="10"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><color rgb="FF111827"/><sz val="16"/><name val="Aptos Display"/><family val="2"/></font>
    <font><b/><color rgb="FF111827"/><sz val="10"/><name val="Aptos"/><family val="2"/></font>
    <font><color rgb="FF44546A"/><sz val="10"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><color rgb="FF0B6D8A"/><sz val="10"/><name val="Aptos"/><family val="2"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF12AFE0"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF12AFE0"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFC5D9EE"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF7FBFD"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE6F5FA"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FF202020"/></left><right style="thin"><color rgb="FF202020"/></right><top style="thin"><color rgb="FF202020"/></top><bottom style="thin"><color rgb="FF202020"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`

const worksheetXml = (sheet: SheetModel) => {
  const columnCount = Math.max(1, sheet.headers.length)
  const lastColumn = columnName(columnCount - 1)
  const numericColumns = new Set(sheet.numericColumns || [])
  const dataStartRow = 4
  const rowParts: string[] = [
    renderRow(1, [sheet.title], [1], new Set(), 29),
    renderRow(2, [sheet.subtitle], [2], new Set(), 21),
    renderRow(3, sheet.headers, sheet.headers.map(() => 3), new Set(), 25),
  ]

  sheet.rows.forEach((row, index) => {
    const rowIndex = dataStartRow + index
    const bodyStyles = sheet.summaryStyle
      ? row.map((_, columnIndex) => columnIndex === 1 ? 6 : 5)
      : row.map((_, columnIndex) => columnIndex === 1 ? 4 : 5)
    rowParts.push(renderRow(rowIndex, row, bodyStyles, numericColumns, 21))
  })

  const dataEndRow = Math.max(3, dataStartRow + sheet.rows.length - 1)
  let lastRow = dataEndRow
  if (sheet.totalRow?.length) {
    lastRow += 1
    rowParts.push(renderRow(lastRow, sheet.totalRow, sheet.totalRow.map(() => 7), numericColumns, 23))
  }

  const colsXml = Array.from({ length: columnCount }, (_, index) => (
    `<col min="${index + 1}" max="${index + 1}" width="${sheet.columnWidths[index] || 18}" customWidth="1"/>`
  )).join('')
  const filterRange = `A3:${lastColumn}${dataEndRow}`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${XML_NS}" xmlns:r="${REL_NS}">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowParts.join('')}</sheetData>
  <mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells>
  <autoFilter ref="${filterRange}"/>
  <printOptions horizontalCentered="1" headings="0" gridLines="0"/>
  <pageMargins left="0.3" right="0.3" top="0.45" bottom="0.45" header="0.2" footer="0.2"/>
  <pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`
}

const rosterRows = (group: TallerGroup, plantel: string) => {
  const campus = (group.planteles || []).find(item => text(item?.plantel).toUpperCase() === plantel)
  const students = Array.isArray(campus?.students) ? campus!.students! : []
  return students.map((student, index) => [
    index + 1,
    [text(student?.grado), text(student?.grupo)].filter(Boolean).join(' ') || '—',
    text(student?.nombre) || '—',
  ])
}

export const buildTalleresInstitutionalXlsx = (options: InstitutionalWorkbookOptions) => {
  const plantel = text(options.plantel).toUpperCase()
  const cicloLabel = text(options.cicloLabel)
  const usedNames = new Set<string>()
  const sortedGroups = [...(options.groups || [])]
    .sort((left, right) => text(left?.nombre).localeCompare(text(right?.nombre), 'es', { sensitivity: 'base' }))

  const summaryRows = sortedGroups.map((group, index) => [
    index + 1,
    text(group?.nombre) || text(group?.clave) || 'Taller',
    Number(group?.totalAlumnos || 0),
  ])
  const assignmentTotal = summaryRows.reduce((sum, row) => sum + Number(row[2] || 0), 0)

  const sheets: SheetModel[] = [{
    name: uniqueSheetName('TOTAL', usedNames),
    title: `SERVICIOS CICLO ESCOLAR ${cicloLabel}`.toUpperCase(),
    subtitle: `IECS · IEDIS  |  ${options.plantelNombre} · ${plantel}`,
    headers: ['NO.', 'TALLER', 'ALUMNOS'],
    rows: summaryRows,
    columnWidths: [8, 42, 14],
    numericColumns: [0, 2],
    totalRow: ['', 'TOTAL', assignmentTotal],
    summaryStyle: true,
  }]

  for (const group of sortedGroups) {
    const nombre = text(group?.nombre) || text(group?.clave) || 'Taller'
    sheets.push({
      name: uniqueSheetName(nombre, usedNames),
      title: `${nombre}`.toUpperCase(),
      subtitle: `IECS · IEDIS  |  ${options.plantelNombre} · CICLO ESCOLAR ${cicloLabel}`,
      headers: ['NO.', 'GRADO Y GRUPO', 'NOMBRE'],
      rows: rosterRows(group, plantel),
      columnWidths: [8, 20, 52],
      numericColumns: [0],
    })
  }

  const sheetEntries = sheets.map((sheet, index) => ({
    name: `xl/worksheets/sheet${index + 1}.xml`,
    data: Buffer.from(worksheetXml(sheet), 'utf8'),
  }))
  const worksheetContentTypes = sheets.map((_, index) => (
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  )).join('')
  const workbookSheets = sheets.map((sheet, index) => (
    `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  )).join('')
  const workbookRelationships = sheets.map((_, index) => (
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  )).join('')
  const stylesRelationshipId = sheets.length + 1
  const createdAt = options.generatedAt || new Date().toISOString()
  const sheetTitles = sheets.map(sheet => `<vt:lpstr>${escapeXml(sheet.name)}</vt:lpstr>`).join('')

  const entries: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${worksheetContentTypes}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`, 'utf8'),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`, 'utf8'),
    },
    {
      name: 'docProps/app.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Sistema Aurora</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheetTitles}</vt:vector></TitlesOfParts>
  <Company>IECS-IEDIS</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion>
</Properties>`, 'utf8'),
    },
    {
      name: 'docProps/core.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Sistema Aurora</dc:creator><cp:lastModifiedBy>Sistema Aurora</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(createdAt)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXml(createdAt)}</dcterms:modified><dc:title>Reporte institucional de Talleres</dc:title>
</cp:coreProperties>`, 'utf8'),
    },
    {
      name: 'xl/workbook.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${XML_NS}" xmlns:r="${REL_NS}">
  <fileVersion appName="xl"/><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>
  <sheets>${workbookSheets}</sheets><calcPr calcId="191029"/>
</workbook>`, 'utf8'),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRelationships}
  <Relationship Id="rId${stylesRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`, 'utf8'),
    },
    { name: 'xl/styles.xml', data: Buffer.from(stylesXml, 'utf8') },
    ...sheetEntries,
  ]

  return createZip(entries)
}
