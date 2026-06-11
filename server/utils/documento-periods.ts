import { query } from "./db";

export type DocumentoPeriodoSchema = {
  columns: Set<string>;
  hasPaymentPolicy: boolean;
  hasDiferenciaMonto: boolean;
  hasDiferencialDocumento: boolean;
  missingLifecycleColumns: string[];
};

const REQUIRED_LIFECYCLE_COLUMNS = [
  "payment_policy",
  "diferencia_monto",
  "diferencial_documento",
];

export const getDocumentoPeriodoSchema =
  async (): Promise<DocumentoPeriodoSchema> => {
    const rows = await query<any[]>(
      `SHOW COLUMNS FROM documento_concepto_periodos`,
    );
    const columns = new Set(
      rows.map((row) => String(row.Field || row.field || "").trim()),
    );

    return {
      columns,
      hasPaymentPolicy: columns.has("payment_policy"),
      hasDiferenciaMonto: columns.has("diferencia_monto"),
      hasDiferencialDocumento: columns.has("diferencial_documento"),
      missingLifecycleColumns: REQUIRED_LIFECYCLE_COLUMNS.filter(
        (column) => !columns.has(column),
      ),
    };
  };

export const periodoLifecycleSelect = (schema: DocumentoPeriodoSchema) =>
  [
    schema.hasPaymentPolicy
      ? "payment_policy"
      : `'mantener_pagos_existentes' AS payment_policy`,
    schema.hasDiferenciaMonto ? "diferencia_monto" : `0 AS diferencia_monto`,
    schema.hasDiferencialDocumento
      ? "diferencial_documento"
      : `NULL AS diferencial_documento`,
  ].join(", ");

export const assertDocumentoPeriodoLifecycleSchema = async () => {
  const schema = await getDocumentoPeriodoSchema();

  if (schema.missingLifecycleColumns.length) {
    const error: any = new Error(
      `Faltan columnas de ciclo de conceptos: ${schema.missingLifecycleColumns.join(", ")}.`,
    );
    error.statusCode = 409;
    error.statusMessage = "Actualización de base requerida";
    throw error;
  }

  return schema;
};
