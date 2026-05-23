<template>
  <div class="students-screen control-escolar-screen">
    <header class="students-hero ce-hero">
      <div class="ce-hero-spacer" aria-hidden="true"></div>
      <div class="hero-actions ce-hero-actions">
        <div class="ce-selected-plantel" :class="{ empty: !selectedAgentId }">
          <span>Plantel activo</span>
          <strong>{{ selectedAgentId || "Selecciona" }}</strong>
        </div>
        <UiButton
          variant="secondary"
          :disabled="loadingAny || !selectedAgentId"
          @click="refreshAll"
        >
          <LucideRefreshCw :size="18" :class="{ spinning: loadingAny }" />
          Actualizar
        </UiButton>
        <UiButton
          variant="secondary"
          :disabled="!selectedAgentId || !students.length"
          @click="exportMatriculaDb"
        >
          <LucideFileSpreadsheet :size="18" /> Exportar DB
        </UiButton>
        <UiButton
          variant="secondary"
          :disabled="!selectedAgentId || massImporting"
          @click="openMassImportModal"
        >
          <LucideUpload :size="18" /> Importar DB
        </UiButton>
      </div>
    </header>

    <Transition name="ce-sync-visual-fade">
      <section
        v-if="showControlSyncVisual"
        :class="['ce-sync-visual', controlSyncStatusClass]"
        aria-live="polite"
        :aria-label="controlSyncAriaLabel"
      >
        <span
          class="ce-sync-node"
          :class="controlBaseStepClass"
          :title="controlBaseStepTitle"
          aria-hidden="true"
        >A</span>
        <span class="ce-sync-rail" aria-hidden="true"></span>
        <span
          class="ce-sync-node"
          :class="controlEnrichmentStepClass"
          :title="controlEnrichmentStepTitle"
          aria-hidden="true"
        >B</span>
        <span
          class="ce-sync-cache-dot"
          :title="controlDataFreshnessLabel"
          aria-hidden="true"
        ></span>
      </section>
    </Transition>

    <section
      :class="[
        'kpi-summary-system ce-kpi-system',
        { 'is-refreshing': kpisLoading },
      ]"
      aria-label="Indicadores de Control Escolar"
    >
      <div class="kpi-strip ce-kpi-strip">
        <button
          v-for="item in kpiCards"
          :key="item.key"
          type="button"
          :class="[
            'kpi-card',
            item.tone,
            { active: activeQuickFilter === item.key },
          ]"
          @click="applyKpiFilter(item.key)"
        >
          <span class="kpi-icon"><component :is="item.icon" :size="24" /></span>
          <span class="kpi-text">
            <span>{{ item.label }}</span>
            <strong>{{ formatNumber(item.value) }}</strong>
          </span>
          <span class="ce-kpi-mass" :aria-label="item.volumeAria">
            <i
              v-for="unit in item.massUnits"
              :key="`${item.key}-mass-${unit.index}`"
              :class="{ active: unit.active }"
            ></i>
          </span>
        </button>
      </div>
    </section>

    <div class="filter-bar ce-filter-bar">
      <div class="ce-primary-filter-row">
        <div
          class="search-control"
          :class="{ 'has-filter-token': activeFilterLabel }"
        >
          <span class="search-filter-icon" aria-hidden="true"
            ><LucideFilter :size="15"
          /></span>
          <button
            v-if="activeFilterLabel"
            type="button"
            class="search-filter-token"
            @click="clearFilters"
          >
            <span>{{ activeFilterLabel }}</span
            ><b aria-hidden="true">×</b>
          </button>
          <LucideSearch class="search-icon" :size="18" />
          <input
            v-model="filters.search"
            placeholder="Matrícula, nombre, CURP, teléfono o correo..."
          />
        </div>

        <button
          type="button"
          :class="[
            'ce-filter-button',
            { active: showAdvancedFilters || advancedFilterCount },
          ]"
          @click="showAdvancedFilters = !showAdvancedFilters"
        >
          <LucideFilter :size="16" /> Filtros
          <b v-if="advancedFilterCount">{{ advancedFilterCount }}</b>
        </button>

        <div
          class="ce-chip-cluster ce-chip-cluster--quality"
          aria-label="Calidad del expediente"
        >
          <UiChip
            v-for="filter in qualityFilters"
            :key="`quality-${filter.key}`"
            :active="filters.quality === filter.key"
            @click="toggleQualityFilter(filter.key)"
          >
            <span>{{ filter.label }}</span
            ><b class="ce-chip-count">{{ formatNumber(filter.count) }}</b>
          </UiChip>
        </div>

        <button
          type="button"
          class="ce-clear-link"
          :disabled="!hasActiveFilters"
          @click="clearFilters"
        >
          <LucideRotateCcw :size="15" /> Limpiar filtros
        </button>
      </div>

      <div class="ce-secondary-filter-row">
        <div class="ce-status-tabs" aria-label="Filtros principales">
          <button
            v-for="filter in primaryFilters"
            :key="filter.key"
            type="button"
            :class="[
              'ce-status-tab',
              { active: filters.status === filter.key && !filters.quality },
            ]"
            @click="applyPrimaryFilter(filter.key)"
          >
            {{ filter.label }}
          </button>
        </div>

        <div
          v-if="catalogs.grados.length"
          class="ce-chip-cluster ce-chip-cluster--grade"
          aria-label="Filtrar por grado"
        >
          <span class="ce-chip-label">Grado</span>
          <UiChip
            :active="!filters.grado && !filters.group"
            @click="clearAcademicFilters"
            >Todos</UiChip
          >
          <UiChip
            v-for="grado in catalogs.grados"
            :key="`grado-${grado}`"
            :active="filters.grado === grado"
            @click="selectGrade(grado)"
            >{{ grado }}</UiChip
          >
        </div>

        <div
          v-if="filters.grado && availableGroups.length"
          class="ce-chip-cluster ce-chip-cluster--group"
          aria-label="Filtrar por grupo"
        >
          <span class="ce-chip-label">Grupo</span>
          <UiChip
            :active-group="filters.group === ''"
            @click="filters.group = ''"
            >Todos</UiChip
          >
          <UiChip
            v-for="grupo in availableGroups"
            :key="`grupo-${grupo}`"
            :active-group="filters.group === grupo"
            @click="toggleFilter('group', grupo)"
            >{{ grupo }}</UiChip
          >
        </div>
      </div>
    </div>

    <div
      ref="studentsScaleShell"
      class="students-scale-shell"
      :style="studentsScaleShellStyle"
    >
      <div class="students-design-canvas" :style="studentsDesignCanvasStyle">
        <div
          :class="[
            'students-workspace ce-workspace',
            {
              'has-detail': Boolean(selectedStudent),
              'has-empty-detail': !selectedStudent,
            },
          ]"
        >
          <section
            :class="[
              'student-list-panel',
              selectedStudent ? 'is-compact' : 'is-full',
            ]"
          >
            <div class="student-list-card ce-list-card">
              <div class="list-titlebar ce-list-titlebar">
                <div class="list-heading-copy">
                  <h2>
                    Alumnos <span>{{ pagination.total }}</span>
                  </h2>
                  <p>
                    {{
                      selectedAgentId
                        ? `Plantel ${selectedAgentId}`
                        : "Sin plantel activo"
                    }}
                  </p>
                </div>
                <div class="ce-pagination-mini">
                  <button
                    type="button"
                    :disabled="pagination.page <= 1 || studentsLoading"
                    @click="goToPage(pagination.page - 1)"
                  >
                    <LucideChevronLeft :size="16" />
                  </button>
                  <span>{{ pagination.page }} / {{ pagination.pages }}</span>
                  <button
                    type="button"
                    :disabled="
                      pagination.page >= pagination.pages || studentsLoading
                    "
                    @click="goToPage(pagination.page + 1)"
                  >
                    <LucideChevronRight :size="16" />
                  </button>
                </div>
              </div>

              <div
                :class="[
                  'list-columns ce-list-columns',
                  selectedStudent ? 'compact' : 'full',
                ]"
              >
                <span>Alumno</span>
                <span>Perfil escolar</span>
                <span>Calidad de datos</span>
                <span></span>
              </div>

              <div
                :class="[
                  'student-list-scroll ce-list-scroll',
                  { 'is-source-unavailable': studentsSourceUnavailable },
                ]"
              >
                <div v-if="!selectedAgentId" class="empty-state ce-state-card">
                  <LucideBuilding2 :size="24" /> Selecciona un plantel
                  específico en la barra lateral para iniciar Control Escolar.
                </div>
                <div
                  v-else-if="studentsLoading"
                  class="ce-skeleton-stack"
                  aria-live="polite"
                >
                  <span v-for="i in 6" :key="i" class="ce-skeleton-row"></span>
                </div>
                <section
                  v-else-if="studentsSourceUnavailable"
                  class="ce-source-unavailable"
                  aria-live="polite"
                >
                  <figure class="ce-source-visual" aria-hidden="true">
                    <img src="/brand/plantel-offline-visual.png" alt="" />
                  </figure>
                  <span class="ce-source-eyebrow">Conexión local en pausa</span>
                  <h3>{{ sourceUnavailableTitle }}</h3>
                  <p>{{ sourceUnavailableMessage }}</p>
                  <div class="ce-source-hints">
                    <span
                      ><LucideComputer :size="15" /> Equipo del plantel</span
                    >
                    <span
                      ><LucideClock3 :size="15" />
                      {{ sourceUnavailableHint }}</span
                    >
                  </div>
                  <button
                    type="button"
                    class="ce-source-retry"
                    @click="
                      refreshAll({
                        forceNetwork: true,
                        clearExisting: true,
                        forceLoading: true,
                      })
                    "
                  >
                    <LucideRefreshCw :size="16" />
                    Intentar de nuevo
                  </button>
                </section>
                <div
                  v-else-if="!students.length"
                  class="empty-state ce-state-card"
                >
                  <LucideSearchX :size="24" /> No hay alumnos con los filtros
                  actuales.
                  <button
                    v-if="hasActiveFilters"
                    type="button"
                    class="ce-inline-action"
                    @click="clearFilters"
                  >
                    Limpiar filtros
                  </button>
                </div>

                <template v-else>
                  <button
                    v-for="student in students"
                    :key="student.matricula"
                    type="button"
                    :class="[
                      'student-row ce-student-row',
                      {
                        selected:
                          selectedStudent?.matricula === student.matricula,
                        'missing-overlay': !student.overlayExists,
                      },
                    ]"
                    :style="studentPresentationStyle(student)"
                    @click="selectStudent(student)"
                  >
                    <UiGroupIcon
                      class="student-group-watermark"
                      :class="{
                        'is-missing-group': controlMissingGroup(student),
                      }"
                      :label="controlGroupLabel(student)"
                      :missing="controlMissingGroup(student)"
                    />
                    <span
                      class="student-identity ce-student-identity has-group-icon"
                    >
                      <span
                        :class="[
                          'ce-row-check',
                          {
                            active:
                              selectedStudent?.matricula === student.matricula,
                          },
                        ]"
                        aria-hidden="true"
                        >{{
                          selectedStudent?.matricula === student.matricula
                            ? "✓"
                            : ""
                        }}</span
                      >
                      <StudentGradePhotoCard
                        class="student-row-grade-card"
                        :student="student"
                        :photo-url="controlStudentPhotoUrl(student)"
                        :photo-loading="isControlStudentPhotoLoading(student)"
                        :is-enrolled="student.status === 'Activo'"
                      />
                      <span
                        :class="[
                          'student-group-sigil',
                          { 'is-missing': controlMissingGroup(student) },
                        ]"
                        :title="controlGroupTitle(student)"
                      >
                        <UiGroupIcon
                          :label="controlGroupLabel(student)"
                          :missing="controlMissingGroup(student)"
                        />
                      </span>
                      <span class="student-copy">
                        <strong :title="student.fullName">{{
                          student.fullName || "Alumno sin nombre"
                        }}</strong>
                        <span class="student-type-line">
                          <span
                            :class="[
                              'student-tipo-chip',
                              student.overlayExists ? 'interno' : 'externo',
                            ]"
                          >
                            {{ student.matricula }}
                          </span>
                        </span>
                        <span
                          class="ce-academic-pills"
                          :aria-label="compactAcademic(student)"
                        >
                          <span>{{ student.grado || "Sin grado" }}</span>
                          <span
                            :class="{ warning: controlMissingGroup(student) }"
                            >{{
                              controlMissingGroup(student)
                                ? "Sin grupo"
                                : `Grupo ${controlGroupLabel(student)}`
                            }}</span
                          >
                          <span>{{ student.nivel || "Sin nivel" }}</span>
                        </span>
                      </span>
                    </span>

                    <span
                      :class="['ce-quality-score', qualityScoreTone(student)]"
                      :style="{
                        '--quality-score': `${completionFor(student)}%`,
                      }"
                      :aria-label="`Expediente ${completionFor(student)}% completo`"
                    >
                      <b>{{ completionFor(student) }}%</b>
                    </span>

                    <span class="ce-quality-cell">
                      <strong>{{ qualitySummary(student) }}</strong>
                      <span class="ce-quality-fields">
                        <small
                          v-for="field in requiredDataFields"
                          :key="`${student.matricula}-${field.key}`"
                          :class="{
                            missing: studentMissingField(student, field),
                          }"
                        >
                          <component :is="field.icon" :size="12" />
                          {{ field.label }}
                        </small>
                      </span>
                    </span>

                    <span class="row-actions">
                      <span class="ce-row-action"
                        ><LucideChevronRight :size="18"
                      /></span>
                    </span>
                  </button>
                </template>
              </div>

              <footer
                v-if="
                  selectedAgentId &&
                  students.length &&
                  !studentsSourceUnavailable
                "
                class="ce-list-footer"
              >
                <span
                  >Mostrando {{ paginationRangeLabel }} de
                  {{ formatNumber(pagination.total) }} alumnos</span
                >
                <div class="ce-list-pages" aria-label="Paginación de alumnos">
                  <button
                    v-for="(pageItem, pageIndex) in visiblePaginationPages"
                    :key="`ce-page-${pageIndex}-${pageItem}`"
                    type="button"
                    :disabled="pageItem === 'ellipsis' || studentsLoading"
                    :class="{
                      active: pageItem === pagination.page,
                      ellipsis: pageItem === 'ellipsis',
                    }"
                    @click="pageItem !== 'ellipsis' && goToPage(pageItem)"
                  >
                    {{ pageItem === "ellipsis" ? "..." : pageItem }}
                  </button>
                  <button
                    type="button"
                    :disabled="
                      pagination.page >= pagination.pages || studentsLoading
                    "
                    @click="goToPage(pagination.page + 1)"
                  >
                    <LucideChevronRight :size="14" />
                  </button>
                </div>
              </footer>
            </div>
          </section>

          <section
            v-if="selectedStudent"
            class="student-detail-panel ce-detail-panel"
          >
            <div class="ce-detail-shell">
              <header class="ce-detail-header">
                <div class="ce-detail-title">
                  <small>{{ selectedStudent.matricula }} · Matrícula</small>
                  <div class="ce-title-row">
                    <h2>{{ selectedStudent.fullName || "Ficha de alumno" }}</h2>
                    <span
                      :class="[
                        'ce-status-pill large',
                        statusTone(selectedStudent),
                      ]"
                      >{{ selectedStudent.status || "Activo" }}</span
                    >
                  </div>
                </div>
                <div
                  class="ce-access-header-card"
                  :class="{ unavailable: !selectedStudent.huskyPassAvailable }"
                >
                  <span class="ce-access-icon" aria-hidden="true">
                    <img src="/brand/husky-pass-header-gray.png" alt="" />
                  </span>
                  <div>
                    <strong>Husky Pass</strong>
                    <small v-if="selectedStudent.huskyPassAvailable"
                      >Acceso activo · {{ selectedStudent.huskyPassUsername }} ·
                      {{ selectedStudent.huskyPassPlaintext }}</small
                    >
                    <small v-else
                      >Acceso pendiente ·
                      {{ huskyPassEmailTarget || "Sin correo de padre/tutor" }}</small
                    >
                  </div>
                </div>
                <div class="ce-progress-cluster">
                  <strong
                    >Perfil {{ selectedProfileCompletion }}% completo</strong
                  >
                  <span class="ce-progress-track"
                    ><i :style="{ width: `${selectedProfileCompletion}%` }"></i
                  ></span>
                  <small>{{
                    selectedMissingCount
                      ? `Faltan ${selectedMissingCount} datos principales`
                      : "Datos principales completos"
                  }}</small>
                </div>
                <div class="ce-detail-actions">
                  <span :class="['ce-save-state', saveStateTone]">{{
                    saveStatusText
                  }}</span>
                  <UiButton
                    variant="secondary"
                    type="button"
                    :disabled="savingStudent || !hasUnsavedChanges"
                    @click="discardChanges"
                    >Restaurar</UiButton
                  >
                  <UiButton
                    variant="primary"
                    type="button"
                    :disabled="savingStudent || !hasUnsavedChanges"
                    @click="saveStudent"
                  >
                    <LucideSave :size="17" />
                    {{ savingStudent ? "Guardando..." : "Guardar" }}
                  </UiButton>
                </div>
                <button
                  type="button"
                  class="detail-shell-close ce-detail-menu-button"
                  aria-label="Cerrar detalle"
                  @click="selectedStudent = null"
                >
                  <LucideMoreVertical :size="20" />
                </button>
              </header>

              <div class="ce-detail-body">
                <section class="ce-profile-card">
                  <StudentGradePhotoCard
                    class="ce-detail-photo"
                    :student="selectedStudent"
                    :photo-url="controlStudentPhotoUrl(selectedStudent)"
                    :photo-loading="
                      isControlStudentPhotoLoading(selectedStudent)
                    "
                    :is-enrolled="selectedStudent.status === 'Activo'"
                  />
                  <div class="ce-profile-copy">
                    <strong>{{ selectedStudent.fullName }}</strong>
                    <div class="ce-profile-pills">
                      <span>{{ selectedStudent.grado || "Sin grado" }}</span>
                      <span
                        :class="{
                          warning: controlMissingGroup(selectedStudent),
                        }"
                        >{{
                          controlMissingGroup(selectedStudent)
                            ? "Sin grupo"
                            : `Grupo ${controlGroupLabel(selectedStudent)}`
                        }}</span
                      >
                      <span>{{ selectedStudent.nivel || "Sin nivel" }}</span>
                    </div>
                    <p>
                      Plantel {{ selectedStudent.plantel || selectedAgentId }}
                    </p>
                  </div>
                  <div class="ce-tutor-card">
                    <small>Tutor / Responsable</small>
                    <strong>{{
                      selectedStudent.guardianName || "Sin tutor capturado"
                    }}</strong>
                    <span>{{
                      selectedStudent.phone ||
                      selectedStudent.telefonoPadre ||
                      selectedStudent.telefonoMadre ||
                      "Sin teléfono"
                    }}</span>
                  </div>
                  <UiGroupIcon
                    class="ce-profile-watermark"
                    :class="{
                      'is-missing-group': controlMissingGroup(selectedStudent),
                    }"
                    :label="controlGroupLabel(selectedStudent)"
                    :missing="controlMissingGroup(selectedStudent)"
                  />
                </section>

                <section class="ce-data-section">
                  <div class="ce-section-heading">
                    <span><LucideShieldCheck :size="18" /></span>
                    <div>
                      <h3>Calidad del expediente</h3>
                      <p>
                        {{
                          selectedStudent.missingFields.length
                            ? "Completa estos datos para dejar el expediente listo para matrícula."
                            : "Expediente listo para matrícula."
                        }}
                      </p>
                    </div>
                  </div>
                  <div class="ce-missing-grid">
                    <span
                      v-for="field in requiredDataFields"
                      :key="field.key"
                      :class="[
                        'ce-missing-chip',
                        {
                          ok:
                            !selectedStudent.missingFields.includes(
                              field.key,
                            ) &&
                            !selectedStudent.missingFields.includes(
                              field.label.toLowerCase(),
                            ),
                        },
                      ]"
                    >
                      <component :is="field.icon" :size="14" />
                      {{ field.label }}
                      <b>{{
                        selectedStudent.missingFields.includes(field.key) ||
                        selectedStudent.missingFields.includes(
                          field.label.toLowerCase(),
                        )
                          ? "Falta"
                          : "Listo"
                      }}</b>
                    </span>
                  </div>
                </section>

                <nav class="ce-detail-tabs" aria-label="Secciones de ficha">
                  <button
                    v-for="tab in detailTabs"
                    :key="tab.key"
                    type="button"
                    :class="{ active: activeDetailTab === tab.key }"
                    @click="activeDetailTab = tab.key"
                  >
                    <component :is="tab.icon" :size="15" /> {{ tab.label }}
                  </button>
                </nav>

                <form class="ce-edit-form" @submit.prevent="saveStudent">
                  <section
                    v-show="activeDetailTab === 'identity'"
                    class="ce-form-card ce-tab-panel"
                  >
                    <div class="ce-section-heading compact">
                      <span><LucideUserRound :size="18" /></span>
                      <h3>Identidad</h3>
                    </div>
                    <div class="ce-form-grid two">
                      <label
                        ><span>A. paterno</span
                        ><input
                          v-model="editForm.apellidoPaterno"
                          autocomplete="off"
                      /></label>
                      <label
                        ><span>A. materno</span
                        ><input
                          v-model="editForm.apellidoMaterno"
                          autocomplete="off"
                      /></label>
                      <label
                        ><span>Nombre(s)</span
                        ><input v-model="editForm.nombres" autocomplete="off"
                      /></label>
                      <label
                        ><span>CURP</span
                        ><input
                          v-model="editForm.curp"
                          maxlength="18"
                          autocomplete="off"
                      /></label>
                    </div>
                  </section>

                  <section
                    v-show="activeDetailTab === 'school'"
                    class="ce-form-card ce-tab-panel"
                  >
                    <div class="ce-section-heading compact">
                      <span><LucideGraduationCap :size="18" /></span>
                      <h3>Escolar</h3>
                    </div>
                    <div class="ce-form-grid three">
                      <label>
                        <span>Nivel</span>
                        <select v-model="editForm.nivel">
                          <option value="">Selecciona nivel</option>
                          <option
                            v-for="nivel in nivelOptions"
                            :key="`nivel-${nivel}`"
                            :value="nivel"
                          >
                            {{ labelize(nivel) }}
                          </option>
                        </select>
                      </label>
                      <label>
                        <span>Grado</span>
                        <select v-model="editForm.grado">
                          <option value="">Selecciona grado</option>
                          <option
                            v-for="grado in gradoOptions"
                            :key="`grado-${grado}`"
                            :value="grado"
                          >
                            {{ labelize(grado) }}
                          </option>
                        </select>
                      </label>
                      <label>
                        <span>Grupo</span>
                        <select v-model="editForm.grupo">
                          <option value="">Sin grupo</option>
                          <option
                            v-for="grupo in groupOptions"
                            :key="`grupo-${grupo}`"
                            :value="grupo"
                          >
                            {{ grupo }}
                          </option>
                        </select>
                      </label>
                      <label
                        ><span>Baja</span
                        ><select v-model="editForm.baja">
                          <option :value="0">No</option>
                          <option :value="1">Sí</option>
                        </select></label
                      >
                      <label
                        ><span>Motivo baja</span
                        ><input
                          v-model="editForm.motivoBaja"
                          autocomplete="off"
                      /></label>
                      <label
                        ><span>Categoría baja</span
                        ><input
                          v-model="editForm.categoriaBaja"
                          autocomplete="off"
                      /></label>
                    </div>
                  </section>

                  <section
                    v-show="activeDetailTab === 'family'"
                    class="ce-form-card ce-contact-card ce-tab-panel"
                  >
                    <div class="ce-section-heading compact">
                      <span><LucideUsersRound :size="18" /></span>
                      <h3>Contacto familiar</h3>
                    </div>
                    <div class="ce-form-grid three">
                      <label
                        ><span>Nombre padre</span
                        ><input
                          v-model="editForm.nombrePadre"
                          autocomplete="off"
                      /></label>
                      <label
                        ><span>A. paterno padre</span
                        ><input
                          v-model="editForm.apellidoPaternoPadre"
                          autocomplete="off"
                      /></label>
                      <label
                        ><span>A. materno padre</span
                        ><input
                          v-model="editForm.apellidoMaternoPadre"
                          autocomplete="off"
                      /></label>
                      <label
                        ><span>Nombre madre</span
                        ><input
                          v-model="editForm.nombreMadre"
                          autocomplete="off"
                      /></label>
                      <label
                        ><span>A. paterno madre</span
                        ><input
                          v-model="editForm.apellidoPaternoMadre"
                          autocomplete="off"
                      /></label>
                      <label
                        ><span>A. materno madre</span
                        ><input
                          v-model="editForm.apellidoMaternoMadre"
                          autocomplete="off"
                      /></label>
                      <label
                        ><span>Teléfono padre</span
                        ><input
                          v-model="editForm.telefonoPadre"
                          autocomplete="off"
                      /></label>
                      <label
                        ><span>Teléfono madre</span
                        ><input
                          v-model="editForm.telefonoMadre"
                          autocomplete="off"
                      /></label>
                      <label
                        ><span>Email padre</span
                        ><input
                          v-model="editForm.emailPadre"
                          type="email"
                          autocomplete="off"
                      /></label>
                      <label
                        ><span>Email madre</span
                        ><input
                          v-model="editForm.emailMadre"
                          type="email"
                          autocomplete="off"
                      /></label>
                    </div>
                    <label class="ce-wide-field"
                      ><span>Dirección</span
                      ><textarea
                        v-model="editForm.direccion"
                        rows="2"
                      ></textarea>
                    </label>
                  </section>

                  <section
                    v-show="activeDetailTab === 'system'"
                    class="ce-form-card ce-system-panel ce-tab-panel"
                  >
                    <div class="ce-section-heading compact">
                      <span><LucideKeyRound :size="18" /></span>
                      <h3>Sistema</h3>
                    </div>
                    <div class="ce-system-grid">
                      <article>
                        <span>Registro de matrícula</span>
                        <strong>{{
                          selectedStudent.overlayExists ? "Creado" : "Pendiente"
                        }}</strong>
                      </article>
                      <article>
                        <span>Tipo de ingreso</span>
                        <strong>{{
                          selectedStudent.tipoIngreso || "Sin clasificar"
                        }}</strong>
                      </article>
                      <article>
                        <span>Ciclo base</span>
                        <strong>{{
                          selectedStudent.cicloBase || currentCicloKey
                        }}</strong>
                      </article>
                      <article>
                        <span>Plantel origen</span>
                        <strong>{{
                          selectedStudent.plantelBaseOriginal ||
                          selectedStudent.basePlantel ||
                          selectedAgentId
                        }}</strong>
                      </article>
                    </div>
                    <section class="ce-husky-card compact">
                      <div class="ce-section-heading ce-husky-heading">
                        <img
                          src="/brand/ID-HUSKY-PASS-GREY.png"
                          alt="Husky Pass"
                        />
                        <div>
                          <h3>Husky Pass accesos</h3>
                          <p>
                            Accesos del portal del alumno listos para compartir
                            con el padre o tutor.
                          </p>
                        </div>
                      </div>
                      <div
                        v-if="selectedStudent.huskyPassAvailable"
                        class="ce-husky-credentials"
                      >
                        <span
                          ><small>Usuario</small
                          ><strong>{{
                            selectedStudent.huskyPassUsername
                          }}</strong></span
                        >
                        <span
                          ><small>Contraseña</small
                          ><strong>{{
                            selectedStudent.huskyPassPlaintext
                          }}</strong></span
                        >
                      </div>
                      <div v-else class="ce-husky-empty">
                        Sin Husky Pass registrado para esta matrícula.
                      </div>
                      <div class="ce-husky-actions">
                        <small>{{
                          huskyPassEmailTarget || "Sin correo de padre/tutor"
                        }}</small>
                        <UiButton
                          variant="secondary"
                          type="button"
                          :disabled="
                            sendingHuskyPass ||
                            !selectedStudent.huskyPassAvailable ||
                            !huskyPassEmailTarget
                          "
                          @click="sendHuskyPassEmail"
                        >
                          <LucideSend :size="16" />
                          {{
                            sendingHuskyPass ? "Enviando..." : "Enviar acceso"
                          }}
                        </UiButton>
                      </div>
                    </section>
                  </section>

                  <section
                    v-show="activeDetailTab === 'notes'"
                    class="ce-form-card ce-tab-panel"
                  >
                    <div class="ce-section-heading compact">
                      <span><LucideAlertTriangle :size="18" /></span>
                      <h3>Observaciones</h3>
                    </div>
                    <label class="ce-wide-field standalone"
                      ><span>Seguimiento de baja o nota interna</span
                      ><textarea
                        v-model="editForm.seguimientoBaja"
                        rows="6"
                      ></textarea>
                    </label>
                  </section>

                  <div v-if="saveError" class="ce-save-error">
                    <LucideAlertTriangle :size="16" /> {{ saveError }}
                  </div>
                </form>
              </div>

              <footer class="ce-detail-footer">
                <span :class="['ce-save-state', saveStateTone]">{{
                  saveStatusText
                }}</span>
                <div>
                  <UiButton
                    variant="secondary"
                    type="button"
                    :disabled="savingStudent || !hasUnsavedChanges"
                    @click="discardChanges"
                    >Restaurar</UiButton
                  >
                  <UiButton
                    variant="primary"
                    type="button"
                    :disabled="savingStudent || !hasUnsavedChanges"
                    @click="saveStudent"
                  >
                    <LucideSave :size="17" />
                    {{ savingStudent ? "Guardando..." : "Guardar" }}
                  </UiButton>
                </div>
              </footer>
            </div>
          </section>

          <section
            v-else
            class="student-detail-panel ce-detail-panel ce-empty-detail-panel"
            aria-label="Guía para editar ficha de alumno"
          >
            <div class="ce-empty-shell">
              <div class="ce-empty-hero" aria-hidden="true">
                <span class="ce-empty-sparkle one">✦</span>
                <span class="ce-empty-sparkle two">✦</span>
                <LucideUserRound :size="42" />
                <span class="ce-empty-lines"><i></i><i></i></span>
                <span class="ce-empty-cursor"></span>
              </div>

              <div class="ce-empty-copy">
                <h2>Selecciona un alumno para editar su ficha</h2>
                <p>
                  Elige un alumno de la lista para revisar y actualizar su
                  información.
                </p>
                <p>
                  Podrás editar identidad, datos escolares, contacto familiar,
                  sistema y observaciones.
                </p>
              </div>

              <section class="ce-empty-card ce-empty-review">
                <h3>Qué revisar primero</h3>
                <div>
                  <span><LucideShieldCheck :size="15" /> CURP del alumno</span>
                  <span
                    ><LucideUsersRound :size="15" /> Tutor / Responsable</span
                  >
                  <span><LucidePhone :size="15" /> Teléfono de contacto</span>
                  <span
                    ><LucideGraduationCap :size="15" /> Grupo y servicio
                    asignado</span
                  >
                  <span><LucideMail :size="15" /> Email del contacto</span>
                  <span
                    ><LucideShieldCheck :size="15" /> Expediente completo</span
                  >
                </div>
              </section>

              <section class="ce-empty-card ce-empty-flow">
                <h3>Así se verá tu flujo al seleccionar un alumno</h3>
                <ol>
                  <li>
                    <span><LucideUserRound :size="21" /></span
                    ><b>1 Identidad</b>
                  </li>
                  <li>
                    <span><LucideGraduationCap :size="21" /></span
                    ><b>2 Escolar</b>
                  </li>
                  <li>
                    <span><LucideUsersRound :size="21" /></span
                    ><b>3 Contacto familiar</b>
                  </li>
                  <li>
                    <span><LucideKeyRound :size="21" /></span><b>4 Sistema</b>
                  </li>
                  <li>
                    <span><LucideAlertTriangle :size="21" /></span
                    ><b>5 Observaciones</b>
                  </li>
                </ol>
              </section>

              <aside class="ce-empty-tip">
                <span><LucideShieldCheck :size="23" /></span>
                <p>
                  <strong>Tip:</strong> usa los indicadores de calidad para
                  priorizar los expedientes con pendientes.
                </p>
                <i aria-hidden="true"><LucideShieldCheck :size="23" /></i>
              </aside>
            </div>
          </section>
        </div>
      </div>
    </div>

    <div
      v-if="showMassImportModal"
      class="ce-modal-backdrop"
      @click.self="closeMassImportModal"
    >
      <section
        class="ce-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ce-import-title"
      >
        <header>
          <div>
            <small>Actualización masiva</small>
            <h2 id="ce-import-title">Importar DB de matrícula</h2>
          </div>
          <button
            type="button"
            class="detail-shell-close"
            @click="closeMassImportModal"
          >
            <LucideX :size="20" />
          </button>
        </header>
        <div class="ce-import-body">
          <p>
            Sube el CSV exportado desde Control Escolar. La importación
            actualiza o crea registros del expediente por matrícula y no elimina
            alumnos.
          </p>
          <ul>
            <li>La columna Matrícula es obligatoria.</li>
            <li>Las filas fuera del plantel o ciclo visible se omiten.</li>
            <li>Los campos vacíos no reemplazan información existente.</li>
          </ul>
          <label class="ce-file-drop">
            <LucideUpload :size="20" />
            <span>{{ massImportFile?.name || "Seleccionar archivo CSV" }}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              @change="onMassImportFileChange"
            />
          </label>
          <div
            v-if="massImportResult"
            class="ce-import-result"
            :class="{ warning: massImportResult.errors?.length }"
          >
            <strong
              >{{ massImportResult.updated || 0 }} actualizados ·
              {{ massImportResult.skipped || 0 }} omitidos</strong
            >
            <span>{{ massImportResult.processed || 0 }} filas procesadas.</span>
            <div
              v-if="massImportResult.errors?.length"
              class="ce-import-errors"
            >
              <b>Revisar filas</b>
              <p
                v-for="error in massImportResult.errors.slice(0, 8)"
                :key="`${error.row}-${error.matricula || 'fila'}`"
              >
                Fila {{ error.row
                }}<span v-if="error.matricula"> · {{ error.matricula }}</span
                >: {{ error.message }}
              </p>
            </div>
          </div>
          <div v-if="massImportError" class="ce-save-error">
            <LucideAlertTriangle :size="16" /> {{ massImportError }}
          </div>
        </div>
        <footer>
          <UiButton
            variant="secondary"
            type="button"
            :disabled="massImporting"
            @click="closeMassImportModal"
            >Cerrar</UiButton
          >
          <UiButton
            variant="primary"
            type="button"
            :disabled="!massImportFile || massImporting"
            @click="importMatriculaDb"
          >
            <LucideUpload :size="17" />
            {{ massImporting ? "Importando..." : "Importar archivo" }}
          </UiButton>
        </footer>
      </section>
    </div>
  </div>
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useCookie, useState } from "#app";
import { useHead } from "#imports";
import {
  LucideAlertTriangle,
  LucideBuilding2,
  LucideChevronLeft,
  LucideClock3,
  LucideCloudOff,
  LucideComputer,
  LucideChevronRight,
  LucideDatabase,
  LucideDownload,
  LucideFilter,
  LucideFileSpreadsheet,
  LucideGlobe2,
  LucideGraduationCap,
  LucideKeyRound,
  LucideMail,
  LucideMoreVertical,
  LucidePhone,
  LucideRefreshCw,
  LucideRotateCcw,
  LucideSave,
  LucideSearch,
  LucideSearchX,
  LucideSend,
  LucideShieldCheck,
  LucideUserCheck,
  LucideUserRound,
  LucideUsersRound,
  LucideUpload,
  LucideUserX,
  LucideWifiOff,
  LucideX,
} from "lucide-vue-next";
import UiButton from "~/components/ui/UiButton.vue";
import UiChip from "~/components/ui/UiChip.vue";
import UiGroupIcon from "~/components/ui/UiGroupIcon.vue";
import StudentGradePhotoCard from "~/components/students/StudentGradePhotoCard.vue";
import { useStudentsWorkspaceScale } from "~/composables/useStudentsWorkspaceScale";
import { useToast } from "~/composables/useToast";
import { normalizeCicloKey, formatCicloLabel } from "~/shared/utils/ciclo";
import {
  normalizeEnrollmentConceptIds,
  normalizeStudentMatricula,
  parseEnrollmentConcepts,
  photoStorageKey,
  studentPresentationStyle,
} from "~/shared/utils/studentPresentation";
import { NIVELES_ESCOLARES, gradeOptionsForNivel } from "~/shared/utils/grado";
import { normalizeCicloOption } from "~/utils/constants";

