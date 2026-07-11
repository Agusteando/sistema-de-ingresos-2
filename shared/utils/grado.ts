import { normalizeCicloKey, type CicloInput } from "./ciclo";

export const GRADOS_NORMALIZADOS = [
  "primero",
  "segundo",
  "tercero",
  "cuarto",
  "quinto",
  "sexto",
];
export const GRADOS_DISPLAY = [
  "Primero",
  "Segundo",
  "Tercero",
  "Cuarto",
  "Quinto",
  "Sexto",
];
export const NIVELES_ESCOLARES = [
  "Preescolar",
  "Primaria",
  "Secundaria",
] as const;
export type NivelEscolar = (typeof NIVELES_ESCOLARES)[number];
export type NivelEscolarOrEgresado = NivelEscolar | "Egresado";

const PRIMARIA_PLANTELES = new Set(["PM", "PT"]);
const SECUNDARIA_PLANTELES = new Set(["SM", "ST"]);

export const NIVEL_SEQUENCE: NivelEscolar[] = [
  "Preescolar",
  "Primaria",
  "Secundaria",
];
const GRADES_PER_NIVEL: Record<NivelEscolar, number> = {
  Preescolar: 3,
  Primaria: 6,
  Secundaria: 3,
};

const PRIMARIA_TO_SECUNDARIA_PLANTEL: Record<string, string> = {
  PM: "SM",
  PT: "ST",
};

const SECUNDARIA_TO_PRIMARIA_PLANTEL: Record<string, string> =
  Object.fromEntries(
    Object.entries(PRIMARIA_TO_SECUNDARIA_PLANTEL).map(
      ([primary, secondary]) => [secondary, primary],
    ),
  );

const PREESCOLAR_TO_PRIMARIA_PLANTEL: Record<string, string> = {
  PREEM: "PM",
  PREET: "PT",
};

const PRIMARIA_TO_PREESCOLAR_PLANTEL: Record<string, string> =
  Object.fromEntries(
    Object.entries(PREESCOLAR_TO_PRIMARIA_PLANTEL).map(
      ([preescolar, primary]) => [primary, preescolar],
    ),
  );

const GRADO_NUMERICO: Record<string, string> = {
  "1": "primero",
  "01": "primero",
  primero: "primero",
  primer: "primero",
  "2": "segundo",
  "02": "segundo",
  segundo: "segundo",
  "3": "tercero",
  "03": "tercero",
  tercero: "tercero",
  tercer: "tercero",
  "4": "cuarto",
  "04": "cuarto",
  cuarto: "cuarto",
  "5": "quinto",
  "05": "quinto",
  quinto: "quinto",
  "6": "sexto",
  "06": "sexto",
  sexto: "sexto",
};

const NIVEL_NORMALIZADO: Record<string, NivelEscolar> = {
  preescolar: "Preescolar",
  kinder: "Preescolar",
  jardin: "Preescolar",
  primaria: "Primaria",
  prim: "Primaria",
  secundaria: "Secundaria",
  sec: "Secundaria",
};

const normalizeText = (value: unknown) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const normalizePlantel = (plantel: unknown) =>
  String(plantel || "")
    .trim()
    .toUpperCase();

export const normalizeNivelEscolar = (nivel: unknown): NivelEscolar | "" => {
  const normalized = normalizeText(nivel);
  if (!normalized || normalized === "null" || normalized === "undefined")
    return "";
  return NIVEL_NORMALIZADO[normalized] || "";
};

export const nivelFromPlantel = (plantel: unknown): NivelEscolar => {
  const normalized = normalizePlantel(plantel);
  if (PRIMARIA_PLANTELES.has(normalized)) return "Primaria";
  if (SECUNDARIA_PLANTELES.has(normalized)) return "Secundaria";
  return "Preescolar";
};

export const nivelFromMatricula = (matricula: unknown): NivelEscolar => {
  const normalized = String(matricula || "")
    .trim()
    .toUpperCase();
  const prefix = normalized.slice(0, 2);
  if (PRIMARIA_PLANTELES.has(prefix)) return "Primaria";
  if (SECUNDARIA_PLANTELES.has(prefix)) return "Secundaria";
  return "Preescolar";
};

export const resolveNivelEscolar = (
  input: unknown,
  nivelOverride?: unknown,
): NivelEscolar => {
  if (typeof input === "object" && input !== null) {
    const source = input as Record<string, unknown>;
    const explicit = normalizeNivelEscolar(
      nivelOverride ?? source.nivelOverride ?? source.nivelBase ?? source.nivel,
    );
    if (explicit) return explicit;
    return nivelFromPlantel(source.plantel);
  }

  const explicit = normalizeNivelEscolar(nivelOverride);
  if (explicit) return explicit;
  return nivelFromPlantel(input);
};

export const maxGradoForNivel = (nivel: unknown) =>
  GRADES_PER_NIVEL[normalizeNivelEscolar(nivel) || "Preescolar"];

export const maxGradoForPlantel = (
  plantel: unknown,
  nivelOverride?: unknown,
) => {
  return maxGradoForNivel(resolveNivelEscolar(plantel, nivelOverride));
};

