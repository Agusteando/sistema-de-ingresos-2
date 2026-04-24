import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  await query(`
    INSERT INTO facturas (matricula, rfc, razonSocial, regimenFiscal, usoCfdi, cp, correo, total, folios)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    body.matricula,
    body.rfc,
    body.razonSocial,
    body.regimenFiscal,
    body.usoCfdi,
    body.cp,
    body.correo,
    body.total,
    body.folios.join(',')
  ])

  return { success: true }
})