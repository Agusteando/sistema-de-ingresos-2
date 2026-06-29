import {
  runWithBridgeAgentId,
  executeStatementTransaction,
  query,
  type SqlStatement,
} from "../../utils/db";
import { normalizeCicloKey } from "../../../shared/utils/ciclo";
import { isInProjectedPlantelScopeForCiclo } from "../../../shared/utils/grado";
import { isWholeMoney } from "../../utils/monto-final";
import { assertDocumentoPeriodoLifecycleSchema } from "../../utils/documento-periods";
import { assertStockAvailableForConcept } from '../../utils/conceptos-stock';

const toMesNumber = (value: unknown) => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "ev") return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const countPlazos = (doc: any) => {
  const raw = doc?.plazo || doc?.meses;
  if (!raw) return 1;
  const str = String(raw).trim();

  if (str.startsWith("[")) {
    try {
      const parsed = JSON.parse(str);
      return Array.isArray(parsed) ? Math.max(1, parsed.length) : 1;
    } catch (e) {
      return 1;
    }
  }

  if (str.includes(",")) {
    return Math.max(1, str.split(",").filter(Boolean).length);
  }

  return Math.max(1, Number.parseInt(str, 10) || 1);
};

const hasPaymentsFrom = async (documento: number, fromMes?: number) => {
  const params: any[] = [documento];
  let monthWhere = "";

  if (fromMes) {
    monthWhere = `AND (CASE WHEN mes = 'ev' THEN 1 ELSE CAST(mes AS UNSIGNED) END) >= ?`;
    params.push(fromMes);
  }

  const [payment] = await query<any[]>(
    `
      SELECT folio
      FROM referenciasdepago
      WHERE documento = ? AND estatus = 'Vigente' ${monthWhere}
      LIMIT 1
    `,
    params,
  );

  return Boolean(payment);
};

const periodBoundaryStatements = (
  documento: number,
  fromMes: number,
): SqlStatement[] => [
  {
    sql: `
      UPDATE documento_concepto_periodos
      SET estatus = 'Inactivo'
      WHERE documento = ? AND estatus = 'Activo' AND start_mes >= ?
    `,
    params: [documento, fromMes],
  },
  {
    sql: `
      UPDATE documento_concepto_periodos
      SET end_mes = ?
      WHERE documento = ?
        AND estatus = 'Activo'
        AND start_mes < ?
        AND (end_mes IS NULL OR end_mes >= ?)
    `,
    params: [fromMes - 1, documento, fromMes, fromMes],
  },
];

const toWholeMoney = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
};

