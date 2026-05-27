<template>
  <div ref="controlScreenRef" class="students-screen control-escolar-screen" :style="controlScreenStyle">
    <header class="students-hero ce-hero">
      <div class="ce-hero-spacer">
        <Transition name="ce-sync-trace-fade">
          <ControlSyncTrace
            v-if="showControlSyncVisual"
            :cache-stage="controlCacheStage"
            :base-stage="controlBaseStage"
            :external-stage="controlExternalDbStage"
            :complete-stage="controlCompleteStage"
            :freshness="controlDataFreshness"
            :cache-title="controlCacheStepTitle"
            :base-title="controlBaseStepTitle"
            :external-title="controlExternalDbStepTitle"
            :complete-title="controlCompleteStepTitle"
            :external-rows="controlExternalDbRows"
            :aria-label="controlSyncAriaLabel"
          />
        </Transition>
      </div>
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

    <div
      v-if="showControlDiagnosticsModal"
      class="ce-modal-backdrop ce-diagnostics-backdrop"
      @click.self="closeControlDiagnosticsModal"
    >
      <section
        class="ce-diagnostics-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ce-diagnostics-title"
      >
        <header>
          <div>
            <small>Diagnóstico oculto</small>
            <h2 id="ce-diagnostics-title">Flujo de carga Control Escolar</h2>
          </div>
          <button type="button" class="detail-shell-close" @click="closeControlDiagnosticsModal">
            <LucideX :size="20" />
          </button>
        </header>
        <div v-if="lastControlLoadDiagnostics" class="ce-diagnostics-body">
          <div class="ce-diagnostics-summary">
            <span><b>Estado</b>{{ lastControlLoadDiagnostics.status }}</span>
            <span><b>Total cliente</b>{{ formatControlDuration(lastControlLoadDiagnostics.totalMs) }}</span>
            <span><b>Flujo servidor</b>{{ lastControlLoadDiagnostics.server.flow }}</span>
            <span><b>Cache</b>{{ lastControlLoadDiagnostics.source.cacheFreshness || 'n/a' }}</span>
          </div>
          <section>
            <h3>Cliente</h3>
            <dl>
              <div v-for="step in lastControlLoadDiagnostics.clientSteps" :key="`client-${step.key}`">
                <dt>{{ step.label }}</dt>
                <dd>{{ step.status }} · {{ formatControlDuration(step.ms) }}<span v-if="step.rows != null"> · {{ step.rows }} filas</span></dd>
              </div>
            </dl>
          </section>
          <section>
            <h3>Servidor</h3>
            <dl>
              <div v-for="step in lastControlLoadDiagnostics.server.steps" :key="`server-${step.key}`">
                <dt>{{ step.label }}</dt>
                <dd>{{ step.status }} · {{ formatControlDuration(step.ms) }}<span v-if="step.rows != null"> · {{ step.rows }} filas</span><span v-if="step.freshness"> · {{ step.freshness }}</span></dd>
              </div>
            </dl>
          </section>
          <section>
            <h3>Fuente</h3>
            <p>Base: {{ lastControlLoadDiagnostics.source.base || 'n/a' }}</p>
            <p>Overlay: {{ lastControlLoadDiagnostics.source.overlay || 'n/a' }}</p>
            <p>Rows: base {{ lastControlLoadDiagnostics.source.localRows }}, matricula {{ lastControlLoadDiagnostics.source.overlayRows }}, usuarios {{ lastControlLoadDiagnostics.source.usersRows }}</p>
          </section>
        </div>
        <div v-else class="ce-diagnostics-empty">
          Aún no hay una carga registrada para este plantel.
        </div>
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
const CONTROL_STUDENTS_CACHE_VERSION = 2;
const CONTROL_STUDENTS_CACHE_READ_VERSIONS = [
  CONTROL_STUDENTS_CACHE_VERSION,
  1,
];
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
const controlCacheStage = ref("idle");
const controlBaseStage = ref("idle");
const controlExternalDbStage = ref("idle");
const controlCompleteStage = ref("idle");
const controlDataFreshness = ref("empty");
const controlDataSavedAt = ref("");
const controlDataSource = ref(null);
const controlExternalDbRows = ref(0);
const showControlDiagnosticsModal = ref(false);
const lastControlLoadDiagnostics = ref(null);

const CONTROL_SCREEN_DESIGN_WIDTH = 1520;
const CONTROL_SCREEN_DESIGN_HEIGHT = 820;
const CONTROL_SCREEN_MIN_SCALE = 0.72;

const controlScreenRef = ref(null);
const controlScreenScale = ref(1);
const studentsScaleShell = ref(null);
let controlScreenResizeObserver = null;
let controlScreenFrame = null;

const controlScreenStyle = computed(() => ({
  "--ce-screen-scale": controlScreenScale.value,
}));
const studentsScaleShellStyle = computed(() => ({}));
const studentsDesignCanvasStyle = computed(() => ({}));

const updateControlScreenScale = () => {
  if (!process.client) return;
  const host = controlScreenRef.value?.parentElement;
  const rect = host?.getBoundingClientRect?.();
  const availableWidth = Math.max(900, rect?.width || window.innerWidth || CONTROL_SCREEN_DESIGN_WIDTH);
  const availableHeight = Math.max(560, rect?.height || window.innerHeight || CONTROL_SCREEN_DESIGN_HEIGHT);
  const widthScale = availableWidth / CONTROL_SCREEN_DESIGN_WIDTH;
  const heightScale = availableHeight / CONTROL_SCREEN_DESIGN_HEIGHT;
  const nextScale = Math.min(1, Math.max(CONTROL_SCREEN_MIN_SCALE, Math.min(widthScale, heightScale)));
  controlScreenScale.value = Number(nextScale.toFixed(4));
};

const scheduleControlScreenScaleUpdate = () =>
  nextTick(() => {
    if (!process.client) return;
    if (controlScreenFrame) window.cancelAnimationFrame(controlScreenFrame);
    controlScreenFrame = window.requestAnimationFrame(updateControlScreenScale);
  });

