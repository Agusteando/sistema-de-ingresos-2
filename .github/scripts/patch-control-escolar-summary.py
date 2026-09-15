from pathlib import Path

path = Path("pages/control-escolar.vue")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"{label}: se esperaba 1 coincidencia, se encontraron {count}"
        )
    text = text.replace(old, new, 1)


replace_once(
    'import StudentsKpiValue from "~/components/students/StudentsKpiValue.vue";\n'
    'import ControlEscolarSelectionDock from "~/components/students/ControlEscolarSelectionDock.vue";',
    'import StudentsKpiValue from "~/components/students/StudentsKpiValue.vue";\n'
    'import StudentsEnrollmentSummary from "~/components/students/StudentsEnrollmentSummary.vue";\n'
    'import ControlEscolarSelectionDock from "~/components/students/ControlEscolarSelectionDock.vue";',
    "import del resumen",
)

replace_once(
    'import { normalizeCicloKey, formatCicloLabel } from "~/shared/utils/ciclo";\n'
    'import { DEFAULT_TALLER_SERVICIO_IMAGE, normalizeServicioClave, parseServiciosCsv } from "~/shared/utils/talleresServicios";',
    'import { normalizeCicloKey, formatCicloLabel } from "~/shared/utils/ciclo";\n'
    'import { buildEnrollmentSummary } from "~/shared/utils/enrollmentSummary";\n'
    'import { DEFAULT_TALLER_SERVICIO_IMAGE, normalizeServicioClave, parseServiciosCsv } from "~/shared/utils/talleresServicios";',
    "import del builder",
)

replace_once(
    "            {\n"
    "              'has-detail': Boolean(selectedStudent),\n"
    "              'is-browsing': !selectedStudent,\n"
    "            },",
    "            {\n"
    "              'has-detail': Boolean(selectedStudent),\n"
    "              'has-empty-detail': showControlEnrollmentSummary,\n"
    "              'is-browsing': !selectedStudent && !showControlEnrollmentSummary,\n"
    "            },",
    "estado del workspace",
)

replace_once(
    "              'student-list-panel',\n"
    "              selectedStudent ? 'is-compact' : 'is-full',",
    "              'student-list-panel',\n"
    "              selectedStudent || showControlEnrollmentSummary ? 'is-compact' : 'is-full',",
    "modo del panel de alumnos",
)

replace_once(
    "                  'list-columns ce-list-columns',\n"
    "                  selectedStudent ? 'compact' : 'full',",
    "                  'list-columns ce-list-columns',\n"
    "                  selectedStudent || showControlEnrollmentSummary ? 'compact' : 'full',",
    "modo de columnas",
)

workspace_tail = '''          </section>
        </div>
      </div>
    </div>

    <div
      v-if="showMassImportModal"'''

summary_markup = '''          </section>

          <StudentsEnrollmentSummary
            v-if="showControlEnrollmentSummary"
            class="ce-enrollment-summary"
            :summary="controlEnrollmentSummary"
            :plantel-label="selectedAgentId"
            :ciclo-label="currentCicloLabel"
            :active-grade="filters.grado"
            :active-group="filters.group"
            :loading="studentsLoading"
            :unavailable="controlEnrollmentSummaryUnavailable"
            @select-grade="selectSummaryGrade"
            @select-group="selectSummaryGroup"
            @clear="clearAcademicFilters"
          />
        </div>
      </div>
    </div>

    <div
      v-if="showMassImportModal"'''

replace_once(workspace_tail, summary_markup, "panel de resumen")