useHead({ bodyAttrs: { class: "students-route-active" } });

const { show } = useToast();
const cicloCookie = useCookie("active_ciclo", { maxAge: 31536000 });
const state = useState("globalState", () => ({
  ciclo: normalizeCicloOption(cicloCookie.value),
}));
const activePlantelCookie = useCookie("auth_active_plantel");
const initialControlPlantel = String(activePlantelCookie.value || "").trim();
const externalConcepts = ref([]);
const ENROLLMENT_CONCEPTS_CACHE_KEY = "students-enrollment-concepts:v1";
const CONTROL_STUDENTS_CACHE_VERSION = 1;
const CONTROL_STUDENTS_CACHE_NAMESPACE = "control-escolar:students-cache";
const currentCicloKey = computed(() =>
  normalizeCicloKey(
    normalizeCicloOption(state.value?.ciclo || cicloCookie.value),
  ),
);
const currentCicloLabel = computed(() =>
  formatCicloLabel(currentCicloKey.value),
);
const selectedAgentId = ref(
  initialControlPlantel && initialControlPlantel !== "GLOBAL"
    ? initialControlPlantel
    : "",
);
const optionsLoading = ref(false);
const kpisLoading = ref(false);
const studentsLoading = ref(false);
const savingStudent = ref(false);
const massImporting = ref(false);
const sendingHuskyPass = ref(false);
const loadError = ref("");
const saveError = ref("");
const students = ref([]);
const controlStudentsIndex = ref([]);
const selectedStudent = ref(null);
const kpis = ref(null);
const catalogs = reactive({
  niveles: [],
  grados: [],
  grupos: [],
  gruposPorGrado: {},
});
const DEFAULT_QUICK_FILTER = "inscritos";
const activeQuickFilter = ref(DEFAULT_QUICK_FILTER);
const showAdvancedFilters = ref(false);
const showMassImportModal = ref(false);
const massImportFile = ref(null);
const massImportResult = ref(null);
const massImportError = ref("");
const activeDetailTab = ref("identity");
const editSnapshot = ref("");
const draftRestored = ref(false);
const draftSavedAt = ref("");
const pendingSelectedStudentRefresh = ref(null);
const pagination = reactive({ page: 1, limit: 8, total: 0, pages: 1 });
const filters = reactive({
  search: "",
  status: DEFAULT_QUICK_FILTER,
  quality: "",
  grado: "",
  group: "",
  recent: "",
});
const editForm = reactive({});
const photoCache = ref({});
const photoLoadingKeys = ref(new Set());
let searchTimer = null;
let controlStudentsRequestId = 0;
const controlStudentPhotoRequests = new Map();
const controlPhotoQueue = [];
const controlPhotoQueuedKeys = new Set();
const controlPhotoActiveKeys = new Set();
let activeControlPhotoLoads = 0;
const controlBaseStage = ref("idle");
const controlEnrichmentStage = ref("idle");
const controlDataFreshness = ref("empty");
const controlDataSavedAt = ref("");
const controlDataSource = ref(null);

