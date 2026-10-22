/** Coverage of entered workplace fields among the enrolled students in a report scope. */
export const summarizeParentWorkplaces = (
  students: Array<{ lugarTrabajoPadre?: unknown; lugarTrabajoMadre?: unknown }>,
  columns: { padre?: boolean; madre?: boolean } = {},
) => {
  let father = 0, mother = 0, both = 0;
  for (const student of students) {
    const hasFather = String(student.lugarTrabajoPadre ?? "").trim().length > 0;
    const hasMother = String(student.lugarTrabajoMadre ?? "").trim().length > 0;
    if (hasFather) father++;
    if (hasMother) mother++;
    if (hasFather && hasMother) both++;
  }
  const total = students.length;
  const metric = (registered: number, available: boolean) => ({
    available, total, registered, pending: total - registered,
    percent: total ? Math.round(registered * 100 / total) : 0,
  });
  return {
    total,
    padre: metric(father, columns.padre === true),
    madre: metric(mother, columns.madre === true),
    ambos: metric(both, columns.padre === true && columns.madre === true),
  };
};