export const normalizeGrado = (grado: unknown) => {
  if (!grado) return "primero";
  const key = String(grado)
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return GRADO_NUMERICO[key] || "primero";
};

export const normalizeGradoForPlantel = (
  grado: unknown,
  plantel: unknown,
  nivelOverride?: unknown,
) => {
  const normalized = normalizeGrado(grado);
  const max = maxGradoForPlantel(plantel, nivelOverride);
  const index = GRADOS_NORMALIZADOS.indexOf(normalized);
  return GRADOS_NORMALIZADOS[Math.min(Math.max(index, 0), max - 1)];
};

export const displayGrado = (grado: unknown) => {
  if (
    String(grado || "")
      .toLowerCase()
      .trim() === "egresado"
  )
    return "Egresado";
  const g = normalizeGrado(grado);
  return g.charAt(0).toUpperCase() + g.slice(1);
};

export const gradeOptionsForNivel = (nivel: unknown) => {
  return GRADOS_DISPLAY.slice(0, maxGradoForNivel(nivel));
};

export const gradeOptionsForPlantel = (
  plantel: unknown,
  nivelOverride?: unknown,
) => {
  return gradeOptionsForNivel(resolveNivelEscolar(plantel, nivelOverride));
};

export const projectPlantelForNivel = (plantel: unknown, nivel: unknown) => {
  const sourcePlantel = normalizePlantel(plantel);
  const targetNivel = normalizeNivelEscolar(nivel);

  if (!sourcePlantel || !targetNivel) return sourcePlantel;

  if (targetNivel === "Secundaria") {
    return (
      PRIMARIA_TO_SECUNDARIA_PLANTEL[sourcePlantel] ||
      (SECUNDARIA_PLANTELES.has(sourcePlantel) ? sourcePlantel : sourcePlantel)
    );
  }

  if (targetNivel === "Primaria") {
    return (
      SECUNDARIA_TO_PRIMARIA_PLANTEL[sourcePlantel] ||
      PREESCOLAR_TO_PRIMARIA_PLANTEL[sourcePlantel] ||
      (PRIMARIA_PLANTELES.has(sourcePlantel) ? sourcePlantel : sourcePlantel)
    );
  }

  if (targetNivel === "Preescolar") {
    return PRIMARIA_TO_PREESCOLAR_PLANTEL[sourcePlantel] || sourcePlantel;
  }

  return sourcePlantel;
};

export interface AcademicPosition {
  nivel: NivelEscolar;
  grado: string;
  index: number;
}

export const academicPositionSequence = (): AcademicPosition[] => {
  const positions: AcademicPosition[] = [];

  NIVEL_SEQUENCE.forEach((nivel) => {
    GRADOS_NORMALIZADOS.slice(0, GRADES_PER_NIVEL[nivel]).forEach((grado) => {
      positions.push({ nivel, grado, index: positions.length });
    });
  });

  return positions;
};

export const academicPositionIndex = (nivel: unknown, grado: unknown) => {
  const normalizedNivel = normalizeNivelEscolar(nivel);
  if (!normalizedNivel) return -1;
  const normalizedGrado = normalizeGradoForPlantel(grado, "", normalizedNivel);
  return academicPositionSequence().findIndex(
    (position) =>
      position.nivel === normalizedNivel && position.grado === normalizedGrado,
  );
};

export const academicPositionAtIndex = (
  index: unknown,
): AcademicPosition | null => {
  const numericIndex = Number(index);
  if (!Number.isFinite(numericIndex)) return null;
  return academicPositionSequence()[numericIndex] || null;
};

export const calculateBasePlacementForTargetPosition = (
  targetNivel: unknown,
  targetGrado: unknown,
  ingresoCiclo: unknown,
  selectedCiclo: unknown,
  targetPlantel: unknown,
) => {
  const targetPositionIndex = academicPositionIndex(targetNivel, targetGrado);
  const ingresoYear = parseInt(
    normalizeCicloKey(ingresoCiclo as CicloInput),
    10,
  );
  const selectedYear = parseInt(
    normalizeCicloKey(selectedCiclo as CicloInput),
    10,
  );

  if (targetPositionIndex < 0 || isNaN(ingresoYear) || isNaN(selectedYear)) {
    return {
      outOfScope: true,
      nivel: "",
      grado: "",
      plantel: normalizePlantel(targetPlantel),
      index: -1,
    };
  }

  const diff = selectedYear - ingresoYear;
  if (diff < 0) {
    return {
      outOfScope: true,
      nivel: "",
      grado: "",
      plantel: normalizePlantel(targetPlantel),
      index: -1,
    };
  }

  const basePosition = academicPositionAtIndex(targetPositionIndex - diff);
  if (!basePosition) {
    return {
      outOfScope: true,
      nivel: "",
      grado: "",
      plantel: normalizePlantel(targetPlantel),
      index: -1,
    };
  }

  return {
    ...basePosition,
    plantel: projectPlantelForNivel(targetPlantel, basePosition.nivel),
    outOfScope: false,
  };
};