const hasDetail = computed(() => true);
const {
  studentsScaleShell,
  studentsScaleShellStyle,
  studentsDesignCanvasStyle,
  scheduleWorkspaceScaleUpdate,
} = useStudentsWorkspaceScale(hasDetail, {
  detailDesignWidth: 1360,
  detailDesignHeight: 660,
  detailMinScale: 0.58,
  fitPadding: 6,
});
const controlSyncBusy = computed(
  () =>
    controlBaseStage.value === "loading" ||
    controlEnrichmentStage.value === "loading",
);
const loadingAny = computed(
  () =>
    optionsLoading.value ||
    kpisLoading.value ||
    studentsLoading.value ||
    savingStudent.value ||
    controlSyncBusy.value,
);

const localHour = ref(12);
const isAfterOfficeHours = computed(() => localHour.value >= 17);
const studentsSourceUnavailable = computed(() =>
  Boolean(
    selectedAgentId.value &&
    loadError.value &&
    !studentsLoading.value &&
    !students.value.length,
  ),
);
const sourceUnavailableTitle = computed(() =>
  isAfterOfficeHours.value
    ? "El equipo del plantel ya cerró por hoy"
    : "La base del plantel no está disponible en este momento",
);
const sourceUnavailableMessage = computed(() =>
  isAfterOfficeHours.value
    ? "La información se consulta desde el equipo local del plantel. Si el administrador ya terminó su jornada, la lista volverá a estar disponible cuando ese equipo se encienda de nuevo."
    : "La lista se activa cuando el equipo del administrador del plantel está encendido y conectado. Solicita que lo mantengan disponible y vuelve a intentarlo.",
);
const sourceUnavailableHint = computed(() =>
  isAfterOfficeHours.value ? "Fuera de horario" : "Esperando conexión",
);

