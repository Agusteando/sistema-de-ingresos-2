Refine ciclo de ingreso modal scaling and alta overflow

- Reworked the ciclo de ingreso correction modal header so decorative waves stay behind the visual shell instead of crossing the student name and metadata.
- Tuned modal dimensions, padding, panel heights, and responsive breakpoints so the correction modal fits cleanly at constrained viewport sizes such as 1900 x 1200 at 150% scale.
- Preserved the functional 12-cycle picker, selected/current/registered cues, result animation, timeline explanation, and save flow based on base.ciclo.
- Reworked the alta/edit student modal container so the form body scrolls inside the modal while the header and footer remain accessible.
- Tuned the alta modal sizing, compact-height behavior, and responsive layout to avoid inaccessible overflow on scaled screens.
- Kept the alta default behavior: new students use the currently selected ciclo as ciclo de ingreso and resolve visibly as Externo for that ciclo unless the user explicitly changes the ingreso cycle.
- Kept automatic proper-name casing for student and tutor names before saving.
- Removed the legacy folder from the delivered package.
- Removed remaining active base.interno compatibility declarations/checks; tipo de ingreso is resolved from base.ciclo and selected ciclo.
