declare const Buffer: any;
type Buffer = any;

const XMLNS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const XMLNS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

type XlsxCell = string | number | boolean | null | undefined;

type XlsxColumn = {
  key: string;
  label: string;
  width?: number;
  type?: "text" | "number";
};

type XlsxSheet = {
  name: string;
  title: string;
  subtitle?: string;
  columns: XlsxColumn[];
  rows: Record<string, XlsxCell>[];
  totalRow?: Record<string, XlsxCell>;
};

type ZipEntry = {
  name: string;
  data: Buffer;
  crc: number;
  offset: number;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Buffer) => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date = new Date()) => {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const packedDate = ((year - 1980) << 9) | (month << 5) | day;
  return { time, date: packedDate };
};

const writeZip = (files: { name: string; content: string | Buffer }[]) => {
  const chunks: Buffer[] = [];
  const entries: ZipEntry[] = [];
  const stamp = dosDateTime();
  let offset = 0;

  files.forEach((file) => {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8");
    const header = Buffer.alloc(30);
    const crc = crc32(data);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(stamp.time, 10);
    header.writeUInt16LE(stamp.date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    chunks.push(header, name, data);
    entries.push({ name: file.name, data, crc, offset });
    offset += header.length + name.length + data.length;
  });

  const centralStart = offset;
  entries.forEach((entry) => {
    const name = Buffer.from(entry.name, "utf8");
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(stamp.time, 12);
    header.writeUInt16LE(stamp.date, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.data.length, 20);
    header.writeUInt32LE(entry.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(entry.offset, 42);
    chunks.push(header, name);
    offset += header.length + name.length;
  });

  const centralSize = offset - centralStart;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  chunks.push(end);
  return Buffer.concat(chunks);
};

const escapeXml = (value: unknown) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const cellText = (value: unknown) => {
  const text = String(value ?? "");
  return text.length > 32767 ? `${text.slice(0, 32764)}...` : text;
};

const columnName = (index: number) => {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const modulo = (n - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    n = Math.floor((n - modulo) / 26);
  }
  return name;
};

const sanitizeSheetNameBase = (value: string) => {
  const cleaned = String(value || "Hoja")
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || "Hoja";
};

const uniqueSheetNames = (names: string[]) => {
  const seen = new Set<string>();
  return names.map((rawName) => {
    const base = sanitizeSheetNameBase(rawName);
    let candidate = base;
    let suffix = 1;
    while (seen.has(candidate.toLowerCase())) {
      const tail = ` ${suffix}`;
      candidate = `${base.slice(0, Math.max(1, 31 - tail.length))}${tail}`;
      suffix += 1;
    }
    seen.add(candidate.toLowerCase());
    return candidate;
  });
};

const createCell = (ref: string, value: XlsxCell, styleId = 4, type: "text" | "number" = "text") => {
  if (value === null || value === undefined || value === "") return `<c r="${ref}" s="${styleId}"/>`;
  if (type === "number" && typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}" s="${styleId}"><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${ref}" s="${styleId}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t>${escapeXml(cellText(value))}</t></is></c>`;
};

const createRow = (
  rowNumber: number,
  values: XlsxCell[],
  styles: number[],
  types: Array<"text" | "number"> = [],
  height?: number,
) => {
  const attrs = height ? ` r="${rowNumber}" ht="${height}" customHeight="1"` : ` r="${rowNumber}"`;
  const cells = values
    .map((value, index) => createCell(`${columnName(index)}${rowNumber}`, value, styles[index] ?? 4, types[index] ?? "text"))
    .join("");
  return `<row${attrs}>${cells}</row>`;
};

const createCols = (columns: XlsxColumn[]) => columns.map((column, index) => {
  const width = Math.max(8, Math.min(42, Number(column.width || 16)));
  const colIndex = index + 1;
  return `<col min="${colIndex}" max="${colIndex}" width="${width}" customWidth="1"/>`;
}).join("");

const createWorksheetXml = (sheet: XlsxSheet) => {
  const columnCount = Math.max(1, sheet.columns.length);
  const lastColumn = columnName(columnCount - 1);
  const rows: string[] = [];
  rows.push(createRow(1, [sheet.title], [1], ["text"], 24));
  rows.push(createRow(2, [sheet.subtitle || ""], [2], ["text"], 18));
  rows.push(createRow(3, [], []));
  rows.push(createRow(4, sheet.columns.map((column) => column.label), sheet.columns.map(() => 3), sheet.columns.map(() => "text"), 20));

  sheet.rows.forEach((row, index) => {
    const isZebra = index % 2 === 1;
    rows.push(createRow(
      index + 5,
      sheet.columns.map((column) => row[column.key]),
      sheet.columns.map((column) => {
        if (column.type === "number") return isZebra ? 7 : 6;
        return isZebra ? 5 : 4;
      }),
      sheet.columns.map((column) => column.type === "number" ? "number" : "text"),
    ));
  });

  const lastDataRow = Math.max(4, sheet.rows.length + 4);
  let totalRowXml = "";
  let mergeCount = 2;
  if (sheet.totalRow) {
    const totalRowNumber = lastDataRow + 1;
    totalRowXml = createRow(
      totalRowNumber,
      sheet.columns.map((column) => sheet.totalRow?.[column.key]),
      sheet.columns.map((column, index) => column.type === "number" ? 10 : index === 0 ? 9 : 8),
      sheet.columns.map((column) => column.type === "number" ? "number" : "text"),
      20,
    );
    rows.push(totalRowXml);
  }

  const autoFilterLastRow = sheet.totalRow ? lastDataRow : Math.max(4, lastDataRow);
  const mergedRefs = [`A1:${lastColumn}1`, `A2:${lastColumn}2`];
  const dimensionLastRow = sheet.totalRow ? lastDataRow + 1 : lastDataRow;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${XMLNS_MAIN}" xmlns:r="${XMLNS_REL}">
  <dimension ref="A1:${lastColumn}${dimensionLastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${createCols(sheet.columns)}</cols>
  <sheetData>${rows.join("")}</sheetData>
  <autoFilter ref="A4:${lastColumn}${autoFilterLastRow}"/>
  <mergeCells count="${mergeCount}">${mergedRefs.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
};

const workbookXml = (sheetNames: string[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${XMLNS_MAIN}" xmlns:r="${XMLNS_REL}">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="19200" windowHeight="12000"/></bookViews>
  <sheets>${sheetNames.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>
</workbook>`;

const workbookRelsXml = (sheetCount: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${Array.from({ length: sheetCount }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const contentTypesXml = (sheetCount: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${Array.from({ length: sheetCount }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${XMLNS_MAIN}">
  <fonts count="5">
    <font><sz val="10"/><color rgb="FF203047"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/><family val="2"/></font>
    <font><sz val="10"/><color rgb="FF516070"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF173D24"/><name val="Aptos"/><family val="2"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF173D24"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3FAF4"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF276A34"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFAFCFB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF4EC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFDDE8DF"/></left><right style="thin"><color rgb="FFDDE8DF"/></right><top style="thin"><color rgb="FFDDE8DF"/></top><bottom style="thin"><color rgb="FFDDE8DF"/></bottom><diagonal/></border>
    <border><left style="thin"><color rgb="FFC7DACB"/></left><right style="thin"><color rgb="FFC7DACB"/></right><top style="thin"><color rgb="FFC7DACB"/></top><bottom style="thin"><color rgb="FFC7DACB"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="11">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFill="1" applyFont="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="2" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="49" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="1" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="49" fontId="4" fillId="6" borderId="2" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment vertical="center"/></xf>
    <xf numFmtId="49" fontId="4" fillId="6" borderId="2" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment vertical="center"/></xf>
    <xf numFmtId="1" fontId="4" fillId="6" borderId="2" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium4" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;

const coreXml = (createdAt: Date) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Control Escolar</dc:creator>
  <cp:lastModifiedBy>Control Escolar</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt.toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt.toISOString()}</dcterms:modified>
</cp:coreProperties>`;

const appXml = (sheetNames: string[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Control Escolar</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheetNames.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="${sheetNames.length}" baseType="lpstr">${sheetNames.map((name) => `<vt:lpstr>${escapeXml(name)}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts>
  <Company>Casita Apps</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0300</AppVersion>
</Properties>`;

export const createXlsxWorkbook = (inputSheets: XlsxSheet[]) => {
  const sheets = inputSheets.length ? inputSheets : [{
    name: "Resumen",
    title: "Control Escolar",
    columns: [{ key: "mensaje", label: "Mensaje", width: 24 }],
    rows: [{ mensaje: "Sin datos para exportar" }],
  }];
  const sheetNames = uniqueSheetNames(sheets.map((sheet) => sheet.name));
  const createdAt = new Date();
  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml(sheets.length) },
    { name: "_rels/.rels", content: rootRelsXml },
    { name: "docProps/core.xml", content: coreXml(createdAt) },
    { name: "docProps/app.xml", content: appXml(sheetNames) },
    { name: "xl/workbook.xml", content: workbookXml(sheetNames) },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(sheets.length) },
    { name: "xl/styles.xml", content: stylesXml },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: createWorksheetXml({ ...sheet, name: sheetNames[index] }),
    })),
  ];
  return writeZip(files);
};