const formatControlSyncTime = (value) => {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch (_) {
    return "";
  }
};

const stepClass = (stage) => ({
  active: stage === "loading",
  done: stage === "ready",
  failed: stage === "failed",
});
const controlBaseStepClass = computed(() => stepClass(controlBaseStage.value));
const controlEnrichmentStepClass = computed(() =>
  stepClass(controlEnrichmentStage.value),
);
const showControlSyncVisual = computed(() =>
  Boolean(
    selectedAgentId.value &&
    !studentsSourceUnavailable.value &&
    (controlDataFreshness.value !== "empty" ||
      controlBaseStage.value !== "idle" ||
      controlEnrichmentStage.value !== "idle"),
  ),
);
const controlSyncStatusClass = computed(() => ({
  "is-cache": controlDataFreshness.value === "cache",
  "is-base": controlDataFreshness.value === "base",
  "is-synced": controlDataFreshness.value === "synced",
  "is-loading":
    controlBaseStage.value === "loading" ||
    controlEnrichmentStage.value === "loading",
  "is-failed":
    controlBaseStage.value === "failed" ||
    controlEnrichmentStage.value === "failed",
}));
const controlDataFreshnessLabel = computed(() => {
  const time = formatControlSyncTime(controlDataSavedAt.value);
  if (controlDataFreshness.value === "cache")
    return time ? `Caché · ${time}` : "Caché local";
  if (controlDataFreshness.value === "base") return "Base del administrador";
  if (controlDataFreshness.value === "synced")
    return time ? `Sync · ${time}` : "Sincronizado";
  if (controlBaseStage.value === "loading") return "Conectando";
  if (controlEnrichmentStage.value === "loading") return "Enriqueciendo";
  return "Sin datos";
});
const controlBaseStepTitle = computed(() =>
  controlBaseStage.value === "loading"
    ? "Conectando con base del administrador"
    : controlBaseStage.value === "ready"
      ? "Base del administrador lista"
      : controlBaseStage.value === "failed"
        ? "Base del administrador no disponible"
        : "Base del administrador pendiente",
);
const controlEnrichmentStepTitle = computed(() =>
  controlEnrichmentStage.value === "loading"
    ? "Enriqueciendo datos de matrícula"
    : controlEnrichmentStage.value === "ready"
      ? "Datos enriquecidos listos"
      : controlEnrichmentStage.value === "failed"
        ? "Enriquecimiento pendiente"
        : "Enriquecimiento pendiente",
);
const controlSyncAriaLabel = computed(() =>
  [
    controlBaseStepTitle.value,
    controlEnrichmentStepTitle.value,
    controlDataFreshnessLabel.value,
  ]
    .filter(Boolean)
    .join(". "),
);
const hasActiveFilters = computed(() =>
  Boolean(
    filters.search ||
    filters.quality ||
    filters.grado ||
    filters.group ||
    filters.recent ||
    (filters.status && filters.status !== DEFAULT_QUICK_FILTER),
  ),
);
const activeFilterLabel = computed(() => {
  const active = [];
  if (filters.status && filters.status !== DEFAULT_QUICK_FILTER)
    active.push(statusLabel(filters.status));
  if (filters.quality) active.push(qualityLabel(filters.quality));
  if (filters.grado) active.push(filters.grado);
  if (filters.group) active.push(`Grupo ${filters.group}`);
  if (filters.search) active.push("Búsqueda");
  return active.slice(0, 2).join(" · ");
});
const availableGroups = computed(() => {
  if (!filters.grado) return [];
  const byGrade = catalogs.gruposPorGrado || {};
  return Array.isArray(byGrade[filters.grado])
    ? byGrade[filters.grado]
    : catalogs.grupos;
});

