import { formatCicloLabel } from "./ciclo";

export type TipoIngresoValue = "interno" | "externo";
export type TipoIngresoSource =
  | "manual_override"
  | "ingreso_anchor"
  | "confirmed_conceptos"
  | "legacy_fallback";

export interface TipoIngresoResult {
  value: TipoIngresoValue;
  ciclo: string;
  source: TipoIngresoSource;
  reason: string;
}

export interface TipoIngresoResolverOptions {
  enrollmentConcepts?: unknown[];
  ignoreManualOverride?: boolean;
}

const DEFAULT_CICLO = "2025";
const truthyOverride = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const raw = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "si", "sí", "yes", "activo", "active"].includes(raw);
};

const normalizeTipoOverride = (value: unknown): TipoIngresoValue => {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "interno" ? "interno" : "externo";
};

const readManualOverride = (student: any): { active: boolean; value: TipoIngresoValue } => {
  const active = truthyOverride(
    student?.tipoIngresoOverrideActivo ??
      student?.tipoIngresoOverrideActive ??
      student?.tipo_ingreso_override_activo ??
      student?.overrideTipoIngresoActivo ??
      student?.override_tipo_ingreso_activo,
  );
  const value = normalizeTipoOverride(
    student?.tipoIngresoOverride ??
      student?.tipoIngresoOverrideValue ??
      student?.tipo_ingreso_override ??
      student?.tipo_forzado ??
      student?.tipoIngresoForzado,
  );

  return { active, value };
};


const normalizeEnrollmentConceptId = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  return /^\d+$/.test(raw) ? String(Number(raw)) : "";
};

export const normalizeCicloForTipoIngreso = (value: unknown): string | null => {
  if (Array.isArray(value)) return normalizeCicloForTipoIngreso(value[0]);
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const match = raw.match(/\b(19\d{2}|20\d{2}|21\d{2})\b/);
  if (!match) return null;

  const year = Number(match[1]);
  if (!Number.isFinite(year) || year < 1990 || year > 2199) return null;
  return String(year);
};

export const previousCicloKey = (value: unknown): string => {
  const key = normalizeCicloForTipoIngreso(value) || DEFAULT_CICLO;
  return String(Number(key) - 1);
};

export const nextCicloKey = (value: unknown): string => {
  const key = normalizeCicloForTipoIngreso(value) || DEFAULT_CICLO;
  return String(Number(key) + 1);
};

const normalizeConceptIdList = (values: unknown): string[] => {
  if (values === null || values === undefined) return [];

  if (Array.isArray(values)) {
    return values.flatMap(normalizeConceptIdList);
  }

  if (typeof values === "object") {
    return Object.values(values as Record<string, unknown>).flatMap(
      normalizeConceptIdList,
    );
  }

  return String(values)
    .split(/[|,;]/)
    .map(normalizeEnrollmentConceptId)
    .filter(Boolean);
};

const readEvidenceMapConcepts = (student: any, cicloKey: string): unknown[] => {
  const maps = [
    student?.tipoIngresoEvidence?.byCiclo,
    student?.tipoIngresoEvidence?.conceptosByCiclo,
    student?.conceptosByCiclo,
    student?.conceptosPorCiclo,
    student?.enrollmentConceptsByCiclo,
  ].filter(Boolean);

  return maps.flatMap((map: any) => {
    if (!map || typeof map !== "object") return [];
    const direct = map[cicloKey] ?? map[formatCicloLabel(cicloKey)];
    if (direct !== undefined) return normalizeConceptIdList(direct);

    const matchingEntry = Object.entries(map).find(
      ([key]) => normalizeCicloForTipoIngreso(key) === cicloKey,
    );
    return matchingEntry ? normalizeConceptIdList(matchingEntry[1]) : [];
  });
};

