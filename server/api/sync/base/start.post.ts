import crypto from 'node:crypto'
import { query, runWithBridgeAgentId } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || !user.active_plantel) {
    throw createError({ statusCode: 401, message: 'Sesión no válida o plantel no definido.' })
  }

  const plantel = user.active_plantel
  if (plantel === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'La sincronización debe realizarse por plantel específico.' })
  }

  const dbAgentId = event.context.dbBridgeAgentId || plantel

  // Ensure only one sync runs at a time per plantel
  const [existingRun] = await query<any[]>(
    `SELECT id FROM external_sync_runs WHERE plantel = ? AND status IN ('running', 'fetching', 'processing') LIMIT 1`,
    [plantel]
  )

  if (existingRun) {
    return { success: true, run_id: existingRun.id, status: 'already_running' }
  }

  const insertResult: any = await query(
    `INSERT INTO external_sync_runs (plantel, status, message) VALUES (?, 'fetching', 'Obteniendo datos externos...')`,
    [plantel]
  )
  const runId = insertResult.insertId

  // Fire and forget the background job
  setTimeout(() => {
    runSyncProcess(runId, plantel, dbAgentId).catch(err => {
      console.error(`[Background Sync Error] Plantel ${plantel}, Run ${runId}:`, err)
    })
  }, 0)

  return { success: true, run_id: runId, status: 'started' }
})

async function runSyncProcess(runId: number, plantel: string, agentId: string) {
  await runWithBridgeAgentId(agentId, async () => {
    try {
      const config = useRuntimeConfig()
      const apiUrl = `https://matricula.casitaapps.com/api/sync?plantel=${encodeURIComponent(plantel)}`
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${config.externalSyncApiKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Error en API externa: ${response.status} ${response.statusText}`)
      }

      const rawData = await response.json()
      const data = Array.isArray(rawData) ? rawData : (rawData.data || [])

      await query(
        `UPDATE external_sync_runs SET status = 'processing', total_rows = ?, message = 'Procesando datos...' WHERE id = ?`,
        [data.length, runId]
      )

      let processed = 0
      let updated = 0
      let skipped = 0
      let errors = 0

      for (const row of data) {
        // Yield occasionally to avoid blocking event loop
        if (processed % 50 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10))
          
          // Check for cancellation
          const [check] = await query<any[]>(`SELECT cancelled FROM external_sync_runs WHERE id = ?`, [runId])
          if (check && check.cancelled) {
            await query(`UPDATE external_sync_runs SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP, message = 'Sincronización cancelada por el usuario.' WHERE id = ?`, [runId])
            return
          }

          // Update progress
          await query(`UPDATE external_sync_runs SET processed_rows = ?, updated_rows = ?, skipped_rows = ?, error_rows = ? WHERE id = ?`,
            [processed, updated, skipped, errors, runId])
        }

        processed++
        
        try {
          if (!row.matricula) {
            errors++
            continue
          }

          const mapped = mapExternalRow(row, plantel)
          const sourceHash = computeHash(mapped)

          const [existingMeta] = await query<any[]>(
            `SELECT source_hash FROM external_base_sync WHERE matricula = ?`,
            [row.matricula]
          )

          if (existingMeta && existingMeta.source_hash === sourceHash) {
            skipped++
            continue
          }

          const [localStudent] = await query<any[]>(
            `SELECT estatus FROM base WHERE matricula = ? LIMIT 1`,
            [row.matricula]
          )

          // Handle conservative baja rule
          let finalEstatus = 'Activo'
          if (row.baja === 1 || String(row.baja).toLowerCase() === 'true') {
            finalEstatus = row.motivo_baja || row.categoria_baja || 'Baja'
          } else {
            // If external says active, but local is inactive (baja), DO NOT reactivate automatically
            if (localStudent && localStudent.estatus && localStudent.estatus !== 'Activo') {
              finalEstatus = localStudent.estatus
              console.info(`[Sync] Mantenimiento conservador de baja para matrícula ${row.matricula}`)
            }
          }

          const fullName = `${mapped.apellidoPaterno} ${mapped.apellidoMaterno} ${mapped.nombres}`.trim()
          const dbPadre = mapped.padre
          
          if (!localStudent) {
            // Insert
            await query(`
              INSERT INTO base (
                matricula, plantel, apellidoPaterno, apellidoMaterno, nombres, nombreCompleto, 
                nivel, grado, grupo, interno, correo, telefono, \`Nombre del padre o tutor\`, 
                estatus, \`Fecha de nacimiento\`, ciclo, usuario
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Sistema Sync')
            `, [
              row.matricula, plantel, mapped.apellidoPaterno, mapped.apellidoMaterno, mapped.nombres, fullName,
              mapped.nivel, mapped.grado, mapped.grupo, mapped.interno, mapped.correo, mapped.telefono, dbPadre,
              finalEstatus, '', '2025' // Default safe values
            ])
          } else {
            // Update
            await query(`
              UPDATE base SET
                apellidoPaterno = ?, apellidoMaterno = ?, nombres = ?, nombreCompleto = ?,
                nivel = ?, grado = ?, grupo = ?, interno = ?, correo = ?, telefono = ?,
                \`Nombre del padre o tutor\` = ?, estatus = ?
              WHERE matricula = ?
            `, [
              mapped.apellidoPaterno, mapped.apellidoMaterno, mapped.nombres, fullName,
              mapped.nivel, mapped.grado, mapped.grupo, mapped.interno, mapped.correo, mapped.telefono,
              dbPadre, finalEstatus, row.matricula
            ])
          }

          // Update sync metadata
          await query(`
            INSERT INTO external_base_sync (matricula, plantel, source_hash, last_synced_at, last_payload)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
            ON DUPLICATE KEY UPDATE 
              plantel = VALUES(plantel), source_hash = VALUES(source_hash), 
              last_synced_at = VALUES(last_synced_at), last_payload = VALUES(last_payload), last_error = NULL
          `, [row.matricula, plantel, sourceHash, JSON.stringify(row)])

          updated++
        } catch (rowError: any) {
          errors++
          await query(`
            INSERT INTO external_base_sync (matricula, plantel, source_hash, last_synced_at, last_error)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
            ON DUPLICATE KEY UPDATE last_synced_at = CURRENT_TIMESTAMP, last_error = VALUES(last_error)
          `, [row.matricula || 'UNKNOWN', plantel, 'ERROR', rowError?.message || String(rowError)])
        }
      }

      await query(
        `UPDATE external_sync_runs SET status = 'completed', finished_at = CURRENT_TIMESTAMP, 
         processed_rows = ?, updated_rows = ?, skipped_rows = ?, error_rows = ?, message = 'Sincronización finalizada exitosamente.' WHERE id = ?`,
        [processed, updated, skipped, errors, runId]
      )

    } catch (err: any) {
      await query(
        `UPDATE external_sync_runs SET status = 'error', finished_at = CURRENT_TIMESTAMP, message = ? WHERE id = ?`,
        [err?.message || 'Error desconocido durante la sincronización', runId]
      )
    }
  })
}