export const plantelCandidatesForProjectedScope = (plantel: unknown) => {
  const activePlantel = normalizePlantel(plantel);
  const candidates = new Set<string>();
  if (!activePlantel || activePlantel === "GLOBAL") return [];

  candidates.add(activePlantel);

  Object.entries(PRIMARIA_TO_SECUNDARIA_PLANTEL).forEach(
    ([primary, secondary]) => {
      if (secondary === activePlantel) candidates.add(primary);
      if (primary === activePlantel) candidates.add(secondary);
    },
  );

  Object.entries(PREESCOLAR_TO_PRIMARIA_PLANTEL).forEach(
    ([preescolar, primary]) => {
      if (primary === activePlantel) candidates.add(preescolar);
      if (preescolar === activePlantel) candidates.add(primary);
    },
  );

  return Array.from(candidates);
};

const buildPlacementResult = (
  grado: string,
  nivel: NivelEscolarOrEgresado,
  plantel: string,
  outOfScope: boolean,
  maxGrado: number,
) => ({
  grado,
  nivel,
  plantel,
  egresado: nivel === "Egresado",
  outOfScope,
  maxGrado,
});

export const calculatePromotedGrado = (
  gradoBase: unknown,
  plantel: unknown,
  cicloBase: unknown,
  selectedCiclo: unknown,
  nivelOverride?: unknown,
) => {
  const sourceNivel = resolveNivelEscolar(plantel, nivelOverride);
  const normalizedGrado = normalizeGradoForPlantel(
    gradoBase,
    plantel,
    sourceNivel,
  );
  const sourceMax = maxGradoForNivel(sourceNivel);
  const sourcePlantel = normalizePlantel(plantel);
  const baseIndex = Math.max(GRADOS_NORMALIZADOS.indexOf(normalizedGrado), 0);

  if (!cicloBase || !selectedCiclo) {
    return buildPlacementResult(
      normalizedGrado,
      sourceNivel,
      projectPlantelForNivel(sourcePlantel, sourceNivel),
      false,
      sourceMax,
    );
  }

  const baseYear = parseInt(normalizeCicloKey(cicloBase as CicloInput), 10);
  const selectedYear = parseInt(
    normalizeCicloKey(selectedCiclo as CicloInput),
    10,
  );

  if (isNaN(baseYear) || isNaN(selectedYear)) {
    return buildPlacementResult(
      normalizedGrado,
      sourceNivel,
      projectPlantelForNivel(sourcePlantel, sourceNivel),
      false,
      sourceMax,
    );
  }

  const diff = selectedYear - baseYear;

  if (diff < 0) {
    return buildPlacementResult(
      normalizedGrado,
      sourceNivel,
      projectPlantelForNivel(sourcePlantel, sourceNivel),
      true,
      sourceMax,
    );
  }

  let promotedPosition = baseIndex + 1 + diff;
  const sourceLevelIndex = NIVEL_SEQUENCE.indexOf(sourceNivel);

  for (
    let levelIndex = sourceLevelIndex;
    levelIndex < NIVEL_SEQUENCE.length;
    levelIndex += 1
  ) {
    const nivel = NIVEL_SEQUENCE[levelIndex];
    const max = maxGradoForNivel(nivel);

    if (promotedPosition <= max) {
      return buildPlacementResult(
        GRADOS_NORMALIZADOS[promotedPosition - 1],
        nivel,
        projectPlantelForNivel(sourcePlantel, nivel),
        false,
        max,
      );
    }

    promotedPosition -= max;
  }

  return buildPlacementResult(
    "egresado",
    "Egresado",
    sourcePlantel,
    true,
    sourceMax,
  );
};

export const isOutOfScopeForPlantelCiclo = (
  gradoBase: unknown,
  plantel: unknown,
  cicloBase: unknown,
  selectedCiclo: unknown,
  nivelOverride?: unknown,
) =>
  calculatePromotedGrado(
    gradoBase,
    plantel,
    cicloBase,
    selectedCiclo,
    nivelOverride,
  ).outOfScope;

export const isInScopeForPlantelCiclo = (
  gradoBase: unknown,
  plantel: unknown,
  cicloBase: unknown,
  selectedCiclo: unknown,
  nivelOverride?: unknown,
) =>
  !isOutOfScopeForPlantelCiclo(
    gradoBase,
    plantel,
    cicloBase,
    selectedCiclo,
    nivelOverride,
  );

export const isInProjectedPlantelScopeForCiclo = (
  gradoBase: unknown,
  plantel: unknown,
  cicloBase: unknown,
  selectedCiclo: unknown,
  nivelOverride: unknown,
  activePlantel: unknown,
) => {
  const projected = calculatePromotedGrado(
    gradoBase,
    plantel,
    cicloBase,
    selectedCiclo,
    nivelOverride,
  );
  const targetPlantel = normalizePlantel(activePlantel);
  if (!targetPlantel || targetPlantel === "GLOBAL")
    return !projected.outOfScope;
  return (
    !projected.outOfScope &&
    normalizePlantel(projected.plantel) === targetPlantel
  );
};