const readTargetConcepts = (student: any, targetCicloKey: string): string[] =>
  normalizeConceptIdList([
    student?.tipoIngresoEvidence?.targetConceptIds,
    student?.tipoIngresoEvidence?.targetConceptosIds,
    student?.tipoIngresoEvidence?.targetConcepts,
    student?.tipoIngresoEvidence?.targetConceptos,
    student?.tipoIngresoTargetConceptIds,
    student?.tipoIngresoTargetConceptosIds,
    student?.conceptoIdsTarget,
    student?.conceptoIdsTargetCiclo,
    student?.conceptoIdsCicloActual,
    student?.conceptoIdsPagados,
    student?.conceptoIdsCargados,
    readEvidenceMapConcepts(student, targetCicloKey),
  ]);

const readPreviousConcepts = (student: any, previousCiclo: string): string[] =>
  normalizeConceptIdList([
    student?.tipoIngresoEvidence?.previousConceptIds,
    student?.tipoIngresoEvidence?.previousConceptosIds,
    student?.tipoIngresoEvidence?.previousConcepts,
    student?.tipoIngresoEvidence?.previousConceptos,
    student?.tipoIngresoPreviousConceptIds,
    student?.tipoIngresoPreviousConceptosIds,
    student?.conceptoIdsPreviousCiclo,
    student?.conceptoIdsCicloPrevio,
    student?.conceptoIdsPagadosPrevios,
    student?.conceptoIdsCargadosPrevios,
    readEvidenceMapConcepts(student, previousCiclo),
  ]);

const readAllConcepts = (
  student: any,
  targetCicloKey: string,
  previousCiclo: string,
): string[] =>
  normalizeConceptIdList([
    student?.tipoIngresoEvidence?.allConceptIds,
    student?.tipoIngresoEvidence?.allConceptosIds,
    student?.tipoIngresoEvidence?.globalConceptIds,
    student?.tipoIngresoEvidence?.globalConceptosIds,
    student?.tipoIngresoEvidence?.historicalConceptIds,
    student?.tipoIngresoEvidence?.historicalConceptosIds,
    student?.tipoIngresoAllConceptIds,
    student?.tipoIngresoAllConceptosIds,
    student?.conceptoIdsTodos,
    student?.conceptoIdsAll,
    student?.conceptoIdsHistoricos,
    student?.conceptoIdsPagadosTodos,
    student?.conceptoIdsCargadosTodos,
    student?.conceptoIds,
    student?.conceptosIds,
    readTargetConcepts(student, targetCicloKey),
    readPreviousConcepts(student, previousCiclo),
  ]);

const matchingEnrollmentConcepts = (
  concepts: unknown[],
  enrollmentConcepts: unknown[],
): string[] => {
  const normalizedConcepts = normalizeConceptIdList(concepts);
  const enrollmentConceptIds = normalizeConceptIdList(enrollmentConcepts);
  if (!normalizedConcepts.length || !enrollmentConceptIds.length) return [];

  const conceptSet = new Set(normalizedConcepts);
  return Array.from(new Set(enrollmentConceptIds.filter((conceptId) => conceptSet.has(conceptId))));
};

const conceptsContainEnrollment = (
  concepts: unknown[],
  enrollmentConcepts: unknown[],
): boolean => matchingEnrollmentConcepts(concepts, enrollmentConcepts).length > 0;

const hasConfirmedEnrollmentPair = (
  student: any,
  targetCicloKey: string,
  previousCiclo: string,
  enrollmentConcepts: unknown[],
): boolean => {
  const enrollmentConceptIds = Array.from(new Set(normalizeConceptIdList(enrollmentConcepts)));
  if (enrollmentConceptIds.length < 2) return false;

  return matchingEnrollmentConcepts(
    readAllConcepts(student, targetCicloKey, previousCiclo),
    enrollmentConceptIds,
  ).length >= 2;
};

const fallbackResult = (
  cicloKey: string,
  reasonPrefix: string,
): TipoIngresoResult => ({
  value: "externo",
  ciclo: cicloKey,
  source: "legacy_fallback",
  reason: `${reasonPrefix} No hay ciclo de ingreso confiable; se conserva Externo como fallback defensivo.`,
});