const mergeOptions = (...groups) =>
  Array.from(
    new Set(
      groups
        .flat()
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
const labelize = (value) => {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};
const nivelOptions = computed(() =>
  mergeOptions(NIVELES_ESCOLARES, catalogs.niveles, [editForm.nivel]),
);
const gradoOptions = computed(() =>
  mergeOptions(
    gradeOptionsForNivel(editForm.nivel || selectedStudent.value?.nivel).map(
      (grado) => grado.toLowerCase(),
    ),
    [editForm.grado],
  ),
);
const groupOptions = computed(() => {
  const byGrade = catalogs.gruposPorGrado || {};
  const scopedGroups =
    editForm.grado && Array.isArray(byGrade[editForm.grado])
      ? byGrade[editForm.grado]
      : [];
  return mergeOptions(scopedGroups, catalogs.grupos, [editForm.grupo]);
});

watch(
  () => editForm.nivel,
  () => {
    const available = gradoOptions.value;
    if (editForm.grado && !available.includes(editForm.grado))
      editForm.grado = available[0] || "";
    editForm.grupo = "";
  },
);

const advancedFilterCount = computed(
  () =>
    [filters.quality, filters.grado, filters.group, filters.recent].filter(
      Boolean,
    ).length,
);

const paginationRangeLabel = computed(() => {
  const total = Number(pagination.total || 0);
  if (!total) return "0 a 0";
  const start =
    (Number(pagination.page || 1) - 1) *
      Number(pagination.limit || students.value.length || 1) +
    1;
  const end = Math.min(start + Math.max(students.value.length, 1) - 1, total);
  return `${formatNumber(start)} a ${formatNumber(end)}`;
});
const visiblePaginationPages = computed(() => {
  const totalPages = Math.max(1, Number(pagination.pages || 1));
  if (totalPages <= 4)
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (pagination.page <= 3) return [1, 2, 3, "ellipsis", totalPages];
  if (pagination.page >= totalPages - 2)
    return [1, "ellipsis", totalPages - 2, totalPages - 1, totalPages];
  return [1, "ellipsis", pagination.page, "ellipsis", totalPages];
});

const primaryFilters = [
  { key: "all", label: "Todos" },
  { key: "inscritos", label: "Inscritos" },
  { key: "internos", label: "Internos" },
  { key: "externos", label: "Externos" },
  { key: "no_inscritos", label: "No inscritos" },
  { key: "bajas", label: "Bajas" },
];

const detailTabs = [
  { key: "identity", label: "Identidad", icon: LucideUserRound },
  { key: "school", label: "Escolar", icon: LucideGraduationCap },
  { key: "family", label: "Contacto familiar", icon: LucideUsersRound },
  { key: "system", label: "Sistema", icon: LucideKeyRound },
  { key: "notes", label: "Observaciones", icon: LucideAlertTriangle },
];

const qualityFilters = computed(() => {
  const data = kpis.value || {};
  return [
    {
      key: "incomplete",
      label: "Expediente incompleto",
      count: data.expedientesIncompletos || 0,
    },
    { key: "curp", label: "Sin CURP", count: data.sinCurp || 0 },
    { key: "phone", label: "Sin teléfono", count: data.sinTelefono || 0 },
    { key: "email", label: "Sin email", count: data.sinEmail || 0 },
    { key: "guardian", label: "Sin tutor", count: data.sinTutor || 0 },
    { key: "contact", label: "Sin contacto", count: data.sinContacto || 0 },
  ];
});

const MASS_UNIT_COUNT = 10;
const buildMassUnits = (value, total) => {
  const safeValue = Math.max(0, Number(value || 0));
  const safeTotal = Math.max(0, Number(total || 0));
  const ratio = safeTotal > 0 ? Math.min(1, safeValue / safeTotal) : 0;
  const activeUnits =
    safeValue > 0 ? Math.max(1, Math.ceil(ratio * MASS_UNIT_COUNT)) : 0;
  return Array.from({ length: MASS_UNIT_COUNT }, (_, index) => ({
    index,
    active: index < activeUnits,
  }));
};
const volumePercent = (value, total) => {
  const safeValue = Math.max(0, Number(value || 0));
  const safeTotal = Math.max(0, Number(total || 0));
  if (!safeTotal) return 0;
  return Math.min(100, Math.round((safeValue / safeTotal) * 100));
};
const withVolume = (card, total) => {
  const percent =
    card.key === "inscritos" && Number(card.value || 0) > 0
      ? 100
      : volumePercent(card.value, total);
  return {
    ...card,
    massUnits: buildMassUnits(
      card.key === "inscritos" ? total : card.value,
      total,
    ),
    volumeAria: `${card.label}: ${formatNumber(card.value)}; ${card.key === "inscritos" ? "total de inscritos" : `${percent}% del total de inscritos`}`,
  };
};
const kpiCards = computed(() => {
  const data = kpis.value || {};
  const total = Number(data.inscritos || data.totalInscritos || 0);
  return [
    {
      key: "inscritos",
      label: "Inscritos",
      value: total,
      tone: "kpi-green",
      icon: LucideUsersRound,
    },
    {
      key: "internos",
      label: "Internos",
      value: data.internos || 0,
      tone: "kpi-teal",
      icon: LucideUserCheck,
    },
    {
      key: "externos",
      label: "Externos",
      value: data.externos || 0,
      tone: "kpi-blue",
      icon: LucideGlobe2,
    },
    {
      key: "no_inscritos",
      label: "No inscritos",
      value: data.noInscritos || 0,
      tone: "kpi-red",
      icon: LucideUserX,
    },
    {
      key: "bajas",
      label: "Bajas",
      value: data.bajas || 0,
      tone: "kpi-gray",
      icon: LucideUserX,
    },
  ].map((card) => withVolume(card, total));
});

const requiredDataFields = [
  { key: "curp", label: "CURP", icon: LucideShieldCheck },
  { key: "teléfono", label: "Teléfono", icon: LucidePhone },
  { key: "email", label: "Email", icon: LucideMail },
  { key: "tutor", label: "Tutor", icon: LucideUsersRound },
];

const formatNumber = (value) => Number(value || 0).toLocaleString("es-MX");
const statusLabel = (value) =>
  ({
    all: "Todos",
    inscritos: "Inscritos",
    activos: "Activos",
    active: "Activos",
    internos: "Internos",
    externos: "Externos",
    no_inscritos: "No inscritos",
    bajas: "Bajas",
    baja: "Bajas",
    sin_contacto: "Sin contacto",
  })[value] || value;
const qualityLabel = (value) =>
  ({
    complete: "Completo",
    incomplete: "Expediente incompleto",
    curp: "Sin CURP",
    phone: "Sin teléfono",
    email: "Sin email",
    guardian: "Sin tutor",
    contact: "Sin contacto",
  })[value] || value;
const controlGroupLabel = (student) => {
  const value = String(student?.group ?? student?.grupo ?? "")
    .replaceAll('"', "")
    .trim();
  return value && value.toLowerCase() !== "null" ? value : "";
};
const controlMissingGroup = (student) => !controlGroupLabel(student);
const controlGroupTitle = (student) => {
  const group = controlGroupLabel(student);
  return group ? `Grupo ${group}` : "Sin grupo";
};
const compactAcademic = (student) =>
  [
    student.grado,
    controlGroupLabel(student)
      ? `Grupo ${controlGroupLabel(student)}`
      : "Sin grupo",
    student.nivel,
  ]
    .filter(Boolean)
    .join(" · ") || "Sin datos académicos";
const statusTone = (student) =>
  String(student?.status || "").toLowerCase() === "baja"
    ? "danger"
    : String(student?.status || "").toLowerCase() === "activo"
      ? "success"
      : "neutral";
const normalizedMissingFields = (student) =>
  Array.isArray(student?.missingFields)
    ? student.missingFields
        .map((field) =>
          String(field || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : [];
const studentMissingField = (student, field) => {
  const missing = normalizedMissingFields(student);
  return (
    missing.includes(String(field?.key || "").toLowerCase()) ||
    missing.includes(String(field?.label || "").toLowerCase())
  );
};
const isInscritoForControlProgress = (student) =>
  String(student?.enrollmentState || "").toLowerCase() === "inscrito";
const studentMissingCount = (student) =>
  requiredDataFields.filter((field) => studentMissingField(student, field))
    .length;
const completionFor = (student) => {
  if (!isInscritoForControlProgress(student)) return 0;
  const total = requiredDataFields.length || 1;
  const missing = studentMissingCount(student);
  return Math.max(0, Math.round(((total - missing) / total) * 100));
};
const qualitySummary = (student) => {
  if (!isInscritoForControlProgress(student)) return "Fuera de inscritos";
  const missing = studentMissingCount(student);
  if (!missing) return "Completo";
  return missing === 1 ? "1 pendiente" : `${missing} faltantes`;
};
const qualityScoreTone = (student) => {
  const score = completionFor(student);
  if (score >= 100) return "complete";
  if (score >= 75) return "warning";
  return "danger";
};
const selectedProfileCompletion = computed(() =>
  completionFor(selectedStudent.value),
);
const selectedMissingCount = computed(() =>
  studentMissingCount(selectedStudent.value),
);
const huskyPassEmailTarget = computed(
  () =>
    selectedStudent.value?.emailPadre ||
    selectedStudent.value?.emailMadre ||
    selectedStudent.value?.email ||
    selectedStudent.value?.huskyPassEmail ||
    "",
);
const EDIT_FORM_FIELDS = [
  "nombres",
  "apellidoPaterno",
  "apellidoMaterno",
  "curp",
  "nivel",
  "grado",
  "grupo",
  "baja",
  "motivoBaja",
  "categoriaBaja",
  "seguimientoBaja",
  "nombrePadre",
  "apellidoPaternoPadre",
  "apellidoMaternoPadre",
  "nombreMadre",
  "apellidoPaternoMadre",
  "apellidoMaternoMadre",
  "telefonoPadre",
  "telefonoMadre",
  "emailPadre",
  "emailMadre",
  "direccion",
];
const readEditForm = () =>
  EDIT_FORM_FIELDS.reduce((draft, field) => {
    draft[field] = editForm[field] ?? "";
    return draft;
  }, {});
const formSnapshot = () => JSON.stringify(readEditForm());
const hasUnsavedChanges = computed(() =>
  Boolean(
    selectedStudent.value &&
    editSnapshot.value &&
    formSnapshot() !== editSnapshot.value,
  ),
);
const saveStateTone = computed(() =>
  savingStudent.value ? "saving" : hasUnsavedChanges.value ? "dirty" : "clean",
);
const saveStatusText = computed(() => {
  if (savingStudent.value) return "Guardando...";
  if (hasUnsavedChanges.value)
    return draftSavedAt.value
      ? `Borrador local ${draftSavedAt.value}`
      : "Cambios sin guardar";
  if (draftSavedAt.value) return `Borrador local ${draftSavedAt.value}`;
  return selectedStudent.value?.overlayExists ? "Al día" : "Guardar";
});
const draftKey = computed(() =>
  selectedStudent.value?.matricula
    ? `control-escolar:draft:${selectedAgentId.value}:${selectedStudent.value.matricula}`
    : "",
);

const buildScopeQuery = () => ({
  agentId: selectedAgentId.value || undefined,
  ciclo: currentCicloKey.value,
  concepts: externalConcepts.value.join(",") || undefined,
});

const buildQuery = (extra = {}) => ({
  ...buildScopeQuery(),
  search: filters.search || undefined,
  status: filters.status || undefined,
  quality: filters.quality || undefined,
  grado: filters.grado || undefined,
  group: filters.group || undefined,
  recent: filters.recent || undefined,
  page: pagination.page,
  limit: pagination.limit,
  ...extra,
});

const buildIndexQuery = () => ({
  ...buildScopeQuery(),
  page: 1,
  limit: 500,
  all: "1",
});

const loadOptions = async () => {
  optionsLoading.value = true;
  try {
    const response = await $fetch("/api/control-escolar/options");
    loadError.value = "";
    selectedAgentId.value = response.activePlantel || "";
  } catch (error) {
    selectedAgentId.value = "";
    loadError.value =
      error?.data?.message ||
      error?.message ||
      "No se pudo resolver el plantel activo.";
  } finally {
    optionsLoading.value = false;
  }
};

const loadKpis = async () => {
  if (!selectedAgentId.value) return;
  kpisLoading.value = true;
  try {
    const response = await $fetch("/api/control-escolar/kpis", {
      query: buildScopeQuery(),
    });
    kpis.value = response.kpis;
  } catch (error) {
    loadError.value =
      error?.data?.message ||
      error?.message ||
      "No se pudieron cargar los indicadores.";
  } finally {
    kpisLoading.value = false;
  }
};

const normalizeControlCacheParams = (query = buildQuery()) =>
  Object.keys(query || {})
    .sort()
    .reduce((normalized, key) => {
      const value = query[key];
      if (value === undefined || value === null || value === "")
        return normalized;
      normalized[key] = String(value);
      return normalized;
    }, {});

const controlStudentsCacheKey = (query = buildQuery()) => {
  const signature = encodeURIComponent(
    JSON.stringify(normalizeControlCacheParams(query)),
  );
  return `${CONTROL_STUDENTS_CACHE_NAMESPACE}:v${CONTROL_STUDENTS_CACHE_VERSION}:${signature}`;
};

const readCachedControlStudents = (query = buildQuery()) => {
  if (!process.client) return null;

  try {
    const cached = JSON.parse(
      localStorage.getItem(controlStudentsCacheKey(query)) || "null",
    );
    if (Number(cached?.version) !== CONTROL_STUDENTS_CACHE_VERSION) return null;
    if (!Array.isArray(cached?.data)) return null;
    return cached;
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo leer la caché local de alumnos.",
      error,
    );
    return null;
  }
};

const writeCachedControlStudents = (query = buildQuery(), response = {}) => {
  if (!process.client || !Array.isArray(response?.data)) return false;

  const record = {
    version: CONTROL_STUDENTS_CACHE_VERSION,
    savedAt: new Date().toISOString(),
    query: normalizeControlCacheParams(query),
    data: response.data,
    pagination: response.pagination || {
      page: pagination.page,
      limit: pagination.limit,
      total: response.data.length,
      pages: 1,
    },
    catalogs: response.catalogs || {
      niveles: [],
      grados: [],
      grupos: [],
      gruposPorGrado: {},
    },
    source: response.source || null,
  };

  try {
    localStorage.setItem(
      controlStudentsCacheKey(query),
      JSON.stringify(record),
    );
    return true;
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo guardar la caché local de alumnos.",
      error,
    );
    return false;
  }
};

const normalizeMatriculaKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const isDetailFieldFocused = () => {
  if (!process.client) return false;
  const activeElement = document.activeElement;
  if (!activeElement?.closest?.(".ce-detail-panel")) return false;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(activeElement.tagName);
};

const applySelectedStudentRefresh = (student) => {
  if (!student) return;
  const currentTab = activeDetailTab.value;
  selectedStudent.value = student;
  pendingSelectedStudentRefresh.value = null;
  resetEditForm(student, { restoreDraft: false });
  activeDetailTab.value = currentTab;
};

const applyPendingSelectedStudentRefresh = () => {
  if (
    !pendingSelectedStudentRefresh.value ||
    hasUnsavedChanges.value ||
    isDetailFieldFocused()
  )
    return;
  applySelectedStudentRefresh(pendingSelectedStudentRefresh.value);
};

const reconcileSelectedStudentAfterSync = (nextStudents = []) => {
  if (!selectedStudent.value) return;

  const selectedKey = normalizeMatriculaKey(selectedStudent.value.matricula);
  const refreshed = nextStudents.find(
    (student) => normalizeMatriculaKey(student.matricula) === selectedKey,
  );
  if (!refreshed) return;

  if (hasUnsavedChanges.value || isDetailFieldFocused()) {
    pendingSelectedStudentRefresh.value = refreshed;
    if (process.client)
      window.setTimeout(applyPendingSelectedStudentRefresh, 900);
    return;
  }

  applySelectedStudentRefresh(refreshed);
};

const normalizeClientText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const controlStudentSearchHaystack = (student = {}) =>
  normalizeClientText(
    [
      student.matricula,
      student.fullName,
      student.nombres,
      student.apellidoPaterno,
      student.apellidoMaterno,
      student.curp,
      student.phone,
      student.telefono,
      student.telefonoPadre,
      student.telefonoMadre,
      student.email,
      student.emailPadre,
      student.emailMadre,
      student.guardianName,
      student.nombrePadre,
      student.nombreMadre,
      student.nivel,
      student.grado,
      student.group,
      student.grupo,
    ]
      .filter(Boolean)
      .join(" "),
  );

const hasNoPrimaryContactClient = (student = {}) =>
  ![
    student.phone,
    student.telefono,
    student.telefonoPadre,
    student.telefonoMadre,
    student.email,
    student.emailPadre,
    student.emailMadre,
    student.guardianName,
    student.nombrePadre,
    student.nombreMadre,
  ].some((value) => String(value || "").trim());

const localStudentMatchesStatus = (student, status) => {
  const normalized = normalizeClientText(status);
  if (!normalized || normalized === "all" || normalized === "todos")
    return true;
  if (normalized === "activos" || normalized === "active")
    return student.status === "Activo";
  if (normalized === "inscritos") return student.enrollmentState === "inscrito";
  if (normalized === "internos")
    return (
      student.enrollmentState === "inscrito" &&
      student.tipoIngresoValue === "interno"
    );
  if (normalized === "externos")
    return (
      student.enrollmentState === "inscrito" &&
      student.tipoIngresoValue !== "interno"
    );
  if (normalized === "no_inscritos")
    return student.enrollmentState === "no_inscrito";
  if (normalized === "bajas" || normalized === "baja")
    return (
      student.status === "Baja" ||
      student.enrollmentState === "baja_inscrita" ||
      student.enrollmentState === "baja"
    );
  if (normalized === "sin_ficha" || normalized === "sin_ficha_matricula")
    return !student.overlayExists;
  if (normalized === "sin_contacto") return hasNoPrimaryContactClient(student);
  return true;
};

const localStudentMatchesQuality = (student, quality) => {
  const normalized = normalizeClientText(quality);
  if (!normalized || normalized === "all") return true;
  if (!isInscritoForControlProgress(student)) return false;
  const missing = normalizedMissingFields(student);
  if (normalized === "complete" || normalized === "completo")
    return missing.length === 0;
  if (normalized === "incomplete" || normalized === "incompleto")
    return missing.length > 0;
  if (normalized === "curp") return missing.includes("curp");
  if (normalized === "phone" || normalized === "telefono")
    return missing.includes("teléfono") || missing.includes("telefono");
  if (normalized === "email") return missing.includes("email");
  if (normalized === "guardian" || normalized === "tutor")
    return missing.includes("tutor");
  if (normalized === "contact" || normalized === "contacto")
    return hasNoPrimaryContactClient(student);
  if (
    normalized === "overlay" ||
    normalized === "sin_ficha" ||
    normalized === "sin_ficha_matricula"
  )
    return !student.overlayExists;
  return true;
};

const localStudentMatchesRecent = (student, recent) => {
  const normalized = normalizeClientText(recent);
  if (!normalized || normalized === "all") return true;
  const days =
    normalized === "7d"
      ? 7
      : normalized === "30d"
        ? 30
        : normalized === "90d"
          ? 90
          : 0;
  if (!days) return true;
  const time = student.updatedAt ? new Date(student.updatedAt).getTime() : 0;
  return (
    Number.isFinite(time) && time >= Date.now() - days * 24 * 60 * 60 * 1000
  );
};

const CONTROL_PHOTO_CONCURRENCY = 3;
const normalizePhotoKey = (studentOrMatricula) =>
  normalizeStudentMatricula(
    typeof studentOrMatricula === "object"
      ? studentOrMatricula?.matricula
      : studentOrMatricula,
  );

const setControlPhotoLoading = (matricula, loading) => {
  const key = normalizePhotoKey(matricula);
  if (!key) return;
  const next = new Set(photoLoadingKeys.value);
  if (loading) next.add(key);
  else next.delete(key);
  photoLoadingKeys.value = next;
};

const readStoredControlPhoto = (matricula) => {
  if (!process.client) return "";
  const key = normalizePhotoKey(matricula);
  if (!key) return "";
  try {
    return sessionStorage.getItem(photoStorageKey(key)) || "";
  } catch (error) {
    return "";
  }
};

const writeStoredControlPhoto = (matricula, photoUrl) => {
  if (!process.client) return;
  const key = normalizePhotoKey(matricula);
  if (!key) return;
  try {
    sessionStorage.setItem(photoStorageKey(key), photoUrl || "none");
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo guardar la foto del alumno en sesión.",
      error,
    );
  }
};

const cacheControlPhoto = (matricula, photoUrl) => {
  const key = normalizePhotoKey(matricula);
  if (!key || !photoUrl || photoUrl === "none") return;
  photoCache.value = { ...photoCache.value, [key]: photoUrl };
};

const hydrateControlPhotoFromSession = (matricula) => {
  const key = normalizePhotoKey(matricula);
  if (!key || photoCache.value[key]) return Boolean(photoCache.value[key]);
  const stored = readStoredControlPhoto(key);
  if (stored && stored !== "none") {
    cacheControlPhoto(key, stored);
    return true;
  }
  return Boolean(stored === "none");
};

const controlStudentPhotoUrl = (student) => {
  const key = normalizePhotoKey(student);
  if (!key) return student?.photoUrl || "";
  const cached = photoCache.value[key];
  if (cached && cached !== "none") return cached;
  if (student?.photoUrl && student.photoUrl !== "none") return student.photoUrl;
  return "";
};

const isControlStudentPhotoLoading = (student) =>
  photoLoadingKeys.value.has(normalizePhotoKey(student));

const loadControlStudentPhoto = async (matricula) => {
  const key = normalizePhotoKey(matricula);
  if (!key || !process.client) return;
  if (hydrateControlPhotoFromSession(key)) return;

  setControlPhotoLoading(key, true);
  try {
    let request = controlStudentPhotoRequests.get(key);
    if (!request) {
      request = $fetch(`/api/students/${encodeURIComponent(key)}/photo`, {
        params: { format: "json" },
      }).finally(() => controlStudentPhotoRequests.delete(key));
      controlStudentPhotoRequests.set(key, request);
    }

    const response = await request;
    const photoUrl = response?.photoUrl || "";
    if (photoUrl) {
      cacheControlPhoto(key, photoUrl);
      writeStoredControlPhoto(key, photoUrl);
    } else {
      writeStoredControlPhoto(key, "none");
    }
  } catch (error) {
    if (error?.statusCode === 404 || error?.response?.status === 404)
      writeStoredControlPhoto(key, "none");
  } finally {
    setControlPhotoLoading(key, false);
  }
};

const pumpControlPhotoQueue = () => {
  if (!process.client) return;
  while (
    activeControlPhotoLoads < CONTROL_PHOTO_CONCURRENCY &&
    controlPhotoQueue.length
  ) {
    const key = controlPhotoQueue.shift();
    controlPhotoQueuedKeys.delete(key);
    if (
      !key ||
      controlPhotoActiveKeys.has(key) ||
      hydrateControlPhotoFromSession(key)
    )
      continue;

    activeControlPhotoLoads += 1;
    controlPhotoActiveKeys.add(key);
    loadControlStudentPhoto(key).finally(() => {
      activeControlPhotoLoads = Math.max(0, activeControlPhotoLoads - 1);
      controlPhotoActiveKeys.delete(key);
      pumpControlPhotoQueue();
    });
  }
};

const queueControlStudentPhotos = (sourceStudents = [], options = {}) => {
  if (!process.client) return;
  const entries = Array.isArray(sourceStudents)
    ? sourceStudents
    : [sourceStudents];
  const keys = entries.map(normalizePhotoKey).filter(Boolean);

  keys.forEach((key) => {
    if (
      photoCache.value[key] ||
      controlPhotoQueuedKeys.has(key) ||
      controlPhotoActiveKeys.has(key)
    )
      return;
    if (hydrateControlPhotoFromSession(key)) return;
    controlPhotoQueuedKeys.add(key);
    if (options.priority) controlPhotoQueue.unshift(key);
    else controlPhotoQueue.push(key);
  });

  pumpControlPhotoQueue();
};

const filteredControlStudents = () => {
  const search = normalizeClientText(filters.search);
  const grado = normalizeClientText(filters.grado);
  const grupo = String(filters.group || "").trim();

  return controlStudentsIndex.value.filter((student) => {
    if (search && !controlStudentSearchHaystack(student).includes(search))
      return false;
    if (!localStudentMatchesStatus(student, filters.status)) return false;
    if (grado && normalizeClientText(student.grado) !== grado) return false;
    if (
      grupo &&
      grupo !== "all" &&
      String(student.group || student.grupo || "").trim() !== grupo
    )
      return false;
    if (!localStudentMatchesQuality(student, filters.quality)) return false;
    if (!localStudentMatchesRecent(student, filters.recent)) return false;
    return true;
  });
};

const applyInstantStudentFilters = ({ reconcileSelection = false } = {}) => {
  const filtered = filteredControlStudents();
  const safeLimit = Math.max(1, Number(pagination.limit || 8));
  const pages = Math.max(1, Math.ceil(filtered.length / safeLimit));
  const safePage = Math.min(Math.max(1, Number(pagination.page || 1)), pages);
  if (pagination.page !== safePage) pagination.page = safePage;

  const offset = (safePage - 1) * safeLimit;
  students.value = filtered.slice(offset, offset + safeLimit);
  Object.assign(pagination, {
    page: safePage,
    limit: safeLimit,
    total: filtered.length,
    pages,
  });
  if (reconcileSelection) reconcileSelectedStudentAfterSync(filtered);
  queueControlStudentPhotos(students.value);
  nextTick(scheduleWorkspaceScaleUpdate);
};

const resetControlStudentsView = () => {
  controlStudentsIndex.value = [];
  students.value = [];
  selectedStudent.value = null;
  pendingSelectedStudentRefresh.value = null;
  kpis.value = null;
  controlDataFreshness.value = "empty";
  controlDataSavedAt.value = "";
  controlDataSource.value = null;
  Object.assign(catalogs, {
    niveles: [],
    grados: [],
    grupos: [],
    gruposPorGrado: {},
  });
  Object.assign(pagination, { page: 1, total: 0, pages: 1 });
};

const buildClientKpisFromStudents = (sourceStudents = []) => {
  const rows = Array.isArray(sourceStudents) ? sourceStudents : [];
  const progressRows = rows.filter(isInscritoForControlProgress);
  const missing = (field) =>
    progressRows.filter((student) => normalizedMissingFields(student).includes(field))
      .length;
  const inscritos = progressRows.length;
  const internos = rows.filter(
    (student) =>
      student.enrollmentState === "inscrito" &&
      student.tipoIngresoValue === "interno",
  ).length;
  const externos = rows.filter(
    (student) =>
      student.enrollmentState === "inscrito" &&
      student.tipoIngresoValue !== "interno",
  ).length;
  const noInscritos = rows.filter(
    (student) => student.enrollmentState === "no_inscrito",
  ).length;
  const bajas = rows.filter(
    (student) =>
      student.status === "Baja" ||
      student.enrollmentState === "baja_inscrita" ||
      student.enrollmentState === "baja",
  ).length;
  const sinContacto = progressRows.filter(hasNoPrimaryContactClient).length;

  return {
    totalInscritos: inscritos,
    totalVisible: rows.length,
    totalExpedientesEvaluados: progressRows.length,
    expedientesCompletos: progressRows.filter(
      (student) => normalizedMissingFields(student).length === 0,
    ).length,
    inscritos,
    internos,
    externos,
    noInscritos,
    activos: rows.filter((student) => student.status === "Activo").length,
    bajas,
    sinFichaMatricula: rows.filter((student) => !student.overlayExists).length,
    expedientesIncompletos: progressRows.filter(
      (student) => normalizedMissingFields(student).length > 0,
    ).length,
    sinContacto,
    sinCurp: missing("curp"),
    sinTelefono: missing("teléfono") || missing("telefono"),
    sinTutor: missing("tutor"),
    sinEmail: missing("email"),
  };
};

const applyControlStudentsPayload = (
  response = {},
  { reconcileSelection = true } = {},
) => {
  if (response?.error) {
    throw new Error(
      response?.message ||
        response?.statusMessage ||
        "No se pudieron cargar alumnos de Control Escolar.",
    );
  }

  controlStudentsIndex.value = Array.isArray(response?.data)
    ? response.data
    : [];
  controlDataSource.value = response?.source || controlDataSource.value;
  Object.assign(
    catalogs,
    response?.catalogs || {
      niveles: [],
      grados: [],
      grupos: [],
      gruposPorGrado: {},
    },
  );
  kpis.value =
    response?.kpis || buildClientKpisFromStudents(controlStudentsIndex.value);
  applyInstantStudentFilters({ reconcileSelection });
};

const replaceControlStudentInIndex = (student) => {
  if (!student?.matricula) return;
  const selectedKey = normalizeMatriculaKey(student.matricula);
  const index = controlStudentsIndex.value.findIndex(
    (candidate) => normalizeMatriculaKey(candidate.matricula) === selectedKey,
  );
  if (index >= 0) controlStudentsIndex.value.splice(index, 1, student);
  else controlStudentsIndex.value.unshift(student);
  applyInstantStudentFilters({ reconcileSelection: false });
};

const persistCurrentControlStudentsCache = () =>
  writeCachedControlStudents(buildIndexQuery(), {
    data: controlStudentsIndex.value,
    pagination: {
      page: 1,
      limit: Math.max(controlStudentsIndex.value.length, 1),
      total: controlStudentsIndex.value.length,
      pages: 1,
    },
    catalogs: {
      ...catalogs,
      gruposPorGrado: { ...(catalogs.gruposPorGrado || {}) },
    },
    source: controlDataSource.value,
  });

const isDomEventPayload = (value) =>
  Boolean(
    value &&
    typeof value === "object" &&
    ("isTrusted" in value || "target" in value || "currentTarget" in value),
  );

const loadStudents = async (options = {}) => {
  if (!selectedAgentId.value) return;

  const safeOptions = isDomEventPayload(options) ? {} : options || {};
  const {
    useCache = true,
    clearExisting = false,
    forceLoading = false,
  } = safeOptions;
  const requestId = ++controlStudentsRequestId;
  const query = buildIndexQuery();
  const cached = useCache ? readCachedControlStudents(query) : null;
  const hadStudents =
    controlStudentsIndex.value.length > 0 || students.value.length > 0;

  controlBaseStage.value = "idle";
  controlEnrichmentStage.value = "idle";

  if (cached) {
    pagination.page = 1;
    applyControlStudentsPayload(cached);
    loadError.value = "";
    studentsLoading.value = false;
    controlDataFreshness.value = "cache";
    controlDataSavedAt.value = cached.savedAt || "";
    controlDataSource.value = cached.source || null;
  } else {
    if (clearExisting) resetControlStudentsView();
    studentsLoading.value = forceLoading || !hadStudents || clearExisting;
    controlDataFreshness.value =
      hadStudents && !clearExisting ? controlDataFreshness.value : "empty";
    controlDataSavedAt.value = "";
  }

  const canKeepVisibleData = () =>
    Boolean(cached) ||
    (!clearExisting && hadStudents) ||
    controlStudentsIndex.value.length > 0 ||
    students.value.length > 0;

  try {
    controlBaseStage.value = "loading";
    const baseResponse = await $fetch("/api/control-escolar/students", {
      query: { ...query, phase: "base" },
    });
    if (requestId !== controlStudentsRequestId) return;

    pagination.page = 1;
    applyControlStudentsPayload(baseResponse);
    loadError.value = "";
    controlBaseStage.value = "ready";
    controlDataFreshness.value = "base";
    controlDataSavedAt.value = "";
    controlDataSource.value = baseResponse?.source || controlDataSource.value;
    if (!cached) writeCachedControlStudents(query, baseResponse);
  } catch (error) {
    if (requestId !== controlStudentsRequestId) return;
    controlBaseStage.value = "failed";

    if (!canKeepVisibleData()) {
      resetControlStudentsView();
      loadError.value =
        error?.data?.message ||
        error?.message ||
        "Plantel fuera de línea o sin respuesta.";
      studentsLoading.value = false;
      nextTick(scheduleWorkspaceScaleUpdate);
      return;
    }

    loadError.value = "";
    applyInstantStudentFilters();
  } finally {
    if (requestId === controlStudentsRequestId) {
      studentsLoading.value = false;
      nextTick(scheduleWorkspaceScaleUpdate);
    }
  }

  try {
    controlEnrichmentStage.value = "loading";
    const response = await $fetch("/api/control-escolar/students", {
      query: { ...query, phase: "enriched" },
    });
    if (requestId !== controlStudentsRequestId) return;

    pagination.page = 1;
    applyControlStudentsPayload(response);
    writeCachedControlStudents(query, response);
    loadError.value = "";
    const responseSource = response?.source || {};
    const enrichmentRows = Number(
      responseSource.enrichedRows ??
        responseSource.centralRows ??
        responseSource.overlayRows ??
        responseSource.matriculaRows ??
        0,
    );
    controlEnrichmentStage.value = enrichmentRows > 0 ? "ready" : "idle";
    controlDataFreshness.value = enrichmentRows > 0 ? "synced" : "base";
    controlDataSavedAt.value = enrichmentRows > 0 ? new Date().toISOString() : "";
    controlDataSource.value = response?.source || controlDataSource.value;
  } catch (error) {
    if (requestId !== controlStudentsRequestId) return;
    controlEnrichmentStage.value = "failed";

    if (!canKeepVisibleData()) {
      resetControlStudentsView();
      loadError.value =
        error?.data?.message ||
        error?.message ||
        "Plantel fuera de línea o sin respuesta.";
    } else {
      loadError.value = "";
      applyInstantStudentFilters();
    }
  } finally {
    if (requestId === controlStudentsRequestId) {
      studentsLoading.value = false;
      nextTick(scheduleWorkspaceScaleUpdate);
    }
  }
};

const refreshAll = async (options = {}) => {
  const safeOptions = isDomEventPayload(options) ? {} : options || {};
  const { forceNetwork = false, ...studentOptions } = safeOptions;
  kpisLoading.value = true;
  try {
    await loadStudents({ useCache: !forceNetwork, ...studentOptions });
  } finally {
    kpisLoading.value = false;
  }
};

const reloadControlStudentsForCurrentScope = async () => {
  if (!selectedAgentId.value) return;
  pagination.page = 1;
  await refreshAll({ clearExisting: true, forceLoading: true });
};

const clearQuickFilters = () => {
  filters.status = DEFAULT_QUICK_FILTER;
  filters.quality = "";
  activeQuickFilter.value = DEFAULT_QUICK_FILTER;
};

const toggleFilter = (key, value) => {
  filters[key] = filters[key] === value ? "" : value;
  pagination.page = 1;
};

const clearAcademicFilters = () => {
  filters.grado = "";
  filters.group = "";
  pagination.page = 1;
};

const selectGrade = (grado) => {
  filters.grado = filters.grado === grado ? "" : grado;
  filters.group = "";
  pagination.page = 1;
};

const clearFilters = () => {
  Object.assign(filters, {
    search: "",
    status: DEFAULT_QUICK_FILTER,
    quality: "",
    grado: "",
    group: "",
    recent: "",
  });
  activeQuickFilter.value = DEFAULT_QUICK_FILTER;
  pagination.page = 1;
};

const applyPrimaryFilter = (key) => {
  filters.status = key;
  filters.quality = "";
  activeQuickFilter.value = key;
  pagination.page = 1;
};

const toggleQualityFilter = (key) => {
  filters.quality = filters.quality === key ? "" : key;
  if (filters.quality) activeQuickFilter.value = "quality";
  else activeQuickFilter.value = filters.status || DEFAULT_QUICK_FILTER;
  pagination.page = 1;
};

const applyKpiFilter = (key) => {
  if (key === "incomplete") {
    filters.status = DEFAULT_QUICK_FILTER;
    filters.quality = filters.quality === "incomplete" ? "" : "incomplete";
    activeQuickFilter.value = filters.quality ? key : DEFAULT_QUICK_FILTER;
  } else {
    const next =
      activeQuickFilter.value === key && key !== DEFAULT_QUICK_FILTER
        ? DEFAULT_QUICK_FILTER
        : key;
    filters.status = next;
    filters.quality = "";
    activeQuickFilter.value = next;
  }
  pagination.page = 1;
};

const goToPage = (page) => {
  pagination.page = Math.min(Math.max(1, page), pagination.pages || 1);
};

const readStoredDraft = () => {
  if (!process.client || !draftKey.value) return null;
  try {
    return JSON.parse(localStorage.getItem(draftKey.value) || "null");
  } catch (error) {
    console.warn("[Control Escolar] No se pudo leer el borrador local.", error);
    return null;
  }
};

const clearEditDraft = () => {
  if (!process.client || !draftKey.value) return;
  try {
    localStorage.removeItem(draftKey.value);
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo limpiar el borrador local.",
      error,
    );
  }
  draftRestored.value = false;
  draftSavedAt.value = "";
};

