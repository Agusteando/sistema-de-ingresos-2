import { runWithBridgeAgentId, query } from "../../../utils/db";
import dayjs from "dayjs";
import { normalizeCicloKey } from "../../../../shared/utils/ciclo";
import {
  isInProjectedPlantelScopeForCiclo,
  normalizePlantel,
  plantelCandidatesForProjectedScope,
} from "../../../../shared/utils/grado";
import { resolveProjectedAmount } from "../../../utils/monto-final";
import { normalizeBecaTypes } from "../../../utils/becaTypes";
import { isDepuradoPayment, isOtherCampusPayment } from "../../../utils/payment-classification";
import {
  getDocumentoPeriodoSchema,
  periodoLifecycleSelect,
} from "../../../utils/documento-periods";

const cicloQueryValues = (cicloKey: string) => {
  const key = String(cicloKey || "").trim();
  const numeric = Number(key);
  return Array.from(
    new Set(
      [
        key,
        Number.isFinite(numeric) ? `${key}-${numeric + 1}` : "",
      ].filter(Boolean),
    ),
  );
};

const cicloInClause = (values: string[]) => values.map(() => "?").join(",");

export default defineEventHandler(async (event) =>
  runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
    const matricula = event.context.params?.matricula;
    const { ciclo = "2025", lateFeeActive = "true" } = getQuery(event);
    const cicloKey = normalizeCicloKey(ciclo);
    if (!matricula)
      throw createError({ statusCode: 400, message: "Matrícula requerida" });

    const normalizedMatricula = matricula.trim();
    const cicloValues = cicloQueryValues(cicloKey);

    const documentos = await query<any[]>(
      `
    SELECT
      d.documento, d.matricula, d.costo, d.montoFinal, d.meses, d.plazo,
      d.beca, d.becaNombre, d.becaTipos, d.becaMotivo, d.becaMonto, d.becaPorcentaje,
      d.becaCartaGenerada, d.ciclo, d.concepto, d.conceptoNombre, d.eventual
    FROM documentos d
    WHERE d.matricula = ?
      AND CAST(d.ciclo AS CHAR) IN (${cicloInClause(cicloValues)})
      AND LOWER(TRIM(CAST(d.estatus AS CHAR))) = 'activo'
  `,
      [normalizedMatricula, ...cicloValues],
    );

    const pagosRows = await query<any[]>(
      `
    SELECT folio, folio_plantel, documento, mes, mesReal, recargo, monto, fecha, fecha_original, fecha_modificada_at, fecha_modificada_por, formaDePago, concepto, conceptoNombre, estatus, depurado, depurado_por, depurado_fecha, pago_otro_plantel, plantel_pago
    FROM referenciasdepago
    WHERE matricula = ?
      AND CAST(ciclo AS CHAR) IN (${cicloInClause(cicloValues)})
    ORDER BY fecha DESC, folio DESC
  `,
      [normalizedMatricula, ...cicloValues],
    );

    const [studentRef] = await query<any[]>(
      `SELECT matricula, plantel, nivel as nivelBase, grado as gradoBase, ciclo as cicloBase FROM base WHERE matricula = ? LIMIT 1`,
      [normalizedMatricula],
    );

    const hasLegacyFinancialEvidence = documentos.length > 0 || pagosRows.length > 0;
    if (!studentRef && !hasLegacyFinancialEvidence) return [];

    const user = event.context.user;
    const isScopedToActivePlantel =
      !user.isSuperAdmin ||
      (user.isSuperAdmin && user.active_plantel !== "GLOBAL");

    if (studentRef) {
      const projectedPlantelInScope = isInProjectedPlantelScopeForCiclo(
        studentRef.gradoBase,
        studentRef.plantel,
        studentRef.cicloBase,
        cicloKey,
        studentRef.nivelBase,
        isScopedToActivePlantel ? user.active_plantel : "GLOBAL",
      );

      if (!projectedPlantelInScope) {
        const activePlantelKey = normalizePlantel(user.active_plantel);
        const basePlantelKey = normalizePlantel(studentRef.plantel);
        const plantelCandidates = isScopedToActivePlantel
          ? plantelCandidatesForProjectedScope(activePlantelKey)
          : [];
        const basePlantelAllowed =
          !isScopedToActivePlantel ||
          plantelCandidates.includes(basePlantelKey);

        if (!hasLegacyFinancialEvidence) {
          console.info("[EstadoCuentaDebug] Estado de Cuenta filtered by scope", {
            matricula: normalizedMatricula,
            selectedCicloRaw: ciclo,
            normalizedCicloKey: cicloKey,
            cicloQueryValues: cicloValues,
            basePlantel: basePlantelKey,
            activePlantel: activePlantelKey || "GLOBAL",
            hasLegacyFinancialEvidence,
            returnedDocumentosCount: documentos.length,
            returnedReferenciasCount: pagosRows.length,
          });
          return [];
        }

        console.info("[EstadoCuentaDebug] Estado de Cuenta scope bypassed by legacy financial evidence", {
          matricula: normalizedMatricula,
          selectedCicloRaw: ciclo,
          normalizedCicloKey: cicloKey,
          cicloQueryValues: cicloValues,
          basePlantel: basePlantelKey,
          activePlantel: activePlantelKey || "GLOBAL",
          basePlantelAllowed,
          returnedDocumentosCount: documentos.length,
          returnedReferenciasCount: pagosRows.length,
        });
      }
    } else {
      console.info("[EstadoCuentaDebug] Estado de Cuenta loaded without base row using legacy financial evidence", {
        matricula: normalizedMatricula,
        selectedCicloRaw: ciclo,
        normalizedCicloKey: cicloKey,
        cicloQueryValues: cicloValues,
        returnedDocumentosCount: documentos.length,
        returnedReferenciasCount: pagosRows.length,
      });
    }

    let periodRows: any[] = [];
    if (documentos.length) {
      try {
        const periodoSchema = await getDocumentoPeriodoSchema();
        periodRows = await query<any[]>(
          `
        SELECT id, documento, start_mes, end_mes, concepto_id, conceptoNombre, costo, montoFinal, accion, estatus, ${periodoLifecycleSelect(periodoSchema)}
        FROM documento_concepto_periodos
        WHERE documento IN (${documentos.map(() => "?").join(",")}) AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'activo'
        ORDER BY documento ASC, start_mes ASC, id ASC
      `,
          documentos.map((doc) => doc.documento),
        );
      } catch (error: any) {
        console.warn("[EstadoCuentaDebug] documento_concepto_periodos unavailable; legacy documentos will render without period overrides", {
          matricula: normalizedMatricula,
          selectedCicloRaw: ciclo,
          normalizedCicloKey: cicloKey,
          message: error?.message || error,
        });
        periodRows = [];
      }
    }

    const periodsByDocument = new Map<number, any[]>();
    periodRows.forEach((period) => {
      const key = Number(period.documento);
      const list = periodsByDocument.get(key) || [];
      list.push(period);
      periodsByDocument.set(key, list);
    });

    const differentialParentByDocument = new Map<number, number>();
    const differentialPeriodByDocument = new Map<number, any>();
    periodRows.forEach((period) => {
      const diferencialDocumento = Number(period.diferencial_documento || 0);
      if (!diferencialDocumento) return;
      differentialParentByDocument.set(
        diferencialDocumento,
        Number(period.documento),
      );
      differentialPeriodByDocument.set(diferencialDocumento, period);
    });

    const debtRowsByDocumentMes = new Map<string, any>();

    const debts = [];
    const today = dayjs();

    const spanishMonths = [
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
    ];

    for (const doc of documentos) {
      const isEventual = String(doc.eventual) === "1";
      const beca = parseFloat(doc.beca) || 0;

      let plazos = 1;
      const plazoRaw = doc.plazo || doc.meses;
      if (plazoRaw) {
        const plazoStr = String(plazoRaw).trim();
        if (plazoStr.startsWith("[")) {
          try {
            plazos = JSON.parse(plazoStr).length || 1;
          } catch (e) {}
        } else if (plazoStr.includes(",")) {
          plazos = plazoStr.split(",").filter(Boolean).length || 1;
        } else {
          plazos = parseInt(plazoStr) || 1;
        }
      }

      for (let mes = 1; mes <= plazos; mes++) {
        const mesStr = isEventual ? "ev" : String(mes);
        const mesNumber = isEventual ? 1 : mes;
        const activePeriod = (
          periodsByDocument.get(Number(doc.documento)) || []
        ).find((period) => {
          const startMes = Number(period.start_mes || 1);
          const endMes =
            period.end_mes == null
              ? Number.POSITIVE_INFINITY
              : Number(period.end_mes);
          return mesNumber >= startMes && mesNumber <= endMes;
        });

        if (activePeriod?.accion === "cancelacion") continue;

        const conceptoNombre =
          activePeriod?.conceptoNombre || doc.conceptoNombre;
        const projected = resolveProjectedAmount(doc, activePeriod);
        const costoBase = projected.baseCost;
        const totalOriginal = projected.amount;

        // Preserve the full payment history for audit/actions, but only vigente rows affect balances.
        const historialPagosDelMes = pagosRows.filter(
          (p) =>
            String(p.documento) === String(doc.documento) &&
            (String(p.mes) === mesStr || String(p.mes) === String(mes)),
        );
        const pagosDelMes = historialPagosDelMes.filter(
          (p) => String(p.estatus || "").trim().toLowerCase() === "vigente",
        );

        const pagosAplicadosDelMes = pagosDelMes.filter(
          (p) => !isDepuradoPayment(p),
        );
        const depuracionesDelMes = pagosDelMes.filter(isDepuradoPayment);
        const pagosTotalMes = pagosAplicadosDelMes.reduce(
          (sum, p) => sum + parseFloat(p.monto),
          0,
        );
        const depuradoTotalMes = depuracionesDelMes.reduce(
          (sum, p) => sum + parseFloat(p.monto),
          0,
        );
        const resueltoTotalMes = pagosTotalMes + depuradoTotalMes;
        const hasRecargoManual = pagosDelMes.some(
          (p) => String(p.recargo) === "1",
        );

        let subtotal = totalOriginal;
        let saldoAntes = subtotal - resueltoTotalMes;

        const monthOffset = mes > 5 ? mes - 6 : mes + 6;
        const limitDate = dayjs()
          .year(today.year())
          .month(monthOffset)
          .date(12);
        const isLate = today.isAfter(limitDate);

        if (
          lateFeeActive === "true" &&
          !isEventual &&
          (hasRecargoManual || (isLate && saldoAntes > 10))
        ) {
          subtotal = Math.trunc(totalOriginal * 1.1);
          saldoAntes = subtotal - resueltoTotalMes;
        }
        if (saldoAntes < 0) saldoAntes = 0;

        const mesLabel = isEventual
          ? "Cargo Único"
          : spanishMonths[mes - 1] || `Mensualidad ${mes}`;

        debts.push({
          documento: doc.documento,
          concepto: doc.concepto,
          conceptoId: activePeriod?.concepto_id || doc.concepto,
          periodoId: activePeriod?.id || null,
          conceptoNombre,
          isEventual,
          recurring: !isEventual && plazos > 1,
          totalMonths: plazos,
          periodoAccion: activePeriod?.accion || 'original',
          mes: mesStr, // Pass the parsed mes value ('ev' or numeric string) for reliable future binding
          mesLabel,
          costoOriginal: totalOriginal,
          costoBase,
          montoFinal:
            projected.source === "period"
              ? activePeriod?.montoFinal
              : doc.montoFinal,
          montoFinalPendiente: projected.pending,
          montoFinalSource: projected.source,
          subtotal,
          pagos: pagosTotalMes,
          pagosRegistrados: pagosTotalMes,
          resuelto: resueltoTotalMes,
          pagosDepurados: depuradoTotalMes,
          saldo: saldoAntes,
          beca,
          becaNombre:
            normalizeBecaTypes(doc.becaNombre || doc.becaTipos).selected.join(
              ", ",
            ) ||
            doc.becaNombre ||
            doc.becaTipos ||
            "",
          becaTipos:
            normalizeBecaTypes(doc.becaTipos || doc.becaNombre).selected.join(
              ", ",
            ) ||
            doc.becaTipos ||
            doc.becaNombre ||
            "",
          becaMotivo: doc.becaMotivo || "",
          becaMonto: Number(doc.becaMonto || 0),
          becaPorcentaje: Number(doc.becaPorcentaje || beca || 0),
          becaCartaGenerada: String(doc.becaCartaGenerada || "") === "1",
          porcentajePagado:
            subtotal > 0
              ? Math.min(100, (resueltoTotalMes * 100) / subtotal).toFixed(1)
              : 100,
          porcentajePagoReal:
            subtotal > 0
              ? Math.min(100, (pagosTotalMes * 100) / subtotal).toFixed(1)
              : 100,
          porcentajeDepurado:
            subtotal > 0
              ? Math.min(100, (depuradoTotalMes * 100) / subtotal).toFixed(1)
              : 0,
          isLate,
          hasRecargo: subtotal > totalOriginal,
          recargoActivo: lateFeeActive === "true",
          recargoManual: hasRecargoManual,
          originalConceptoNombre: doc.conceptoNombre,
          isDifferentialDocument: differentialParentByDocument.has(
            Number(doc.documento),
          ),
          parentDocumento:
            differentialParentByDocument.get(Number(doc.documento)) || null,
          linkedChangePeriodoId:
            differentialPeriodByDocument.get(Number(doc.documento))?.id || null,
          historialPagos: historialPagosDelMes.map((p) => ({
            ...p,
            depurado: isDepuradoPayment(p),
            pagoOtroPlantel: isOtherCampusPayment(p),
            plantelPago: p.plantel_pago || null,
            cancelado: ["cancelada", "cancelado"].includes(
              String(p.estatus || "").trim().toLowerCase(),
            ),
          })),
        });
      }
    }

    const countMonthsForTimeline = (doc: any) => {
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
      if (str.includes(","))
        return Math.max(1, str.split(",").filter(Boolean).length);
      return Math.max(1, Number.parseInt(str, 10) || 1);
    };

    const monthLabelFor = (mes: number, isEventual = false) =>
      isEventual
        ? "Cargo Único"
        : spanishMonths[mes - 1] || `Mensualidad ${mes}`;
    debts.forEach((debt: any) => {
      debtRowsByDocumentMes.set(
        `${Number(debt.documento)}:${debt.mes === "ev" ? 1 : Number(debt.mes || 1)}`,
        debt,
      );
    });

    const documentTimelineById = new Map<number, any>();

    documentos.forEach((doc: any) => {
      const documentoId = Number(doc.documento);
      const isEventual = String(doc.eventual) === "1";
      const totalMonths = countMonthsForTimeline(doc);
      const docPeriods = periodsByDocument.get(documentoId) || [];
      const monthStates: any[] = [];

      for (let mes = 1; mes <= totalMonths; mes++) {
        const activePeriod = docPeriods.find((period) => {
          const startMes = Number(period.start_mes || 1);
          const endMes =
            period.end_mes == null
              ? Number.POSITIVE_INFINITY
              : Number(period.end_mes);
          return mes >= startMes && mes <= endMes;
        });
        const key = `${documentoId}:${mes}`;
        const debt = debtRowsByDocumentMes.get(key);
        const cancelled = activePeriod?.accion === "cancelacion";
        monthStates.push({
          mes,
          mesLabel: monthLabelFor(mes, isEventual),
          conceptoNombre: cancelled
            ? "Cancelado"
            : activePeriod?.conceptoNombre || doc.conceptoNombre,
          accion: cancelled
            ? "cancelacion"
            : activePeriod?.accion === "cambio"
              ? "cambio"
              : "original",
          periodoId: activePeriod?.id || null,
          subtotal: Number(debt?.subtotal || 0),
          pagos: Number(debt?.pagos || 0),
          saldo: Number(debt?.saldo || 0),
          hasRecargo: Boolean(debt?.hasRecargo),
          cancelled,
        });
      }

      const segments: any[] = [];
      monthStates.forEach((month) => {
        const last = segments[segments.length - 1];
        const sameSegment =
          last &&
          last.conceptoNombre === month.conceptoNombre &&
          last.accion === month.accion &&
          last.periodoId === month.periodoId &&
          last.endMes + 1 === month.mes;

        if (sameSegment) {
          last.endMes = month.mes;
          last.endLabel = month.mesLabel;
          last.months.push(month.mes);
          last.subtotal += month.subtotal;
          last.pagos += month.pagos;
          last.saldo += month.saldo;
          last.hasRecargo = last.hasRecargo || month.hasRecargo;
          return;
        }

        segments.push({
          conceptoNombre: month.conceptoNombre,
          accion: month.accion,
          periodoId: month.periodoId,
          startMes: month.mes,
          endMes: month.mes,
          startLabel: month.mesLabel,
          endLabel: month.mesLabel,
          months: [month.mes],
          subtotal: month.subtotal,
          pagos: month.pagos,
          saldo: month.saldo,
          hasRecargo: month.hasRecargo,
          cancelled: month.cancelled,
        });
      });

      const linkedDifferentials = docPeriods
        .filter((period) => Number(period.diferencial_documento || 0) > 0)
        .map((period) => {
          const differentialDocumento = Number(period.diferencial_documento);
          const differentialDebts = debts.filter(
            (debt: any) => Number(debt.documento) === differentialDocumento,
          );
          return {
            documento: differentialDocumento,
            periodoId: period.id,
            conceptoNombre:
              differentialDebts[0]?.conceptoNombre ||
              `Diferencia · ${period.conceptoNombre || doc.conceptoNombre}`,
            monto: Number(period.diferencia_monto || 0),
            pagos: differentialDebts.reduce(
              (sum: number, debt: any) => sum + Number(debt.pagos || 0),
              0,
            ),
            saldo: differentialDebts.reduce(
              (sum: number, debt: any) => sum + Number(debt.saldo || 0),
              0,
            ),
          };
        });

      documentTimelineById.set(documentoId, {
        documento: documentoId,
        conceptoNombre: doc.conceptoNombre,
        totalMonths,
        isEventual,
        segments,
        linkedDifferentials,
        hasChanges:
          segments.some((segment) => segment.accion !== "original") ||
          linkedDifferentials.length > 0,
        subtotal: segments.reduce(
          (sum, segment) => sum + Number(segment.subtotal || 0),
          0,
        ),
        pagos: segments.reduce(
          (sum, segment) => sum + Number(segment.pagos || 0),
          0,
        ),
        saldo:
          segments.reduce(
            (sum, segment) => sum + Number(segment.saldo || 0),
            0,
          ) +
          linkedDifferentials.reduce(
            (sum, differential) => sum + Number(differential.saldo || 0),
            0,
          ),
      });
    });

    debts.forEach((debt: any) => {
      debt.documentTimeline =
        documentTimelineById.get(Number(debt.documento)) || null;
    });

    console.info("[EstadoCuentaDebug] Estado de Cuenta DB result", {
      matricula: normalizedMatricula,
      selectedCicloRaw: ciclo,
      normalizedCicloKey: cicloKey,
      cicloQueryValues: cicloValues,
      returnedDocumentosCount: documentos.length,
      returnedReferenciasCount: pagosRows.length,
      renderedConceptosCount: debts.length,
    });

    return debts;
  }),
);