summary_logic = '''const controlBulkSelectedCount = computed(() => controlBulkSelection.size);

const controlEnrollmentSummaryUnavailable = computed(
  () =>
    !studentsLoading.value &&
    (studentsSourceUnavailable.value || controlCompleteStage.value === "failed"),
);

const controlEnrollmentSummary = computed(() =>
  buildEnrollmentSummary(controlStudentsIndex.value, {
    include: (student) => student?.enrollmentState === "inscrito",
    type: (student) =>
      student?.tipoIngresoValue === "interno" ? "interno" : "externo",
    grade: (student) => student?.grado,
    group: (student) => student?.group || student?.grupo,
    matricula: (student) => student?.matricula,
  }),
);

const showControlEnrollmentSummary = computed(
  () => !selectedStudent.value && controlBulkSelectedCount.value === 0,
);

const selectSummaryGrade = (grado) => {
  selectGrade(grado);
};

const selectSummaryGroup = ({ grade, group } = {}) => {
  const sameSelection = filters.grado === grade && filters.group === group;
  filters.grado = sameSelection ? "" : String(grade || "");
  filters.group = sameSelection ? "" : String(group || "");
  pagination.page = 1;
};'''

replace_once(
    "const controlBulkSelectedCount = computed(() => controlBulkSelection.size);",
    summary_logic,
    "lógica del resumen",
)

summary_css = r'''

/* El resumen comparte la misma segunda columna útil que /alumnos antes de abrir un alumno. */
@media (min-width: 821px) {
  .control-escolar-screen .ce-workspace.has-empty-detail {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .control-escolar-screen .ce-workspace.has-empty-detail > .student-list-panel {
    display: contents;
  }

  .control-escolar-screen .ce-workspace.has-empty-detail > .student-list-panel > .ce-filter-bar {
    grid-column: 1 / -1;
    grid-row: 1;
  }

  .control-escolar-screen .ce-workspace.has-empty-detail > .student-list-panel > .ce-list-card {
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
    min-height: 0;
  }

  .control-escolar-screen .ce-workspace.has-empty-detail > :deep(.ce-enrollment-summary) {
    grid-column: 2;
    grid-row: 2;
    min-width: 0;
    min-height: 0;
  }
}

@media (max-width: 820px) {
  .control-escolar-screen .ce-workspace.has-empty-detail {
    grid-template-rows: minmax(360px, 48vh) minmax(420px, 58vh) !important;
    gap: 10px !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior-y: contain;
    scrollbar-width: thin;
  }

  .control-escolar-screen .ce-workspace.has-empty-detail > .student-list-panel,
  .control-escolar-screen .ce-workspace.has-empty-detail > :deep(.ce-enrollment-summary) {
    width: 100%;
    min-width: 0 !important;
    height: 100%;
    min-height: 0;
  }
}
'''

style_marker = "\n</style>\n"
if text.count(style_marker) != 1:
    raise SystemExit(
        f"cierre style: se esperaba 1 coincidencia, se encontraron {text.count(style_marker)}"
    )
text = text.replace(style_marker, summary_css + style_marker, 1)

checks = {
    "componente": "StudentsEnrollmentSummary",
    "builder": "buildEnrollmentSummary(controlStudentsIndex.value",
    "selección masiva": "controlBulkSelectedCount.value === 0",
    "estado vacío": "'has-empty-detail': showControlEnrollmentSummary",
    "browsing excluye resumen": "'is-browsing': !selectedStudent && !showControlEnrollmentSummary",
    "evento de grupo": '@select-group="selectSummaryGroup"',
    "resumen dentro del workspace": '<StudentsEnrollmentSummary\n            v-if="showControlEnrollmentSummary"',
}
for label, needle in checks.items():
    if needle not in text:
        raise SystemExit(f"validación faltante: {label}")

if text.count('class="ce-enrollment-summary"') != 1:
    raise SystemExit("el resumen debe renderizarse exactamente una vez")
if text.count("import StudentsEnrollmentSummary from") != 1:
    raise SystemExit("el componente debe importarse exactamente una vez")
if text.count("import { buildEnrollmentSummary }") != 1:
    raise SystemExit("el builder debe importarse exactamente una vez")
if 'v-else-if="showControlEnrollmentSummary"' in text:
    raise SystemExit("el resumen no debe depender de adyacencia v-else-if")

path.write_text(text, encoding="utf-8")