const persistEditDraft = () => {
  if (!process.client || !draftKey.value || !hasUnsavedChanges.value) return;
  const savedAt = new Date().toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
  try {
    localStorage.setItem(
      draftKey.value,
      JSON.stringify({ savedAt, values: readEditForm() }),
    );
    draftSavedAt.value = savedAt;
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo guardar el borrador local.",
      error,
    );
  }
};

const restoreEditDraft = () => {
  const stored = readStoredDraft();
  if (!stored?.values || typeof stored.values !== "object") return;
  Object.assign(editForm, stored.values);
  draftRestored.value = true;
  draftSavedAt.value = stored.savedAt || "";
};

const selectStudent = (student, copy = true) => {
  selectedStudent.value = student;
  activeDetailTab.value = "identity";
  if (copy) resetEditForm(student, { restoreDraft: true });
  queueControlStudentPhotos([student], { priority: true });
  nextTick(scheduleWorkspaceScaleUpdate);
};

const resetEditForm = (student = selectedStudent.value, options = {}) => {
  if (!student) return;
  Object.assign(editForm, {
    nombres: student.nombres || "",
    apellidoPaterno: student.apellidoPaterno || "",
    apellidoMaterno: student.apellidoMaterno || "",
    curp: student.curp || "",
    nivel: student.nivel || "",
    grado: student.grado || "",
    grupo: student.group || "",
    baja: Number(student.baja || 0),
    motivoBaja: student.motivoBaja || "",
    categoriaBaja: student.categoriaBaja || "",
    seguimientoBaja: student.seguimientoBaja || "",
    nombrePadre: student.nombrePadre || "",
    apellidoPaternoPadre: student.apellidoPaternoPadre || "",
    apellidoMaternoPadre: student.apellidoMaternoPadre || "",
    nombreMadre: student.nombreMadre || "",
    apellidoPaternoMadre: student.apellidoPaternoMadre || "",
    apellidoMaternoMadre: student.apellidoMaternoMadre || "",
    telefonoPadre: student.telefonoPadre || "",
    telefonoMadre: student.telefonoMadre || "",
    emailPadre: student.emailPadre || "",
    emailMadre: student.emailMadre || "",
    direccion: student.address || "",
  });
  saveError.value = "";
  draftRestored.value = false;
  draftSavedAt.value = "";
  editSnapshot.value = formSnapshot();
  if (options.restoreDraft) restoreEditDraft();
};

