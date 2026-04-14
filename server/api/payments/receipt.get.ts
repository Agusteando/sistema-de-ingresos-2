import dayjs from 'dayjs'
import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { folios } = getQuery(event)
  if (!folios) return 'Folios requeridos'

  const folioList = Array.isArray(folios) ? folios : folios.split(',')
  
  const placeholders = folioList.map(() => '?').join(',')
  const refs = await query<any[]>(`
    SELECT r.folio, r.monto, r.fecha, r.formaDePago, c.concepto as conceptoNombre, b.nombreCompleto, b.matricula
    FROM referenciasdepago r
    LEFT JOIN documentos d ON r.documento = d.documento
    LEFT JOIN conceptos c ON d.conceptoId = c.id
    LEFT JOIN base b ON r.matricula = b.matricula
    WHERE r.folio IN (${placeholders})
  `, folioList)

  if (!refs.length) return 'Recibo no encontrado'

  const total = refs.reduce((acc, r) => acc + parseFloat(r.monto), 0)
  const student = refs[0]

  // Extremely fast HTML receipt for browser printing
  event.node.res.setHeader('Content-Type', 'text/html; charset=utf-8')
  
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Recibo de Pago - ${student.matricula}</title>
      <style>
        body { font-family: 'Helvetica', Arial, sans-serif; color: #333; max-width: 800px; margin: 40px auto; padding: 20px; border: 1px solid #ccc; }
        .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
        th { background-color: #f8fafc; }
        .total { text-align: right; font-size: 1.25rem; font-weight: bold; margin-top: 20px; }
        @media print { body { border: none; margin: 0; } button { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h2>Instituto Educativo</h2>
        <p>Recibo de Pago Oficial</p>
      </div>
      <div class="row">
        <div><strong>Alumno:</strong> ${student.nombreCompleto}</div>
        <div><strong>Matrícula:</strong> ${student.matricula}</div>
      </div>
      <div class="row">
        <div><strong>Fecha:</strong> ${dayjs().format('DD/MM/YYYY HH:mm')}</div>
        <div><strong>Folios:</strong> ${folioList.join(', ')}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th>Forma de Pago</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          ${refs.map(r => `
            <tr>
              <td>${r.conceptoNombre || 'Pago'}</td>
              <td>${r.formaDePago || 'Efectivo'}</td>
              <td>$${parseFloat(r.monto).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="total">
        Total Pagado: $${total.toFixed(2)}
      </div>
      <div style="text-align: center; margin-top: 40px;">
        <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer;">Imprimir Recibo</button>
      </div>
    </body>
    </html>
  `
})