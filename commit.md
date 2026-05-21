feat(becas): add scholarship metadata and PDF letter generation to cargo extra

- Add closed tipo de beca selection in Cargo extra with multiple selections stored comma-separated.
- Add optional beca motivo field and server-side validation for allowed beca types.
- Persist becaTipos, becaMotivo, becaMonto, becaPorcentaje, becaCartaGenerada, and becaCartaFecha in documentos.
- Keep montoFinal as the authoritative final charge amount and calculate discount metadata server-side.
- Add official-looking carta de beca PDF generation for beca documents.
- Expose beca metadata in student debt rows for later reading.
- Document the Cargo extra beca data model and PDF generation flow.
