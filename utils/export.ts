export function exportToCSV(filename: string, rows: any[]) {
  if (!rows || !rows.length) return;

  const separator = ',';
  const keys = Object.keys(rows[0]).filter(k => typeof rows[0][k] !== 'object');
  
  const csvContent =
    keys.join(separator) +
    '\n' +
    rows.map(row => {
      return keys.map(k => {
        let cell = row[k] === null || row[k] === undefined ? '' : row[k];
        cell = cell instanceof Date ? cell.toLocaleString() : cell.toString().replace(/"/g, '""');
        if (cell.search(/("|,|\n)/g) >= 0) cell = `"${cell}"`;
        return cell;
      }).join(separator);
    }).join('\n');

  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

type ExcelColumn = {
  key: string
  label?: string
  type?: 'text' | 'number' | 'currency' | 'date'
}

type ExcelOptions = {
  title?: string
  subtitle?: string
  sheetName?: string
  columns?: ExcelColumn[]
}

const escapeExcelHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const sanitizeSheetName = (value: string) => {
  const cleaned = String(value || 'Reporte')
    .replace(/[\[\]:*?/\\]/g, ' ')
    .trim()
  return escapeExcelHtml(cleaned.slice(0, 31) || 'Reporte')
}

const cellStyleFor = (type?: ExcelColumn['type']) => {
  if (type === 'currency') return 'mso-number-format:"$"#,##0.00;'
  if (type === 'number') return 'mso-number-format:"0.00";'
  if (type === 'date') return 'mso-number-format:"dd/mm/yyyy";'
  return 'mso-number-format:"\\@";'
}

export function exportToExcel(filename: string, rows: any[], options: ExcelOptions = {}) {
  if (!rows || !rows.length) return

  const columns = options.columns?.length
    ? options.columns
    : Object.keys(rows[0]).map(key => ({ key, label: key, type: 'text' as const }))

  const tableRows = rows.map(row => {
    const cells = columns.map((column) => {
      const raw = row[column.key]
      const value = raw === null || raw === undefined ? '' : raw
      return `<td style="${cellStyleFor(column.type)}">${escapeExcelHtml(value)}</td>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('')

  const titleRows = [
    options.title
      ? `<tr><td colspan="${columns.length}" class="report-title">${escapeExcelHtml(options.title)}</td></tr>`
      : '',
    options.subtitle
      ? `<tr><td colspan="${columns.length}" class="report-subtitle">${escapeExcelHtml(options.subtitle)}</td></tr>`
      : ''
  ].join('')

  const html = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${sanitizeSheetName(options.sheetName || 'Reporte')}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  <style>
    body { font-family: Arial, sans-serif; color: #162641; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #eaf4ec; color: #173d24; font-weight: 700; border: 1px solid #bfd4c3; padding: 8px; text-align: left; }
    td { border: 1px solid #dfe7e1; padding: 7px; vertical-align: top; }
    .report-title { background: #173d24; color: #ffffff; font-size: 18px; font-weight: 700; padding: 12px; }
    .report-subtitle { background: #f5faf6; color: #4b5f52; font-size: 12px; padding: 9px 12px; }
  </style>
</head>
<body>
  <table>
    ${titleRows}
    <tr>${columns.map(column => `<th>${escapeExcelHtml(column.label || column.key)}</th>`).join('')}</tr>
    ${tableRows}
  </table>
</body>
</html>`

  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), html], {
    type: 'application/vnd.ms-excel;charset=utf-8;'
  })
  const link = document.createElement('a')

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename.endsWith('.xls') ? filename : `${filename}.xls`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}