const discardChanges = () => {
  clearEditDraft();
  resetEditForm(selectedStudent.value, { restoreDraft: false });
};

const saveStudent = async () => {
  if (!selectedStudent.value || !selectedAgentId.value || savingStudent.value)
    return;
  savingStudent.value = true;
  saveError.value = "";
  try {
    const payload = readEditForm();
    const response = await $fetch(
      `/api/control-escolar/students/${encodeURIComponent(selectedStudent.value.matricula)}`,
      {
        method: "PATCH",
        query: buildScopeQuery(),
        body: payload,
      },
    );
    if (response.student) {
      replaceControlStudentInIndex(response.student);
      selectedStudent.value = response.student;
      pendingSelectedStudentRefresh.value = null;
      clearEditDraft();
      resetEditForm(response.student, { restoreDraft: false });
      persistCurrentControlStudentsCache();
    }
    show("Ficha de Control Escolar guardada.", "success");
    await loadKpis();
  } catch (error) {
    saveError.value =
      error?.data?.message || error?.message || "No se pudo guardar la ficha.";
  } finally {
    savingStudent.value = false;
  }
};

const exportCurrentView = () => {
  if (!selectedAgentId.value) return;
  const params = new URLSearchParams();
  Object.entries(buildQuery({ page: undefined, limit: undefined })).forEach(
    ([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, value);
    },
  );
  window.open(`/api/control-escolar/export?${params.toString()}`, "_blank");
};

const exportMatriculaDb = () => {
  if (!selectedAgentId.value) return;
  const params = new URLSearchParams();
  Object.entries(buildQuery({ page: undefined, limit: undefined })).forEach(
    ([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, value);
    },
  );
  window.open(
    `/api/control-escolar/matricula-db/export?${params.toString()}`,
    "_blank",
  );
};

const openMassImportModal = () => {
  massImportError.value = "";
  massImportResult.value = null;
  showMassImportModal.value = true;
};

const closeMassImportModal = () => {
  if (massImporting.value) return;
  showMassImportModal.value = false;
  massImportFile.value = null;
  massImportError.value = "";
};

const onMassImportFileChange = (event) => {
  massImportFile.value = event?.target?.files?.[0] || null;
  massImportResult.value = null;
  massImportError.value = "";
};