function mapExternalRow(row: any, fallbackPlantel: string) {
  const padreFullName = [row.nombre_padre, row.apellido_paterno_padre, row.apellido_materno_padre].filter(Boolean).join(' ').trim()
  const madreFullName = [row.nombre_madre, row.apellido_paterno_madre, row.apellido_materno_madre].filter(Boolean).join(' ').trim()
  const padreTutor = padreFullName || madreFullName || 'No especificado'

  return {
    apellidoPaterno: String(row.apellido_paterno || '').trim(),
    apellidoMaterno: String(row.apellido_materno || '').trim(),
    nombres: String(row.nombres || '').trim(),
    nivel: String(row.nivel || 'Primaria').trim(),
    grado: String(row.grado || 'Primero').trim(),
    grupo: String(row.grupo || 'A').trim(),
    interno: (row.interno === false || row.interno === 0 || String(row.interno).toLowerCase() === 'false') ? 0 : 1,
    correo: String(row.email_padre || row.email_madre || '').trim(),
    telefono: String(row.telefono_padre || row.telefono_madre || '').trim(),
    padre: padreTutor,
    baja: row.baja,
    motivo_baja: row.motivo_baja,
    categoria_baja: row.categoria_baja
  }
}

function computeHash(mappedData: any) {
  const str = JSON.stringify(mappedData)
  return crypto.createHash('sha256').update(str).digest('hex')
}