const scheduleWorkspaceScaleUpdate = scheduleControlScreenScaleUpdate;
const controlSyncBusy = computed(
  () =>
    controlBaseStage.value === "loading" ||
    controlExternalDbStage.value === "loading" ||
    controlCompleteStage.value === "loading",
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

const getControlExternalDbRowCount = (source = {}) =>
  Number(
    source.externalRows ??
      source.enrichedRows ??
      source.centralRows ??
      source.overlayRows ??
      source.matriculaRows ??
      0,
  ) || 0;

const controlNow = () =>
  typeof performance !== "undefined" && performance?.now
    ? performance.now()
    : Date.now();

const formatControlDuration = (ms) => {
  const value = Number(ms || 0);
  if (!Number.isFinite(value)) return "0 ms";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} s`;
};

const normalizeControlDiagnostics = ({
  query = {},
  cached = null,
  response = null,
  clientSteps = [],
  startedAt = Date.now(),
  totalMs = 0,
  status = "ready",
} = {}) => {
  const source = response?.source || {};
  const server = source.diagnostics || {};
  const serverSteps = Array.isArray(server.steps) ? server.steps : [];
  return {
    capturedAt: new Date().toISOString(),
    status,
    agentId: selectedAgentId.value,
    ciclo: currentCicloKey.value,
    query: { ...query },
    localCacheUsed: Boolean(cached),
    localCacheRows: Array.isArray(cached?.data) ? cached.data.length : 0,
    totalMs: Math.max(0, Math.round(Number(totalMs || 0))),
    clientSteps,
    server: {
      flow: server.flow || source.phase || "unknown",
      phase: server.phase || source.phase || "enriched",
      totalMs: Number(server.totalMs || 0),
      steps: serverSteps,
    },
    source: {
      base: source.base || "",
      overlay: source.overlay || "",
      cacheFreshness: source.cacheFreshness || "",
      cacheRefreshedAt: source.cacheRefreshedAt || "",
      cacheExpiresAt: source.cacheExpiresAt || "",
      localRows: Number(source.localRows || 0),
      overlayRows: Number(source.overlayRows || 0),
      enrichedRows: Number(source.enrichedRows || 0),
      usersRows: Number(source.usersRows || 0),
    },
  };
};

const openControlDiagnosticsModal = () => {
  showControlDiagnosticsModal.value = true;
};
const closeControlDiagnosticsModal = () => {
  showControlDiagnosticsModal.value = false;
};

const showControlSyncVisual = computed(() =>
  Boolean(
    selectedAgentId.value &&
    !studentsSourceUnavailable.value &&
    (controlDataFreshness.value !== "empty" ||
      controlCacheStage.value !== "idle" ||
      controlBaseStage.value !== "idle" ||
      controlExternalDbStage.value !== "idle" ||
      controlCompleteStage.value !== "idle"),
  ),
);
const controlDataFreshnessLabel = computed(() => {
  const time = formatControlSyncTime(controlDataSavedAt.value);
  if (controlDataFreshness.value === "cache")
    return time ? `Caché · ${time}` : "Caché local";
  if (controlDataFreshness.value === "base") return "Base del administrador";
  if (controlDataFreshness.value === "synced")
    return time ? `Sync · ${time}` : "Sincronizado";
  if (controlCacheStage.value === "ready") return "Caché local";
  if (controlBaseStage.value === "loading") return "Conectando";
  if (controlExternalDbStage.value === "loading") return "Base externa";
  return "Sin datos";
});
const controlCacheStepTitle = computed(() =>
  controlCacheStage.value === "ready"
    ? controlDataSavedAt.value
      ? `Caché local cargada · ${formatControlSyncTime(controlDataSavedAt.value)}`
      : "Caché local cargada"
    : "Caché local pendiente para este plantel y ciclo",
);
const controlBaseStepTitle = computed(() =>
  controlBaseStage.value === "loading"
    ? "Conectando con base del administrador"
    : controlBaseStage.value === "ready"
      ? "Base del administrador lista"
      : controlBaseStage.value === "failed"
        ? "Base del administrador pendiente"
        : "Base del administrador pendiente",
);
const controlExternalDbStepTitle = computed(() =>
  controlExternalDbStage.value === "loading"
    ? "Consultando base externa de matrícula"
    : controlExternalDbStage.value === "ready"
      ? "Base externa de matrícula lista"
      : controlExternalDbStage.value === "empty"
        ? "Base externa consultada sin filas"
        : controlExternalDbStage.value === "failed"
          ? "Base externa pendiente"
          : "Base externa pendiente",
);
const controlCompleteStepTitle = computed(() =>
  controlCompleteStage.value === "loading"
    ? "Sincronización en proceso"
    : controlCompleteStage.value === "ready"
      ? "Proceso terminado"
      : controlCompleteStage.value === "failed"
        ? "Proceso terminado con pendientes"
        : "Proceso pendiente",
);
const controlSyncAriaLabel = computed(() =>
  [
    controlCacheStepTitle.value,
    controlBaseStepTitle.value,
    controlExternalDbStepTitle.value,
    controlCompleteStepTitle.value,
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

const controlCacheScopeFromQuery = (query = buildQuery()) => ({
  agentId: String(query?.agentId || selectedAgentId.value || "").trim(),
  ciclo: normalizeCicloKey(query?.ciclo || currentCicloKey.value || ""),
});

const controlStudentsCacheSignature = (query = buildQuery()) =>
  encodeURIComponent(JSON.stringify(normalizeControlCacheParams(query)));

const controlStudentsLegacyCacheKey = (
  query = buildQuery(),
  version = CONTROL_STUDENTS_CACHE_VERSION,
) =>
  `${CONTROL_STUDENTS_CACHE_NAMESPACE}:v${version}:${controlStudentsCacheSignature(query)}`;

const controlStudentsCacheKey = (
  query = buildQuery(),
  version = CONTROL_STUDENTS_CACHE_VERSION,
) => {
  const scope = controlCacheScopeFromQuery(query);
  return `${CONTROL_STUDENTS_CACHE_NAMESPACE}:v${version}:${encodeURIComponent(scope.agentId)}:${encodeURIComponent(scope.ciclo)}:${controlStudentsCacheSignature(query)}`;
};

const controlStudentsCacheLookupKeys = (query = buildQuery()) =>
  CONTROL_STUDENTS_CACHE_READ_VERSIONS.flatMap((version) => [
    controlStudentsCacheKey(query, version),
    controlStudentsLegacyCacheKey(query, version),
  ]);

const isCachedControlStudentsForScope = (cached, query = buildQuery()) => {
  const scope = controlCacheScopeFromQuery(query);
  const cachedScope = cached?.scope || cached?.query || {};
  return (
    String(cachedScope.agentId || "").trim() === scope.agentId &&
    normalizeCicloKey(cachedScope.ciclo || "") === scope.ciclo
  );
};

const isControlPhotoCacheKey = (key = "") => {
  const normalized = String(key).toLowerCase();
  return (
    normalized === "foto" ||
    normalized.includes("photo") ||
    normalized.includes("foto") ||
    normalized.includes("image") ||
    normalized.includes("avatar") ||
    normalized.includes("picture") ||
    normalized.includes("thumbnail") ||
    normalized.includes("portrait")
  );
};

const sanitizeControlStudentForCache = (student = {}) => {
  if (!student || typeof student !== "object") return student;

  return Object.entries(student).reduce((sanitized, [key, value]) => {
    if (isControlPhotoCacheKey(key)) return sanitized;
    sanitized[key] = value;
    return sanitized;
  }, {});
};

const sanitizeControlStudentsForCache = (data = []) =>
  Array.isArray(data) ? data.map(sanitizeControlStudentForCache) : [];

const normalizeCachedControlStudentsRecord = (cached = {}, query = buildQuery()) => {
  const sanitizedData = sanitizeControlStudentsForCache(cached.data);

  return {
    ...cached,
    version: CONTROL_STUDENTS_CACHE_VERSION,
    scope: cached.scope || controlCacheScopeFromQuery(query),
    query: cached.query || normalizeControlCacheParams(query),
    data: sanitizedData,
  };
};

const readCachedControlStudents = (query = buildQuery()) => {
  if (!process.client) return null;

  try {
    const keys = controlStudentsCacheLookupKeys(query);
    for (const key of keys) {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (!cached) continue;
      if (!CONTROL_STUDENTS_CACHE_READ_VERSIONS.includes(Number(cached?.version)))
        continue;
      if (!Array.isArray(cached?.data)) continue;
      if (!isCachedControlStudentsForScope(cached, query)) continue;
      return normalizeCachedControlStudentsRecord(cached, query);
    }
    return null;
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo leer la caché local de alumnos.",
      error,
    );
    return null;
  }
};

const buildControlCacheMetadata = (metadata = {}, response = {}) => {
  const savedAt = metadata.savedAt || new Date().toISOString();
  const source = response?.source || {};
  return {
    savedAt,
    stage: metadata.stage || source.phase || "unknown",
    freshness: metadata.freshness || "base",
    steps: {
      cache: metadata.cacheStage || controlCacheStage.value,
      base: metadata.baseStage || controlBaseStage.value,
      external: metadata.externalStage || controlExternalDbStage.value,
      complete: metadata.completeStage || controlCompleteStage.value,
    },
    externalRows: Number(
      metadata.externalRows ??
        getControlExternalDbRowCount(source) ??
        controlExternalDbRows.value ??
        0,
    ),
  };
};

const writeCachedControlStudents = (
  query = buildQuery(),
  response = {},
  metadata = {},
) => {
  if (!process.client || !Array.isArray(response?.data)) return false;

  const cache = buildControlCacheMetadata(metadata, response);
  const record = {
    version: CONTROL_STUDENTS_CACHE_VERSION,
    savedAt: cache.savedAt,
    scope: controlCacheScopeFromQuery(query),
    query: normalizeControlCacheParams(query),
    data: sanitizeControlStudentsForCache(response.data),
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
    source: {
      ...(response.source || {}),
      cache,
      cacheSavedAt: cache.savedAt,
      cacheFreshness: cache.freshness,
      cacheStage: cache.stage,
      cacheExternalRows: cache.externalRows,
    },
    cache,
  };

  try {
    localStorage.setItem(controlStudentsCacheKey(query), JSON.stringify(record));
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
  controlCacheStage.value = "idle";
  controlBaseStage.value = "idle";
  controlExternalDbStage.value = "idle";
  controlCompleteStage.value = "idle";
  controlDataFreshness.value = "empty";
  controlDataSavedAt.value = "";
  controlDataSource.value = null;
  controlExternalDbRows.value = 0;
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

const persistCurrentControlStudentsCache = (metadata = {}) =>
  writeCachedControlStudents(
    buildIndexQuery(),
    {
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
    },
    metadata,
  );

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
  const hadStudents =
    controlStudentsIndex.value.length > 0 || students.value.length > 0;
  const startedAt = controlNow();
  const clientSteps = [];
  const markClientStep = (key, label, stepStartedAt, status = "ready", details = {}) => {
    clientSteps.push({
      key,
      label,
      status,
      ms: Math.max(0, Math.round(controlNow() - stepStartedAt)),
      ...details,
    });
  };

  controlCacheStage.value = useCache ? "loading" : "empty";
  controlBaseStage.value = "idle";
  controlExternalDbStage.value = "idle";
  controlCompleteStage.value = "idle";
  controlExternalDbRows.value = 0;

  const cacheStartedAt = controlNow();
  const cached = useCache ? readCachedControlStudents(query) : null;
  markClientStep(
    "browser-cache",
    "Leer cache del navegador",
    cacheStartedAt,
    cached ? "ready" : "empty",
    { rows: Array.isArray(cached?.data) ? cached.data.length : 0 },
  );

  if (cached) {
    pagination.page = 1;
    applyControlStudentsPayload(cached);
    loadError.value = "";
    studentsLoading.value = false;
    controlDataFreshness.value = "cache";
    controlDataSavedAt.value = cached.savedAt || "";
    controlDataSource.value = cached.source || null;
    controlCacheStage.value = "ready";
    controlExternalDbRows.value = getControlExternalDbRowCount(cached.source || {});
  } else {
    controlCacheStage.value = "empty";
    if (clearExisting && !hadStudents) resetControlStudentsView();
    studentsLoading.value = forceLoading || !hadStudents;
    controlDataFreshness.value =
      hadStudents ? controlDataFreshness.value : "empty";
    controlDataSavedAt.value = "";
    if (!hadStudents) controlExternalDbRows.value = 0;
  }

  const canKeepVisibleData = () =>
    Boolean(cached) ||
    (!clearExisting && hadStudents) ||
    controlStudentsIndex.value.length > 0 ||
    students.value.length > 0;

  try {
    controlBaseStage.value = "loading";
    controlExternalDbStage.value = "loading";
    controlCompleteStage.value = "loading";
    const requestStartedAt = controlNow();
    const response = await $fetch("/api/control-escolar/students", {
      query: { ...query, phase: "enriched" },
    });
    markClientStep(
      "server-enriched",
      "Base como selector + matricula enriquecida",
      requestStartedAt,
      "ready",
      { rows: Array.isArray(response?.data) ? response.data.length : 0 },
    );
    if (requestId !== controlStudentsRequestId) return;

    pagination.page = 1;
    applyControlStudentsPayload(response);
    loadError.value = "";
    controlBaseStage.value = "ready";
    const responseSource = response?.source || {};
    const externalDbRows = getControlExternalDbRowCount(responseSource);
    controlExternalDbRows.value = externalDbRows;
    controlExternalDbStage.value = externalDbRows > 0 ? "ready" : "empty";
    controlDataFreshness.value = externalDbRows > 0 ? "synced" : "base";
    controlDataSavedAt.value = new Date().toISOString();
    controlDataSource.value = responseSource || controlDataSource.value;
    controlCompleteStage.value = "ready";
    persistCurrentControlStudentsCache({
      stage: "complete",
      freshness: controlDataFreshness.value,
      cacheStage: controlCacheStage.value,
      baseStage: "ready",
      externalStage: controlExternalDbStage.value,
      completeStage: "ready",
      externalRows: externalDbRows,
      savedAt: controlDataSavedAt.value,
    });
    lastControlLoadDiagnostics.value = normalizeControlDiagnostics({
      query,
      cached,
      response,
      clientSteps,
      startedAt,
      totalMs: controlNow() - startedAt,
      status: "ready",
    });
  } catch (error) {
    markClientStep(
      "server-enriched",
      "Base como selector + matricula enriquecida",
      startedAt,
      "failed",
      { error: error?.data?.message || error?.message || String(error || "") },
    );
    if (requestId !== controlStudentsRequestId) return;
    controlBaseStage.value = canKeepVisibleData() ? "partial" : "failed";
    controlExternalDbStage.value = "failed";
    controlCompleteStage.value = "failed";
    lastControlLoadDiagnostics.value = normalizeControlDiagnostics({
      query,
      cached,
      response: null,
      clientSteps,
      startedAt,
      totalMs: controlNow() - startedAt,
      status: "failed",
    });

    if (!canKeepVisibleData()) {
      resetControlStudentsView();
      controlCacheStage.value = cached ? "ready" : "empty";
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
  await refreshAll({ clearExisting: false, forceLoading: !students.value.length });
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
  scheduleControlScreenScaleUpdate();
  if (process.client) {
    localHour.value = new Date().getHours();
    window.addEventListener("ingresos:ciclo-changed", handleCicloChanged);
    window.addEventListener("control-escolar:open-sync-diagnostics", openControlDiagnosticsModal);
    window.addEventListener("resize", scheduleControlScreenScaleUpdate, { passive: true });
    const controlScreenHost = controlScreenRef.value?.parentElement;
    if (typeof ResizeObserver !== "undefined" && controlScreenHost) {
      controlScreenResizeObserver = new ResizeObserver(scheduleControlScreenScaleUpdate);
      controlScreenResizeObserver.observe(controlScreenHost);
    }
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
  if (process.client) {
    window.removeEventListener("ingresos:ciclo-changed", handleCicloChanged);
    window.removeEventListener("control-escolar:open-sync-diagnostics", openControlDiagnosticsModal);
    window.removeEventListener("resize", scheduleControlScreenScaleUpdate);
    if (controlScreenFrame) window.cancelAnimationFrame(controlScreenFrame);
  }
  controlScreenResizeObserver?.disconnect?.();
});
</script>

<style scoped>
.control-escolar-screen {
  --ce-screen-scale: 1;
  width: calc(100% / var(--ce-screen-scale));
  height: calc(100% / var(--ce-screen-scale));
  min-width: 0;
  min-height: 0;
  flex: 0 0 auto;
  gap: 0;
  transform: scale(var(--ce-screen-scale));
  transform-origin: top left;
  will-change: transform;
}

.control-escolar-screen .students-design-canvas {
  width: 100%;
  height: 100%;
  transform: none;
}

.control-escolar-screen .students-scale-shell {
  min-height: 0;
}

.ce-hero {
  min-height: 34px;
  margin-bottom: 6px;
  align-items: center;
  justify-content: flex-end;
}

.ce-hero-spacer {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
}

.ce-hero-title h1 {
  margin: 0;
  color: #10203a;
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.035em;
}



.ce-hero-actions {
  align-items: stretch;
  flex-wrap: nowrap;
  justify-content: flex-end;
}

.ce-selected-plantel {
  display: flex;
  min-width: 126px;
  flex-direction: column;
  justify-content: center;
  padding: 6px 14px;
  border: 1px solid rgba(63, 145, 56, 0.18);
  border-radius: 13px;
  background: linear-gradient(180deg, #fff, #f7fbf5);
  box-shadow: 0 8px 18px rgba(21, 35, 60, 0.04);
}

.ce-selected-plantel span {
  color: #6b758f;
  font-size: 9.5px;
  font-weight: 880;
  letter-spacing: 0.045em;
  line-height: 1.1;
  text-transform: uppercase;
}

.ce-selected-plantel strong {
  color: #1d912d;
  font-size: 20px;
  font-weight: 900;
  line-height: 1;
}

.ce-selected-plantel.empty strong {
  color: #7a849a;
  font-size: 13px;
}

.spinning {
  animation: ce-spin 900ms linear infinite;
}
.ce-hidden-file {
  display: none;
}

.ce-sync-trace-fade-enter-active,
.ce-sync-trace-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.ce-sync-trace-fade-enter-from,
.ce-sync-trace-fade-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
@keyframes ce-spin {
  to {
    transform: rotate(360deg);
  }
}

.ce-kpi-system {
  margin-bottom: 6px;
}

.ce-kpi-strip {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  min-height: 70px;
  border-radius: 0;
  border-inline: 0;
  box-shadow: none;
}

.ce-kpi-strip .kpi-card {
  height: 64px;
  min-height: 64px;
  padding-right: 14px;
}

.ce-kpi-strip .kpi-icon {
  width: 38px;
  height: 38px;
}

.ce-kpi-strip .kpi-text strong {
  font-size: clamp(20px, 1.7vw, 28px);
}

.ce-kpi-strip .kpi-card.active {
  background: linear-gradient(
    90deg,
    rgba(86, 171, 73, 0.13),
    rgba(255, 255, 255, 0)
  );
}

.ce-kpi-mass {
  position: absolute;
  right: 12px;
  bottom: 9px;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(10, 4px);
  gap: 3px;
  align-items: end;
  color: var(--kpi-color, #3f9138);
  pointer-events: none;
}

.ce-kpi-mass i {
  display: block;
  width: 4px;
  height: 14px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.14;
  transform-origin: bottom;
}

.ce-kpi-mass i.active {
  opacity: 0.72;
}

.ce-kpi-mass i:nth-child(2n) {
  height: 18px;
}
.ce-kpi-mass i:nth-child(3n) {
  height: 11px;
}

.ce-program-rail {
  display: none;
}

.ce-filter-bar {
  display: flex;
  min-height: 52px;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 9px;
  padding: 7px 0 9px;
  border: 0;
  border-top: 1px solid var(--students-border-soft);
  border-bottom: 1px solid var(--students-border-soft);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-gutter: stable;
}

.ce-primary-filter-row {
  display: grid;
  grid-template-columns: minmax(430px, 1fr) max-content minmax(0, 0.95fr) auto;
  align-items: center;
  gap: 9px;
  min-width: max(100%, 1120px);
}

.ce-status-tabs {
  display: inline-flex;
  min-width: max-content;
  align-items: center;
  gap: 6px;
  overflow: visible;
}

.ce-status-tab {
  display: inline-flex;
  min-height: 35px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border: 1px solid #d9e3ee;
  border-radius: 10px;
  background: #fff;
  color: #15233c;
  font-size: 11px;
  font-weight: 850;
  box-shadow: 0 5px 12px rgba(21, 35, 60, 0.035);
  cursor: pointer;
}

.ce-status-tab.active {
  border-color: #3f9138;
  background: linear-gradient(180deg, #5bbd55, #278c31);
  color: #fff;
  box-shadow: 0 10px 20px rgba(63, 145, 56, 0.22);
}

.ce-filter-bar .search-control {
  height: 39px;
  min-width: 0;
  border-radius: 13px;
  background: #fff;
}

.ce-filter-button,
.ce-clear-link {
  display: inline-flex;
  min-height: 37px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 11px;
  font-size: 11px;
  font-weight: 850;
  white-space: nowrap;
  cursor: pointer;
}

.ce-filter-button {
  width: max-content;
  min-width: 0;
  justify-self: start;
  padding: 0 14px;
  border: 1px solid #d9e3ee;
  background: #fff;
  color: #15233c;
}

.ce-filter-button.active {
  border-color: rgba(63, 145, 56, 0.28);
  background: #f4fbf2;
  color: #21882e;
}

.ce-filter-button b {
  display: inline-flex;
  min-width: 17px;
  height: 17px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #2f9138;
  color: #fff;
  font-size: 9px;
}

.ce-clear-link {
  display: inline-flex;
  border: 0;
  background: transparent;
  color: #21882e;
}

.ce-clear-link:disabled {
  color: #a8b2c2;
  cursor: not-allowed;
}

.ce-secondary-filter-row {
  display: flex;
  min-width: max(100%, 1120px);
  align-items: stretch;
  gap: 8px;
  overflow: visible;
  padding-bottom: 1px;
}

.ce-chip-cluster {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 5px 10px;
  border: 1px solid rgba(217, 227, 238, 0.9);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 6px 14px rgba(21, 35, 60, 0.035);
}

.ce-chip-cluster + .ce-chip-cluster::before {
  content: "";
  position: absolute;
  left: -5px;
  top: 7px;
  bottom: 7px;
  width: 1px;
  background: #d9e3ee;
}

.ce-chip-cluster--grade {
  border-color: rgba(63, 145, 56, 0.2);
  background: linear-gradient(
    180deg,
    rgba(246, 252, 245, 0.92),
    rgba(255, 255, 255, 0.78)
  );
}

.ce-chip-cluster--group {
  border-color: rgba(40, 116, 240, 0.18);
}

.ce-chip-label {
  color: #6f7b95;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.045em;
  text-transform: uppercase;
  white-space: nowrap;
}

.ce-secondary-filter-row :deep(.ui-chip),
.ce-secondary-filter-row :deep(button) {
  min-height: 26px;
  border-radius: 999px;
  font-size: 9.5px;
  white-space: nowrap;
}

.ce-chip-count {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  border-radius: 999px;
  background: rgba(32, 136, 45, 0.12);
  color: #20882d;
  font-size: 9px;
  font-weight: 900;
}

.ce-workspace.has-detail {
  grid-template-columns: minmax(430px, 0.52fr) minmax(820px, 1.48fr);
  gap: 12px;
}

.ce-workspace.has-empty-detail {
  grid-template-columns: minmax(760px, 1.18fr) minmax(520px, 0.82fr);
  gap: 12px;
}

.ce-list-card {
  --student-list-balance-col: clamp(124px, 8.5vw, 150px);
  --student-list-quality-col: clamp(108px, 7.5vw, 134px);
  --student-list-action-col: clamp(38px, 2.8vw, 46px);
  --student-list-row-height: clamp(76px, 5.35vw, 90px);
  --student-list-grade-size: clamp(56px, 4vw, 68px);
  --student-list-grade-height: clamp(54px, 3.85vw, 64px);
  --student-list-crest-size: clamp(28px, 2.1vw, 34px);
  grid-template-rows: 44px minmax(0, 1fr) 38px;
  border-radius: 14px;
  background: #fff;
}

.ce-list-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 18px;
  border-bottom: 1px solid var(--students-border-soft);
}

.ce-list-titlebar h2 {
  margin: 0;
  color: #15233c;
  font-size: 15px;
  font-weight: 880;
  letter-spacing: -0.025em;
}

.ce-list-titlebar h2 span {
  color: #20922d;
}
.ce-list-titlebar p {
  display: none;
}

.ce-pagination-mini {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #6f7b95;
  font-size: 11px;
  font-weight: 800;
}

.ce-pagination-mini button {
  display: inline-flex;
  width: 29px;
  height: 29px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--students-border);
  border-radius: 10px;
  background: #fff;
  color: #5d687f;
}

.ce-pagination-mini button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.ce-list-columns {
  display: none;
}

.ce-list-scroll.is-source-unavailable {
  position: relative;
  display: flex;
  min-height: 0;
  overflow: visible;
  padding: clamp(12px, 1.1vw, 18px);
  background: #fff;
  isolation: isolate;
}

.ce-list-scroll.is-source-unavailable::before,
.ce-list-scroll.is-source-unavailable::after {
  display: none;
}

.ce-list-scroll {
  min-height: 0;
  overflow-y: auto;
  padding: 8px 7px 0 11px;
}

.ce-student-row {
  width: calc(100% - 7px);
  box-sizing: border-box;
  grid-template-columns:
    minmax(0, 1fr) var(--student-list-balance-col) var(
      --student-list-quality-col
    )
    var(--student-list-action-col);
  min-height: var(--student-list-row-height);
  margin: 0 7px 7px 0;
  padding-left: 12px;
  border-radius: 14px;
}

.ce-workspace.has-detail .ce-list-card {
  grid-template-rows: 44px minmax(0, 1fr);
}

.ce-workspace.has-empty-detail .ce-list-card {
  --student-list-balance-col: 58px;
  --student-list-quality-col: 236px;
  --student-list-action-col: 42px;
  --student-list-row-height: 88px;
  --student-list-grade-size: 58px;
  --student-list-grade-height: 62px;
  --student-list-crest-size: 36px;
}

.ce-workspace.has-empty-detail .ce-student-row {
  grid-template-columns:
    minmax(0, 1fr) var(--student-list-balance-col) var(
      --student-list-quality-col
    )
    var(--student-list-action-col);
  align-items: center;
  padding-right: 7px;
}

.ce-workspace.has-detail .ce-student-row {
  --student-list-row-height: 88px;
  --student-list-grade-size: 60px;
  --student-list-grade-height: 64px;
  --student-list-crest-size: 35px;
  grid-template-columns: minmax(0, 1fr) var(--student-list-action-col);
}

.ce-workspace.has-detail .ce-quality-score,
.ce-workspace.has-detail .ce-quality-cell {
  display: none;
}

.ce-student-row.missing-overlay {
  border-style: dashed;
}

.ce-student-identity {
  grid-template-columns:
    26px var(--student-list-grade-size) var(--student-list-crest-size)
    minmax(0, 1fr);
  gap: 8px;
}

.ce-student-identity.no-group-icon {
  grid-template-columns: 26px var(--student-list-grade-size) minmax(0, 1fr);
}

.ce-student-row .student-copy {
  width: 100%;
  max-width: 100%;
}

.ce-student-row .student-copy strong {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow-wrap: normal;
  word-break: normal;
}

.ce-row-check {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 1px solid #cfdbea;
  border-radius: 7px;
  background: #fff;
  color: transparent;
  font-size: 14px;
  font-weight: 900;
  box-shadow: none;
}

.ce-row-check.active {
  border-color: transparent;
  background: #67af5a;
  color: #fff;
  box-shadow: 0 8px 16px rgba(63, 145, 56, 0.18);
}

.ce-quality-score {
  --score-color: #2f9c3b;
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: 52px;
  height: 52px;
  align-items: center;
  justify-content: center;
  justify-self: center;
  border-radius: 999px;
  background: conic-gradient(
    var(--score-color) var(--quality-score),
    #edf1f5 0deg
  );
  box-shadow:
    0 8px 18px rgba(21, 35, 60, 0.08),
    inset 0 0 0 1px rgba(255, 255, 255, 0.72);
}

.ce-quality-score::after {
  content: "";
  position: absolute;
  inset: 6px;
  border-radius: inherit;
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(215, 225, 235, 0.7);
}

.ce-quality-score b {
  position: relative;
  z-index: 1;
  color: #15233c;
  font-size: 11px;
  font-weight: 920;
  letter-spacing: -0.025em;
}

.ce-quality-score.warning {
  --score-color: #f39a18;
}
.ce-quality-score.danger {
  --score-color: #e34a43;
}

.ce-profile-cell,
.ce-quality-cell {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding-right: 8px;
}

.ce-profile-cell strong,
.ce-quality-cell strong {
  max-width: 100%;
  overflow: hidden;
  color: #15233c;
  font-size: 12px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-profile-cell small,
.ce-quality-cell small {
  max-width: 100%;
  overflow: hidden;
  color: #71809a;
  font-size: 10px;
  font-weight: 680;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-quality-cell strong {
  color: #1f8a2c;
  font-size: 11px;
  font-weight: 900;
}

.ce-quality-score.warning + .ce-quality-cell strong {
  color: #e28a11;
}

.ce-quality-score.danger + .ce-quality-cell strong {
  color: #d7423b;
}

.ce-quality-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, max-content));
  gap: 5px 9px;
  max-width: 100%;
}

.ce-quality-fields small {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  overflow: visible;
  color: #2b8740;
  font-size: 9px;
  font-weight: 760;
  line-height: 1;
  text-overflow: clip;
  white-space: nowrap;
}

.ce-quality-fields small svg {
  flex: 0 0 auto;
  color: currentColor;
  stroke-width: 2.8;
}

.ce-quality-fields small.missing {
  color: #e24740;
}

.ce-status-pill {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 880;
}

.ce-status-pill.success {
  background: #eef8eb;
  color: #21882e;
}
.ce-status-pill.danger {
  background: #fff0ee;
  color: #c8423b;
}
.ce-status-pill.neutral {
  background: #f2f5f8;
  color: #657083;
}
.ce-status-pill.large {
  min-height: 28px;
  padding-inline: 12px;
}

.ce-row-action {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--students-border);
  border-radius: 12px;
  background: #fff;
  color: #71809a;
  box-shadow: 0 8px 16px rgba(21, 35, 60, 0.06);
}

.ce-state-card {
  flex-direction: column;
  text-align: center;
}

.ce-state-card.error {
  color: #c8423b;
}
.ce-inline-action {
  border: 0;
  background: transparent;
  color: #2f7f32;
  font-weight: 840;
}

.ce-list-footer {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 19px;
  border-top: 1px solid var(--students-border-soft);
  color: #66758e;
  font-size: 10.5px;
  font-weight: 680;
}

.ce-list-pages {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.ce-list-pages button {
  display: inline-flex;
  min-width: 25px;
  height: 25px;
  align-items: center;
  justify-content: center;
  border: 1px solid #dce6f0;
  border-radius: 8px;
  background: #fff;
  color: #60708a;
  font-size: 10px;
  font-weight: 820;
  cursor: pointer;
}

.ce-list-pages button.active {
  border-color: #2f9138;
  background: linear-gradient(180deg, #58b951, #2f9239);
  color: #fff;
  box-shadow: 0 8px 14px rgba(63, 145, 56, 0.2);
}

.ce-list-pages button.ellipsis {
  min-width: 18px;
  border-color: transparent;
  background: transparent;
  cursor: default;
}

.ce-list-pages button:disabled:not(.ellipsis) {
  opacity: 0.5;
  cursor: not-allowed;
}

.ce-skeleton-stack {
  display: grid;
  gap: 8px;
  padding-right: 18px;
}

.ce-skeleton-row {
  height: var(--student-list-row-height);
  border-radius: 14px;
  background: linear-gradient(90deg, #f3f6f9, #fff, #f3f6f9);
  background-size: 220% 100%;
  animation: ce-loading 1.4s linear infinite;
}

@keyframes ce-loading {
  to {
    background-position: -220% 0;
  }
}

.ce-detail-panel {
  display: flex;
  min-height: 0;
}

.ce-detail-shell {
  display: flex;
  width: 100%;
  min-height: 0;
  max-height: 100%;
  flex-direction: column;
  border: 1px solid var(--students-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(21, 35, 60, 0.04);
  overflow: hidden;
}

.ce-detail-header {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(220px, 0.7fr) 230px auto 34px;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--students-border-soft);
  background: linear-gradient(180deg, #fff, #fbfdfb);
}

.ce-detail-title {
  min-width: 0;
}

.ce-detail-title small {
  color: #6f7b95;
  font-size: 10.5px;
  font-weight: 850;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ce-title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.ce-title-row h2 {
  margin: 0;
  overflow: hidden;
  color: #10203a;
  font-size: 19px;
  font-weight: 900;
  letter-spacing: -0.035em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-husky-header-card {
  display: grid;
  min-width: 0;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(63, 145, 56, 0.14);
  border-radius: 14px;
  background: linear-gradient(110deg, #ffffff 0%, #f5fbf2 100%);
  box-shadow: 0 8px 18px rgba(21, 35, 60, 0.045);
}

.ce-husky-header-card.unavailable {
  border-color: rgba(129, 142, 162, 0.18);
  background: #fbfcfd;
}

.ce-husky-header-card img {
  display: block;
  width: 72px;
  max-height: 42px;
  object-fit: contain;
}

.ce-husky-header-card div {
  min-width: 0;
}

.ce-husky-header-card strong,
.ce-husky-header-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-husky-header-card strong {
  color: #1f7b2b;
  font-size: 11px;
  font-weight: 900;
}

.ce-husky-header-card.unavailable strong {
  color: #677389;
}

.ce-husky-header-card span {
  margin-top: 3px;
  color: #59687f;
  font-size: 10px;
  font-weight: 760;
}

.ce-progress-cluster {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.ce-progress-cluster strong {
  color: #5f6d84;
  font-size: 11px;
  font-weight: 850;
}

.ce-progress-track {
  display: block;
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2ece4;
}

.ce-progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2f9c3b, #91c76f);
}

.ce-progress-cluster small {
  color: #72809a;
  font-size: 10px;
  font-weight: 680;
}

.ce-detail-actions {
  display: flex;
  gap: 8px;
}

.detail-shell-close {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #10203a;
  cursor: pointer;
}

.detail-shell-close:hover {
  background: #f5f7f9;
}

.ce-detail-body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 14px 14px;
  background: #fff;
}

.ce-profile-card,
.ce-data-section,
.ce-form-card {
  border: 1px solid var(--students-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 7px 18px rgba(21, 35, 60, 0.035);
}

.ce-profile-card {
  position: relative;
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr) minmax(200px, 0.45fr);
  align-items: center;
  gap: 14px;
  min-height: 88px;
  overflow: hidden;
  padding: 10px 16px;
  background: linear-gradient(110deg, #fff 0%, #fff 68%, #f4fbf2 100%);
}

.ce-detail-photo {
  --student-grade-photo-width: 76px;
  --student-grade-photo-height: 70px;
  --student-grade-photo-radius: 13px;
}

.ce-profile-copy,
.ce-tutor-card {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.ce-profile-copy strong {
  display: block;
  overflow: hidden;
  color: #15233c;
  font-size: 18px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-profile-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 7px;
}

.ce-profile-pills span {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  padding: 0 9px;
  border-radius: 999px;
  background: #eaf7e7;
  color: #20882d;
  font-size: 10px;
  font-weight: 850;
}

.ce-profile-pills span.warning {
  background: #fff6e7;
  color: #b36a16;
}

.ce-profile-copy p {
  margin: 7px 0 0;
  color: #66758e;
  font-size: 11px;
  font-weight: 720;
}

.ce-tutor-card small {
  display: block;
  color: #6d7890;
  font-size: 11px;
  font-weight: 880;
  letter-spacing: 0.04em;
}

.ce-tutor-card strong {
  display: block;
  margin-top: 5px;
  color: #16243d;
  font-size: 12px;
  font-weight: 860;
}

.ce-tutor-card span {
  display: block;
  margin-top: 4px;
  color: #5e6c84;
  font-size: 12px;
  font-weight: 680;
}

.ce-profile-watermark {
  --group-icon-size: 118px;
  position: absolute;
  right: 34px;
  top: 50%;
  z-index: 0;
  color: #3f9138;
  opacity: 0.12;
  transform: translateY(-50%) rotate(-7deg);
}

.ce-profile-watermark.is-missing-group {
  color: #b36a16;
  opacity: 0.11;
}

.ce-data-section {
  display: grid;
  grid-template-columns: minmax(220px, 0.42fr) minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-color: rgba(63, 145, 56, 0.18);
  background: linear-gradient(90deg, #f7fcf5, #fff);
}

.ce-section-heading {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ce-section-heading.compact {
  align-items: center;
  margin-bottom: 11px;
}

.ce-section-heading > span {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #eaf7e7;
  color: #2f8f37;
}

.ce-section-heading h3 {
  margin: 0;
  color: #15233c;
  font-size: 13px;
  font-weight: 880;
}

.ce-section-heading p {
  margin: 3px 0 0;
  color: #71809a;
  font-size: 11px;
  font-weight: 620;
  line-height: 1.25;
}

.ce-missing-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
}

.ce-missing-chip {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid rgba(200, 66, 59, 0.2);
  border-radius: 13px;
  background: #fff5f3;
  color: #c8423b;
  font-size: 11px;
  font-weight: 860;
}

.ce-missing-chip b {
  font-size: 9px;
  font-weight: 900;
  opacity: 0.82;
}

.ce-missing-chip.ok {
  border-color: rgba(63, 145, 56, 0.2);
  background: #eff8eb;
  color: #21882e;
}

.ce-husky-card {
  display: grid;
  grid-template-columns: minmax(260px, 0.55fr) minmax(260px, 0.7fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(42, 126, 191, 0.16);
  border-radius: 14px;
  background: linear-gradient(90deg, #f7fbff, #fff);
  box-shadow: 0 7px 18px rgba(21, 35, 60, 0.035);
}

.ce-husky-heading {
  align-items: center;
}

.ce-husky-heading > img {
  display: block;
  width: 98px;
  max-height: 58px;
  object-fit: contain;
}

.ce-husky-credentials {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ce-husky-credentials span {
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid var(--students-border);
  border-radius: 12px;
  background: #fff;
}

.ce-husky-credentials small,
.ce-husky-actions small {
  display: block;
  color: #6f7b95;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.ce-husky-credentials strong {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: #15233c;
  font-size: 12px;
  font-weight: 860;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-husky-empty {
  padding: 10px 12px;
  border: 1px dashed #ccd8e5;
  border-radius: 12px;
  color: #6f7b95;
  font-size: 11px;
  font-weight: 720;
}

.ce-husky-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.ce-husky-actions small {
  max-width: 190px;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-detail-tabs {
  display: flex;
  min-height: 38px;
  flex: 0 0 auto;
  align-items: center;
  gap: 22px;
  overflow-x: auto;
  padding: 0 14px;
  border-bottom: 1px solid var(--students-border-soft);
  color: #60708a;
  font-size: 11px;
  font-weight: 840;
}

.ce-detail-tabs span {
  display: inline-flex;
  height: 42px;
  align-items: center;
  gap: 7px;
  border-bottom: 3px solid transparent;
}

.ce-detail-tabs .active {
  border-bottom-color: #279233;
  color: #20882d;
}

.ce-edit-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.ce-form-card {
  padding: 14px;
}

.ce-contact-card,
.ce-save-error,
.ce-detail-footer {
  grid-column: 1 / -1;
}

.ce-form-grid {
  display: grid;
  gap: 10px;
}

.ce-form-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.ce-form-card:not(.ce-contact-card):not(.ce-tab-panel) .ce-form-grid.three {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.ce-form-grid label,
.ce-wide-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.ce-form-grid span,
.ce-wide-field span {
  color: #60708a;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.ce-form-grid input,
.ce-form-grid select,
.ce-wide-field textarea {
  width: 100%;
  min-height: 36px;
  border: 1px solid #cfdbea;
  border-radius: 10px;
  background: #fbfdff;
  color: #15233c;
  font-size: 12px;
  font-weight: 650;
  outline: 0;
  padding: 0 11px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.ce-form-grid input:focus,
.ce-form-grid select:focus,
.ce-wide-field textarea:focus {
  border-color: rgba(63, 145, 56, 0.42);
  box-shadow: 0 0 0 3px rgba(63, 145, 56, 0.1);
}

.ce-wide-field {
  margin-top: 10px;
}

.ce-wide-field textarea {
  min-height: 62px;
  padding: 9px 10px;
  resize: vertical;
}

.ce-save-error {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(200, 66, 59, 0.2);
  border-radius: 12px;
  background: #fff5f3;
  color: #c8423b;
  font-size: 12px;
  font-weight: 760;
}

.ce-detail-footer {
  z-index: 8;
  display: flex;
  flex: 0 0 auto;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 18px;
  border-top: 1px solid rgba(63, 145, 56, 0.12);
  background: linear-gradient(
    90deg,
    rgba(242, 250, 238, 0.98),
    rgba(255, 255, 255, 0.98)
  );
  box-shadow: 0 -10px 24px rgba(21, 35, 60, 0.055);
}

.ce-detail-footer span {
  color: #526078;
  font-size: 11px;
  font-weight: 720;
}

.ce-detail-footer div {
  display: flex;
  gap: 8px;
}

.ce-save-state {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 860;
  white-space: nowrap;
}

.ce-save-state.clean {
  background: #eef8eb;
  color: #21882e;
}

.ce-save-state.dirty {
  background: #fff8e6;
  color: #9a640f;
}

.ce-save-state.saving {
  background: #eef5ff;
  color: #2b67a6;
}

.ce-detail-footer .ce-save-state {
  min-height: 32px;
  padding-inline: 13px;
}

.ce-detail-footer :deep(.ui-button) {
  min-height: 42px;
}

.ce-detail-tabs button {
  display: inline-flex;
  height: 38px;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  border: 0;
  border-bottom: 3px solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.ce-detail-tabs button.active {
  border-bottom-color: #279233;
  color: #20882d;
}

.ce-tab-panel,
.ce-system-panel,
.ce-contact-card,
.ce-save-error,
.ce-detail-footer {
  grid-column: 1 / -1;
}

.ce-form-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.ce-tab-panel .ce-form-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.ce-system-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.ce-system-grid article {
  min-width: 0;
  padding: 12px;
  border: 1px solid #dce6f0;
  border-radius: 12px;
  background: #fbfdff;
}

.ce-system-grid article span {
  display: block;
  color: #61708a;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.ce-system-grid article strong {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: #15233c;
  font-size: 12px;
  font-weight: 880;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-husky-card.compact {
  grid-template-columns: minmax(230px, 0.55fr) minmax(260px, 0.7fr) auto;
  box-shadow: none;
}

.ce-wide-field.standalone {
  margin-top: 0;
}

.ce-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(6px);
}

.ce-empty-detail-panel {
  min-height: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
}

.ce-empty-shell {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 22px 16px 16px;
  border: 1px solid var(--students-border);
  border-radius: 14px;
  background:
    radial-gradient(
      circle at 48% 12%,
      rgba(142, 193, 83, 0.13),
      transparent 170px
    ),
    linear-gradient(180deg, #fff 0%, #fff 58%, #fbfcfd 100%);
  box-shadow: 0 8px 20px rgba(21, 35, 60, 0.04);
}

.ce-empty-hero {
  position: relative;
  display: flex;
  width: 118px;
  height: 94px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  align-self: center;
  margin-top: 4px;
  color: #8bc884;
}

.ce-empty-hero::before {
  content: "";
  position: absolute;
  inset: 10px 17px 5px 17px;
  border: 2px solid rgba(63, 145, 56, 0.16);
  border-radius: 28px;
  background: linear-gradient(
    145deg,
    rgba(244, 252, 241, 0.94),
    rgba(255, 255, 255, 0.92)
  );
  box-shadow:
    0 18px 40px rgba(63, 145, 56, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.86);
}

.ce-empty-hero > svg {
  position: relative;
  z-index: 1;
  margin-right: 31px;
  stroke-width: 1.8;
}

.ce-empty-lines {
  position: absolute;
  z-index: 1;
  right: 28px;
  top: 39px;
  display: grid;
  gap: 12px;
  width: 34px;
}

.ce-empty-lines i {
  display: block;
  height: 4px;
  border-radius: 999px;
  background: rgba(118, 190, 104, 0.38);
}

.ce-empty-cursor {
  position: absolute;
  right: 14px;
  bottom: 15px;
  z-index: 2;
  width: 0;
  height: 0;
  border-top: 24px solid #5caf52;
  border-right: 18px solid transparent;
  filter: drop-shadow(0 8px 9px rgba(63, 145, 56, 0.2));
  transform: rotate(-13deg);
}

.ce-empty-sparkle {
  position: absolute;
  z-index: 2;
  color: #8ed17d;
  font-size: 19px;
  line-height: 1;
}

.ce-empty-sparkle.one {
  left: 13px;
  top: 18px;
}
.ce-empty-sparkle.two {
  left: 40px;
  top: 5px;
  font-size: 12px;
}

.ce-empty-copy {
  display: grid;
  gap: 6px;
  text-align: center;
}

.ce-empty-copy h2 {
  margin: 0;
  color: #10203a;
  font-size: 18px;
  font-weight: 920;
  letter-spacing: -0.035em;
}

.ce-empty-copy p {
  margin: 0;
  color: #66758e;
  font-size: 11.5px;
  font-weight: 650;
  line-height: 1.35;
}

.ce-empty-card {
  border: 1px solid #dbe5f0;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 8px 18px rgba(21, 35, 60, 0.035);
}

.ce-empty-card h3 {
  margin: 0 0 12px;
  color: #15233c;
  font-size: 12px;
  font-weight: 900;
}

.ce-empty-review {
  margin-top: 2px;
  padding: 14px 18px;
}

.ce-empty-review div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 34px;
}

.ce-empty-review span {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  color: #61708a;
  font-size: 11px;
  font-weight: 700;
}

.ce-empty-review svg {
  flex: 0 0 auto;
  color: #2d9440;
  stroke-width: 2.7;
}

.ce-empty-flow {
  padding: 14px 18px 15px;
}

.ce-empty-flow ol {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 24px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ce-empty-flow li {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 7px;
  min-width: 0;
}

.ce-empty-flow li:not(:last-child)::after {
  content: "→";
  position: absolute;
  top: 13px;
  right: -21px;
  color: rgba(63, 145, 56, 0.48);
  font-size: 23px;
  font-weight: 400;
  line-height: 1;
}

.ce-empty-flow li span {
  display: inline-flex;
  width: 45px;
  height: 45px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(63, 145, 56, 0.18);
  border-radius: 11px;
  background: linear-gradient(180deg, #f7fcf5, #fff);
  color: #2e9038;
  box-shadow: 0 8px 14px rgba(63, 145, 56, 0.08);
}

.ce-empty-flow li b {
  max-width: 86px;
  overflow: hidden;
  color: #61708a;
  font-size: 10px;
  font-weight: 760;
  line-height: 1.18;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-empty-tip {
  position: relative;
  display: flex;
  min-height: 58px;
  align-items: center;
  gap: 12px;
  margin-top: auto;
  overflow: hidden;
  padding: 0 92px 0 18px;
  border: 1px solid rgba(63, 145, 56, 0.22);
  border-radius: 14px;
  background: linear-gradient(90deg, #f4fbf1, #fff);
  color: #56677f;
  box-shadow: 0 8px 18px rgba(63, 145, 56, 0.06);
}

.ce-empty-tip > span {
  display: inline-flex;
  flex: 0 0 auto;
  color: #2f9138;
}

.ce-empty-tip p {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: 11px;
  font-weight: 660;
  line-height: 1.35;
}

.ce-empty-tip strong {
  color: #15233c;
  font-weight: 900;
}

.ce-empty-tip i {
  position: absolute;
  right: 24px;
  top: 50%;
  display: inline-flex;
  width: 56px;
  height: 56px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(63, 145, 56, 0.09);
  color: #3f9138;
  transform: translateY(-50%);
}

.ce-import-modal {
  width: min(620px, 100%);
  overflow: hidden;
  border: 1px solid #dce6f0;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 28px 70px rgba(15, 23, 42, 0.22);
}

.ce-import-modal > header,
.ce-import-modal > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
}

.ce-import-modal > header {
  border-bottom: 1px solid #e5edf5;
  background: linear-gradient(180deg, #fff, #fbfdfb);
}

.ce-import-modal > header small {
  color: #2f9138;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ce-import-modal > header h2 {
  margin: 2px 0 0;
  color: #10203a;
  font-size: 18px;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.ce-import-modal > footer {
  border-top: 1px solid #e5edf5;
  background: #f8fbf7;
}

.ce-import-body {
  display: grid;
  gap: 12px;
  padding: 16px 18px;
}

.ce-import-body p,
.ce-import-body li {
  color: #5d6b83;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.45;
}

.ce-import-body ul {
  margin: 0;
  padding-left: 18px;
}

.ce-file-drop {
  position: relative;
  display: flex;
  min-height: 82px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px dashed #b9cbe0;
  border-radius: 14px;
  background: #fbfdff;
  color: #15233c;
  font-size: 13px;
  font-weight: 820;
  cursor: pointer;
}

.ce-file-drop input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.ce-import-result {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid rgba(63, 145, 56, 0.24);
  border-radius: 13px;
  background: #f3fbf1;
  color: #1f7b2b;
  font-size: 12px;
  font-weight: 760;
}

.ce-import-result.warning {
  border-color: rgba(196, 126, 23, 0.28);
  background: #fffaf0;
  color: #9a640f;
}

.ce-import-errors {
  display: grid;
  gap: 3px;
  margin-top: 8px;
  color: #6b4b12;
}

.ce-import-errors p {
  margin: 0;
  color: inherit;
  font-size: 11px;
}

.ce-filter-bar {
  min-height: 0;
  gap: 9px;
  margin: 6px 0 10px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

.ce-primary-filter-row {
  display: grid;
  grid-template-columns: minmax(430px, 1fr) max-content minmax(0, 0.95fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 52px;
  padding: 9px 14px;
  border: 1px solid #dfe7ef;
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(21, 35, 60, 0.035);
}

.ce-secondary-filter-row {
  display: flex;
  min-width: 0;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 14px;
  border: 1px solid #dfe7ef;
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(21, 35, 60, 0.03);
}

.ce-filter-bar .search-control {
  height: 39px;
  border-color: #d9e3ee;
  border-radius: 11px;
  box-shadow: none;
}

.ce-filter-button {
  width: max-content;
  min-width: 0;
  min-height: 38px;
  justify-self: start;
  padding: 0 14px;
  border-radius: 11px;
  background: #fff;
  box-shadow: none;
}

.ce-clear-link {
  min-width: 122px;
  justify-content: flex-end;
  color: #66758e;
}

.ce-clear-link:not(:disabled) {
  color: #647087;
}

.ce-chip-cluster {
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.ce-chip-cluster + .ce-chip-cluster::before {
  display: none;
}

.ce-chip-cluster--quality {
  display: flex;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.ce-chip-cluster--quality::-webkit-scrollbar {
  display: none;
}

.ce-chip-cluster--grade {
  flex: 0 0 auto;
  margin-left: auto;
}

.ce-chip-cluster--group {
  flex: 0 0 auto;
}

.ce-secondary-filter-row :deep(.ui-chip),
.ce-secondary-filter-row :deep(button),
.ce-primary-filter-row :deep(.ui-chip),
.ce-primary-filter-row :deep(button.ui-chip) {
  min-height: 30px;
  border-color: #dbe5ef;
  background: #fff;
  box-shadow: none;
  color: #15233c;
  font-size: 10.5px;
  font-weight: 860;
}

.ce-secondary-filter-row :deep(.ui-chip.active),
.ce-primary-filter-row :deep(.ui-chip.active) {
  border-color: #2f9138;
  background: linear-gradient(180deg, #58b951, #2f9239);
  color: #fff;
  box-shadow: 0 8px 16px rgba(63, 145, 56, 0.18);
}

.ce-chip-label {
  margin-right: 4px;
  color: #66758e;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.045em;
}

.ce-status-tabs {
  flex: 0 1 auto;
  gap: 6px;
}

.ce-status-tab {
  min-height: 34px;
  min-width: 72px;
  border-color: #dce6f0;
  border-radius: 9px;
  box-shadow: none;
  font-size: 10.5px;
  font-weight: 880;
}

.ce-status-tab.active {
  border-color: #2f9138;
  background: linear-gradient(180deg, #55b84f, #2d9137);
  box-shadow: 0 9px 18px rgba(63, 145, 56, 0.2);
}

.ce-workspace.has-detail {
  grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
  gap: 10px;
}

.ce-workspace.has-empty-detail {
  grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
  gap: 10px;
}

.ce-list-card {
  grid-template-rows: 44px minmax(0, 1fr) 38px;
  border-color: #dfe7ef;
  border-radius: 12px;
  box-shadow: 0 9px 20px rgba(21, 35, 60, 0.035);
}

.ce-workspace.has-detail .ce-list-card {
  --student-list-balance-col: 56px;
  --student-list-quality-col: 128px;
  --student-list-action-col: 38px;
  --student-list-row-height: 72px;
  --student-list-grade-size: 54px;
  --student-list-grade-height: 58px;
  --student-list-crest-size: 32px;
  grid-template-rows: 44px minmax(0, 1fr) 38px;
}

.ce-workspace.has-detail .ce-student-row {
  grid-template-columns:
    minmax(0, 1fr) var(--student-list-balance-col) var(
      --student-list-quality-col
    )
    var(--student-list-action-col);
  min-height: var(--student-list-row-height);
  padding-right: 6px;
}

.ce-workspace.has-detail .ce-quality-score,
.ce-workspace.has-detail .ce-quality-cell {
  display: flex;
}

.ce-workspace.has-detail .ce-quality-score {
  width: 43px;
  height: 43px;
}

.ce-workspace.has-detail .ce-quality-score::after {
  inset: 5px;
}

.ce-workspace.has-detail .ce-quality-fields {
  grid-template-columns: repeat(2, minmax(0, max-content));
  gap: 4px 7px;
}

.ce-list-scroll {
  padding: 8px 7px 0 8px;
}

.ce-student-row {
  width: calc(100% - 5px);
  margin: 0 5px 7px 0;
  border-color: #dfe7ef;
  box-shadow: 0 5px 12px rgba(21, 35, 60, 0.035);
}

.ce-student-row.selected,
.ce-student-row.multi-selected {
  border-color: rgba(63, 145, 56, 0.34);
  background: linear-gradient(90deg, rgba(235, 249, 232, 0.96) 0%, #fff 76%);
  box-shadow: 0 8px 20px rgba(63, 145, 56, 0.105);
}

.ce-row-check {
  width: 22px;
  height: 22px;
  border-radius: 7px;
}

.ce-student-identity {
  grid-template-columns:
    24px var(--student-list-grade-size) var(--student-list-crest-size)
    minmax(0, 1fr);
  gap: 7px;
}

.ce-list-titlebar {
  padding-inline: 15px 12px;
}

.ce-list-footer {
  min-height: 38px;
  padding: 0 16px;
}

.ce-detail-shell {
  border-color: #dfe7ef;
  border-radius: 12px;
  box-shadow: 0 9px 20px rgba(21, 35, 60, 0.035);
}

.ce-detail-header {
  grid-template-columns:
    minmax(250px, 1fr) minmax(180px, 220px) minmax(190px, 245px)
    34px;
  min-height: 78px;
  gap: 12px;
  padding: 12px 14px 12px 18px;
  background: #fff;
}

.ce-detail-actions {
  display: none;
}

.ce-title-row h2 {
  font-size: 18px;
}

.ce-access-header-card {
  display: grid;
  min-width: 0;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 58px;
  padding: 9px 12px;
  border: 1px solid rgba(63, 145, 56, 0.22);
  border-radius: 12px;
  background: linear-gradient(180deg, #f8fcf6, #fff);
  box-shadow: 0 8px 18px rgba(21, 35, 60, 0.04);
}

.ce-access-header-card > span {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 9px;
  background: #eff8eb;
  color: #21882e;
}

.ce-access-header-card strong,
.ce-access-header-card small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-access-header-card strong {
  color: #21882e;
  font-size: 11px;
  font-weight: 920;
}

.ce-access-header-card small {
  margin-top: 3px;
  color: #53627b;
  font-size: 10px;
  font-weight: 760;
}

.ce-access-header-card.unavailable {
  border-color: #dce6f0;
  background: #fbfcfd;
}

.ce-access-header-card.unavailable > span,
.ce-access-header-card.unavailable strong {
  color: #7a8498;
}

.ce-progress-cluster strong {
  color: #4f5f78;
  font-size: 10.5px;
}

.ce-progress-track {
  height: 7px;
}

.ce-progress-cluster small {
  display: none;
}

.ce-detail-menu-button {
  border: 1px solid #dfe7ef;
  background: #fff;
  box-shadow: 0 6px 14px rgba(21, 35, 60, 0.04);
}

.ce-detail-body {
  gap: 9px;
  padding: 9px 12px 12px;
}

.ce-profile-card {
  grid-template-columns: 78px minmax(0, 1fr) minmax(190px, 0.42fr);
  min-height: 88px;
  padding: 10px 14px;
  border-color: #dfe7ef;
  border-radius: 12px;
  background: linear-gradient(90deg, #fff 0%, #fff 75%, #f7fbf5 100%);
}

.ce-data-section {
  grid-template-columns: minmax(220px, 0.36fr) minmax(0, 1fr);
  min-height: 48px;
  padding: 8px 12px;
  border-color: rgba(63, 145, 56, 0.16);
  border-radius: 12px;
  background: linear-gradient(90deg, #f8fcf6, #fff);
}

.ce-section-heading > span {
  width: 29px;
  height: 29px;
}

.ce-section-heading h3 {
  font-size: 12px;
}

.ce-section-heading p {
  font-size: 10px;
}

.ce-missing-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.ce-missing-chip {
  min-height: 34px;
  border-radius: 10px;
  background: #fff;
  font-size: 10px;
}

.ce-detail-tabs {
  min-height: 39px;
  gap: 24px;
  padding: 0 14px;
  border-bottom: 1px solid #dfe7ef;
}

.ce-detail-tabs button {
  height: 39px;
}

.ce-tab-panel {
  border: 0;
  box-shadow: none;
  padding: 13px 14px 8px;
}

.ce-tab-panel .ce-section-heading.compact {
  display: none;
}

.ce-form-grid {
  gap: 12px 16px;
}

.ce-form-grid input,
.ce-form-grid select,
.ce-wide-field textarea {
  min-height: 39px;
  border-color: #d7e1ec;
  border-radius: 9px;
  background: #fbfdff;
  font-size: 12px;
}

.ce-detail-footer {
  min-height: 58px;
  padding: 8px 16px;
  background: linear-gradient(
    90deg,
    rgba(255, 248, 238, 0.94),
    rgba(255, 255, 255, 0.98)
  );
}

.ce-detail-footer .ce-save-state {
  background: transparent;
  color: #b05f0b;
  padding-inline: 0;
}

@media (max-height: 800px) {
  .ce-empty-shell {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    grid-auto-rows: auto;
    align-content: start;
    gap: 10px 12px;
    padding: 14px;
  }

  .ce-empty-hero {
    grid-column: 1;
    grid-row: 1;
    width: 82px;
    height: 64px;
    align-self: center;
    margin-top: 0;
  }

  .ce-empty-hero::before {
    inset: 8px 12px 4px;
    border-radius: 22px;
  }

  .ce-empty-hero > svg {
    margin-right: 22px;
  }

  .ce-empty-lines {
    right: 21px;
    top: 27px;
    gap: 8px;
    width: 26px;
  }

  .ce-empty-lines i {
    height: 3px;
  }

  .ce-empty-cursor {
    right: 9px;
    bottom: 10px;
    border-top-width: 18px;
    border-right-width: 14px;
  }

  .ce-empty-sparkle.one {
    left: 8px;
    top: 11px;
  }

  .ce-empty-sparkle.two {
    left: 27px;
    top: 3px;
  }

  .ce-empty-copy {
    grid-column: 2;
    grid-row: 1;
    align-self: center;
    text-align: left;
  }

  .ce-empty-copy h2 {
    font-size: 16px;
    line-height: 1.08;
  }

  .ce-empty-copy p {
    font-size: 11px;
    line-height: 1.3;
  }

  .ce-empty-copy p + p {
    display: none;
  }

  .ce-empty-review {
    grid-column: 1 / -1;
    margin-top: 0;
    padding: 11px 14px;
  }

  .ce-empty-card h3 {
    margin-bottom: 9px;
  }

  .ce-empty-review div {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px 12px;
  }

  .ce-empty-review span {
    gap: 7px;
    font-size: 10.5px;
  }

  .ce-empty-flow {
    display: none;
  }

  .ce-empty-tip {
    grid-column: 1 / -1;
    min-height: 46px;
    margin-top: 0;
    padding: 0 64px 0 14px;
  }

  .ce-empty-tip i {
    right: 14px;
    width: 42px;
    height: 42px;
  }
}

@media (max-width: 1320px) {
  .ce-kpi-strip {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    overflow: visible;
  }
  .ce-primary-filter-row {
    grid-template-columns: minmax(430px, 1fr) max-content minmax(0, 0.95fr) auto;
  }
  .ce-clear-link {
    display: inline-flex;
  }
  .ce-status-tabs {
    overflow: visible;
  }
  .ce-workspace.has-detail,
  .ce-workspace.has-empty-detail {
    grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
  }
  .ce-workspace.has-empty-detail .ce-list-card {
    --student-list-quality-col: 210px;
  }
  .ce-quality-fields {
    grid-template-columns: repeat(2, minmax(0, max-content));
  }
  .ce-empty-flow ol {
    gap: 18px;
  }
  .ce-empty-flow li:not(:last-child)::after {
    right: -18px;
  }
  .ce-detail-header {
    grid-template-columns:
      minmax(0, 1fr) minmax(180px, 220px) minmax(180px, 220px)
      34px;
    gap: 9px;
  }
  .ce-access-header-card {
    grid-template-columns: 30px minmax(0, 1fr);
    padding: 7px 8px;
  }
  .ce-detail-actions {
    display: none;
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


.ce-progress-cluster small {
  display: block;
}

.ce-student-row .student-copy,
.ce-student-row .student-copy strong,
.ce-title-row h2,
.ce-profile-copy strong,
.ce-tutor-card strong,
.ce-tutor-card span,
.ce-empty-flow li b {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}

.ce-title-row h2,
.ce-profile-copy strong,
.ce-tutor-card strong {
  line-height: 1.1;
}

.ce-filter-button,
.ce-clear-link,
.ce-status-tab,
.ce-chip-label,
.ce-secondary-filter-row :deep(.ui-chip),
.ce-primary-filter-row :deep(.ui-chip),
.ce-primary-filter-row :deep(button.ui-chip) {
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

@media (max-height: 800px) {
  .ce-empty-copy p + p {
    display: block;
  }

  .ce-empty-flow {
    display: block;
    grid-column: 1 / -1;
  }
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


.ce-diagnostics-modal {
  width: min(720px, calc(100vw - 36px));
  max-height: min(760px, calc(100vh - 40px));
  overflow: hidden;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 26px 80px rgba(18, 30, 52, 0.22);
  border: 1px solid rgba(213, 224, 236, 0.9);
}

.ce-diagnostics-modal > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 22px;
  border-bottom: 1px solid rgba(219, 229, 240, 0.92);
}

.ce-diagnostics-modal header small {
  display: block;
  color: #718096;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.ce-diagnostics-modal header h2 {
  margin: 4px 0 0;
  color: #172033;
  font-size: 1.06rem;
  font-weight: 850;
}

.ce-diagnostics-body {
  display: grid;
  gap: 16px;
  max-height: calc(100vh - 160px);
  overflow: auto;
  padding: 18px 22px 22px;
}

.ce-diagnostics-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.ce-diagnostics-summary span {
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #f7fafc;
  border: 1px solid rgba(220, 230, 241, 0.88);
  color: #25324a;
  font-size: 0.78rem;
}

.ce-diagnostics-summary b {
  color: #718096;
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ce-diagnostics-body section {
  border: 1px solid rgba(220, 230, 241, 0.88);
  border-radius: 16px;
  padding: 13px 14px;
  background: rgba(250, 252, 254, 0.82);
}

.ce-diagnostics-body h3 {
  margin: 0 0 10px;
  color: #1c2a3f;
  font-size: 0.86rem;
  font-weight: 850;
}

.ce-diagnostics-body dl {
  display: grid;
  gap: 7px;
  margin: 0;
}

.ce-diagnostics-body dl div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(224, 233, 244, 0.75);
}

.ce-diagnostics-body dl div:last-child { border-bottom: 0; }
.ce-diagnostics-body dt { color: #34435c; font-weight: 720; }
.ce-diagnostics-body dd { margin: 0; color: #607087; text-align: right; }
.ce-diagnostics-body p { margin: 4px 0; color: #526175; font-size: 0.82rem; }
.ce-diagnostics-empty { padding: 24px; color: #526175; }

@media (max-width: 860px) {
  .ce-diagnostics-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

</style>