const importMatriculaDb = async () => {
  const file = massImportFile.value;
  if (!file || !selectedAgentId.value) return;
  massImporting.value = true;
  massImportError.value = "";
  try {
    const form = new FormData();
    form.append("file", file);
    const response = await $fetch("/api/control-escolar/matricula-db/import", {
      method: "POST",
      query: buildScopeQuery(),
      body: form,
    });
    const summary = response?.summary || {};
    massImportResult.value = summary;
    const skipped = Number(summary.skipped || 0);
    show(
      `Importación aplicada: ${summary.updated || 0} actualizados${skipped ? `, ${skipped} omitidos` : ""}.`,
      skipped ? "warning" : "success",
    );
    await refreshAll();
  } catch (error) {
    massImportError.value =
      error?.data?.message ||
      error?.message ||
      "No se pudo importar el archivo.";
    show(massImportError.value, "danger");
  } finally {
    massImporting.value = false;
  }
};

const sendHuskyPassEmail = async () => {
  if (!selectedStudent.value || !selectedAgentId.value) return;
  sendingHuskyPass.value = true;
  try {
    const response = await $fetch(
      `/api/control-escolar/students/${encodeURIComponent(selectedStudent.value.matricula)}/husky-pass-email`,
      {
        method: "POST",
        query: buildScopeQuery(),
        body: { to: huskyPassEmailTarget.value },
      },
    );
    show(`Husky Pass enviado a ${response.sentTo}.`, "success");
  } catch (error) {
    show(
      error?.data?.message || error?.message || "No se pudo enviar Husky Pass.",
      "danger",
    );
  } finally {
    sendingHuskyPass.value = false;
  }
};

const cacheEnrollmentConcepts = (conceptIds) => {
  if (!process.client || !Array.isArray(conceptIds) || !conceptIds.length)
    return;
  try {
    localStorage.setItem(
      ENROLLMENT_CONCEPTS_CACHE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        concepts: conceptIds,
      }),
    );
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo guardar la configuración de inscripción.",
      error,
    );
  }
};

const hydrateCachedEnrollmentConcepts = () => {
  if (!process.client || externalConcepts.value.length) return;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(ENROLLMENT_CONCEPTS_CACHE_KEY) || "null",
    );
    const conceptIds = normalizeEnrollmentConceptIds(parsed?.concepts);
    if (conceptIds.length) externalConcepts.value = conceptIds;
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo leer la configuración de inscripción.",
      error,
    );
  }
};

const parseEnrollmentConfig = (obj) => {
  const conceptIds = parseEnrollmentConcepts(obj);
  if (!conceptIds.length) return;
  externalConcepts.value = conceptIds;
  cacheEnrollmentConcepts(conceptIds);
};

const loadEnrollmentConfig = async ({ refreshStudents = false } = {}) => {
  const previousConcepts = externalConcepts.value.join("|");

  try {
    const configData = await $fetch("/api/control-escolar/enrollment-config");
    parseEnrollmentConfig(configData);
  } catch (serverError) {
    try {
      const configData = await $fetch(
        "https://matricula.casitaapps.com/api/enrollment-config/all",
      );
      parseEnrollmentConfig(configData);
    } catch (externalError) {
      console.warn(
        "[Control Escolar] Usando configuración de inscripción local o por defecto.",
        externalError || serverError,
      );
    }
  }

  if (
    refreshStudents &&
    externalConcepts.value.join("|") !== previousConcepts
  ) {
    await refreshAll({
      clearExisting: false,
      forceLoading: !controlStudentsIndex.value.length,
    });
  }
};

watch(
  editForm,
  () => {
    if (!selectedStudent.value || !editSnapshot.value) return;
    if (hasUnsavedChanges.value) persistEditDraft();
    else clearEditDraft();
  },
  { deep: true },
);

watch(hasUnsavedChanges, (isDirty) => {
  if (!isDirty) nextTick(applyPendingSelectedStudentRefresh);
});

watch(
  () => ({ ...filters }),
  () => {
    pagination.page = 1;
    if (process.client) window.clearTimeout(searchTimer);
    applyInstantStudentFilters();
  },
  { deep: true },
);

watch(
  () => pagination.page,
  () => applyInstantStudentFilters(),
);
watch(
  () => [
    selectedAgentId.value,
    currentCicloKey.value,
    externalConcepts.value.join("|"),
  ],
  ([nextAgent], [previousAgent]) => {
    if (!nextAgent) return;
    if (
      !previousAgent &&
      controlStudentsIndex.value.length === 0 &&
      studentsLoading.value
    )
      return;
    reloadControlStudentsForCurrentScope();
  },
  { flush: "post" },
);
watch(selectedAgentId, () => nextTick(scheduleWorkspaceScaleUpdate));
watch(
  students,
  (visibleStudents) => queueControlStudentPhotos(visibleStudents),
  { deep: false },
);
watch(selectedStudent, (student) =>
  queueControlStudentPhotos(student ? [student] : [], { priority: true }),
);

const handleCicloChanged = (event) => {
  const previousCiclo = currentCicloKey.value;
  const cicloKey = normalizeCicloOption(
    event?.detail?.ciclo || cicloCookie.value || state.value?.ciclo,
  );
  if (state.value.ciclo !== cicloKey) state.value.ciclo = cicloKey;
  cicloCookie.value = cicloKey;
  if (normalizeCicloKey(cicloKey) === previousCiclo)
    reloadControlStudentsForCurrentScope();
};

onMounted(async () => {
  if (process.client) {
    localHour.value = new Date().getHours();
    window.addEventListener("ingresos:ciclo-changed", handleCicloChanged);
  }

  state.value.ciclo = normalizeCicloOption(
    state.value?.ciclo || cicloCookie.value,
  );
  hydrateCachedEnrollmentConcepts();
  const initialAgentId = selectedAgentId.value;
  const initialStudentsLoad = initialAgentId ? loadStudents() : null;

  await loadOptions();

  if (selectedAgentId.value) {
    if (selectedAgentId.value !== initialAgentId) await refreshAll();
    else if (initialStudentsLoad) await initialStudentsLoad;
    else await refreshAll();
  }

  await loadEnrollmentConfig({ refreshStudents: true });
});

onBeforeUnmount(() => {
  if (process.client)
    window.removeEventListener("ingresos:ciclo-changed", handleCicloChanged);
});
</script>

<style scoped>
.control-escolar-screen {
  gap: 0;
}

.ce-hero {
  min-height: 34px;
  margin-bottom: 6px;
  align-items: center;
  justify-content: flex-end;
}

.ce-hero-spacer {
  flex: 1 1 auto;
}

.ce-hero-title h1 {
  margin: 0;
  color: #10203a;
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.035em;
}

.ce-sync-visual {
  display: inline-flex;
  width: max-content;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  margin: 0 0 8px;
  padding: 5px 9px;
  border: 1px solid rgba(212, 222, 232, 0.9);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 8px 18px rgba(21, 35, 60, 0.05);
}

.ce-sync-node {
  display: inline-grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 999px;
  background: #f8fafc;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 920;
  line-height: 1;
}

.ce-sync-node.active {
  border-color: rgba(56, 147, 62, 0.36);
  background: #eaf8e7;
  color: #1f8531;
  box-shadow: 0 0 0 5px rgba(63, 145, 56, 0.08);
  animation: ce-sync-pulse 1.35s ease-in-out infinite;
}

.ce-sync-node.done {
  border-color: rgba(48, 141, 58, 0.45);
  background: #278b3a;
  color: #fff;
}

.ce-sync-node.failed {
  border-color: rgba(225, 80, 72, 0.35);
  background: #fff1f0;
  color: #d4423b;
}

.ce-sync-rail {
  width: 28px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(39, 139, 58, 0.82), rgba(203, 213, 225, 0.9));
}

.ce-sync-visual.is-synced .ce-sync-rail {
  background: #278b3a;
}

.ce-sync-visual.is-failed .ce-sync-rail {
  background: linear-gradient(90deg, rgba(39, 139, 58, 0.6), rgba(225, 80, 72, 0.72));
}

.ce-sync-cache-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #cbd5e1;
}

.ce-sync-visual.is-cache .ce-sync-cache-dot {
  background: #f0a529;
}

.ce-sync-visual.is-base .ce-sync-cache-dot,
.ce-sync-visual.is-loading .ce-sync-cache-dot {
  background: #3f91df;
}

.ce-sync-visual.is-synced .ce-sync-cache-dot {
  background: #278b3a;
}

.ce-sync-visual.is-failed .ce-sync-cache-dot {
  background: #d4423b;
}

.ce-sync-visual-fade-enter-active,
.ce-sync-visual-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.ce-sync-visual-fade-enter-from,
.ce-sync-visual-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes ce-sync-pulse {
  0%, 100% {
    box-shadow: 0 0 0 4px rgba(63, 145, 56, 0.08);
  }
  50% {
    box-shadow: 0 0 0 7px rgba(63, 145, 56, 0.15);
  }
}

.ce-source-unavailable {
  position: relative;
  z-index: 5;
  display: flex;
  width: 100%;
  min-height: clamp(390px, 52vh, 560px);
  height: auto;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(198, 221, 204, 0.92);
  border-radius: 30px;
  background:
    radial-gradient(
      circle at 17% 18%,
      rgba(112, 180, 73, 0.17),
      transparent 13rem
    ),
    radial-gradient(
      circle at 86% 12%,
      rgba(0, 126, 148, 0.12),
      transparent 13rem
    ),
    linear-gradient(
      145deg,
      rgba(255, 255, 255, 0.98),
      rgba(247, 252, 248, 0.96)
    );
  margin: 0;
  padding: 38px 30px;
  text-align: center;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 22px 55px rgba(22, 64, 46, 0.08);
}

.ce-source-unavailable::before {
  content: "";
  position: absolute;
  z-index: 0;
  width: 292px;
  height: 292px;
  right: -124px;
  bottom: -130px;
  border: 36px solid rgba(47, 125, 56, 0.06);
  border-radius: 999px;
}

.ce-source-visual {
  position: relative;
  z-index: 1;
  width: min(86%, 390px);
  margin: -10px auto 4px;
}

.ce-source-visual img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 22px 32px rgba(27, 99, 85, 0.12));
}

.ce-source-eyebrow {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(47, 125, 56, 0.14);
  border-radius: 999px;
  background: rgba(235, 248, 236, 0.82);
  padding: 7px 12px;
  color: #2f7d38;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ce-source-unavailable h3 {
  position: relative;
  z-index: 1;
  max-width: 610px;
  margin: 16px auto 10px;
  color: #16213b;
  font-size: clamp(1.3rem, 2.1vw, 1.82rem);
  font-weight: 950;
  letter-spacing: -0.04em;
}

.ce-source-unavailable p {
  position: relative;
  z-index: 1;
  max-width: 640px;
  margin: 0 auto;
  color: #64748b;
  font-size: 0.99rem;
  font-weight: 650;
  line-height: 1.65;
}

.ce-source-hints {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 22px;
}

.ce-source-hints span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(204, 216, 226, 0.9);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  padding: 8px 12px;
  color: #475569;
  font-size: 0.82rem;
  font-weight: 800;
}

.ce-source-retry {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 24px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, #2f8f46, #52b343);
  padding: 12px 18px;
  color: white;
  font-size: 0.9rem;
  font-weight: 900;
  box-shadow: 0 18px 30px rgba(45, 142, 66, 0.22);
  cursor: pointer;
}

.ce-source-retry:hover {
  transform: translateY(-1px);
}

@media (max-width: 980px) {
  .ce-workspace,
  .ce-workspace.has-detail,
  .ce-workspace.has-empty-detail {
    display: flex;
    flex-direction: column;
    height: auto;
  }
  .ce-list-card,
  .ce-detail-panel {
    height: 660px;
  }
  .ce-empty-review div,
  .ce-empty-flow ol {
    grid-template-columns: 1fr;
  }
  .ce-empty-flow li:not(:last-child)::after {
    display: none;
  }
  .ce-detail-header {
    grid-template-columns: minmax(0, 1fr) 34px;
  }
  .ce-access-header-card,
  .ce-progress-cluster {
    grid-column: 1 / -1;
  }
  .ce-profile-card,
  .ce-data-section,
  .ce-husky-card,
  .ce-edit-form {
    grid-template-columns: 1fr;
  }
  .ce-missing-grid,
  .ce-form-grid.three,
  .ce-form-card:not(.ce-contact-card) .ce-form-grid.three {
    grid-template-columns: 1fr;
  }
  .ce-detail-tabs {
    gap: 14px;
    overflow-x: auto;
  }
}
</style>
