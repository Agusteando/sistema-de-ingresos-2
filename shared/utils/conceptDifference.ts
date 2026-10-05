const normalizeConceptId = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const actionOf = (period: any) =>
  String(period?.accion || "").trim().toLowerCase();

const coversMonth = (period: any, month: number) => {
  const start = Math.max(1, Number(period?.start_mes || 1));
  const end =
    period?.end_mes == null
      ? Number.POSITIVE_INFINITY
      : Number(period.end_mes);
  return month >= start && month <= end;
};

export const isConceptTransition = (
  previousConceptId: unknown,
  nextConceptId: unknown,
) => {
  const previous = normalizeConceptId(previousConceptId);
  const next = normalizeConceptId(nextConceptId);
  return previous > 0 && next > 0 && previous !== next;
};

export const effectiveConceptIdFromPeriods = ({
  periods = [],
  month,
  originalConceptId,
}: {
  periods?: any[];
  month: unknown;
  originalConceptId: unknown;
}) => {
  const targetMonth = Math.max(1, Math.trunc(Number(month || 1)));
  const activeChange = [...periods]
    .filter(
      (period) =>
        actionOf(period) === "cambio" &&
        normalizeConceptId(period?.concepto_id) > 0 &&
        coversMonth(period, targetMonth),
    )
    .sort((left, right) => {
      const startDiff =
        Number(right?.start_mes || 1) - Number(left?.start_mes || 1);
      if (startDiff !== 0) return startDiff;
      return Number(right?.id || 0) - Number(left?.id || 0);
    })[0];

  return (
    normalizeConceptId(activeChange?.concepto_id) ||
    normalizeConceptId(originalConceptId)
  );
};

export const resolveInlineConceptDifference = ({
  activePeriod,
  periods = [],
  originalConceptId,
  month,
}: {
  activePeriod?: any;
  periods?: any[];
  originalConceptId: unknown;
  month: unknown;
}) => {
  const targetMonth = Math.max(1, Math.trunc(Number(month || 1)));
  const rawDifference = Number(activePeriod?.diferencia_monto || 0);

  if (
    actionOf(activePeriod) !== "cambio" ||
    Number(activePeriod?.start_mes || 1) !== targetMonth ||
    Number(activePeriod?.diferencial_documento || 0) > 0 ||
    !Number.isFinite(rawDifference) ||
    rawDifference <= 0
  ) {
    return 0;
  }

  const previousConceptId =
    targetMonth <= 1
      ? normalizeConceptId(originalConceptId)
      : effectiveConceptIdFromPeriods({
          periods,
          month: targetMonth - 1,
          originalConceptId,
        });

  if (!isConceptTransition(previousConceptId, activePeriod?.concepto_id)) {
    return 0;
  }

  return Math.max(0, rawDifference);
};