export const resolveTipoIngreso = (
  student: any,
  targetCiclo: unknown,
  options: TipoIngresoResolverOptions = {},
): TipoIngresoResult => {
  const targetCicloKey = normalizeCicloForTipoIngreso(targetCiclo);

  if (!targetCicloKey) {
    return fallbackResult(
      DEFAULT_CICLO,
      "El ciclo seleccionado no se pudo normalizar.",
    );
  }

  const manualOverride = readManualOverride(student);
  if (!options.ignoreManualOverride && manualOverride.active) {
    return {
      value: manualOverride.value,
      ciclo: targetCicloKey,
      source: "manual_override",
      reason:
        manualOverride.value === "externo"
          ? "Tiene override manual activo: se fuerza Externo aunque la regla automática detecte evidencia de inscripción."
          : "Tiene override manual activo: se fuerza Interno y se omite la regla automática.",
    };
  }

  const previousCiclo = previousCicloKey(targetCicloKey);
  if (
    hasConfirmedEnrollmentPair(
      student,
      targetCicloKey,
      previousCiclo,
      options.enrollmentConcepts || [],
    )
  ) {
    return {
      value: "interno",
      ciclo: targetCicloKey,
      source: "confirmed_conceptos",
      reason: `Tiene los dos conceptos configurados de inscripción/reinscripción. Esta condición tiene prioridad y no depende del ciclo escolar seleccionado.`,
    };
  }

  const ingresoCicloKey = normalizeCicloForTipoIngreso(
    student?.cicloBase ??
      student?.baseCiclo ??
      student?.cicloIngreso ??
      student?.ciclo,
  );

  if (!ingresoCicloKey) {
    return fallbackResult(
      targetCicloKey,
      "base.ciclo no existe o no se pudo normalizar.",
    );
  }

  const targetYear = Number(targetCicloKey);
  const ingresoYear = Number(ingresoCicloKey);

  if (targetYear === ingresoYear) {
    return {
      value: "externo",
      ciclo: targetCicloKey,
      source: "ingreso_anchor",
      reason: `El ciclo seleccionado (${formatCicloLabel(targetCicloKey)}) coincide con base.ciclo; ese ciclo es el ingreso del alumno.`,
    };
  }

  if (targetYear > ingresoYear) {
    const targetHasEnrollmentConcept = conceptsContainEnrollment(
      readTargetConcepts(student, targetCicloKey),
      options.enrollmentConcepts || [],
    );
    const previousHasEnrollmentConcept = conceptsContainEnrollment(
      readPreviousConcepts(student, previousCiclo),
      options.enrollmentConcepts || [],
    );

    if (targetHasEnrollmentConcept && previousHasEnrollmentConcept) {
      return {
        value: "interno",
        ciclo: targetCicloKey,
        source: "confirmed_conceptos",
        reason: `Tiene conceptos validos de inscripción/reinscripción en ${formatCicloLabel(previousCiclo)} y ${formatCicloLabel(targetCicloKey)}.`,
      };
    }

    if (targetHasEnrollmentConcept) {
      return {
        value: "interno",
        ciclo: targetCicloKey,
        source: "ingreso_anchor",
        reason: `El ciclo seleccionado es posterior al ingreso (${formatCicloLabel(ingresoCicloKey)}) y tiene evidencia de inscripción/reinscripción en ${formatCicloLabel(targetCicloKey)}.`,
      };
    }

    return {
      value: "interno",
      ciclo: targetCicloKey,
      source: "ingreso_anchor",
      reason: `El ciclo seleccionado es posterior al ingreso (${formatCicloLabel(ingresoCicloKey)}). La ausencia de conceptos no se usa para inferir Externo.`,
    };
  }

  return {
    value: "externo",
    ciclo: targetCicloKey,
    source: "ingreso_anchor",
    reason: `El ciclo seleccionado es anterior al ciclo de ingreso registrado (${formatCicloLabel(ingresoCicloKey)}).`,
  };
};

export const formatTipoIngresoValue = (
  tipoIngreso: TipoIngresoResult | TipoIngresoValue | null | undefined,
): string => {
  const value =
    typeof tipoIngreso === "string" ? tipoIngreso : tipoIngreso?.value;
  return value === "interno" ? "Interno" : "Externo";
};