export default defineEventHandler(async (event) =>
  runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
    const body = await readBody(event);
    const user = event.context.user;
    const documento = Number(body.documento);
    const action = String(body.action || "").trim();
    const cicloKey = normalizeCicloKey(body.ciclo);
    const fromMes = toMesNumber(body.fromMes);

    if (!documento || !action) {
      throw createError({
        statusCode: 400,
        message: "Documento y accion requeridos.",
      });
    }

    const [doc] = await query<any[]>(
      `
      SELECT
        D.documento, D.concepto, D.conceptoNombre, D.ciclo, D.meses, D.plazo, D.estatus, D.matricula,
        D.costo, D.montoFinal, D.eventual,
        D.beca, D.becaNombre, D.becaTipos, D.becaMotivo, D.becaMonto, D.becaPorcentaje,
        B.plantel, B.nivel as nivelBase, B.grado as gradoBase, B.ciclo as cicloBase
      FROM documentos D
      LEFT JOIN base B ON B.matricula = D.matricula
      WHERE D.documento = ?
      LIMIT 1
    `,
      [documento],
    );

    if (!doc) {
      throw createError({
        statusCode: 404,
        message: "Documento no encontrado.",
      });
    }

    if (String(doc.estatus).toLowerCase() !== "activo") {
      throw createError({
        statusCode: 409,
        message: "El documento no esta activo.",
      });
    }

    const isScopedToActivePlantel =
      !user.isSuperAdmin ||
      (user.isSuperAdmin && user.active_plantel !== "GLOBAL");

    if (
      !isInProjectedPlantelScopeForCiclo(
        doc.gradoBase,
        doc.plantel,
        doc.cicloBase,
        cicloKey,
        doc.nivelBase,
        isScopedToActivePlantel ? user.active_plantel : "GLOBAL",
      )
    ) {
      throw createError({
        statusCode: isScopedToActivePlantel ? 403 : 409,
        message: "Alumno fuera del alcance del plantel para este ciclo.",
      });
    }

    const maxMes = countPlazos(doc);
    const normalizedFromMes = Math.min(Math.max(1, fromMes), maxMes);

    if (action === "cancel_full") {
      if (await hasPaymentsFrom(documento)) {
        throw createError({
          statusCode: 409,
          message:
            "No se puede cancelar completo porque existen pagos vigentes.",
        });
      }

      await executeStatementTransaction([
        {
          sql: `UPDATE documentos SET estatus = 'Cancelado' WHERE documento = ?`,
          params: [documento],
        },
        {
          sql: `UPDATE documento_concepto_periodos SET estatus = 'Inactivo' WHERE documento = ?`,
          params: [documento],
        },
      ]);

      return { success: true, action };
    }

    if (action === "cancel_from") {
      if (await hasPaymentsFrom(documento, normalizedFromMes)) {
        throw createError({
          statusCode: 409,
          message:
            "Seleccione un mes posterior a los pagos vigentes para conservar el historial.",
        });
      }

      await executeStatementTransaction([
        ...periodBoundaryStatements(documento, normalizedFromMes),
        {
          sql: `
          INSERT INTO documento_concepto_periodos (
            documento, start_mes, end_mes, accion, estatus, created_by
          ) VALUES (?, ?, NULL, 'cancelacion', 'Activo', ?)
        `,
          params: [documento, normalizedFromMes, user?.name || "Sistema"],
        },
      ]);

      return { success: true, action, fromMes: normalizedFromMes };
    }

    if (action === "change") {
      await assertDocumentoPeriodoLifecycleSchema();

      const conceptoId = Number(body.conceptoId);

      if (!conceptoId) {
        throw createError({
          statusCode: 400,
          message: "Seleccione el nuevo concepto.",
        });
      }

      const [concepto] = await query<any[]>(
        `SELECT id, concepto, costo FROM conceptos WHERE id = ? AND ciclo = ? LIMIT 1`,
        [conceptoId, cicloKey],
      );

      if (!concepto) {
        throw createError({
          statusCode: 404,
          message: "Concepto no encontrado para el ciclo activo.",
        });
      }

      await assertStockAvailableForConcept({ conceptoId: concepto.id, plantel: doc.plantel, quantity: 1, operation: 'cambiar a este concepto' });

      const baseCoverageAmount = toWholeMoney(doc.montoFinal ?? doc.costo ?? 0);
      const coverageAmount = isWholeMoney(body.montoFinal)
        ? toWholeMoney(body.montoFinal, baseCoverageAmount)
        : baseCoverageAmount;
      const diferenciaMonto = toWholeMoney(body.diferenciaMonto, 0);

      if (!isWholeMoney(coverageAmount)) {
        throw createError({
          statusCode: 400,
          message:
            "El monto cubierto debe ser un numero entero, sin decimales.",
        });
      }

      if (!isWholeMoney(diferenciaMonto)) {
        throw createError({
          statusCode: 400,
          message: "La diferencia debe ser un numero entero, sin decimales.",
        });
      }

      const createdBy = user?.name || "Sistema";
      const paymentPolicy = "mantener_pagos_existentes";
      const statements: SqlStatement[] = [
        ...periodBoundaryStatements(documento, normalizedFromMes),
        {
          sql: `
          INSERT INTO documento_concepto_periodos (
            documento, start_mes, end_mes, concepto_id, conceptoNombre, costo, montoFinal,
            accion, estatus, created_by, payment_policy, diferencia_monto, diferencial_documento
          ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'cambio', 'Activo', ?, ?, ?, NULL)
        `,
          params: [
            documento,
            normalizedFromMes,
            concepto.id,
            concepto.concepto,
            Number(concepto.costo || 0),
            coverageAmount,
            createdBy,
            paymentPolicy,
            diferenciaMonto,
          ],
        },
      ];

      if (diferenciaMonto > 0) {
        const diferenciaConceptoNombre =
          `Diferencia · ${concepto.concepto}`.slice(0, 255);
        statements.push({ sql: "SET @periodo_cambio_id := LAST_INSERT_ID()" });
        statements.push({
          sql: `
          INSERT INTO documentos (
            concepto, conceptoNombre, matricula, costo, montoFinal, plazo, meses,
            beca, becaNombre, becaTipos, becaMotivo, becaMonto, becaPorcentaje,
            becaCartaGenerada, becaCartaFecha, ciclo, eventual, responsable, estatus
          ) VALUES (?, ?, ?, ?, ?, '1', 1, '0', NULL, NULL, NULL, 0, 0, 0, NULL, ?, 1, 'Admin', 'Activo')
        `,
          params: [
            concepto.id,
            diferenciaConceptoNombre,
            doc.matricula,
            diferenciaMonto,
            diferenciaMonto,
            cicloKey,
          ],
        });
        statements.push({
          sql: "SET @documento_diferencial_id := LAST_INSERT_ID()",
        });
        statements.push({
          sql: `
          UPDATE documento_concepto_periodos
          SET diferencial_documento = @documento_diferencial_id
          WHERE id = @periodo_cambio_id
        `,
        });
      }

      await executeStatementTransaction(statements);

      return {
        success: true,
        action,
        fromMes: normalizedFromMes,
        paymentPolicy,
        diferenciaMonto,
      };
    }

    throw createError({ statusCode: 400, message: "Accion no soportada." });
  }),
);
