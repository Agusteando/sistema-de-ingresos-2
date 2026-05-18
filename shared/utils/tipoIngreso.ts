import { formatCicloLabel } from "./ciclo";

export type TipoIngresoValue = "interno" | "externo";
export type TipoIngresoSource =
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
}

const DEFAULT_CICLO = "2025";

const DEFAULT_ENROLLMENT_CONCEPTS = [
  "inscripcion",
  "inscripción",
  "reinscripcion",
  "reinscripción",
];

const normalizeText = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

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

const normalizeConceptList = (values: unknown): string[] => {
  if (values === null || values === undefined) return [];

  if (Array.isArray(values)) {
    return values.flatMap(normalizeConceptList);
  }

  if (typeof values === "object") {
    return Object.values(values as Record<string, unknown>).flatMap(
      normalizeConceptList,
    );
  }

  return String(values).split(/[|,;]/).map(normalizeText).filter(Boolean);
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
    if (direct !== undefined) return normalizeConceptList(direct);

    const matchingEntry = Object.entries(map).find(
      ([key]) => normalizeCicloForTipoIngreso(key) === cicloKey,
    );
    return matchingEntry ? normalizeConceptList(matchingEntry[1]) : [];
  });
};

const readTargetConcepts = (student: any, targetCicloKey: string): string[] =>
  normalizeConceptList([
    student?.tipoIngresoEvidence?.targetConcepts,
    student?.tipoIngresoEvidence?.targetConceptos,
    student?.tipoIngresoTargetConcepts,
    student?.tipoIngresoTargetConceptos,
    student?.conceptosTargetCiclo,
    student?.conceptosCicloActual,
    student?.conceptosPagados,
    student?.conceptosCargados,
    readEvidenceMapConcepts(student, targetCicloKey),
  ]);

const readPreviousConcepts = (student: any, previousCiclo: string): string[] =>
  normalizeConceptList([
    student?.tipoIngresoEvidence?.previousConcepts,
    student?.tipoIngresoEvidence?.previousConceptos,
    student?.tipoIngresoPreviousConcepts,
    student?.tipoIngresoPreviousConceptos,
    student?.conceptosPreviousCiclo,
    student?.conceptosCicloPrevio,
    student?.conceptosPagadosPrevios,
    student?.conceptosCargadosPrevios,
    readEvidenceMapConcepts(student, previousCiclo),
  ]);

const conceptsContainEnrollment = (
  concepts: unknown[],
  enrollmentConcepts: unknown[],
): boolean => {
  const normalizedConcepts = normalizeConceptList(concepts);
  if (!normalizedConcepts.length) return false;

  const tokens = normalizeConceptList(enrollmentConcepts).filter(
    (concept) => concept.length >= 3,
  );

  const effectiveTokens = tokens.length
    ? tokens
    : normalizeConceptList(DEFAULT_ENROLLMENT_CONCEPTS);
  return normalizedConcepts.some((concept) =>
    effectiveTokens.some((token) => concept.includes(token)),
  );
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
    const previousCiclo = previousCicloKey(targetCicloKey);
    const targetHasEnrollmentConcept = conceptsContainEnrollment(
      readTargetConcepts(student, targetCicloKey),
      options.enrollmentConcepts || DEFAULT_ENROLLMENT_CONCEPTS,
    );
    const previousHasEnrollmentConcept = conceptsContainEnrollment(
      readPreviousConcepts(student, previousCiclo),
      options.enrollmentConcepts || DEFAULT_ENROLLMENT_CONCEPTS,
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

export const tipoIngresoToInternoValue = (
  tipoIngreso: TipoIngresoResult | TipoIngresoValue,
): 0 | 1 =>
  (typeof tipoIngreso === "string" ? tipoIngreso : tipoIngreso.value) ===
  "interno"
    ? 1
    : 0;

export const formatTipoIngresoValue = (
  tipoIngreso: TipoIngresoResult | TipoIngresoValue | null | undefined,
): string => {
  const value =
    typeof tipoIngreso === "string" ? tipoIngreso : tipoIngreso?.value;
  return value === "interno" ? "Interno" : "Externo";
};
