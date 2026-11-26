// Shared read-side evidence from /api/students. Keep the four cycle parameters
// in target, target, previous, previous order. Control Escolar requests only IDs;
// the financial route retains its original amounts and descriptions.
export const financialEnrollmentEvidenceJoins = (baseAlias: 'A' | 'b', includeFinancialDetails = true) => `
    LEFT JOIN (
      SELECT
        R.matricula AS matricula,
${includeFinancialDetails ? "        SUM(R.monto) AS pagosTotal,\n        GROUP_CONCAT(DISTINCT R.conceptoNombre SEPARATOR '|') AS conceptosPagados,\n" : ''}        GROUP_CONCAT(DISTINCT CAST(COALESCE(P.concepto_id, D.concepto, R.concepto) AS CHAR) SEPARATOR '|') AS conceptoIdsPagados
      FROM referenciasdepago R
      LEFT JOIN documentos D ON D.documento = R.documento
      LEFT JOIN documento_concepto_periodos P
        ON P.documento = R.documento
        AND P.estatus = 'Activo'
        AND CAST(R.mes AS UNSIGNED) >= P.start_mes
        AND (P.end_mes IS NULL OR CAST(R.mes AS UNSIGNED) <= P.end_mes)
      WHERE R.ciclo = ? AND R.estatus = 'Vigente'
      GROUP BY R.matricula
    ) FPaid ON ${baseAlias}.matricula = FPaid.matricula
    LEFT JOIN (
      SELECT
        cargos.matricula,
${includeFinancialDetails ? "        SUM(cargos.monto) AS saldo,\n        GROUP_CONCAT(DISTINCT cargos.conceptoNombre SEPARATOR '|') AS conceptosCargados,\n" : ''}        GROUP_CONCAT(DISTINCT cargos.conceptoId SEPARATOR '|') AS conceptoIdsCargados
      FROM (
        SELECT
          D.matricula,
${includeFinancialDetails ? "          CASE\n            WHEN P.accion = 'cambio' THEN COALESCE(P.montoFinal, ((100 - IFNULL(D.beca, 0)) * IFNULL(P.costo, D.costo) / 100))\n            ELSE COALESCE(D.montoFinal, ((100 - IFNULL(D.beca, 0)) * IFNULL(P.costo, D.costo) / 100))\n          END AS monto,\n          IFNULL(P.conceptoNombre, D.conceptoNombre) AS conceptoNombre,\n" : ''}          CAST(COALESCE(P.concepto_id, D.concepto) AS CHAR) AS conceptoId
        FROM documentos D
        JOIN (
          SELECT 1 AS mes UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
          UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
        ) M ON M.mes <= GREATEST(1, CAST(IFNULL(NULLIF(D.meses, ''), '1') AS UNSIGNED))
        LEFT JOIN documento_concepto_periodos P
          ON P.documento = D.documento
          AND P.estatus = 'Activo'
          AND M.mes >= P.start_mes
          AND (P.end_mes IS NULL OR M.mes <= P.end_mes)
        WHERE D.ciclo = ? AND D.estatus = 'Activo' AND (P.accion IS NULL OR P.accion <> 'cancelacion')
      ) cargos
      GROUP BY cargos.matricula
    ) FCharged ON ${baseAlias}.matricula = FCharged.matricula
    LEFT JOIN (
      SELECT
        R.matricula AS matricula,
${includeFinancialDetails ? "        GROUP_CONCAT(DISTINCT R.conceptoNombre SEPARATOR '|') AS conceptosPagadosPrevios,\n" : ''}        GROUP_CONCAT(DISTINCT CAST(COALESCE(P.concepto_id, D.concepto, R.concepto) AS CHAR) SEPARATOR '|') AS conceptoIdsPagadosPrevios
      FROM referenciasdepago R
      LEFT JOIN documentos D ON D.documento = R.documento
      LEFT JOIN documento_concepto_periodos P
        ON P.documento = R.documento
        AND P.estatus = 'Activo'
        AND CAST(R.mes AS UNSIGNED) >= P.start_mes
        AND (P.end_mes IS NULL OR CAST(R.mes AS UNSIGNED) <= P.end_mes)
      WHERE R.ciclo = ? AND R.estatus = 'Vigente'
      GROUP BY R.matricula
    ) FPrevPaid ON ${baseAlias}.matricula = FPrevPaid.matricula
    LEFT JOIN (
      SELECT
        matricula,
${includeFinancialDetails ? "        GROUP_CONCAT(DISTINCT conceptoNombre SEPARATOR '|') AS conceptosCargadosPrevios,\n" : ''}        GROUP_CONCAT(DISTINCT concepto SEPARATOR '|') AS conceptoIdsCargadosPrevios
      FROM documentos
      WHERE ciclo = ? AND estatus = 'Activo'
      GROUP BY matricula
    ) FPrevCharged ON ${baseAlias}.matricula = FPrevCharged.matricula
`

export const financialTipoIngresoOverrideJoin = (baseAlias: 'A' | 'b') =>
  `LEFT JOIN student_tipo_ingreso_overrides TIO ON TIO.matricula = ${baseAlias}.matricula`

export const financialTipoIngresoOverrideFields = [
  'IFNULL(TIO.override_activo, 0) AS tipoIngresoOverrideActivo',
  "IFNULL(TIO.tipo_forzado, 'externo') AS tipoIngresoOverride",
]
