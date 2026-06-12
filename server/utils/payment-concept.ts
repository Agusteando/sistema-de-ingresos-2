export type PaymentConceptDocumentSource = {
  concepto?: unknown;
  conceptoNombre?: unknown;
};

export type PaymentConceptPeriodSource = {
  accion?: unknown;
  concepto_id?: unknown;
  conceptoNombre?: unknown;
} | null | undefined;

const toPositiveConceptId = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? String(Math.trunc(numeric)) : "";
};

const toConceptName = (value: unknown) => String(value || "").trim();

const throwContractError = (message: string): never => {
  throw createError({ statusCode: 409, message });
};

export const resolvePaymentConceptSnapshot = (
  doc: PaymentConceptDocumentSource,
  period?: PaymentConceptPeriodSource,
) => {
  const action = String(period?.accion || "").trim().toLowerCase();

  if (action === "cancelacion") {
    throwContractError("El pago contiene un concepto cancelado.");
  }

  if (action === "cambio") {
    const conceptId = toPositiveConceptId(period?.concepto_id);
    const conceptName = toConceptName(period?.conceptoNombre);

    if (!conceptId || !conceptName) {
      throwContractError(
        "El periodo de cambio no tiene concepto financiero completo.",
      );
    }

    return {
      concepto: conceptId,
      conceptoNombre: conceptName,
    };
  }

  const conceptId = toPositiveConceptId(doc?.concepto);
  const conceptName = toConceptName(doc?.conceptoNombre);

  if (!conceptId || !conceptName) {
    throwContractError("El documento no tiene concepto financiero completo.");
  }

  return {
    concepto: conceptId,
    conceptoNombre: conceptName,
  };
};
