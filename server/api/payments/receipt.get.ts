import dayjs from 'dayjs'
import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { folios } = getQuery(event)
  if (!folios) return 'Folios requeridos'

  const folioList = Array.isArray(folios) ? folios : String(folios).split(',')
  const placeholders = folioList.map(() => '?').join(',')
  
  const refs = await query<any[]>(`
    SELECT r.folio, r.monto, r.fecha, r.formaDePago, r.concepto, b.nombreCompleto, b.matricula, b.grado, b.grupo, b.nivel
    FROM referenciasdepago r
    LEFT JOIN base b ON r.matricula = b.matricula
    WHERE r.folio IN (${placeholders}) AND r.estatus = 'Vigente'
  `, folioList)

  if (!refs.length) {
    event.node.res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return `<h2>Recibo anulado o inexistente.</h2>`
  }

  const student = refs[0]
  const total = refs.reduce((sum, r) => sum + parseFloat(r.monto), 0)
  
  event.node.res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Recibo Oficial - ${student.matricula}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; color: #232C25; max-width: 800px; margin: 40px auto; padding: 40px; background: #FFFFFF; box-shadow: 0 12px 24px rgba(35,44,37,0.12); border-radius: 12px; border: 1px solid #D0D3C7; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #D0D3C7; padding-bottom: 20px; margin-bottom: 30px; }
        .brand { display: flex; align-items: center; gap: 20px; }
        .brand img { height: 60px; }
        .brand-text h1 { margin: 0; color: #4E844E; font-size: 24px; font-weight: 700; }
        .brand-text p { margin: 4px 0 0; color: #3F8468; font-size: 14px; font-weight: 500; }
        .meta { text-align: right; font-size: 14px; color: #5B665E; }
        .meta strong { color: #232C25; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; padding: 20px; background: #F7F8F6; border-radius: 8px; border: 1px solid #D0D3C7; }
        .info-item { font-size: 14px; }
        .info-item label { display: block; color: #3F8468; font-size: 12px; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
        .info-item div { font-weight: 600; font-size: 16px; color: #232C25; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { text-align: left; padding: 12px; background: #F4F5F2; color: #5B665E; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #D0D3C7; }
        td { padding: 16px 12px; border-bottom: 1px solid #D0D3C7; font-size: 14px; }
        .amount { text-align: right; font-weight: 600; }
        .total-row { display: flex; justify-content: space-between; align-items: center; padding: 20px; background: #E6F2D8; border-radius: 8px; color: #4E844E; border: 1px solid #D6E8C3; }
        .total-label { font-size: 16px; font-weight: 700; text-transform: uppercase; }
        .total-amount { font-size: 28px; font-weight: 700; }
        .footer-actions { margin-top: 40px; text-align: center; }
        .btn { background: #8EC153; color: #232C25; padding: 12px 32px; border: none; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s; font-family: 'Inter', sans-serif; }
        .btn:hover { background: #7DB045; }
        @media print { body { margin: 0; padding: 20px; box-shadow: none; max-width: 100%; border: none; } .footer-actions { display: none; } }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header">
        <div class="brand">
          <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="IECS IEDIS Logo" />
          <div class="brand-text">
            <h1>SISTEMA DE INGRESOS 2</h1>
            <p>Comprobante Oficial de Pago</p>
          </div>
        </div>
        <div class="meta">
          <div>Folios procesados: <strong>${folioList.join(', ')}</strong></div>
          <div>Fecha de Emisión: <strong>${dayjs().format('DD/MM/YYYY HH:mm')}</strong></div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <label>Alumno</label>
          <div>${student.nombreCompleto}</div>
        </div>
        <div class="info-item">
          <label>Matrícula</label>
          <div>${student.matricula}</div>
        </div>
        <div class="info-item">
          <label>Nivel y Grado</label>
          <div>${student.nivel} - ${student.grado} ${student.grupo}</div>
        </div>
        <div class="info-item">
          <label>Método de Pago</label>
          <div>${student.formaDePago || 'Efectivo'}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Transacción</th>
            <th>Concepto Abonado</th>
            <th class="amount">Importe Pagado</th>
          </tr>
        </thead>
        <tbody>
          ${refs.map(r => `
            <tr>
              <td><span style="color: #67A8D8; font-family: monospace; font-weight: 600;">#${r.folio}</span></td>
              <td style="font-weight: 500;">${r.concepto}</td>
              <td class="amount">$${parseFloat(r.monto).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="total-row">
        <div class="total-label">Suma Recibida (MXN)</div>
        <div class="total-amount">$${total.toFixed(2)}</div>
      </div>

      <div class="footer-actions">
        <button class="btn" onclick="window.print()">Imprimir Comprobante</button>
      </div>
    </body>
    </html>
  `
})