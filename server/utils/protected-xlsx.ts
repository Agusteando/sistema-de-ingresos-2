import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'

type XlsxCell = {
  value: string | number | null | undefined
  style?: number
  type?: 'string' | 'number'
}

type XlsxRow = {
  cells: XlsxCell[]
  height?: number
}

type ProtectedXlsxOptions = {
  sheetName: string
  title: string
  subtitle?: string
  metaLines?: string[]
  headers: string[]
  rows: Array<Array<string | number | null | undefined>>
  numericColumns?: number[]
  currencyColumns?: number[]
  totals?: Array<{ label: string; value: number }>
  protectionPassword?: string
  creator?: string
}

type ZipEntry = {
  name: string
  data: Buffer
}

const XML_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const escapeXml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const sanitizeSheetName = (value: string) => String(value || 'Reporte')
  .replace(/[\[\]:*?/\\]/g, ' ')
  .trim()
  .slice(0, 31) || 'Reporte'

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

// Legacy Excel worksheet/workbook protection hash used by OOXML password fields.
const hashProtectionPassword = (password: string) => {
  let hash = 0
  const source = Buffer.from(password || '', 'utf8')

  source.forEach((character, index) => {
    const shifted = character << (index + 1)
    const rotated = shifted >> 15
    hash ^= (shifted & 0x7FFF) | rotated
  })

  hash ^= source.length
  hash ^= 0xCE4B
  return (hash & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')
}

const stringCell = (reference: string, value: unknown, style: number) => (
  `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
)

const numberCell = (reference: string, value: unknown, style: number) => {
  const numeric = Number(value)
  return `<c r="${reference}" s="${style}"><v>${Number.isFinite(numeric) ? numeric : 0}</v></c>`
}

const renderRow = (rowIndex: number, row: XlsxRow) => {
  const cells = row.cells.map((cell, cellIndex) => {
    const reference = `${columnName(cellIndex)}${rowIndex}`
    return cell.type === 'number'
      ? numberCell(reference, cell.value, cell.style ?? 0)
      : stringCell(reference, cell.value, cell.style ?? 0)
  }).join('')
  const height = row.height ? ` ht="${row.height}" customHeight="1"` : ''
  return `<row r="${rowIndex}"${height}>${cells}</row>`
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${XML_NS}">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>
  <fonts count="5">
    <font><sz val="10"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="16"/><name val="Aptos Display"/><family val="2"/></font>
    <font><color rgb="FF4B5F52"/><sz val="10"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><color rgb="FF173D24"/><sz val="10"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><color rgb="FF162641"/><sz val="10"/><name val="Aptos"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF173D24"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF4EC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFDDE7DF"/></left><right style="thin"><color rgb="FFDDE7DF"/></right><top style="thin"><color rgb="FFDDE7DF"/></top><bottom style="thin"><color rgb="FFDDE7DF"/></bottom><diagonal/></border>
    <border><left/><right/><top style="thin"><color rgb="FF173D24"/></top><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="11">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="4" fillId="0" borderId="2" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`

export const buildProtectedXlsx = (options: ProtectedXlsxOptions) => {
  const sheetName = sanitizeSheetName(options.sheetName)
  const columnCount = Math.max(1, options.headers.length)
  const lastColumn = columnName(columnCount - 1)
  const password = options.protectionPassword || process.env.CORTE_CAJA_EXCEL_PASSWORD || randomBytes(16).toString('hex')
  const passwordHash = hashProtectionPassword(password)
  const numericColumns = new Set(options.numericColumns || [])
  const currencyColumns = new Set(options.currencyColumns || [])
  const rowModels: XlsxRow[] = []

  rowModels.push({ cells: [{ value: options.title, style: 1 }], height: 28 })
  rowModels.push({ cells: [{ value: options.subtitle || '', style: 2 }], height: 22 })

  for (const line of options.metaLines || []) {
    rowModels.push({ cells: [{ value: line, style: 3 }], height: 18 })
  }

  rowModels.push({ cells: [{ value: '', style: 0 }], height: 8 })
  const headerRowIndex = rowModels.length + 1
  rowModels.push({
    cells: options.headers.map(header => ({ value: header, style: 4 })),
    height: 24
  })

  for (const sourceRow of options.rows) {
    const cells: XlsxCell[] = options.headers.map((_, columnIndex) => {
      const value = sourceRow[columnIndex]
      if (currencyColumns.has(columnIndex)) return { value, style: 7, type: 'number' }
      if (numericColumns.has(columnIndex)) return { value, style: 6, type: 'number' }
      return { value, style: 5, type: 'string' }
    })
    rowModels.push({ cells, height: 20 })
  }

  const mergeRanges = [`A1:${lastColumn}1`, `A2:${lastColumn}2`]
  const metaStartRow = 3
  const metaEndRow = metaStartRow + Math.max(0, (options.metaLines || []).length - 1)
  if ((options.metaLines || []).length) {
    for (let row = metaStartRow; row <= metaEndRow; row += 1) mergeRanges.push(`A${row}:${lastColumn}${row}`)
  }

  if (options.totals?.length) {
    rowModels.push({ cells: [{ value: '', style: 0 }], height: 8 })
    options.totals.forEach((total, index) => {
      const cells = Array.from({ length: columnCount }, () => ({ value: '', style: 0 } as XlsxCell))
      const labelColumn = Math.max(0, columnCount - 2)
      const valueColumn = Math.max(0, columnCount - 1)
      cells[labelColumn] = { value: total.label, style: index === options.totals!.length - 1 ? 8 : 10 }
      cells[valueColumn] = { value: total.value, style: index === options.totals!.length - 1 ? 9 : 7, type: 'number' }
      rowModels.push({ cells, height: 20 })
    })
  }

  const dataEndRow = headerRowIndex + options.rows.length
  const filterEndRow = Math.max(headerRowIndex, dataEndRow)
  const lastRow = rowModels.length
  const rowXml = rowModels.map((row, index) => renderRow(index + 1, row)).join('')
  const columnWidths = [12, 13, 16, 12, 13, 30, 26, 22, 12, 34, 16]
  const colsXml = Array.from({ length: columnCount }, (_, index) => (
    `<col min="${index + 1}" max="${index + 1}" width="${columnWidths[index] || 18}" customWidth="1"/>`
  )).join('')
  const mergeXml = mergeRanges.length
    ? `<mergeCells count="${mergeRanges.length}">${mergeRanges.map(range => `<mergeCell ref="${range}"/>`).join('')}</mergeCells>`
    : ''
  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${XML_NS}" xmlns:r="${REL_NS}">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRowIndex}" topLeftCell="A${headerRowIndex + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${headerRowIndex + 1}" sqref="A${headerRowIndex + 1}"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowXml}</sheetData>
  <sheetProtection password="${passwordHash}" sheet="1" objects="1" scenarios="1" formatCells="1" formatColumns="1" formatRows="1" insertColumns="1" insertRows="1" insertHyperlinks="1" deleteColumns="1" deleteRows="1" selectLockedCells="0" selectUnlockedCells="0" sort="0" autoFilter="0" pivotTables="1"/>
  ${mergeXml}
  <printOptions horizontalCentered="1"/>
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
  <tableParts count="1"><tablePart r:id="rId1"/></tableParts>
</worksheet>`

  const tableRange = `A${headerRowIndex}:${lastColumn}${filterEndRow}`
  const tableXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="${XML_NS}" id="1" name="CorteDeCaja" displayName="CorteDeCaja" ref="${tableRange}" totalsRowShown="0">
  <autoFilter ref="${tableRange}"/>
  <tableColumns count="${columnCount}">${options.headers.map((header, index) => `<tableColumn id="${index + 1}" name="${escapeXml(header)}"/>`).join('')}</tableColumns>
  <tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>
</table>`

  const createdAt = new Date().toISOString()
  const creator = escapeXml(options.creator || 'Sistema Aurora')
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${XML_NS}" xmlns:r="${REL_NS}">
  <fileVersion appName="xl"/>
  <workbookPr/>
  <workbookProtection workbookPassword="${passwordHash}" lockStructure="1"/>
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>
  <sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
  <calcPr calcId="191029"/>
</workbook>`

  const entries: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`, 'utf8')
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`, 'utf8')
    },
    {
      name: 'docProps/app.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Sistema Aurora</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${escapeXml(sheetName)}</vt:lpstr></vt:vector></TitlesOfParts>
  <Company>IECS-IEDIS</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion>
</Properties>`, 'utf8')
    },
    {
      name: 'docProps/core.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>${creator}</dc:creator><cp:lastModifiedBy>${creator}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified><dc:title>${escapeXml(options.title)}</dc:title>
</cp:coreProperties>`, 'utf8')
    },
    {
      name: 'xl/workbook.xml',
      data: Buffer.from(workbookXml, 'utf8')
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`, 'utf8')
    },
    {
      name: 'xl/styles.xml',
      data: Buffer.from(stylesXml, 'utf8')
    },
    {
      name: 'xl/worksheets/_rels/sheet1.xml.rels',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/>
</Relationships>`, 'utf8')
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: Buffer.from(worksheetXml, 'utf8')
    },
    {
      name: 'xl/tables/table1.xml',
      data: Buffer.from(tableXml, 'utf8')
    }
  ]

  return createZip(entries)
}
