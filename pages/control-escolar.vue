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
                      :class="['ce-row-health', recordHealth(student).tone]"
                      :aria-label="recordHealth(student).aria"
                    >
                      <span
                        :class="['ce-quality-score', recordHealth(student).tone]"
                        :style="{ '--quality-score': `${recordHealth(student).percent * 3.6}deg` }"
                      >
                        <b>{{ recordHealth(student).percent }}%</b>
                      </span>
                      <span class="ce-quality-cell ce-quality-cell--expanded">
                        <strong>{{ rowHealthHeadline(student) }}</strong>
                        <span class="ce-row-health-summary">{{
                          recordHealth(student).summary
                        }}</span>
                        <div
                          v-if="rowHealthMetrics(student).length"
                          class="ce-quality-fields ce-quality-fields--stacked"
                        >
                          <small
                            v-for="field in rowHealthMetrics(student)"
                            :key="`${student.matricula}-${field.key}`"
                            :class="{ missing: field.missing }"
                          >
                            <component :is="field.icon" :size="11" />
                            {{ field.label }}
                          </small>
                        </div>
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
            <div :class="['ce-detail-shell', `is-${selectedRecordHealth.tone}`]">
              <header class="ce-detail-header">
                <div class="ce-detail-title ce-detail-title--with-photo">
                  <StudentGradePhotoCard
                    class="ce-detail-header-photo"
                    :student="selectedStudent"
                    :photo-url="controlStudentPhotoUrl(selectedStudent)"
                    :photo-loading="
                      isControlStudentPhotoLoading(selectedStudent)
                    "
                    :is-enrolled="selectedStudent.status === 'Activo'"
                  />
                  <div class="ce-detail-title-copy">
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
                <div
                  :class="[
                    'ce-progress-cluster',
                    'ce-progress-cluster--health',
                    selectedRecordHealth.tone,
                  ]"
                >
                  <div class="ce-progress-label-row">
                    <span>
                      <strong>Expediente básico</strong>
                      <small>{{ selectedRecordHealth.summary }}</small>
                    </span>
                    <b>{{ selectedProfileCompletion }}%</b>
                  </div>
                  <span class="ce-progress-track">
                    <i :style="{ width: `${selectedProfileCompletion}%` }"></i>
                  </span>
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
                <section class="ce-health-overview" aria-label="Resumen del expediente seleccionado">
                  <article :class="['ce-health-card', 'ce-health-card--basic', selectedRecordHealth.tone]">
                    <div
                      :class="['ce-health-ring', selectedRecordHealth.tone]"
                      :style="{ '--ring-deg': `${selectedProfileCompletion * 3.6}deg` }"
                    >
                      <b>{{ selectedProfileCompletion }}%</b>
                    </div>
                    <div class="ce-health-card__copy">
                      <small>Expediente básico</small>
                      <strong>{{ rowHealthHeadline(selectedHealthStudent) }}</strong>
                      <p>{{ selectedMissingCount ? selectedNextAction : 'Completo para operación diaria' }}</p>
                      <span class="ce-health-bar"><i :style="{ width: `${selectedProfileCompletion}%` }"></i></span>
                      <em>{{ selectedBasicCompletedCount }} de {{ requiredDataFields.length }} campos completos</em>
                    </div>
                  </article>
                  <article class="ce-health-card ce-health-card--complete">
                    <div
                      class="ce-health-ring is-secondary"
                      :style="{ '--ring-deg': `${selectedCompleteProfileCompletion * 3.6}deg` }"
                    >
                      <b>{{ selectedCompleteProfileCompletion }}%</b>
                    </div>
                    <div class="ce-health-card__copy">
                      <small>Expediente completo</small>
                      <strong>{{ selectedCompleteMissingCount ? `${selectedCompleteMissingCount} pendientes avanzados` : 'Completo' }}</strong>
                      <p>Incluye información avanzada del expediente.</p>
                      <span class="ce-health-bar is-secondary"><i :style="{ width: `${selectedCompleteProfileCompletion}%` }"></i></span>
                      <em>{{ selectedCompleteProfileCompletion }}% · {{ selectedCompleteMissingCount ? `${selectedCompleteMissingCount} pendientes` : `${selectedCompleteCompletedCount}/${completeDataFields.length} completos` }}</em>
                    </div>
                    <button type="button" class="ce-health-link" @click="showCompleteExpediente = !showCompleteExpediente">
                      {{ showCompleteExpediente ? 'Ocultar expediente completo' : 'Ver expediente completo' }}
                      <LucideChevronRight :size="16" />
                    </button>
                  </article>
                  <article :class="['ce-health-card', 'ce-health-card--action', selectedRecordHealth.tone, { 'is-clear': !selectedRecordIssueCount }]">
                    <div class="ce-health-card__icon">
                      <component
                        :is="selectedRecordIssueCount ? LucideAlertTriangle : LucideShieldCheck"
                        :size="19"
                      />
                    </div>
                    <div class="ce-health-card__copy">
                      <small>{{ selectedRecordIssueCount ? 'Pendientes por resolver' : 'Sin pendientes básicos' }}</small>
                      <strong>{{ selectedRecordIssueCount ? `${selectedRecordIssueCount} dato${selectedRecordIssueCount === 1 ? '' : 's'} por revisar` : 'Listo' }}</strong>
                      <p>{{ selectedRecordIssueCount ? selectedNextAction : 'El expediente básico no requiere acción.' }}</p>
                      <div v-if="selectedVisibleActionChips.length" class="ce-health-missing-chips">
                        <button
                          v-for="field in selectedVisibleActionChips"
                          :key="`missing-chip-${field.key}`"
                          type="button"
                          @click="goToMissingField(field)"
                        >
                          <component :is="field.icon" :size="12" />
                          {{ field.shortLabel }}
                        </button>
                        <span v-if="selectedHiddenActionCount">+{{ selectedHiddenActionCount }}</span>
                      </div>
                    </div>
                    <button
                      v-if="selectedRecordIssueCount"
                      type="button"
                      class="ce-health-action-button"
                      @click="goToFirstPendingField"
                    >
                      Resolver
                      <LucideChevronRight :size="15" />
                    </button>
                  </article>
                </section>

                <section class="ce-status-signal-grid" aria-label="Estado operativo del expediente">
                  <article
                    v-for="signal in selectedStatusSignals"
                    :key="`signal-${signal.key}`"
                    :class="['ce-status-signal-card', `is-${signal.tone}`]"
                  >
                    <span class="ce-status-signal-icon">
                      <component :is="signal.icon" :size="16" />
                    </span>
                    <div>
                      <small>{{ signal.title }}</small>
                      <strong>{{ signal.label }}</strong>
                      <p>{{ signal.summary }}</p>
                    </div>
                    <b>{{ signal.count }}</b>
                  </article>
                </section>

                <nav class="ce-detail-tabs" aria-label="Secciones de ficha">
                  <button
                    v-for="tab in detailTabs"
                    :key="tab.key"
                    type="button"
                    :class="[
                      { active: activeDetailTab === tab.key },
                      `is-${detailTabState(tab.key).tone}`,
                    ]"
                    @click="activeDetailTab = tab.key"
                  >
                    <span class="ce-tab-main">
                      <component :is="tab.icon" :size="15" /> {{ tab.label }}
                    </span>
                    <b v-if="detailTabState(tab.key).count" class="ce-tab-badge">{{
                      detailTabState(tab.key).count
                    }}</b>
                  </button>
                </nav>

                <form class="ce-edit-form" @submit.prevent="saveStudent">
                  <section
                    v-show="activeDetailTab === 'identity'"
                    class="ce-form-card ce-tab-panel"
                  >
                    <div class="ce-panel-heading">
                      <div>
                        <h3>Datos de identidad</h3>
                        <p>Revisa y actualiza la identidad principal del alumno.</p>
                      </div>
                      <span :class="['ce-panel-status', selectedIdentityStatus.tone]">{{
                        selectedIdentityStatus.label
                      }}</span>
                    </div>
                    <div class="ce-form-grid two">
                      <label
                        :class="fieldShellClass('apellidoPaterno')"
                        data-ce-field="apellidoPaterno"
                        ><span>A. paterno</span
                        ><input
                          v-model="editForm.apellidoPaterno"
                          autocomplete="off"
                        />
                        <small>{{ fieldValidationMessage('apellidoPaterno') }}</small>
                      </label>
                      <label
                        :class="fieldShellClass('apellidoMaterno')"
                        data-ce-field="apellidoMaterno"
                        ><span>A. materno</span
                        ><input
                          v-model="editForm.apellidoMaterno"
                          autocomplete="off"
                        />
                        <small>{{ fieldValidationMessage('apellidoMaterno') }}</small>
                      </label>
                      <label
                        :class="fieldShellClass('nombres')"
                        data-ce-field="nombres"
                        ><span>Nombre(s)</span
                        ><input v-model="editForm.nombres" autocomplete="off"
                        />
                        <small>{{ fieldValidationMessage('nombres') }}</small>
                      </label>
                      <label :class="fieldShellClass('curp')" data-ce-field="curp">
                        <span>CURP</span>
                        <input
                          v-model="editForm.curp"
                          maxlength="18"
                          autocomplete="off"
                          @input="editForm.curp = normalizeCurpInput(editForm.curp)"
                        />
                        <small>{{ fieldValidationMessage('curp') }}</small>
                      </label>
                      <article v-if="editForm.curp" class="ce-derived-card" :class="`is-${derivedGenderMeta.tone}`">
                        <span class="ce-derived-card__icon" aria-hidden="true"><b>{{ derivedGenderMeta.symbol }}</b></span>
                        <div>
                          <span>{{ curpDerivedIdentity.valid ? 'Derivado de CURP' : 'CURP pendiente' }}</span>
                          <strong>{{ curpDerivedIdentity.valid ? `${curpDerivedIdentity.fechaNacimiento} · ${derivedGenderMeta.label}` : 'Completa una CURP válida para inferir nacimiento y sexo' }}</strong>
                        </div>
                      </article>
                      <template v-if="showCompleteExpediente">
                        <label
                          ><span>Nombre verificado</span
                          ><input v-model="editForm.nombreVerificado" autocomplete="off"
                        /></label>
                        <label
                          ><span>Nombre completo alumno</span
                          ><input v-model="editForm.nombreCompletoAlumno" autocomplete="off"
                        /></label>
                        <label
                          ><span>Lugar nacimiento</span
                          ><input v-model="editForm.lugarNacimiento" autocomplete="off"
                        /></label>
                        <label
                          ><span>Foto</span
                          ><input v-model="editForm.foto" autocomplete="off"
                        /></label>
                      </template>
                    </div>
                  </section>

                  <section
                    v-show="activeDetailTab === 'school'"
                    class="ce-form-card ce-tab-panel"
                  >
                    <div class="ce-section-heading compact">
                      <span><LucideGraduationCap :size="18" /></span>
                      <div>
                        <h3>Escolar</h3>
                        <p>{{ selectedSchoolStatus.summary }}</p>
                      </div>
                      <b :class="['ce-panel-status', selectedSchoolStatus.tone]">{{
                        selectedSchoolStatus.label
                      }}</b>
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
                      <template v-if="showCompleteExpediente">
                        <label
                          ><span>Ciclo matrícula</span
                          ><input v-model="editForm.ciclo" autocomplete="off"
                        /></label>
                        <label
                          ><span>Último grado</span
                          ><input v-model="editForm.lastGrade" autocomplete="off"
                        /></label>
                        <label
                          ><span>Último ciclo</span
                          ><input v-model="editForm.lastCiclo" autocomplete="off"
                        /></label>
                        <label
                          ><span>Servicio</span
                          ><input v-model="editForm.servicio" autocomplete="off"
                        /></label>
                        <label
                          ><span>Interno</span
                          ><select v-model="editForm.interno"><option :value="0">No</option><option :value="1">Sí</option></select>
                        </label>
                        <label
                          ><span>Eventual</span
                          ><select v-model="editForm.eventual"><option :value="0">No</option><option :value="1">Sí</option></select>
                        </label>
                        <label
                          ><span>Verificado</span
                          ><select v-model="editForm.verified"><option :value="0">No</option><option :value="1">Sí</option></select>
                        </label>
                      </template>
                    </div>
                  </section>

                  <section
                    v-show="activeDetailTab === 'family'"
                    class="ce-tab-panel ce-family-panel"
                  >
                    <div class="ce-panel-heading">
                      <div>
                        <h3>Familia y contactos</h3>
                        <p>Los estados se calculan automáticamente con la información capturada.</p>
                      </div>
                    </div>
                    <section class="ce-family-readiness" aria-label="Estado de contacto familiar">
                      <article
                        v-for="group in selectedFamilySummaryCards"
                        :key="group.key"
                        :class="['ce-family-readiness-card', group.tone]"
                      >
                        <span><component :is="group.icon" :size="16" /></span>
                        <div>
                          <small>{{ group.title }}</small>
                          <strong>{{ group.label }}</strong>
                          <p>{{ group.summary }}</p>
                          <i class="ce-family-readiness-meter">
                            <em :style="{ width: `${group.progress}%` }"></em>
                          </i>
                        </div>
                        <b>{{ group.count }}</b>
                      </article>
                    </section>

                    <section class="ce-family-metrics-strip" aria-label="Métricas de contacto familiar">
                      <span
                        v-for="field in selectedBasicMetrics.filter((item) => item.key !== 'curp')"
                        :key="`selected-metric-${field.key}`"
                        :class="['ce-family-metric-chip', { missing: field.missing }]"
                      >
                        <component :is="field.icon" :size="13" />
                        {{ field.label }}
                      </span>
                    </section>

                    <div class="ce-family-grid">
                      <section :class="['ce-family-card', familySectionState('padre').tone]">
                        <header class="ce-family-card-head">
                          <h3>Padre</h3>
                          <div class="ce-family-card-status">
                            <span>{{ familySectionState('padre').label }}</span>
                            <i><b :style="{ width: `${familySectionState('padre').progress}%` }"></b></i>
                          </div>
                        </header>
                        <div class="ce-form-grid two ce-family-fields">
                          <label :class="fieldShellClass('nombrePadre')" data-ce-field="nombrePadre">
                            <span>Nombre padre</span>
                            <input v-model="editForm.nombrePadre" autocomplete="off" />
                            <small>{{ fieldValidationMessage('nombrePadre') }}</small>
                          </label>
                          <label :class="fieldShellClass('apellidoPaternoPadre')" data-ce-field="apellidoPaternoPadre">
                            <span>Apellido paterno padre</span>
                            <input v-model="editForm.apellidoPaternoPadre" autocomplete="off" />
                            <small>{{ fieldValidationMessage('apellidoPaternoPadre') }}</small>
                          </label>
                          <label
                            ><span>Apellido materno padre</span
                            ><input
                              v-model="editForm.apellidoMaternoPadre"
                              autocomplete="off"
                          /></label>
                          <label :class="fieldShellClass('telefonoPadre')" data-ce-field="telefonoPadre">
                            <span>Teléfono padre</span>
                            <input v-model="editForm.telefonoPadre" autocomplete="off" inputmode="tel" />
                            <small>{{ fieldValidationMessage('telefonoPadre') }}</small>
                          </label>
                          <label :class="fieldShellClass('emailPadre')" data-ce-field="emailPadre">
                            <span>Email padre</span>
                            <input v-model="editForm.emailPadre" type="email" autocomplete="off" />
                            <small>{{ fieldValidationMessage('emailPadre') }}</small>
                          </label>
                          <template v-if="showCompleteExpediente">
                            <label
                              ><span>Lugar trabajo padre</span
                              ><input v-model="editForm.lugarTrabajoPadre" autocomplete="off"
                            /></label>
                            <label
                              ><span>Puesto padre</span
                              ><input v-model="editForm.puestoPadre" autocomplete="off"
                            /></label>
                            <label
                              ><span>Estado civil padre</span
                              ><input v-model="editForm.estadoCivilPadre" autocomplete="off"
                            /></label>
                            <label
                              ><span>Fecha nacimiento padre</span
                              ><input v-model="editForm.fechaNacimientoPadre" type="date" autocomplete="off"
                            /></label>
                            <label
                              ><span>INE padre</span
                              ><input v-model="editForm.inePadre" autocomplete="off"
                            /></label>
                            <label
                              ><span>CURP padre</span
                              ><input v-model="editForm.curpPadre" maxlength="18" autocomplete="off"
                            /></label>
                          </template>
                        </div>
                      </section>

                      <section :class="['ce-family-card', familySectionState('madre').tone]">
                        <header class="ce-family-card-head">
                          <h3>Madre</h3>
                          <div class="ce-family-card-status">
                            <span>{{ familySectionState('madre').label }}</span>
                            <i><b :style="{ width: `${familySectionState('madre').progress}%` }"></b></i>
                          </div>
                        </header>
                        <div class="ce-form-grid ce-family-fields ce-family-fields--mother">
                          <label :class="fieldShellClass('nombreMadre')" data-ce-field="nombreMadre">
                            <span>Nombre madre</span>
                            <input v-model="editForm.nombreMadre" autocomplete="off" />
                            <small>{{ fieldValidationMessage('nombreMadre') }}</small>
                          </label>
                          <label :class="fieldShellClass('apellidoPaternoMadre')" data-ce-field="apellidoPaternoMadre">
                            <span>Apellido paterno madre</span>
                            <input v-model="editForm.apellidoPaternoMadre" autocomplete="off" />
                            <small>{{ fieldValidationMessage('apellidoPaternoMadre') }}</small>
                          </label>
                          <label
                            ><span>Apellido materno madre</span
                            ><input
                              v-model="editForm.apellidoMaternoMadre"
                              autocomplete="off"
                          /></label>
                          <label :class="fieldShellClass('telefonoMadre')" data-ce-field="telefonoMadre">
                            <span>Teléfono madre</span>
                            <input v-model="editForm.telefonoMadre" autocomplete="off" inputmode="tel" />
                            <small>{{ fieldValidationMessage('telefonoMadre') }}</small>
                          </label>
                          <label
                            :class="['ce-family-span-2', ...fieldShellClass('emailMadre')]"
                            data-ce-field="emailMadre"
                          >
                            <span>Email madre</span>
                            <input v-model="editForm.emailMadre" type="email" autocomplete="off" />
                            <small>{{ fieldValidationMessage('emailMadre') }}</small>
                          </label>
                          <template v-if="showCompleteExpediente">
                            <label
                              ><span>Lugar trabajo madre</span
                              ><input v-model="editForm.lugarTrabajoMadre" autocomplete="off"
                            /></label>
                            <label
                              ><span>Puesto madre</span
                              ><input v-model="editForm.puestoMadre" autocomplete="off"
                            /></label>
                            <label
                              ><span>Estado civil madre</span
                              ><input v-model="editForm.estadoCivilMadre" autocomplete="off"
                            /></label>
                            <label
                              ><span>Fecha nacimiento madre</span
                              ><input v-model="editForm.fechaNacimientoMadre" type="date" autocomplete="off"
                            /></label>
                            <label
                              ><span>INE madre</span
                              ><input v-model="editForm.ineMadre" autocomplete="off"
                            /></label>
                            <label
                              ><span>CURP madre</span
                              ><input v-model="editForm.curpMadre" maxlength="18" autocomplete="off"
                            /></label>
                          </template>
                        </div>
                      </section>
                    </div>
                    <label class="ce-wide-field ce-family-address"
                      ><span>Dirección</span
                      ><textarea
                        v-model="editForm.direccion"
                        rows="4"
                      ></textarea>
                    </label>
                    <section v-if="showCompleteExpediente" class="ce-form-card ce-complete-nested">
                      <div class="ce-section-heading compact">
                        <span><LucideBuilding2 :size="18" /></span>
                        <h3>Domicilio detallado</h3>
                      </div>
                      <div class="ce-form-grid three">
                        <label><span>Calle</span><input v-model="editForm.domicilioCalle" autocomplete="off" /></label>
                        <label><span>Número</span><input v-model="editForm.domicilioNumero" autocomplete="off" /></label>
                        <label><span>Colonia</span><input v-model="editForm.domicilioColonia" autocomplete="off" /></label>
                        <label><span>Código postal</span><input v-model="editForm.domicilioCp" maxlength="5" autocomplete="off" /></label>
                        <label><span>Municipio</span><input v-model="editForm.domicilioMunicipio" autocomplete="off" /></label>
                      </div>
                    </section>
                    <section v-if="showCompleteExpediente" class="ce-form-card ce-complete-nested">
                      <div class="ce-section-heading compact">
                        <span><LucideShieldCheck :size="18" /></span>
                        <h3>Salud</h3>
                      </div>
                      <div class="ce-form-grid three">
                        <label><span>Talla</span><input v-model="editForm.talla" autocomplete="off" /></label>
                        <label><span>Peso</span><input v-model="editForm.peso" autocomplete="off" /></label>
                        <label><span>Tipo de sangre</span><input v-model="editForm.tipoSangre" autocomplete="off" /></label>
                        <label class="ce-family-span-2"><span>Alergias</span><input v-model="editForm.alergias" autocomplete="off" /></label>
                      </div>
                    </section>
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
                    <template v-if="showCompleteExpediente">
                      <label class="ce-wide-field standalone"
                        ><span>Notas de servicio</span
                        ><textarea v-model="editForm.servicioNotas" rows="4"></textarea>
                      </label>
                      <div class="ce-form-grid two">
                        <label><span>Family ID</span><input v-model="editForm.familyId" autocomplete="off" /></label>
                        <label><span>Certificado médico adjunto</span><input v-model="editForm.certificadoMedicoAdjunto" autocomplete="off" /></label>
                        <label><span>Certificado vacunación COVID-19</span><input v-model="editForm.certificadoVacunacionCovid19Adjunto" autocomplete="off" /></label>
                        <label><span>Acta nacimiento adjunta</span><input v-model="editForm.actaNacimientoAdjunta" autocomplete="off" /></label>
                        <label><span>CURP alumno adjunto</span><input v-model="editForm.curpAlumnoAdjunto" autocomplete="off" /></label>
                        <label><span>Certificado primaria adjunto</span><input v-model="editForm.certificadoPrimariaAdjunto" autocomplete="off" /></label>
                        <label><span>Boleta sexto primaria</span><input v-model="editForm.boletaSextoPrimariaAdjunta" autocomplete="off" /></label>
                        <label><span>Boleta primero secundaria</span><input v-model="editForm.boletaPrimeroSecundariaAdjunta" autocomplete="off" /></label>
                        <label><span>Boleta segundo secundaria</span><input v-model="editForm.boletaSegundoSecundariaAdjunta" autocomplete="off" /></label>
                      </div>
                    </template>
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
          <div class="ce-diagnostics-hero-card">
            <div>
              <small>Lectura automática</small>
              <h3>Ruta de resolución Control Escolar</h3>
              <p>
                Este modal enseña el recorrido real de la última carga: navegador,
                bridge live, snapshot verificado, matrícula central y el resultado final visible.
              </p>
            </div>
            <div class="ce-diagnostics-query-pill">
              <span>{{ lastControlLoadDiagnostics.query.search || lastControlLoadDiagnostics.query.q || 'sin búsqueda' }}</span>
              <small>Ciclo {{ lastControlLoadDiagnostics.ciclo || 'n/a' }}</small>
            </div>
          </div>

          <div class="ce-diagnostics-summary-grid">
            <article
              v-for="item in controlDiagnosticsSummary"
              :key="item.label"
              :class="['ce-diagnostics-summary-card', `is-${item.tone || 'neutral'}`]"
            >
              <small>{{ item.label }}</small>
              <strong>{{ item.value }}</strong>
            </article>
          </div>

          <section class="ce-diagnostics-section-card">
            <div class="ce-diagnostics-section-card__head">
              <div>
                <small>Árbol de decisiones</small>
                <h3>Cómo navegó la resolución</h3>
              </div>
              <span class="ce-diagnostics-inline-badge">{{ controlDiagnosticsTree.length }} nodos</span>
            </div>
            <div class="ce-diagnostics-tree">
              <template v-for="(node, index) in controlDiagnosticsTree" :key="node.id">
                <article :class="['ce-diagnostics-node', `is-${node.tone}`]">
                  <div class="ce-diagnostics-node__rail">
                    <span class="ce-diagnostics-node__lane">{{ node.laneLabel }}</span>
                    <span class="ce-diagnostics-node__status">{{ node.statusLabel }}</span>
                  </div>
                  <div class="ce-diagnostics-node__body">
                    <header>
                      <div>
                        <h4>{{ node.title }}</h4>
                        <p>{{ node.decision }}</p>
                      </div>
                      <span class="ce-diagnostics-node__time">{{ formatControlDuration(node.ms) }}</span>
                    </header>
                    <p class="ce-diagnostics-node__why"><b>Por qué:</b> {{ node.why }}</p>
                    <ul v-if="node.meta.length" class="ce-diagnostics-node__meta">
                      <li v-for="item in node.meta" :key="`${node.id}-${item.label}`">
                        <span>{{ item.label }}</span>
                        <strong>{{ item.value }}</strong>
                      </li>
                    </ul>
                  </div>
                </article>
                <div v-if="index < controlDiagnosticsTree.length - 1" class="ce-diagnostics-tree__arrow">↓</div>
              </template>
            </div>
          </section>

          <section class="ce-diagnostics-section-card ce-diagnostics-section-card--compact">
            <div class="ce-diagnostics-section-card__head">
              <div>
                <small>Estado actual</small>
                <h3>Resumen operativo</h3>
              </div>
            </div>
            <dl class="ce-diagnostics-facts-grid">
              <div>
                <dt>Base</dt>
                <dd>{{ lastControlLoadDiagnostics.source.base || 'n/a' }}</dd>
              </div>
              <div>
                <dt>Overlay</dt>
                <dd>{{ lastControlLoadDiagnostics.source.overlay || 'n/a' }}</dd>
              </div>
              <div>
                <dt>Flujo servidor</dt>
                <dd>{{ lastControlLoadDiagnostics.server.flow || 'unknown' }}</dd>
              </div>
              <div>
                <dt>Fallback snapshot</dt>
                <dd>{{ lastControlLoadDiagnostics.source.bridgeFallback ? 'sí' : 'no' }}</dd>
              </div>
              <div>
                <dt>Freshness</dt>
                <dd>{{ lastControlLoadDiagnostics.source.cacheFreshness || 'live-bridge' }}</dd>
              </div>
              <div>
                <dt>Rows</dt>
                <dd>base {{ lastControlLoadDiagnostics.source.localRows }}, matrícula {{ lastControlLoadDiagnostics.source.overlayRows }}, usuarios {{ lastControlLoadDiagnostics.source.usersRows }}</dd>
              </div>
            </dl>
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
  resolveControlEscolarCompleteness,
  inferMexicanCurpIdentity,
  CONTROL_ESCOLAR_BASIC_REQUIRED_FIELDS,
  CONTROL_ESCOLAR_COMPLETE_REQUIRED_FIELDS,
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
const CONTROL_STUDENTS_SCOPE_CACHE_VERSION = 3;
const CONTROL_STUDENTS_CACHE_READ_VERSIONS = [
  CONTROL_STUDENTS_CACHE_VERSION,
  1,
];
const CONTROL_STUDENTS_CACHE_NAMESPACE = "control-escolar:students-cache";
const CONTROL_STUDENTS_SCOPE_CACHE_NAMESPACE = "control-escolar:students-scope-cache";
const CONTROL_STUDENTS_SCOPE_CACHE_INDEX_KEY = `${CONTROL_STUDENTS_SCOPE_CACHE_NAMESPACE}:index:v1`;
const CONTROL_STUDENTS_SCOPE_CACHE_MAX_SCOPES = 8;
const CONTROL_STUDENTS_BROWSER_CACHE_ENABLED = false;
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
const showCompleteExpediente = ref(false);
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
let lastControlAuditSnapshotKey = "";
let lastControlAuditSnapshotAt = 0;
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
      bridgeFallback: Boolean(source.bridgeFallback),
      bridgeError: source.bridgeError || "",
    },
  };
};

const controlStatusTone = (status = "") => {
  const normalized = String(status || "").toLowerCase();
  if (["ready", "updated", "cached", "complete"].includes(normalized))
    return "success";
  if (["partial", "syncing", "loading"].includes(normalized)) return "info";
  if (["skipped", "disabled", "idle", "empty", "missing"].includes(normalized))
    return "muted";
  if (["failed", "unavailable", "error"].includes(normalized)) return "danger";
  return "neutral";
};

const controlStatusLabel = (status = "") => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "ready") return "Listo";
  if (normalized === "updated") return "Actualizado";
  if (normalized === "cached") return "En caché";
  if (normalized === "syncing") return "Sincronizando";
  if (normalized === "partial") return "Parcial";
  if (normalized === "failed") return "Falló";
  if (normalized === "unavailable") return "No disponible";
  if (normalized === "disabled") return "Desactivado";
  if (normalized === "skipped") return "Omitido";
  if (normalized === "empty") return "Vacío";
  if (normalized === "missing") return "Sin coincidencias";
  if (normalized === "idle") return "En espera";
  return normalized || "Sin estado";
};

const describeControlWhy = (step = {}, lane = "client") => {
  const key = String(step.key || "");
  const status = String(step.status || "");
  const reason = String(step.reason || "");
  if (key === "browser-cache") {
    if (status === "disabled") return "El navegador no resuelve alumnos de Control Escolar desde caché local; esa capa se limpió a propósito para no ocultar cambios vivos.";
    if (status === "ready") return "Se usó la caché local porque estaba habilitada y tenía filas válidas para esta vista.";
    return "Se inspeccionó la caché local y no aportó una resolución útil para esta carga.";
  }
  if (key === "verified-cache") {
    if (status === "skipped") return reason === "live_bridge_primary_snapshot_only_on_bridge_failure"
      ? "El snapshot quedó reservado como plan B; con bridge disponible, no debe adelantarse a la base live."
      : "El snapshot se omitió por la fase actual de carga.";
    if (status === "ready") return "El snapshot verificado entró porque el bridge falló y había un respaldo estructurado para este alcance.";
    if (status === "empty") return "Se intentó acudir al snapshot por falla del bridge, pero no había respaldo utilizable para ese scope.";
    if (status === "failed") return "Además de la falla del bridge, también falló el intento de abrir el snapshot verificado.";
  }
  if (key === "bridge-schema") return status === "ready"
    ? "El servidor pudo validar la base local y, cuando aplica, también la disponibilidad del overlay central."
    : "El bridge respondió pero con disponibilidad parcial o central degradada.";
  if (key === "live-base-selector") return status === "ready"
    ? "La lista base salió del bridge local y se convirtió en la raíz real del flujo de Control Escolar."
    : "La lectura live de la base local falló y el flujo tuvo que degradarse.";
  if (key === "cache-refresh") return status === "ready"
    ? "El snapshot se refrescó usando filas vivas para que el fallback no se oxide."
    : status === "skipped"
      ? "No se refrescó el snapshot porque la consulta no era cacheable o no lo necesitaba."
      : "El refresh del snapshot falló, pero el resultado live siguió adelante.";
  if (key === "matricula-overlay") return status === "ready"
    ? "Se aplicó matrícula central sobre la base ya resuelta, agregando datos vivos del expediente escolar."
    : "La base siguió adelante, pero la capa de matrícula central no respondió completamente.";
  if (key === "husky-pass") return status === "ready"
    ? "Se consultó Husky Pass como enriquecimiento adicional de usuarios." 
    : "La consulta de Husky Pass no respondió o no tenía datos para esta carga.";
  if (key === "server-enriched") return status === "ready"
    ? "El cliente recibió una respuesta final ya enriquecida por el servidor." 
    : "La solicitud principal al servidor falló antes de entregar una lista usable.";
  if (lane === "server") return "El servidor reportó esta etapa como parte del recorrido real de resolución.";
  return "La etapa se registró automáticamente durante la última carga para explicar la decisión tomada.";
};

const controlDiagnosticsSummary = computed(() => {
  const diagnostics = lastControlLoadDiagnostics.value;
  if (!diagnostics) return [];
  return [
    {
      label: "Estado final",
      value: controlStatusLabel(diagnostics.status),
      tone: controlStatusTone(diagnostics.status),
    },
    {
      label: "Tiempo cliente",
      value: formatControlDuration(diagnostics.totalMs),
      tone: "neutral",
    },
    {
      label: "Flujo servidor",
      value: diagnostics.server.flow || "unknown",
      tone: controlStatusTone(diagnostics.status),
    },
    {
      label: "Cache / overlay",
      value: `${diagnostics.source.cacheFreshness || "live"} · ${diagnostics.source.overlayRows}/${diagnostics.source.localRows || 0}`,
      tone: "neutral",
    },
  ];
});

const controlDiagnosticsTree = computed(() => {
  const diagnostics = lastControlLoadDiagnostics.value;
  if (!diagnostics) return [];
  const nodes = [
    ...((diagnostics.clientSteps || []).map((step) => ({
      id: `client-${step.key}`,
      lane: "client",
      laneLabel: "Cliente",
      title: step.label,
      decision: step.label,
      why: describeControlWhy(step, "client"),
      tone: controlStatusTone(step.status),
      status: step.status,
      statusLabel: controlStatusLabel(step.status),
      ms: Number(step.ms || 0),
      meta: [
        { label: "Filas", value: step.rows },
        { label: "Motivo", value: step.reason || step.freshness || "" },
        { label: "Error", value: step.error || "" },
      ].filter((item) => item.value !== "" && item.value != null),
    }))),
    ...((diagnostics.server.steps || []).map((step) => ({
      id: `server-${step.key}`,
      lane: "server",
      laneLabel: "Servidor",
      title: step.label,
      decision: step.label,
      why: describeControlWhy(step, "server"),
      tone: controlStatusTone(step.status),
      status: step.status,
      statusLabel: controlStatusLabel(step.status),
      ms: Number(step.ms || 0),
      meta: [
        { label: "Filas", value: step.rows },
        { label: "Freshness", value: step.freshness || "" },
        { label: "Scope", value: step.scopeKey || "" },
        { label: "Motivo", value: step.reason || "" },
        { label: "Error", value: step.error || "" },
      ].filter((item) => item.value !== "" && item.value != null),
    }))),
  ];

  nodes.push({
    id: "result-final",
    lane: "result",
    laneLabel: "Resultado",
    title: "Resultado final visible",
    decision: diagnostics.source.bridgeFallback
      ? "La vista visible terminó sobre snapshot fallback con overlay central encima."
      : "La vista visible terminó sobre bridge live con overlay central encima.",
    why: diagnostics.source.bridgeFallback
      ? "El bridge no respondió y el snapshot verificado sostuvo la carga para no dejar el plantel ciego."
      : "La ruta consiguió resolver la base live y solo usó el snapshot como respaldo estratégico.",
    tone: controlStatusTone(diagnostics.status),
    status: diagnostics.status,
    statusLabel: controlStatusLabel(diagnostics.status),
    ms: diagnostics.totalMs,
    meta: [
      { label: "Base", value: diagnostics.source.base || "n/a" },
      { label: "Overlay", value: diagnostics.source.overlay || "n/a" },
      { label: "Rows", value: `${diagnostics.source.localRows}/${diagnostics.source.overlayRows}/${diagnostics.source.usersRows}` },
    ],
  });

  return nodes;
});

const openControlDiagnosticsModal = () => {
  showControlDiagnosticsModal.value = true;
};
const closeControlDiagnosticsModal = () => {
  showControlDiagnosticsModal.value = false;
};

const publishControlSyncIndicatorState = (override = {}) => {
  if (!process.client) return;
  const rows = controlStudentsIndex.value.length || students.value.length || 0;
  const source = controlDataSource.value || {};
  const isLoading = studentsLoading.value || kpisLoading.value || controlBaseStage.value === "loading" || controlExternalDbStage.value === "loading" || controlCompleteStage.value === "loading";
  const cacheFreshness = String(source.cacheFreshness || "");
  const isSnapshotFallback = Boolean(source.bridgeFallback) || String(source.base || "").startsWith("verified-cache:");
  const status =
    override.status ||
    (isLoading
      ? "syncing"
      : loadError.value
        ? "failed"
        : isSnapshotFallback || cacheFreshness === "expired"
          ? "cached"
          : controlDataFreshness.value === "synced" || cacheFreshness === "live-bridge"
            ? "updated"
            : controlDataFreshness.value === "cache"
              ? "cached"
              : rows > 0
                ? "cached"
                : "empty");
  const message =
    override.message ||
    (isSnapshotFallback
      ? "Bridge sin conexión; mostrando snapshot verificado de emergencia."
      : cacheFreshness === "expired"
        ? "Mostrando cache activo; actualización automática en segundo plano."
        : cacheFreshness === "live-bridge"
          ? "Control Escolar actualizado desde bridge live."
          : cacheFreshness === "fresh"
            ? "Control Escolar usando snapshot verificado vigente."
            : loadError.value || "Control Escolar");
  window.dispatchEvent(
    new CustomEvent("control-escolar:sync-state", {
      detail: {
        status,
        rows,
        message,
        freshness: source.cacheFreshness || controlDataFreshness.value || "",
      },
    }),
  );
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
        : controlBaseStage.value === "partial"
          ? "Snapshot verificado por bridge sin conexión"
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
const normalizeDateInput = (value) => {
  if (!value) return "";
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString().slice(0, 10);
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
    { key: "padre", label: "Sin datos de padre", count: data.sinPadre || 0 },
    { key: "madre", label: "Sin datos de madre", count: data.sinMadre || 0 },
    { key: "contact", label: "Sin contacto válido", count: data.sinContacto || 0 },
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

const iconForCompletenessField = (key = "") => {
  if (key === "curp") return LucideShieldCheck;
  if (key.toLowerCase().includes("email")) return LucideMail;
  if (key.toLowerCase().includes("telefono")) return LucidePhone;
  return LucideUsersRound;
};
const requiredDataFields = CONTROL_ESCOLAR_BASIC_REQUIRED_FIELDS.map((field) => ({
  ...field,
  icon: iconForCompletenessField(field.key),
}));
const completeDataFields = CONTROL_ESCOLAR_COMPLETE_REQUIRED_FIELDS.map((field) => ({
  ...field,
  icon: iconForCompletenessField(field.key),
}));

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
    phone: "Sin datos familiares",
    email: "Sin datos familiares",
    guardian: "Sin datos familiares",
    tutor: "Sin datos familiares",
    padre: "Sin datos de padre",
    madre: "Sin datos de madre",
    contact: "Sin contacto válido",
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
const controlCompletenessFor = (student) => {
  if (student?.completenessTiers?.basic && student?.completenessTiers?.complete) {
    return student.completenessTiers;
  }
  return resolveControlEscolarCompleteness(student || {}, { honorEnrollmentState: true });
};
const normalizedMissingFields = (student, tier = "basic") => {
  const fields = tier === "complete"
    ? controlCompletenessFor(student)?.complete?.missingFields
    : controlCompletenessFor(student)?.basic?.missingFields || student?.missingFields;
  return Array.isArray(fields)
    ? fields
        .map((field) =>
          String(field || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : [];
};
const studentMissingField = (student, field, tier = "basic") => {
  const missing = normalizedMissingFields(student, tier);
  return (
    missing.includes(String(field?.key || "").toLowerCase()) ||
    missing.includes(String(field?.label || "").toLowerCase())
  );
};
const isInscritoForControlProgress = (student) =>
  String(student?.enrollmentState || "").toLowerCase() === "inscrito";
const studentMissingCount = (student) => controlCompletenessFor(student)?.basic?.pending ??
  requiredDataFields.filter((field) => studentMissingField(student, field)).length;
const studentCompleteMissingCount = (student) => controlCompletenessFor(student)?.complete?.pending ??
  completeDataFields.filter((field) => studentMissingField(student, field, "complete")).length;
const completionFor = (student) => {
  if (!isInscritoForControlProgress(student)) return 0;
  return controlCompletenessFor(student)?.basic?.progress ?? 0;
};
const completeCompletionFor = (student) => {
  if (!isInscritoForControlProgress(student)) return 0;
  return controlCompletenessFor(student)?.complete?.progress ?? 0;
};
const qualitySummary = (student) => {
  if (!isInscritoForControlProgress(student)) return "Fuera de inscritos";
  const missing = studentMissingCount(student);
  if (!missing) return "Expediente básico completo";
  return missing === 1 ? "1 pendiente básico" : `${missing} faltantes básicos`;
};
const qualityScoreTone = (student) => {
  const score = completionFor(student);
  if (score >= 100) return "complete";
  if (score >= 75) return "warning";
  return "danger";
};
const studentCurpIsInvalid = (student = {}) => {
  const curp = normalizeCurpInput(student?.curp || student?.CURP || "");
  return Boolean(curp && !inferMexicanCurpIdentity(curp).valid);
};
const selectedProfileCompletion = computed(() =>
  completionFor(selectedHealthStudent.value),
);
const selectedCompleteProfileCompletion = computed(() =>
  completeCompletionFor(selectedHealthStudent.value),
);
const selectedMissingCount = computed(() =>
  studentMissingCount(selectedHealthStudent.value),
);
const selectedCompleteMissingCount = computed(() =>
  studentCompleteMissingCount(selectedHealthStudent.value),
);
const selectedCompleteCompletedCount = computed(() =>
  Math.max(0, completeDataFields.length - selectedCompleteMissingCount.value),
);
const visibleBasicMissingFieldsFor = (student) =>
  requiredDataFields.filter((field) => studentMissingField(student, field));
const visibleBasicMissingFields = computed(() =>
  visibleBasicMissingFieldsFor(selectedHealthStudent.value),
);
const missingFieldLabelsFor = (student, limit = 2) =>
  visibleBasicMissingFieldsFor(student)
    .slice(0, limit)
    .map((field) => field.label);
const hasMissingContactFor = (student) =>
  ["padreTelefono", "padreEmail", "madreTelefono", "madreEmail"].some((key) =>
    normalizedMissingFields(student, "basic").includes(key.toLowerCase()),
  );
const recordHealth = (student = {}) => {
  if (!isInscritoForControlProgress(student)) {
    return {
      percent: 0,
      tone: "neutral",
      label: "Fuera de alcance",
      summary: "No cuenta para este ciclo.",
      aria: "Alumno fuera del alcance de expediente del ciclo.",
    };
  }

  const percent = completionFor(student);
  const missing = studentMissingCount(student);
  const invalidCurp = studentCurpIsInvalid(student);
  const topMissing = missingFieldLabelsFor(student, 2);
  const missingText = topMissing.join(", ");
  const blocked = invalidCurp || missing >= 4 || hasMissingContactFor(student);
  const tone = missing === 0 && !invalidCurp ? "complete" : blocked ? "danger" : "warning";
  const label = invalidCurp ? "Validación" : missing === 0 ? "Listo" : blocked ? "Atención" : `Faltan ${missing}`;
  const summary = invalidCurp
    ? "CURP inválida"
    : missing === 0
    ? "Básico completo"
    : missingText
      ? missingText
      : "Revisar expediente";

  return {
    percent,
    tone,
    label,
    summary,
    aria: `Expediente básico ${percent}% completo. ${label}. ${summary}`,
  };
};
const rowHealthHeadline = (student = {}) => {
  if (studentCurpIsInvalid(student)) return "CURP inválida";
  const missing = studentMissingCount(student);
  if (!missing) return "Expediente básico completo";
  return missing === 1 ? "1 faltante básico" : `${missing} faltantes básicos`;
};
const rowHealthMetrics = (student = {}, limit = 5) => {
  if (studentCurpIsInvalid(student)) {
    return requiredDataFields
      .filter((field) => field.key === "curp")
      .map((field) => ({ ...field, label: "CURP inválida", missing: true }));
  }
  const missingKeys = new Set(normalizedMissingFields(student, "basic"));
  const missing = requiredDataFields
    .filter((field) => missingKeys.has(String(field.key || "").toLowerCase()))
    .map((field) => ({ ...field, missing: true }));
  return missing.slice(0, limit);
};
const selectedHealthStudent = computed(() => {
  if (!selectedStudent.value) return null;
  return {
    ...selectedStudent.value,
    ...editForm,
    group: editForm.grupo || selectedStudent.value.group || selectedStudent.value.grupo || "",
    direccion: editForm.direccion || selectedStudent.value.direccion || selectedStudent.value.address || "",
  };
});
const selectedRecordHealth = computed(() => recordHealth(selectedHealthStudent.value));
const selectedNextAction = computed(() => {
  const invalid = selectedInvalidActions.value;
  if (invalid.length) {
    const firstInvalid = invalid[0]?.label || "el dato inválido";
    return `Siguiente: revisar ${firstInvalid.toLowerCase()}.`;
  }
  const missing = visibleBasicMissingFields.value;
  if (!missing.length) return "Sin pendientes básicos.";
  const first = missing[0]?.label || "el primer dato pendiente";
  return `Siguiente: completar ${first.toLowerCase()}.`;
});
const selectedBasicCompletedCount = computed(() =>
  Math.max(0, requiredDataFields.length - selectedMissingCount.value),
);
const missingFieldTargets = {
  curp: { tab: "identity", formField: "curp", shortLabel: "CURP" },
  padreNombre: { tab: "family", formField: "nombrePadre", shortLabel: "Nombre padre" },
  padreApellidoPaterno: { tab: "family", formField: "apellidoPaternoPadre", shortLabel: "Apellido padre" },
  padreTelefono: { tab: "family", formField: "telefonoPadre", shortLabel: "Tel. padre" },
  padreEmail: { tab: "family", formField: "emailPadre", shortLabel: "Email padre" },
  madreNombre: { tab: "family", formField: "nombreMadre", shortLabel: "Nombre madre" },
  madreApellidoPaterno: { tab: "family", formField: "apellidoPaternoMadre", shortLabel: "Apellido madre" },
  madreTelefono: { tab: "family", formField: "telefonoMadre", shortLabel: "Tel. madre" },
  madreEmail: { tab: "family", formField: "emailMadre", shortLabel: "Email madre" },
};
const selectedMissingActions = computed(() =>
  visibleBasicMissingFields.value.map((field) => ({
    ...field,
    ...(missingFieldTargets[field.key] || {
      tab: "identity",
      formField: field.key,
      shortLabel: field.label,
    }),
  })),
);
const invalidFieldTargets = {
  curp: { key: "curp-invalid", tab: "identity", formField: "curp", shortLabel: "CURP inválida", label: "CURP inválida", icon: LucideShieldCheck },
  telefonoPadre: { key: "telefono-padre-invalid", tab: "family", formField: "telefonoPadre", shortLabel: "Tel. padre", label: "Teléfono padre inválido", icon: LucidePhone },
  telefonoMadre: { key: "telefono-madre-invalid", tab: "family", formField: "telefonoMadre", shortLabel: "Tel. madre", label: "Teléfono madre inválido", icon: LucidePhone },
  emailPadre: { key: "email-padre-invalid", tab: "family", formField: "emailPadre", shortLabel: "Email padre", label: "Email padre inválido", icon: LucideMail },
  emailMadre: { key: "email-madre-invalid", tab: "family", formField: "emailMadre", shortLabel: "Email madre", label: "Email madre inválido", icon: LucideMail },
};
const selectedInvalidActions = computed(() =>
  editableInvalidFields().map((field) => invalidFieldTargets[field]).filter(Boolean),
);
const selectedRecordActions = computed(() => {
  const seen = new Set();
  return [...selectedInvalidActions.value, ...selectedMissingActions.value].filter((field) => {
    const key = field.formField || field.key;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});
const selectedRecordIssueCount = computed(() => selectedRecordActions.value.length);
const selectedVisibleActionChips = computed(() =>
  selectedRecordActions.value.slice(0, 3),
);
const selectedHiddenActionCount = computed(() =>
  Math.max(0, selectedRecordActions.value.length - selectedVisibleActionChips.value.length),
);
const goToMissingField = (field = {}) => {
  if (field.tab) activeDetailTab.value = field.tab;
  nextTick(() => {
    if (!process.client || !field.formField) return;
    const target = document.querySelector(
      `[data-ce-field="${field.formField}"] input, [data-ce-field="${field.formField}"] select, [data-ce-field="${field.formField}"] textarea`,
    );
    target?.focus?.();
  });
};
const goToFirstPendingField = () => {
  goToMissingField(selectedRecordActions.value[0] || {});
};
const selectedBasicMetrics = computed(() => rowHealthMetrics(selectedHealthStudent.value, 8));
const selectedFamilySummaryCards = computed(() => {
  const father = familyPersonState("padre");
  const mother = familyPersonState("madre");
  const contact = familyCriticalContactState.value;
  return [
    {
      key: "padre",
      title: "Padre",
      tone: `is-${father.tone}`,
      label: father.status,
      count: `${father.completed}/${father.total}`,
      progress: father.progress,
      summary: father.summary,
      icon: LucideUserRound,
    },
    {
      key: "madre",
      title: "Madre",
      tone: `is-${mother.tone}`,
      label: mother.status,
      count: `${mother.completed}/${mother.total}`,
      progress: mother.progress,
      summary: mother.summary,
      icon: LucideUsersRound,
    },
    {
      key: "contacto",
      title: "Contacto crítico",
      tone: `is-${contact.tone}`,
      label: contact.status,
      count: `${contact.completed}/${contact.total}`,
      progress: contact.progress,
      summary: contact.summary,
      icon: LucidePhone,
    },
  ];
});
const derivedGenderMeta = computed(() => {
  if (!curpDerivedIdentity.value?.valid) {
    return {
      label: "Sin inferencia",
      symbol: "•",
      tone: "neutral",
    };
  }
  return curpDerivedIdentity.value?.sexoCorto === "H"
    ? { label: "Masculino", symbol: "♂", tone: "male" }
    : { label: "Femenino", symbol: "♀", tone: "female" };
});
const formValue = (field) => String(editForm[field] ?? "").trim();
const formFieldIsOk = (field) => fieldValidationState(field) === "ok";
const familyPersonState = (type = "padre") => {
  const fields = type === "madre"
    ? ["nombreMadre", "apellidoPaternoMadre", "telefonoMadre", "emailMadre"]
    : ["nombrePadre", "apellidoPaternoPadre", "telefonoPadre", "emailPadre"];
  const labels = {
    nombrePadre: "nombre",
    apellidoPaternoPadre: "apellido paterno",
    telefonoPadre: "teléfono",
    emailPadre: "email",
    nombreMadre: "nombre",
    apellidoPaternoMadre: "apellido paterno",
    telefonoMadre: "teléfono",
    emailMadre: "email",
  };
  const missing = fields.filter((field) => !formFieldIsOk(field));
  const completed = fields.length - missing.length;
  const noun = type === "madre" ? "Madre" : "Padre";
  return {
    key: type,
    label: noun,
    total: fields.length,
    completed,
    missing,
    progress: Math.round((completed / Math.max(fields.length, 1)) * 100),
    tone: missing.length ? (missing.length >= 2 ? "danger" : "warning") : "complete",
    status: missing.length ? `${missing.length} pendiente${missing.length === 1 ? "" : "s"}` : "Completo",
    summary: missing.length
      ? `Falta ${missing.slice(0, 2).map((field) => labels[field]).join(", ")}`
      : "Identidad y contacto listos",
  };
};
const familyCriticalContactState = computed(() => {
  const hasPhone = phoneIsValid(formValue("telefonoPadre")) || phoneIsValid(formValue("telefonoMadre"));
  const hasEmail = emailIsValid(formValue("emailPadre")) || emailIsValid(formValue("emailMadre"));
  const missing = [
    !hasPhone ? "teléfono" : "",
    !hasEmail ? "email" : "",
  ].filter(Boolean);
  return {
    key: "critical-contact",
    label: "Contacto crítico",
    total: 2,
    completed: Number(hasPhone) + Number(hasEmail),
    missing,
    progress: Math.round(((Number(hasPhone) + Number(hasEmail)) / 2) * 100),
    tone: missing.length ? "danger" : "complete",
    status: missing.length ? "Incompleto" : "Listo",
    summary: missing.length ? `Falta ${missing.join(" y ")}` : "Hay vía familiar de contacto",
  };
});
const familySectionState = (type = "padre") => {
  const state = familyPersonState(type);
  return {
    tone: `is-${state.tone}`,
    label: state.status,
    progress: state.progress,
  };
};
const selectedFamilyReadiness = computed(() => {
  const father = familyPersonState("padre");
  const mother = familyPersonState("madre");
  const contact = familyCriticalContactState.value;
  const total = father.total + mother.total + contact.total;
  const completed = father.completed + mother.completed + contact.completed;
  const pending = total - completed;
  const severe = [father, mother, contact].some((item) => item.tone === "danger");
  return {
    total,
    completed,
    pending,
    tone: pending ? (severe ? "danger" : "warning") : "complete",
    label: pending ? `${pending} pendientes` : "Listo",
    summary: pending
      ? [father, mother, contact].filter((item) => item.missing.length).map((item) => item.label).join(" · ")
      : "Contacto familiar completo",
  };
});
const familyReadinessGroups = computed(() => {
  const withIcon = (state, icon) => ({ ...state, icon, tone: `is-${state.tone}` });
  return [
    withIcon(familyPersonState("padre"), LucideUserRound),
    withIcon(familyPersonState("madre"), LucideUsersRound),
    withIcon(familyCriticalContactState.value, LucidePhone),
  ];
});
const normalizeCurpInput = (value) => String(value || "")
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "")
  .slice(0, 18);
const curpDerivedIdentity = computed(() => inferMexicanCurpIdentity(editForm.curp || selectedStudent.value?.curp || ""));
const emailIsValid = (value) => {
  const email = String(value || "").trim().toLowerCase();
  return Boolean(email && !email.includes("@casita") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
};
const phoneIsValid = (value) => String(value || "").replace(/\D/g, "").length >= 10;
const fieldValidationState = (field) => {
  const value = String(editForm[field] ?? "").trim();
  const fieldMap = {
    curp: { key: "curp", tier: "basic", kind: "curp" },
    apellidoPaterno: { key: "apellidoPaternoAlumno", tier: "complete", kind: "text" },
    apellidoMaterno: { key: "apellidoMaternoAlumno", tier: "complete", kind: "text" },
    nombres: { key: "nombresAlumno", tier: "complete", kind: "text" },
    nombrePadre: { key: "padreNombre", tier: "basic", kind: "text" },
    apellidoPaternoPadre: { key: "padreApellidoPaterno", tier: "basic", kind: "text" },
    telefonoPadre: { key: "padreTelefono", tier: "basic", kind: "phone" },
    emailPadre: { key: "padreEmail", tier: "basic", kind: "email" },
    nombreMadre: { key: "madreNombre", tier: "basic", kind: "text" },
    apellidoPaternoMadre: { key: "madreApellidoPaterno", tier: "basic", kind: "text" },
    telefonoMadre: { key: "madreTelefono", tier: "basic", kind: "phone" },
    emailMadre: { key: "madreEmail", tier: "basic", kind: "email" },
  };
  const config = fieldMap[field];
  if (!config) return "neutral";
  const selectedMissing = normalizedMissingFields(selectedHealthStudent.value, config.tier);
  const missingKey = String(config.key || field).toLowerCase();
  if (!value) return selectedMissing.includes(missingKey) ? "missing" : "neutral";
  if (config.kind === "curp") return inferMexicanCurpIdentity(value).valid ? "ok" : "invalid";
  if (config.kind === "phone") return phoneIsValid(value) ? "ok" : "invalid";
  if (config.kind === "email") return emailIsValid(value) ? "ok" : "invalid";
  return value.length >= 2 ? "ok" : "invalid";
};
const fieldShellClass = (field) => {
  const state = fieldValidationState(field);
  return ["ce-smart-field", `is-${state}`];
};
const fieldValidationMessage = (field) => {
  const state = fieldValidationState(field);
  if (state === "ok") return "Listo";
  if (field === "curp") {
    if (state === "missing") return "Requerida";
    if (state === "invalid") return "CURP inválida";
  }
  if (field.toLowerCase().includes("telefono")) {
    if (state === "missing") return "Requerido";
    if (state === "invalid") return "10 dígitos";
  }
  if (field.toLowerCase().includes("email")) {
    if (state === "missing") return "Requerido";
    if (state === "invalid") return "Correo familiar válido";
  }
  if (state === "missing") return "Requerido";
  if (state === "invalid") return "Revisa el dato";
  return "";
};
const validationCount = (fields = []) =>
  fields.filter((field) => ["missing", "invalid"].includes(fieldValidationState(field))).length;
const selectedIdentityStatus = computed(() => {
  const curpState = fieldValidationState("curp");
  const pending = validationCount(["curp", "apellidoPaterno", "apellidoMaterno", "nombres"]);
  if (curpState === "invalid")
    return { tone: "danger", label: "CURP inválida", count: pending };
  if (pending)
    return {
      tone: curpState === "missing" ? "danger" : "warning",
      label: `${pending} pendiente${pending === 1 ? "" : "s"}`,
      count: pending,
    };
  return { tone: "complete", label: "Lista", count: 0 };
});
const selectedSchoolStatus = computed(() => {
  const schoolKeys = ["nivel", "grado", "grupo", "servicio"];
  const missing = schoolKeys.filter((key) =>
    normalizedMissingFields(selectedHealthStudent.value, "complete").includes(key),
  );
  if (!missing.length)
    return { tone: "complete", label: "Completo", count: 0, summary: "Nivel, grado y grupo listos." };
  return {
    tone: missing.length >= 3 ? "warning" : "neutral",
    label: `${missing.length} pendiente${missing.length === 1 ? "" : "s"}`,
    count: missing.length,
    summary: `Falta ${missing.slice(0, 2).join(", ")}${missing.length > 2 ? "..." : ""}.`,
  };
});
const selectedStatusSignals = computed(() => {
  const curpState = fieldValidationState("curp");
  const father = familyPersonState("padre");
  const mother = familyPersonState("madre");
  const contact = familyCriticalContactState.value;
  const curpLabel =
    curpState === "ok" ? "Derivada" : curpState === "invalid" ? "Inválida" : "Pendiente";
  const curpSummary =
    curpState === "ok"
      ? `${curpDerivedIdentity.value.fechaNacimiento} · ${derivedGenderMeta.value.label}`
      : curpState === "invalid"
        ? "No se puede inferir nacimiento ni sexo."
        : "Falta CURP para inferir identidad.";

  return [
    {
      key: "curp",
      title: "CURP",
      label: curpLabel,
      summary: curpSummary,
      count: curpState === "ok" ? "1/1" : "0/1",
      tone: curpState === "ok" ? "complete" : curpState === "invalid" ? "danger" : "warning",
      icon: LucideShieldCheck,
    },
    {
      key: "padre",
      title: "Padre",
      label: father.status,
      summary: father.summary,
      count: `${father.completed}/${father.total}`,
      tone: father.tone,
      icon: LucideUserRound,
    },
    {
      key: "madre",
      title: "Madre",
      label: mother.status,
      summary: mother.summary,
      count: `${mother.completed}/${mother.total}`,
      tone: mother.tone,
      icon: LucideUsersRound,
    },
    {
      key: "contacto",
      title: "Contacto",
      label: contact.status,
      summary: contact.summary,
      count: `${contact.completed}/${contact.total}`,
      tone: contact.tone,
      icon: LucidePhone,
    },
  ];
});
const detailTabState = (key) => {
  const father = familyPersonState("padre");
  const mother = familyPersonState("madre");
  const contact = familyCriticalContactState.value;
  const familyPending = father.missing.length + mother.missing.length + contact.missing.length;
  const states = {
    identity: selectedIdentityStatus.value,
    school: selectedSchoolStatus.value,
    family: {
      tone: familyPending ? (familyPending >= 3 ? "danger" : "warning") : "complete",
      count: familyPending,
    },
    system: {
      tone: selectedStudent.value?.huskyPassAvailable ? "complete" : "warning",
      count: selectedStudent.value?.huskyPassAvailable ? 0 : 1,
    },
    notes: { tone: "neutral", count: 0 },
  };
  return states[key] || { tone: "neutral", count: 0 };
};
const editableInvalidFields = () => [
  "curp",
  "telefonoPadre",
  "telefonoMadre",
  "emailPadre",
  "emailMadre",
].filter((field) => fieldValidationState(field) === "invalid");
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
  "nombreVerificado",
  "nombreCompletoAlumno",
  "lastGrade",
  "lastCiclo",
  "lugarNacimiento",
  "talla",
  "peso",
  "tipoSangre",
  "alergias",
  "foto",
  "nivel",
  "grado",
  "grupo",
  "ciclo",
  "servicio",
  "interno",
  "eventual",
  "verified",
  "baja",
  "motivoBaja",
  "categoriaBaja",
  "seguimientoBaja",
  "servicioNotas",
  "nombrePadre",
  "apellidoPaternoPadre",
  "apellidoMaternoPadre",
  "lugarTrabajoPadre",
  "puestoPadre",
  "estadoCivilPadre",
  "fechaNacimientoPadre",
  "inePadre",
  "curpPadre",
  "nombreMadre",
  "apellidoPaternoMadre",
  "apellidoMaternoMadre",
  "lugarTrabajoMadre",
  "puestoMadre",
  "estadoCivilMadre",
  "fechaNacimientoMadre",
  "ineMadre",
  "curpMadre",
  "telefonoPadre",
  "telefonoMadre",
  "emailPadre",
  "emailMadre",
  "direccion",
  "domicilioCalle",
  "domicilioNumero",
  "domicilioColonia",
  "domicilioCp",
  "domicilioMunicipio",
  "certificadoMedicoAdjunto",
  "certificadoVacunacionCovid19Adjunto",
  "actaNacimientoAdjunta",
  "curpAlumnoAdjunto",
  "certificadoPrimariaAdjunto",
  "boletaSextoPrimariaAdjunta",
  "boletaPrimeroSecundariaAdjunta",
  "boletaSegundoSecundariaAdjunta",
  "familyId",
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
  savingStudent.value
    ? "saving"
    : saveError.value
      ? "error"
      : hasUnsavedChanges.value
        ? "dirty"
        : "clean",
);
const saveStatusText = computed(() => {
  if (savingStudent.value) return "Guardando...";
  if (saveError.value) return "Error al guardar";
  if (hasUnsavedChanges.value)
    return draftSavedAt.value
      ? `Borrador local ${draftSavedAt.value}`
      : "Cambios sin guardar";
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

const controlStudentsScopeCacheKey = (
  query = buildQuery(),
  version = CONTROL_STUDENTS_SCOPE_CACHE_VERSION,
) => {
  const scope = controlCacheScopeFromQuery(query);
  return `${CONTROL_STUDENTS_SCOPE_CACHE_NAMESPACE}:v${version}:${encodeURIComponent(scope.agentId)}:${encodeURIComponent(scope.ciclo)}`;
};

const controlStudentsCacheKey = (
  query = buildQuery(),
  version = CONTROL_STUDENTS_CACHE_VERSION,
) => {
  const scope = controlCacheScopeFromQuery(query);
  return `${CONTROL_STUDENTS_CACHE_NAMESPACE}:v${version}:${encodeURIComponent(scope.agentId)}:${encodeURIComponent(scope.ciclo)}:${controlStudentsCacheSignature(query)}`;
};

const controlStudentsCacheLookupKeys = (query = buildQuery()) => [
  controlStudentsScopeCacheKey(query),
  ...CONTROL_STUDENTS_CACHE_READ_VERSIONS.flatMap((version) => [
    controlStudentsCacheKey(query, version),
    controlStudentsLegacyCacheKey(query, version),
  ]),
];

const clearControlStudentsBrowserCache = () => {
  if (!process.client) return;
  try {
    const keysToRemove = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || "";
      if (
        key.startsWith(CONTROL_STUDENTS_CACHE_NAMESPACE) ||
        key.startsWith(CONTROL_STUDENTS_SCOPE_CACHE_NAMESPACE)
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn("[Control Escolar] No se pudo limpiar la caché local de alumnos.", error);
  }
};

const readControlScopeCacheIndex = () => {
  if (!process.client) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTROL_STUDENTS_SCOPE_CACHE_INDEX_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (_) {
    return [];
  }
};

const writeControlScopeCacheIndex = (keys = []) => {
  if (!process.client) return;
  try {
    localStorage.setItem(
      CONTROL_STUDENTS_SCOPE_CACHE_INDEX_KEY,
      JSON.stringify(keys.slice(0, CONTROL_STUDENTS_SCOPE_CACHE_MAX_SCOPES)),
    );
  } catch (_) {}
};

const touchControlScopeCacheKey = (key) => {
  if (!process.client || !key) return;
  const nextKeys = [key, ...readControlScopeCacheIndex().filter((candidate) => candidate !== key)];
  const staleKeys = nextKeys.slice(CONTROL_STUDENTS_SCOPE_CACHE_MAX_SCOPES);
  staleKeys.forEach((staleKey) => {
    try {
      localStorage.removeItem(staleKey);
    } catch (_) {}
  });
  writeControlScopeCacheIndex(nextKeys);
};

const removeLegacyControlStudentsCacheForScope = (query = buildQuery()) => {
  if (!process.client) return;
  const scope = controlCacheScopeFromQuery(query);
  const scopePrefix = `${CONTROL_STUDENTS_CACHE_NAMESPACE}:v`;
  const encodedAgent = encodeURIComponent(scope.agentId);
  const encodedCiclo = encodeURIComponent(scope.ciclo);

  try {
    const keysToRemove = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || "";
      if (
        key.startsWith(scopePrefix) &&
        key.includes(`:${encodedAgent}:${encodedCiclo}:`)
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (_) {}
};

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
    version: CONTROL_STUDENTS_SCOPE_CACHE_VERSION,
    scope: cached.scope || controlCacheScopeFromQuery(query),
    query: cached.query || normalizeControlCacheParams(query),
    data: sanitizedData,
  };
};

const isReadableCachedControlStudentsVersion = (value) => {
  const version = Number(value);
  return (
    version === CONTROL_STUDENTS_SCOPE_CACHE_VERSION ||
    CONTROL_STUDENTS_CACHE_READ_VERSIONS.includes(version)
  );
};

const readCachedControlStudents = (_query = buildQuery()) => {
  clearControlStudentsBrowserCache();
  return null;
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

const writeCachedControlStudents = () => {
  clearControlStudentsBrowserCache();
  return false;
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

const phoneDigits = (value) => String(value || "").replace(/\D/g, "");
const isValidPhone = (value) => phoneDigits(value).length >= 10;
const normalizeEmailValue = (value) => String(value || "").trim().toLowerCase();
const isValidFamilyEmail = (value) => {
  const email = normalizeEmailValue(value);
  if (!email || email.includes("@casita")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
const parentDisplayName = (student = {}, type = "padre") => {
  if (type === "madre") {
    return [student.nombreMadre, student.apellidoPaternoMadre, student.apellidoMaternoMadre]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ") || String(student.motherName || student.nombreMadreCompleto || "").trim();
  }
  return [student.nombrePadre, student.apellidoPaternoPadre, student.apellidoMaternoPadre]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ") || String(student.fatherName || student.nombrePadreCompleto || "").trim();
};
const isParentComplete = (student = {}, type = "padre") => {
  const name = parentDisplayName(student, type);
  const phone = type === "madre" ? student.telefonoMadre : (student.telefonoPadre || student.phone || student.telefono);
  const email = type === "madre" ? student.emailMadre : (student.emailPadre || student.email || student.correo);
  return Boolean(name && isValidPhone(phone) && isValidFamilyEmail(email));
};
const hasNoPrimaryContactClient = (student = {}) =>
  !isParentComplete(student, "padre") && !isParentComplete(student, "madre");

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
  if (normalized === "padre" || normalized === "father") return missing.includes("padre");
  if (normalized === "madre" || normalized === "mother") return missing.includes("madre");
  if (normalized === "phone" || normalized === "telefono" || normalized === "email" || normalized === "guardian" || normalized === "tutor")
    return missing.includes("padre") || missing.includes("madre");
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
    sinPadre: progressRows.filter((student) => ["padrenombre", "padreapellidopaterno", "padretelefono", "padreemail"].some((field) => normalizedMissingFields(student).includes(field))).length,
    sinMadre: progressRows.filter((student) => ["madrenombre", "madreapellidopaterno", "madretelefono", "madreemail"].some((field) => normalizedMissingFields(student).includes(field))).length,
    sinTelefono: progressRows.filter((student) => ["padretelefono", "madretelefono"].some((field) => normalizedMissingFields(student).includes(field))).length,
    sinTutor: progressRows.filter((student) => ["padrenombre", "padreapellidopaterno", "madrenombre", "madreapellidopaterno"].some((field) => normalizedMissingFields(student).includes(field))).length,
    sinEmail: progressRows.filter((student) => ["padreemail", "madreemail"].some((field) => normalizedMissingFields(student).includes(field))).length,
  };
};

const buildControlAuditProgress = () => {
  const rows = Array.isArray(controlStudentsIndex.value)
    ? controlStudentsIndex.value
    : [];
  const progressRows = rows.filter(isInscritoForControlProgress);
  const total = progressRows.length;
  const completed = progressRows.filter(
    (student) => normalizedMissingFields(student).length === 0,
  ).length;
  const pending = Math.max(0, total - completed);
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return { percent, total, completed, pending };
};

const postControlAuditSnapshot = (reason = "control_escolar_page_loaded") => {
  if (!selectedAgentId.value || typeof window === "undefined") return;
  const progress = buildControlAuditProgress();
  const source = controlDataSource.value || {};
  const flow = source?.diagnostics?.flow || source?.phase || source?.cacheFreshness || "";
  const snapshotKey = [
    selectedAgentId.value,
    currentCicloKey.value,
    progress.percent,
    progress.total,
    progress.completed,
    progress.pending,
    source?.base || "",
    flow,
  ].join("|");
  const now = Date.now();

  if (snapshotKey === lastControlAuditSnapshotKey && now - lastControlAuditSnapshotAt < 5 * 60 * 1000) {
    return;
  }

  lastControlAuditSnapshotKey = snapshotKey;
  lastControlAuditSnapshotAt = now;

  $fetch("/api/control-escolar/audit/snapshot", {
    method: "POST",
    body: {
      plantel: selectedAgentId.value,
      ciclo: currentCicloKey.value,
      progress,
      visibleRows: students.value.length,
      totalRows: controlStudentsIndex.value.length,
      counters: kpis.value || buildClientKpisFromStudents(controlStudentsIndex.value),
      source: {
        base: source?.base || "",
        flow,
        cacheFreshness: source?.cacheFreshness || "",
        bridgeFallback: Boolean(source?.bridgeFallback),
      },
      reason,
    },
  }).catch((error) => {
    console.warn("[Control Escolar Audit] Snapshot skipped", error?.message || error);
  });
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
    useCache = false,
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

  controlCacheStage.value = "empty";
  controlBaseStage.value = "idle";
  controlExternalDbStage.value = "idle";
  controlCompleteStage.value = "idle";
  controlExternalDbRows.value = 0;
  publishControlSyncIndicatorState({ status: "syncing", message: "Cargando Control Escolar" });

  const cacheStartedAt = controlNow();
  const cached = null;
  if (useCache || CONTROL_STUDENTS_BROWSER_CACHE_ENABLED) clearControlStudentsBrowserCache();
  markClientStep(
    "browser-cache",
    "Cache local del navegador",
    cacheStartedAt,
    "disabled",
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
    publishControlSyncIndicatorState({ status: "cached", message: "Cache local del plantel/ciclo visible mientras se actualiza." });
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
    const responseSource = response?.source || {};
    const isSnapshotFallback = Boolean(responseSource.bridgeFallback) || String(responseSource.base || "").startsWith("verified-cache:");
    controlBaseStage.value = isSnapshotFallback ? "partial" : "ready";
    const externalDbRows = getControlExternalDbRowCount(responseSource);
    controlExternalDbRows.value = externalDbRows;
    controlExternalDbStage.value = externalDbRows > 0 ? "ready" : "empty";
    controlDataFreshness.value = isSnapshotFallback ? "cache" : externalDbRows > 0 ? "synced" : "base";
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
    publishControlSyncIndicatorState();
    postControlAuditSnapshot(isSnapshotFallback ? "snapshot_fallback_visible" : "live_bridge_visible");
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
    publishControlSyncIndicatorState({ status: "failed" });
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
    nombreVerificado: student.nombreVerificado || "",
    nombreCompletoAlumno: student.nombreCompletoAlumno || student.fullName || "",
    lastGrade: student.lastGrade || "",
    lastCiclo: student.lastCiclo || "",
    lugarNacimiento: student.lugarNacimiento || "",
    talla: student.talla || "",
    peso: student.peso || "",
    tipoSangre: student.tipoSangre || "",
    alergias: student.alergias || "",
    foto: student.foto || "",
    nivel: student.nivel || "",
    grado: student.grado || "",
    grupo: student.group || student.grupo || "",
    ciclo: student.ciclo || currentCicloKey.value || "",
    servicio: student.servicio || "",
    interno: Number(student.interno || 0),
    eventual: Number(student.eventual || 0),
    verified: Number(student.verified || 0),
    baja: Number(student.baja || 0),
    motivoBaja: student.motivoBaja || "",
    categoriaBaja: student.categoriaBaja || "",
    seguimientoBaja: student.seguimientoBaja || "",
    servicioNotas: student.servicioNotas || "",
    nombrePadre: student.nombrePadre || "",
    apellidoPaternoPadre: student.apellidoPaternoPadre || "",
    apellidoMaternoPadre: student.apellidoMaternoPadre || "",
    lugarTrabajoPadre: student.lugarTrabajoPadre || "",
    puestoPadre: student.puestoPadre || "",
    estadoCivilPadre: student.estadoCivilPadre || "",
    fechaNacimientoPadre: normalizeDateInput(student.fechaNacimientoPadre),
    inePadre: student.inePadre || "",
    curpPadre: student.curpPadre || "",
    nombreMadre: student.nombreMadre || "",
    apellidoPaternoMadre: student.apellidoPaternoMadre || "",
    apellidoMaternoMadre: student.apellidoMaternoMadre || "",
    lugarTrabajoMadre: student.lugarTrabajoMadre || "",
    puestoMadre: student.puestoMadre || "",
    estadoCivilMadre: student.estadoCivilMadre || "",
    fechaNacimientoMadre: normalizeDateInput(student.fechaNacimientoMadre),
    ineMadre: student.ineMadre || "",
    curpMadre: student.curpMadre || "",
    telefonoPadre: student.telefonoPadre || "",
    telefonoMadre: student.telefonoMadre || "",
    emailPadre: student.emailPadre || "",
    emailMadre: student.emailMadre || "",
    direccion: student.address || student.direccion || "",
    domicilioCalle: student.domicilioCalle || "",
    domicilioNumero: student.domicilioNumero || student.domicioNum || "",
    domicilioColonia: student.domicilioColonia || "",
    domicilioCp: student.domicilioCp || "",
    domicilioMunicipio: student.domicilioMunicipio || "",
    certificadoMedicoAdjunto: student.certificadoMedicoAdjunto || "",
    certificadoVacunacionCovid19Adjunto: student.certificadoVacunacionCovid19Adjunto || "",
    actaNacimientoAdjunta: student.actaNacimientoAdjunta || "",
    curpAlumnoAdjunto: student.curpAlumnoAdjunto || "",
    certificadoPrimariaAdjunto: student.certificadoPrimariaAdjunto || "",
    boletaSextoPrimariaAdjunta: student.boletaSextoPrimariaAdjunta || "",
    boletaPrimeroSecundariaAdjunta: student.boletaPrimeroSecundariaAdjunta || "",
    boletaSegundoSecundariaAdjunta: student.boletaSegundoSecundariaAdjunta || "",
    familyId: student.familyId || "",
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
  const invalidFields = editableInvalidFields();
  if (invalidFields.length) {
    saveError.value = "Revisa los campos marcados antes de guardar.";
    return;
  }
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
  () => [
    studentsLoading.value,
    kpisLoading.value,
    loadError.value,
    controlDataFreshness.value,
    controlExternalDbRows.value,
    controlStudentsIndex.value.length,
    students.value.length,
    controlDataSource.value?.cacheFreshness || "",
  ],
  () => publishControlSyncIndicatorState(),
  { flush: "post" },
);

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
    clearControlStudentsBrowserCache();
    localHour.value = new Date().getHours();
    window.addEventListener("ingresos:ciclo-changed", handleCicloChanged);
    window.addEventListener("control-escolar:open-sync-diagnostics", openControlDiagnosticsModal);
    window.addEventListener("resize", scheduleControlScreenScaleUpdate, { passive: true });
    publishControlSyncIndicatorState();
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
.ce-profile-summary-grid {
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

.ce-profile-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.ce-profile-summary-item {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid #e0e9e2;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 7px 16px rgba(36, 70, 44, 0.045);
}

.ce-profile-summary-item small {
  display: block;
  color: #2f7b3a;
  font-size: 9px;
  font-weight: 920;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ce-profile-summary-item strong {
  display: block;
  overflow: hidden;
  margin-top: 4px;
  color: #16243d;
  font-size: 12px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.ce-profile-summary-item strong,
.ce-empty-flow li b {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}

.ce-title-row h2,
.ce-profile-copy strong,
.ce-profile-summary-item strong {
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


/* Control Escolar detail panel: compact responsive editorial pass. */
.ce-detail-shell {
  container-type: inline-size;
  border-color: #dce6f0;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(21, 35, 60, 0.05);
}

.ce-detail-header {
  grid-template-columns: minmax(0, 1.1fr) minmax(214px, 0.58fr) minmax(172px, 0.42fr) 38px;
  min-height: 86px;
  align-items: center;
  gap: 14px;
  padding: 14px 16px 14px 18px;
  border-bottom-color: #e8eef5;
  background: #fff;
}

.ce-detail-title small {
  color: #6b778e;
  font-size: 10.5px;
  letter-spacing: 0.055em;
}

.ce-title-row {
  flex-wrap: wrap;
  gap: 9px;
}

.ce-title-row h2 {
  min-width: min(100%, 240px);
  font-size: clamp(16.5px, 1.28vw, 21px);
  line-height: 1.08;
  white-space: normal;
}

.ce-access-header-card {
  grid-template-columns: 38px minmax(0, 1fr);
  min-height: 60px;
  padding: 10px 12px;
  border-radius: 16px;
  background: linear-gradient(180deg, #fbfef9, #fff);
}

.ce-access-header-card > span {
  width: 34px;
  height: 34px;
  border-radius: 12px;
}

.ce-access-icon img {
  display: block;
  width: 26px;
  max-height: 22px;
  object-fit: contain;
  opacity: 0.86;
}

.ce-access-header-card strong {
  font-size: 12px;
  letter-spacing: -0.01em;
}

.ce-access-header-card small {
  font-size: 10.5px;
  line-height: 1.25;
}

.ce-progress-cluster {
  justify-self: stretch;
  gap: 6px;
}

.ce-progress-cluster strong {
  color: #394860;
  font-size: 12px;
  letter-spacing: -0.01em;
}

.ce-progress-track {
  height: 8px;
  background: #e7eee9;
}

.ce-detail-menu-button {
  width: 38px;
  height: 38px;
  border-radius: 13px;
}

.ce-detail-body {
  gap: 12px;
  padding: 12px 14px 14px;
  background: #fff;
  scrollbar-gutter: stable;
}

.ce-profile-card {
  grid-template-columns: minmax(72px, 84px) minmax(0, 1fr) minmax(220px, 0.58fr);
  min-height: 112px;
  gap: 16px;
  padding: 14px 16px;
  border-color: #dce6f0;
  border-radius: 16px;
  background:
    radial-gradient(circle at 88% 50%, rgba(63, 145, 56, 0.08), transparent 170px),
    linear-gradient(90deg, #fff 0%, #fff 78%, #f8fcf6 100%);
}

.ce-detail-photo {
  --student-grade-photo-width: 80px;
  --student-grade-photo-height: 74px;
  --student-grade-photo-radius: 16px;
}

.ce-profile-copy strong {
  color: #13223c;
  font-size: clamp(16px, 1.2vw, 19px);
  line-height: 1.1;
}

.ce-profile-pills {
  gap: 7px;
  margin-top: 8px;
}

.ce-profile-pills span {
  min-height: 24px;
  padding-inline: 10px;
  background: #edf8ea;
}

.ce-profile-copy p {
  margin-top: 8px;
  color: #68768f;
  font-size: 11.5px;
  line-height: 1.35;
}

.ce-profile-summary-grid {
  align-self: stretch;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.ce-profile-summary-item {
  display: grid;
  min-height: 62px;
  align-content: center;
  border-color: #e1eadf;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 18px rgba(21, 35, 60, 0.04);
}

.ce-profile-summary-item strong {
  line-height: 1.15;
}

.ce-profile-watermark {
  right: 20px;
  --group-icon-size: 132px;
  opacity: 0.075;
}

.ce-data-section {
  grid-template-columns: minmax(210px, 0.35fr) minmax(0, 1fr);
  min-height: 68px;
  gap: 14px;
  padding: 12px 14px;
  border-color: rgba(63, 145, 56, 0.18);
  border-radius: 16px;
  background: linear-gradient(90deg, #f8fcf6, #fff 62%);
}

.ce-section-heading > span {
  width: 34px;
  height: 34px;
}

.ce-section-heading h3 {
  color: #15233c;
  font-size: 13px;
}

.ce-section-heading p {
  max-width: 36ch;
  font-size: 11px;
  line-height: 1.35;
}

.ce-missing-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
}

.ce-missing-chip {
  min-height: 42px;
  justify-content: center;
  border-radius: 13px;
  font-size: 11px;
}

.ce-missing-chip b {
  min-width: 42px;
  border-radius: 999px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.54);
  text-align: center;
}

.ce-detail-tabs {
  min-height: 44px;
  gap: clamp(12px, 2vw, 26px);
  padding-inline: 12px;
  border-bottom-color: #e3ebf3;
}

.ce-detail-tabs button {
  height: 44px;
  color: #5f6f89;
}

.ce-detail-tabs button.active {
  border-bottom-color: #279233;
  color: #20882d;
}

.ce-edit-form {
  gap: 12px;
}

.ce-form-card {
  border-color: #dce6f0;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 8px 18px rgba(21, 35, 60, 0.035);
}

.ce-form-grid.two {
  grid-template-columns: repeat(2, minmax(180px, 1fr));
}

.ce-form-grid input,
.ce-form-grid select,
.ce-wide-field textarea {
  min-height: 42px;
  border-color: #d3deeb;
  border-radius: 12px;
  background: #fbfdff;
  font-size: 12.5px;
}

.ce-detail-footer {
  min-height: 66px;
  padding: 10px 18px;
  border-top-color: rgba(223, 231, 240, 0.96);
  background: linear-gradient(90deg, rgba(255, 251, 244, 0.96), rgba(255, 255, 255, 0.98));
}

@container (max-width: 860px) {
  .ce-detail-header {
    grid-template-columns: minmax(0, 1fr) 38px;
    min-height: 0;
  }

  .ce-detail-title {
    grid-column: 1;
    grid-row: 1;
  }

  .ce-detail-menu-button {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
  }

  .ce-access-header-card,
  .ce-progress-cluster {
    grid-column: 1 / -1;
  }

  .ce-access-header-card {
    grid-row: 2;
  }

  .ce-progress-cluster {
    grid-row: 3;
    max-width: none;
  }

  .ce-profile-card {
    grid-template-columns: minmax(68px, 78px) minmax(0, 1fr);
  }

  .ce-profile-summary-grid {
    grid-column: 1 / -1;
  }

  .ce-data-section {
    grid-template-columns: 1fr;
  }

  .ce-section-heading p {
    max-width: none;
  }
}

@container (max-width: 620px) {
  .ce-detail-header,
  .ce-detail-body,
  .ce-detail-footer {
    padding-inline: 12px;
  }

  .ce-profile-card {
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 12px;
    padding: 12px;
  }

  .ce-detail-photo {
    --student-grade-photo-width: 64px;
    --student-grade-photo-height: 62px;
  }

  .ce-profile-summary-grid,
  .ce-missing-grid,
  .ce-form-grid.two,
  .ce-tab-panel .ce-form-grid.three,
  .ce-system-grid {
    grid-template-columns: 1fr;
  }

  .ce-detail-tabs {
    gap: 14px;
    padding-inline: 4px;
  }

  .ce-detail-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .ce-detail-footer div {
    justify-content: stretch;
  }

  .ce-detail-footer :deep(.ui-button) {
    flex: 1 1 0;
  }
}


.ce-diagnostics-modal {
  width: min(880px, calc(100vw - 36px));
  max-height: min(780px, calc(100vh - 40px));
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

.ce-diagnostics-hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(210px, .7fr);
  gap: 14px;
  align-items: start;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid rgba(217, 228, 240, 0.92);
  background:
    radial-gradient(circle at top right, rgba(87, 163, 255, 0.12), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 1), rgba(248, 251, 255, 0.98));
}

.ce-diagnostics-hero-card small,
.ce-diagnostics-section-card__head small {
  color: #5b6f8f;
  font-size: 0.7rem;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.ce-diagnostics-hero-card h3,
.ce-diagnostics-section-card__head h3 {
  margin: 4px 0 0;
  color: #172033;
  font-size: 1rem;
  font-weight: 880;
}

.ce-diagnostics-hero-card p {
  margin: 8px 0 0;
  color: #526175;
  font-size: 0.88rem;
  line-height: 1.58;
}

.ce-diagnostics-query-pill {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(204, 220, 241, 0.96);
  background: rgba(243, 248, 255, 0.92);
}

.ce-diagnostics-query-pill span {
  color: #264061;
  font-size: 0.92rem;
  font-weight: 820;
  overflow-wrap: anywhere;
}

.ce-diagnostics-query-pill small {
  color: #667a96;
  font-size: 0.74rem;
}

.ce-diagnostics-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}

.ce-diagnostics-summary-card,
.ce-diagnostics-section-card,
.ce-diagnostics-facts-grid div {
  display: grid;
  gap: 4px;
  border: 1px solid rgba(220, 230, 241, 0.88);
  background: #fff;
}

.ce-diagnostics-summary-card {
  min-width: 0;
  padding: 11px 12px;
  border-radius: 14px;
}

.ce-diagnostics-summary-card.is-success {
  background: linear-gradient(180deg, rgba(242, 250, 246, 1), rgba(255, 255, 255, 1));
}

.ce-diagnostics-summary-card.is-info {
  background: linear-gradient(180deg, rgba(241, 247, 255, 1), rgba(255, 255, 255, 1));
}

.ce-diagnostics-summary-card.is-danger {
  background: linear-gradient(180deg, rgba(255, 243, 243, 1), rgba(255, 255, 255, 1));
}

.ce-diagnostics-summary-card small,
.ce-diagnostics-facts-grid dt {
  color: #718096;
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ce-diagnostics-summary-card strong,
.ce-diagnostics-facts-grid dd {
  color: #25324a;
  font-size: 0.84rem;
  font-weight: 760;
}

.ce-diagnostics-section-card {
  gap: 14px;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(250, 252, 254, 0.82);
}

.ce-diagnostics-section-card--compact {
  gap: 10px;
}

.ce-diagnostics-section-card__head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.ce-diagnostics-inline-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(236, 244, 255, 0.95);
  color: #2b5faa;
  font-size: 0.74rem;
  font-weight: 850;
}

.ce-diagnostics-tree {
  display: grid;
  gap: 8px;
}

.ce-diagnostics-tree__arrow {
  justify-self: center;
  color: #7f93ad;
  font-size: 1.35rem;
  font-weight: 700;
}

.ce-diagnostics-node {
  display: grid;
  grid-template-columns: 126px minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(220, 230, 241, 0.88);
  background: linear-gradient(180deg, rgba(255, 255, 255, 1), rgba(250, 252, 255, 0.98));
}

.ce-diagnostics-node.is-success { border-color: rgba(182, 223, 194, 0.95); }
.ce-diagnostics-node.is-info { border-color: rgba(180, 210, 245, 0.95); }
.ce-diagnostics-node.is-danger { border-color: rgba(244, 191, 191, 0.95); }

.ce-diagnostics-node__rail {
  display: grid;
  align-content: start;
  gap: 6px;
}

.ce-diagnostics-node__lane,
.ce-diagnostics-node__status,
.ce-diagnostics-node__time {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 850;
}

.ce-diagnostics-node__lane {
  background: rgba(240, 245, 252, 1);
  color: #4f627f;
}

.ce-diagnostics-node__status,
.ce-diagnostics-node__time {
  background: rgba(246, 248, 251, 1);
  color: #55657c;
}

.ce-diagnostics-node.is-success .ce-diagnostics-node__status {
  background: rgba(237, 248, 241, 1);
  color: #2d7a49;
}

.ce-diagnostics-node.is-info .ce-diagnostics-node__status {
  background: rgba(237, 245, 253, 1);
  color: #2b6cb0;
}

.ce-diagnostics-node.is-danger .ce-diagnostics-node__status {
  background: rgba(255, 240, 240, 1);
  color: #c24141;
}

.ce-diagnostics-node__body {
  display: grid;
  gap: 8px;
}

.ce-diagnostics-node__body header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.ce-diagnostics-node__body h4 {
  margin: 0;
  color: #172033;
  font-size: 0.94rem;
  font-weight: 850;
}

.ce-diagnostics-node__body header p,
.ce-diagnostics-node__why {
  margin: 4px 0 0;
  color: #526175;
  font-size: 0.84rem;
  line-height: 1.56;
}

.ce-diagnostics-node__why b {
  color: #2f3e57;
}

.ce-diagnostics-node__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ce-diagnostics-node__meta li {
  display: grid;
  gap: 3px;
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid rgba(224, 233, 244, 0.78);
  background: rgba(255, 255, 255, 0.92);
}

.ce-diagnostics-node__meta span {
  color: #7b8aa0;
  font-size: 0.66rem;
  font-weight: 820;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ce-diagnostics-node__meta strong {
  color: #25324a;
  font-size: 0.82rem;
  font-weight: 760;
  overflow-wrap: anywhere;
}

.ce-diagnostics-facts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.ce-diagnostics-facts-grid dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.ce-diagnostics-empty {
  padding: 24px;
  color: #526175;
}

@media (max-width: 860px) {
  .ce-diagnostics-hero-card,
  .ce-diagnostics-node,
  .ce-diagnostics-facts-grid {
    grid-template-columns: 1fr;
  }

  .ce-diagnostics-section-card__head,
  .ce-diagnostics-node__body header {
    flex-direction: column;
  }
}


/* Reference-aligned Control Escolar detail panel pass. */
.ce-detail-shell {
  container-type: inline-size;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
}

.ce-detail-header {
  grid-template-columns: minmax(0, 1.1fr) minmax(220px, 0.8fr) minmax(240px, 0.62fr) 48px;
  min-height: 104px;
  align-items: center;
  gap: 16px;
  padding: 16px 18px 18px;
  border-bottom: 1px solid #e7edf5;
  background: #ffffff;
}

.ce-detail-title small {
  color: #6b778e;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.ce-title-row {
  align-items: flex-start;
  gap: 14px;
}

.ce-title-row h2 {
  margin: 0;
  max-width: 11ch;
  color: #10203a;
  font-size: clamp(18px, 2.15cqi, 24px);
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 1.05;
}

.ce-status-pill.large {
  min-height: 40px;
  padding-inline: 18px;
  font-size: 13px;
  font-weight: 900;
}

.ce-detail-actions {
  display: none;
}

.ce-access-header-card {
  grid-template-columns: 40px minmax(0, 1fr);
  min-height: 72px;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: none;
}

.ce-access-header-card > span {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #f6f8f4;
}

.ce-access-icon img {
  width: 24px;
  max-height: 24px;
  object-fit: contain;
  opacity: 1;
}

.ce-access-header-card strong {
  color: #1f8a34;
  font-size: 12px;
  font-weight: 900;
}

.ce-access-header-card small {
  color: #66758e;
  font-size: 11px;
  font-weight: 780;
  line-height: 1.3;
}

.ce-progress-cluster {
  align-self: center;
  gap: 8px;
}

.ce-progress-cluster strong {
  color: #32435d;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.15;
}

.ce-progress-track {
  height: 8px;
  border-radius: 999px;
  background: #dfebdf;
}

.ce-progress-cluster small {
  display: block;
  color: #66758e;
  font-size: 11px;
  font-weight: 780;
  line-height: 1.25;
}

.ce-detail-menu-button {
  width: 44px;
  height: 44px;
  align-self: start;
  justify-self: end;
  border: 1px solid #dfe7ef;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
}

.ce-detail-menu-button:hover {
  background: #f7fafc;
}

.ce-detail-body {
  gap: 14px;
  padding: 14px 18px 14px;
  background: #ffffff;
}

.ce-detail-status-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-height: 72px;
  padding: 12px 14px;
  border: 1px solid rgba(86, 165, 85, 0.18);
  border-radius: 16px;
  background: linear-gradient(180deg, #fcfefc, #ffffff);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.03);
}

.ce-inline-note {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 0 2px;
}

.ce-inline-note > span {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #edf8ea;
  color: #2f8f37;
}

.ce-inline-note p {
  margin: 0;
  color: #43536d;
  font-size: 12px;
  font-weight: 820;
  line-height: 1.35;
}

.ce-missing-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}

.ce-missing-chip {
  min-height: 42px;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid rgba(224, 98, 87, 0.24);
  border-radius: 14px;
  background: #fffdfd;
  color: #df5142;
  font-size: 12px;
  font-weight: 860;
  white-space: nowrap;
}

.ce-missing-chip b {
  padding: 0;
  background: transparent;
  color: inherit;
  font-size: 12px;
  font-weight: 900;
}

.ce-missing-chip.ok {
  border-color: rgba(86, 165, 85, 0.22);
  background: #fbfefb;
  color: #20882d;
}

.ce-detail-tabs {
  min-height: 46px;
  gap: clamp(12px, 2.3cqi, 28px);
  padding: 0 4px;
  border-bottom: 1px solid #e2e8f0;
}

.ce-detail-tabs button {
  height: 46px;
  gap: 8px;
  color: #5f6f89;
  font-size: 12px;
  font-weight: 860;
}

.ce-detail-tabs button.active {
  border-bottom-color: #279233;
  color: #229433;
}

.ce-inline-note--tab {
  min-height: 56px;
  padding: 0 14px;
  border: 1px solid rgba(86, 165, 85, 0.16);
  border-radius: 16px;
  background: linear-gradient(180deg, #fcfefc, #ffffff);
}

.ce-tab-panel {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.ce-family-panel {
  display: grid;
  gap: 14px;
}

.ce-family-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
}

.ce-family-card {
  display: grid;
  gap: 18px;
  min-width: 0;
  padding: 14px 16px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.03);
}

.ce-family-card h3 {
  margin: 0;
  color: #42516c;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.ce-family-fields {
  gap: 18px 18px;
}

.ce-family-fields--mother {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.ce-family-span-2 {
  grid-column: span 2;
}

.ce-form-grid label,
.ce-wide-field {
  gap: 8px;
}

.ce-form-grid span,
.ce-wide-field span {
  color: #56657e;
  font-size: 11px;
  font-weight: 820;
  letter-spacing: 0;
  text-transform: none;
}

.ce-form-grid input,
.ce-form-grid select,
.ce-wide-field textarea {
  min-height: 56px;
  border: 1px solid #e4ebf3;
  border-radius: 14px;
  background: #ffffff;
  color: #22324a;
  font-size: 13px;
  font-weight: 720;
  padding: 0 16px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

.ce-form-grid input:focus,
.ce-form-grid select:focus,
.ce-wide-field textarea:focus {
  border-color: rgba(60, 151, 65, 0.42);
  box-shadow: 0 0 0 3px rgba(60, 151, 65, 0.1);
}

.ce-smart-field {
  position: relative;
}

.ce-smart-field input,
.ce-smart-field select {
  padding-right: 42px;
  transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
}

.ce-smart-field::after {
  position: absolute;
  right: 14px;
  bottom: 18px;
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
  pointer-events: none;
}

.ce-smart-field small {
  min-height: 15px;
  margin-top: -2px;
  color: #7a8799;
  font-size: 10.5px;
  font-weight: 760;
}

.ce-smart-field.is-ok input,
.ce-smart-field.is-ok select {
  border-color: rgba(65, 166, 75, .38);
  background: linear-gradient(180deg, #ffffff, #fbfefb);
}

.ce-smart-field.is-ok::after {
  content: "✓";
  background: #e9f8e9;
  color: #20882d;
}

.ce-smart-field.is-missing input,
.ce-smart-field.is-missing select,
.ce-smart-field.is-invalid input,
.ce-smart-field.is-invalid select {
  border-color: rgba(228, 86, 74, .46);
  background: linear-gradient(180deg, #fffefe, #fff8f8);
  box-shadow: 0 0 0 3px rgba(228, 86, 74, .055);
}

.ce-smart-field.is-missing::after,
.ce-smart-field.is-invalid::after {
  content: "!";
  background: #fff1ef;
  color: #d83b2f;
}

.ce-smart-field.is-missing small,
.ce-smart-field.is-invalid small {
  color: #c93b31;
}

.ce-derived-card {
  display: grid;
  align-content: center;
  gap: 4px;
  min-height: 56px;
  padding: 11px 14px;
  border: 1px solid rgba(82, 154, 91, .18);
  border-radius: 14px;
  background: linear-gradient(180deg, #fbfefb, #ffffff);
}

.ce-derived-card span {
  color: #6b7c92;
  font-size: 10.5px;
  font-weight: 850;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.ce-derived-card strong {
  color: #20314d;
  font-size: 12.5px;
  font-weight: 840;
  line-height: 1.35;
}

.ce-family-address {
  margin-top: 0;
}

.ce-family-address textarea {
  min-height: 112px;
  padding: 14px 16px;
  resize: vertical;
}

.ce-detail-footer {
  min-height: 74px;
  padding: 14px 18px 18px;
  border-top: 1px solid #e7edf5;
  background: linear-gradient(180deg, #fffaf3, #ffffff);
  box-shadow: none;
}

.ce-detail-footer .ce-save-state {
  background: transparent;
  color: #c26a15;
  font-size: 14px;
  font-weight: 900;
}

.ce-detail-footer div {
  gap: 12px;
}

.ce-detail-footer :deep(.ui-button) {
  min-height: 54px;
  padding-inline: 24px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 860;
}

@container (max-width: 1100px) {
  .ce-detail-header {
    grid-template-columns: minmax(0, 1fr) minmax(220px, 0.95fr) 48px;
  }

  .ce-progress-cluster {
    grid-column: 1 / span 2;
    grid-row: 2;
  }
}

@container (max-width: 860px) {
  .ce-detail-header {
    grid-template-columns: minmax(0, 1fr) 48px;
    gap: 14px;
  }

  .ce-access-header-card,
  .ce-progress-cluster {
    grid-column: 1 / -1;
  }

  .ce-detail-status-strip,
  .ce-family-grid {
    grid-template-columns: 1fr;
  }

  .ce-missing-grid {
    justify-content: flex-start;
  }
}

@container (max-width: 620px) {
  .ce-detail-header,
  .ce-detail-body,
  .ce-detail-footer {
    padding-inline: 12px;
  }

  .ce-title-row {
    flex-wrap: wrap;
    gap: 10px;
  }

  .ce-title-row h2 {
    max-width: none;
    font-size: 20px;
  }

  .ce-status-pill.large {
    min-height: 34px;
    padding-inline: 14px;
    font-size: 12px;
  }

  .ce-inline-note--tab {
    padding-inline: 12px;
  }

  .ce-family-fields--mother,
  .ce-form-grid.two {
    grid-template-columns: 1fr;
  }

  .ce-family-span-2 {
    grid-column: auto;
  }

  .ce-detail-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .ce-detail-footer div {
    width: 100%;
  }

  .ce-detail-footer :deep(.ui-button) {
    flex: 1 1 0;
  }
}


/* Final reference correction: stable header grid, visible student avatar, no metric overlap. */
.ce-detail-shell {
  overflow: hidden;
}

.ce-detail-header {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) minmax(210px, 250px) minmax(180px, 230px) 46px;
  grid-auto-rows: auto;
  align-items: center;
  gap: 14px;
  min-height: 112px;
  padding: 16px 18px;
}

.ce-detail-title--with-photo {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.ce-detail-header-photo {
  --student-grade-photo-width: 58px;
  --student-grade-photo-height: 58px;
  --student-grade-photo-radius: 14px;
  flex: 0 0 auto;
}

.ce-detail-title-copy {
  min-width: 0;
}

.ce-detail-title-copy small {
  display: block;
  margin-bottom: 8px;
}

.ce-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin: 0;
}

.ce-title-row h2 {
  max-width: min(100%, 330px);
  min-width: 0;
  color: #10203a;
  font-size: clamp(18px, 2cqi, 23px);
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 1.06;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}

.ce-status-pill.large {
  min-height: 36px;
  padding-inline: 18px;
}

.ce-access-header-card {
  grid-column: auto;
  grid-row: auto;
  min-width: 0;
  min-height: 64px;
  align-self: center;
  padding: 10px 12px;
}

.ce-access-header-card small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-progress-cluster {
  grid-column: auto;
  grid-row: auto;
  min-width: 0;
  align-self: center;
  justify-self: stretch;
}

.ce-progress-track {
  width: 100%;
}

.ce-detail-menu-button {
  grid-column: auto;
  grid-row: auto;
  align-self: start;
  justify-self: end;
}

.ce-detail-body {
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px;
}

.ce-detail-status-strip {
  grid-template-columns: minmax(290px, 1fr) auto;
  min-height: 78px;
}

.ce-missing-grid {
  display: flex;
  min-width: 0;
}

.ce-missing-chip {
  min-width: 152px;
}

.ce-detail-tabs {
  flex-wrap: nowrap;
  gap: clamp(14px, 2.2cqi, 30px);
}

.ce-detail-tabs button {
  white-space: nowrap;
}

.ce-inline-note--tab {
  min-height: 58px;
}

.ce-family-card {
  min-height: 0;
}

.ce-form-grid input,
.ce-form-grid select,
.ce-wide-field textarea {
  min-height: 54px;
}

.ce-detail-footer {
  flex: 0 0 auto;
}

@container (max-width: 900px) {
  .ce-detail-header {
    grid-template-columns: minmax(0, 1fr) 46px;
    gap: 14px;
    min-height: 0;
  }

  .ce-detail-title--with-photo {
    grid-column: 1;
    grid-row: 1;
  }

  .ce-detail-menu-button {
    grid-column: 2;
    grid-row: 1;
  }

  .ce-access-header-card {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .ce-progress-cluster {
    grid-column: 1 / -1;
    grid-row: 3;
  }

  .ce-detail-status-strip {
    grid-template-columns: 1fr;
  }

  .ce-missing-grid {
    justify-content: flex-start;
  }

  .ce-missing-chip {
    min-width: 150px;
  }
}

@container (max-width: 640px) {
  .ce-detail-header,
  .ce-detail-body,
  .ce-detail-footer {
    padding-inline: 12px;
  }

  .ce-detail-title--with-photo {
    grid-template-columns: 52px minmax(0, 1fr);
    gap: 12px;
  }

  .ce-detail-header-photo {
    --student-grade-photo-width: 52px;
    --student-grade-photo-height: 52px;
    --student-grade-photo-radius: 13px;
  }

  .ce-title-row h2 {
    max-width: 100%;
    font-size: 19px;
  }

  .ce-status-pill.large {
    min-height: 30px;
    padding-inline: 13px;
  }

  .ce-missing-chip {
    min-width: calc(50% - 6px);
  }
}

@container (max-width: 440px) {
  .ce-detail-title--with-photo {
    grid-template-columns: 44px minmax(0, 1fr);
    gap: 10px;
  }

  .ce-detail-header-photo {
    --student-grade-photo-width: 44px;
    --student-grade-photo-height: 44px;
    --student-grade-photo-radius: 12px;
  }

  .ce-missing-chip {
    width: 100%;
    min-width: 0;
  }
}


/* Pixel-reference lock: keep the desktop header in one row and scale inside the panel instead of stacking. */
@container (min-width: 721px) {
  .ce-detail-header {
    display: grid;
    grid-template-columns: minmax(250px, 1fr) minmax(195px, 0.82fr) minmax(150px, 0.62fr) 44px;
    grid-auto-flow: column;
    grid-auto-rows: auto;
    align-items: center;
    gap: 10px;
    min-height: 112px;
    padding: 16px 18px 18px;
  }

  .ce-detail-title--with-photo,
  .ce-access-header-card,
  .ce-progress-cluster,
  .ce-detail-menu-button {
    grid-column: auto;
    grid-row: auto;
  }

  .ce-detail-title--with-photo {
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 14px;
    align-self: center;
  }

  .ce-detail-header-photo {
    --student-grade-photo-width: 58px;
    --student-grade-photo-height: 58px;
    --student-grade-photo-radius: 14px;
  }

  .ce-detail-title-copy small {
    margin-bottom: 7px;
  }

  .ce-title-row {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 12px;
  }

  .ce-title-row h2 {
    flex: 0 1 auto;
    max-width: clamp(185px, 24cqi, 345px);
    font-size: clamp(18px, 1.75cqi, 23px);
    line-height: 1.06;
    white-space: normal;
  }

  .ce-status-pill.large {
    flex: 0 0 auto;
    min-height: 38px;
    padding-inline: clamp(13px, 1.4cqi, 18px);
    font-size: 12px;
  }

  .ce-access-header-card {
    min-height: 68px;
    padding: 10px 12px;
    border-radius: 16px;
  }

  .ce-access-header-card > span {
    width: 38px;
    height: 38px;
  }

  .ce-access-header-card strong {
    font-size: 12px;
  }

  .ce-access-header-card small {
    font-size: 11px;
  }

  .ce-progress-cluster {
    gap: 7px;
    min-width: 0;
    align-self: center;
    justify-self: stretch;
  }

  .ce-progress-cluster strong,
  .ce-progress-cluster small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ce-progress-track {
    width: 100%;
    min-width: 0;
  }

  .ce-detail-menu-button {
    align-self: start;
    justify-self: end;
    width: 44px;
    height: 44px;
  }

  .ce-detail-status-strip {
    grid-template-columns: minmax(300px, 1fr) auto;
    min-height: 54px;
    padding: 10px 14px;
  }

  .ce-inline-note--quality {
    min-width: 0;
  }

  .ce-missing-grid {
    flex-wrap: nowrap;
    justify-content: flex-end;
    gap: 10px;
  }

  .ce-missing-chip {
    min-width: clamp(128px, 13cqi, 162px);
    min-height: 38px;
    padding-inline: clamp(11px, 1.3cqi, 16px);
  }

  .ce-family-grid {
    grid-template-columns: minmax(0, 0.96fr) minmax(0, 1.04fr);
    gap: 14px;
  }

  .ce-family-fields--mother {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ce-family-span-2 {
    grid-column: span 2;
  }
}

@container (min-width: 721px) and (max-width: 980px) {
  .ce-detail-header {
    grid-template-columns: minmax(285px, 1fr) minmax(235px, 0.82fr) minmax(185px, 0.62fr) 44px;
    gap: 10px;
  }

  .ce-title-row h2 {
    max-width: 235px;
    font-size: 20px;
  }

  .ce-access-header-card {
    grid-template-columns: 38px minmax(0, 1fr);
  }

  .ce-progress-cluster strong {
    font-size: 11.5px;
  }

  .ce-progress-cluster small {
    font-size: 10.5px;
  }

  .ce-detail-status-strip {
    grid-template-columns: minmax(340px, 1fr) auto;
  }

  .ce-inline-note p {
    font-size: 12px;
  }

  .ce-missing-chip {
    min-width: 132px;
    font-size: 11px;
  }
}

@container (max-width: 720px) {
  .ce-detail-header {
    grid-template-columns: minmax(0, 1fr) 44px;
  }

  .ce-detail-title--with-photo {
    grid-column: 1;
    grid-row: 1;
  }

  .ce-detail-menu-button {
    grid-column: 2;
    grid-row: 1;
  }

  .ce-access-header-card,
  .ce-progress-cluster {
    grid-column: 1 / -1;
  }

  .ce-detail-status-strip,
  .ce-family-grid {
    grid-template-columns: 1fr;
  }

  .ce-missing-grid {
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}


.ce-tier-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
  gap: 12px;
  align-items: stretch;
}

.ce-tier-card {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid #dfe9f1;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
  box-shadow: 0 10px 24px rgba(21, 35, 60, 0.045);
}

.ce-tier-card small {
  color: #6f7f96;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .09em;
  text-transform: uppercase;
}

.ce-tier-card strong {
  color: #17233f;
  font-size: 13.5px;
  font-weight: 900;
}

.ce-tier-card p {
  margin: 0;
  color: #60718a;
  font-size: 11.5px;
  font-weight: 700;
}

.ce-tier-bar {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf2f7;
}

.ce-tier-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #24a33f, #8fdb8b);
  transition: width .36s ease;
}

.ce-tier-card.is-complete .ce-tier-bar i {
  background: linear-gradient(90deg, #2b6cb0, #90cdf4);
}

.ce-complete-toggle {
  align-self: center;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid #d8e4ef;
  border-radius: 14px;
  background: #fff;
  color: #22632e;
  font-size: 12px;
  font-weight: 850;
  box-shadow: 0 8px 18px rgba(21, 35, 60, .04);
}

.ce-complete-toggle:hover {
  border-color: #b8d8bd;
  background: #f7fcf7;
}

.ce-complete-nested {
  margin-top: 14px;
}

@media (max-width: 860px) {
  .ce-tier-panel {
    grid-template-columns: 1fr;
  }
}

/* Compact expediente refinement: show only actionable gaps and keep validation subtle. */
.ce-detail-status-strip {
  grid-template-columns: minmax(220px, 1fr) auto;
  min-height: 58px;
}

.ce-missing-grid {
  flex-wrap: wrap;
  gap: 8px;
}

.ce-missing-chip {
  min-width: 0;
  min-height: 32px;
  padding: 0 11px;
  border-radius: 999px;
  font-size: 11px;
}

.ce-missing-chip.ok {
  border-color: rgba(68, 165, 78, .24);
}

.ce-tier-panel {
  grid-template-columns: minmax(240px, 1fr) auto;
  gap: 10px;
}

.ce-tier-panel.show-complete {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
}

.ce-tier-card {
  padding: 12px 14px;
}

.ce-tier-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ce-tier-card-head b {
  color: #1f8f34;
  font-size: 12px;
  font-weight: 900;
}

.ce-tier-card.is-complete .ce-tier-card-head b {
  color: #2b6cb0;
}

.ce-tier-card p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-complete-toggle {
  min-height: 40px;
  padding: 0 14px;
  white-space: nowrap;
}

@container (max-width: 900px) {
  .ce-tier-panel,
  .ce-detail-status-strip {
    grid-template-columns: 1fr;
  }

  .ce-complete-toggle {
    justify-self: start;
  }
}

@container (max-width: 560px) {
  .ce-missing-chip {
    width: auto;
    min-width: 0;
  }
}

/* Operational health redesign for Control Escolar. */
.ce-workspace.has-detail .ce-student-row,
.ce-workspace.has-empty-detail .ce-student-row,
.ce-student-row {
  grid-template-columns: minmax(0, 1fr) minmax(118px, 150px) 38px;
  align-items: center;
}

.ce-row-health {
  display: grid;
  min-width: 0;
  gap: 2px;
  justify-items: end;
  padding: 8px 10px;
  border: 1px solid #e5edf4;
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff, #fbfdff);
  color: #526175;
  text-align: right;
}

.ce-row-health b {
  color: #172033;
  font-size: 15px;
  font-weight: 950;
  line-height: 1;
}

.ce-row-health span {
  color: #263650;
  font-size: 11px;
  font-weight: 900;
  line-height: 1.1;
}

.ce-row-health small {
  max-width: 100%;
  overflow: hidden;
  color: #78869a;
  font-size: 10px;
  font-weight: 760;
  line-height: 1.18;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-row-health.complete {
  border-color: rgba(72, 158, 76, 0.22);
  background: linear-gradient(180deg, #fbfefb, #ffffff);
}

.ce-row-health.complete b,
.ce-row-health.complete span {
  color: #1f8f34;
}

.ce-row-health.warning {
  border-color: rgba(218, 151, 45, 0.28);
  background: linear-gradient(180deg, #fffdf7, #ffffff);
}

.ce-row-health.warning b,
.ce-row-health.warning span {
  color: #b36b12;
}

.ce-row-health.danger {
  border-color: rgba(224, 83, 74, 0.28);
  background: linear-gradient(180deg, #fffafa, #ffffff);
}

.ce-row-health.danger b,
.ce-row-health.danger span {
  color: #cf3f35;
}

.ce-progress-cluster--health {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  padding: 0;
}

.ce-progress-cluster--health div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.ce-progress-cluster--health.complete strong {
  color: #1f8f34;
}

.ce-progress-cluster--health.warning strong {
  color: #b36b12;
}

.ce-progress-cluster--health.danger strong {
  color: #c93b31;
}

.ce-health-overview {
  display: grid;
  grid-template-columns: minmax(220px, 1.1fr) minmax(220px, 1fr) minmax(190px, 0.82fr);
  gap: 12px;
}

.ce-health-card {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 82px;
  padding: 13px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.035);
}

.ce-health-card__score {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(#2f9138 calc(var(--score, 1) * 1%), #e8efe9 0);
  border: 1px solid rgba(47, 145, 56, 0.16);
}

.ce-health-card__score b {
  color: #15233c;
  font-size: 13px;
  font-weight: 950;
}

.ce-health-card__score.compact {
  background: #f7fafc;
  color: #15233c;
}

.ce-health-card__score.compact span {
  margin-left: 1px;
  color: #7b8798;
  font-size: 11px;
  font-weight: 820;
}

.ce-health-card small {
  color: #7a8798;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ce-health-card strong {
  display: block;
  margin-top: 2px;
  color: #172033;
  font-size: 13px;
  font-weight: 940;
}

.ce-health-card p {
  margin: 3px 0 0;
  overflow: hidden;
  color: #5d6b83;
  font-size: 11.5px;
  font-weight: 760;
  line-height: 1.35;
  text-overflow: ellipsis;
}

.ce-health-card.complete {
  border-color: rgba(72, 158, 76, 0.22);
}

.ce-health-card.warning {
  border-color: rgba(218, 151, 45, 0.28);
}

.ce-health-card.danger {
  border-color: rgba(224, 83, 74, 0.28);
}

.ce-health-card.is-secondary {
  grid-template-columns: 48px minmax(0, 1fr) auto;
  background: linear-gradient(180deg, #ffffff, #fbfdff);
}

.ce-health-link {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #dce7ef;
  border-radius: 12px;
  background: #fff;
  color: #1f8f34;
  font-size: 11px;
  font-weight: 900;
}

.ce-family-readiness {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.ce-family-readiness-card {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  padding: 12px 13px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #ffffff;
}

.ce-family-readiness-card > span {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  background: #f4f8f5;
  color: #2f9138;
}

.ce-family-readiness-card small {
  color: #748095;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.ce-family-readiness-card strong {
  display: block;
  margin-top: 2px;
  color: #172033;
  font-size: 12px;
  font-weight: 900;
}

.ce-family-readiness-card p {
  margin: 3px 0 0;
  color: #647087;
  font-size: 11px;
  font-weight: 760;
  line-height: 1.35;
}

.ce-family-readiness-card.is-complete {
  border-color: rgba(72, 158, 76, 0.2);
  background: #fbfefb;
}

.ce-family-readiness-card.is-warning {
  border-color: rgba(218, 151, 45, 0.28);
  background: #fffdf7;
}

.ce-family-readiness-card.is-danger {
  border-color: rgba(224, 83, 74, 0.28);
  background: #fffafa;
}

.ce-family-card {
  gap: 14px;
}

.ce-family-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ce-family-card-head h3 {
  margin: 0;
}

.ce-family-card-head span {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  padding: 0 10px;
  border-radius: 999px;
  background: #f5f7fa;
  color: #5c6a80;
  font-size: 10.5px;
  font-weight: 900;
}

.ce-family-card.is-complete .ce-family-card-head span {
  background: #edf8ea;
  color: #1f8f34;
}

.ce-family-card.is-warning .ce-family-card-head span {
  background: #fff6e7;
  color: #b36b12;
}

.ce-family-card.is-danger .ce-family-card-head span {
  background: #fff0ef;
  color: #c93b31;
}

.ce-inline-note--tab {
  min-height: 48px;
  border-color: #edf2f7;
  background: #fbfdff;
}

.ce-form-card.ce-tab-panel {
  padding: 14px;
  border: 1px solid #e5edf4;
  border-radius: 18px;
  background: #ffffff;
}

.ce-section-heading.compact {
  min-height: 34px;
  margin-bottom: 12px;
}

.ce-form-grid input,
.ce-form-grid select,
.ce-wide-field textarea {
  min-height: 48px;
  border-radius: 12px;
}

.ce-smart-field small {
  min-height: 14px;
}

.ce-derived-card {
  min-height: 48px;
}

.ce-detail-footer {
  position: sticky;
  bottom: 0;
  z-index: 3;
  min-height: 64px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(14px) saturate(120%);
}

@container (max-width: 980px) {
  .ce-health-overview,
  .ce-family-readiness,
  .ce-family-grid {
    grid-template-columns: 1fr;
  }
}

@container (max-width: 720px) {
  .ce-detail-header {
    grid-template-columns: minmax(0, 1fr) 44px;
  }

  .ce-access-header-card,
  .ce-progress-cluster--health {
    grid-column: 1 / -1;
  }

  .ce-workspace.has-detail .ce-student-row,
  .ce-workspace.has-empty-detail .ce-student-row,
  .ce-student-row {
    grid-template-columns: minmax(0, 1fr) 34px;
  }

  .ce-row-health {
    grid-column: 1 / -1;
    justify-items: start;
    text-align: left;
  }

  .row-actions {
    grid-column: 2;
    grid-row: 1;
  }
}


/* UX recalibration: restore dense visual progress while keeping real logic-driven states. */
.ce-workspace.has-detail .ce-student-row,
.ce-workspace.has-empty-detail .ce-student-row,
.ce-student-row {
  grid-template-columns: minmax(0, 1fr) minmax(220px, 248px) 40px;
  align-items: center;
}

.ce-row-health {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #dce6ee;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff, #fbfdfd);
  text-align: left;
  justify-items: stretch;
}

.ce-quality-cell--expanded {
  gap: 5px;
  padding-right: 0;
}

.ce-quality-cell--expanded strong {
  font-size: 11.25px;
  line-height: 1.15;
}

.ce-quality-fields--stacked {
  grid-template-columns: repeat(2, minmax(0, max-content));
  gap: 4px 8px;
}

.ce-quality-fields--stacked small {
  font-size: 9.5px;
  font-weight: 830;
}

.ce-row-health.complete {
  border-color: rgba(71, 157, 76, 0.25);
  background: linear-gradient(180deg, #fbfefb, #ffffff);
}

.ce-row-health.warning {
  border-color: rgba(223, 152, 47, 0.28);
  background: linear-gradient(180deg, #fffdf8, #ffffff);
}

.ce-row-health.danger {
  border-color: rgba(227, 74, 67, 0.26);
  background: linear-gradient(180deg, #fffafa, #ffffff);
}

.ce-progress-cluster--health {
  gap: 7px;
}

.ce-health-overview {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
}

.ce-health-card {
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 92px;
  padding: 15px 16px;
  border-radius: 18px;
}

.ce-health-card__icon {
  display: inline-flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
  background: #edf8ea;
  color: #20882d;
}

.ce-health-card__icon.is-secondary {
  background: #eef5ff;
  color: #2d6dbc;
}

.ce-health-card__copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.ce-health-card__copy small {
  font-size: 10px;
  letter-spacing: .07em;
}

.ce-health-card__copy strong {
  margin-top: 0;
  font-size: 14px;
}

.ce-health-card__copy p {
  margin: 0;
  line-height: 1.3;
}

.ce-health-bar {
  display: block;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #e4ece5;
  margin-top: 3px;
}

.ce-health-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2a9b3d, #97cf79);
}

.ce-health-bar.is-secondary {
  background: #e5edf8;
}

.ce-health-bar.is-secondary i {
  background: linear-gradient(90deg, #5796dc, #7fc2f4);
}

.ce-health-card__copy em {
  color: #59677e;
  font-size: 11px;
  font-style: normal;
  font-weight: 780;
}

.ce-health-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 14px;
  white-space: nowrap;
}

.ce-panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.ce-panel-heading h3 {
  margin: 0;
  color: #15233c;
  font-size: 13.5px;
  font-weight: 920;
}

.ce-panel-heading p {
  margin: 4px 0 0;
  color: #69778f;
  font-size: 11px;
  font-weight: 680;
}

.ce-form-card.ce-tab-panel {
  padding: 16px 16px 12px;
}

.ce-family-readiness {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}

.ce-family-readiness-card {
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  min-height: 86px;
  padding: 12px 13px;
}

.ce-family-readiness-card b {
  align-self: start;
  color: #516079;
  font-size: 11px;
  font-weight: 900;
}

.ce-family-readiness-card.is-complete b {
  color: #20882d;
}

.ce-family-readiness-card.is-warning b {
  color: #b36b12;
}

.ce-family-readiness-card.is-danger b {
  color: #ca3d33;
}

.ce-family-metrics-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.ce-family-metric-chip {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid rgba(71, 157, 76, 0.2);
  border-radius: 999px;
  background: #f9fdf9;
  color: #20882d;
  font-size: 10.5px;
  font-weight: 860;
}

.ce-family-metric-chip.missing {
  border-color: rgba(227, 74, 67, 0.22);
  background: #fff7f7;
  color: #cf4036;
}

.ce-family-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.ce-family-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid #e5edf4;
  border-radius: 16px;
  background: #fff;
}

.ce-family-fields {
  gap: 12px;
}

.ce-derived-card {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  min-height: 58px;
}

.ce-derived-card__icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #eef4ff;
  color: #486ec3;
}

.ce-derived-card__icon b {
  font-size: 18px;
  font-weight: 950;
  line-height: 1;
}

.ce-derived-card.is-female .ce-derived-card__icon {
  background: #fff0f7;
  color: #c55385;
}

.ce-derived-card.is-male .ce-derived-card__icon {
  background: #eef4ff;
  color: #486ec3;
}

.ce-derived-card.is-neutral .ce-derived-card__icon {
  background: #f3f6f9;
  color: #72809a;
}

.ce-derived-card > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.ce-wide-field.ce-family-address {
  margin-top: 12px;
}

.ce-form-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.ce-detail-footer {
  position: sticky;
  bottom: 0;
}

@container (max-width: 1120px) {
  .ce-workspace.has-detail .ce-student-row,
  .ce-workspace.has-empty-detail .ce-student-row,
  .ce-student-row {
    grid-template-columns: minmax(0, 1fr) minmax(180px, 216px) 40px;
  }

  .ce-quality-fields--stacked {
    grid-template-columns: 1fr;
  }
}

@container (max-width: 920px) {
  .ce-health-overview,
  .ce-family-readiness,
  .ce-family-grid {
    grid-template-columns: 1fr;
  }
}

@container (max-width: 720px) {
  .ce-workspace.has-detail .ce-student-row,
  .ce-workspace.has-empty-detail .ce-student-row,
  .ce-student-row {
    grid-template-columns: minmax(0, 1fr) 40px;
  }

  .ce-row-health {
    grid-column: 1 / -1;
    margin-top: 8px;
  }

  .row-actions {
    grid-column: 2;
    grid-row: 1;
  }

  .ce-health-card {
    grid-template-columns: 42px minmax(0, 1fr);
  }

  .ce-health-link {
    grid-column: 1 / -1;
    justify-content: center;
  }
}

@container (max-width: 560px) {
  .ce-form-grid.two,
  .ce-family-fields,
  .ce-family-grid {
    grid-template-columns: 1fr;
  }

  .ce-family-readiness-card {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .ce-family-readiness-card b {
    grid-column: 2;
    justify-self: start;
  }
}

/* Aurora record-health interface */
.ce-student-row {
  --ce-health-accent: #2f9138;
  --ce-health-soft: #eef8eb;
  --ce-health-border: rgba(63, 145, 56, 0.24);
}

.ce-student-row .ce-row-health.warning,
.ce-detail-shell.is-warning {
  --ce-health-accent: #c37412;
  --ce-health-soft: #fff7e8;
  --ce-health-border: rgba(216, 139, 28, 0.28);
}

.ce-student-row .ce-row-health.danger,
.ce-detail-shell.is-danger {
  --ce-health-accent: #d63f35;
  --ce-health-soft: #fff1ef;
  --ce-health-border: rgba(217, 67, 56, 0.3);
}

.ce-workspace.has-detail .ce-student-row,
.ce-workspace.has-empty-detail .ce-student-row,
.ce-student-row {
  grid-template-columns: minmax(0, 1fr) minmax(218px, 252px) 40px;
  align-items: center;
  min-height: 92px;
  border-color: rgba(218, 229, 238, 0.96);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--grade-soft, #f2f8ef) 28%, #fff), #fff 54%),
    #fff;
}

.ce-student-row.selected {
  border-color: color-mix(in srgb, var(--grade-accent, #4fa346) 52%, #d7e8d2);
  box-shadow: 0 14px 32px rgba(63, 145, 56, 0.13);
}

.ce-row-health {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid var(--ce-health-border);
  border-radius: 15px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 255, 255, 0.98)),
    var(--ce-health-soft);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.94), 0 9px 18px rgba(21, 35, 60, 0.045);
}

.ce-row-health.complete {
  --ce-health-accent: #2f9138;
  --ce-health-soft: #f6fbf5;
  --ce-health-border: rgba(63, 145, 56, 0.18);
}

.ce-row-health.warning {
  --ce-health-accent: #c37412;
  --ce-health-soft: #fff8eb;
  --ce-health-border: rgba(216, 139, 28, 0.28);
}

.ce-row-health.danger {
  --ce-health-accent: #d63f35;
  --ce-health-soft: #fff2f0;
  --ce-health-border: rgba(217, 67, 56, 0.3);
}

.ce-row-health .ce-quality-score {
  width: 50px;
  height: 50px;
  background: conic-gradient(var(--ce-health-accent) var(--quality-score), #e8edf2 0deg);
}

.ce-row-health .ce-quality-score b {
  color: #18243a;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0;
}

.ce-quality-cell--expanded {
  gap: 4px;
  padding: 0;
}

.ce-quality-cell--expanded strong {
  color: #172238;
  font-size: 11.5px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.16;
}

.ce-row-health-summary {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--ce-health-accent);
  font-size: 10.5px;
  font-weight: 820;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-quality-fields--stacked {
  grid-template-columns: repeat(2, minmax(0, max-content));
  gap: 4px 7px;
}

.ce-quality-fields--stacked small {
  color: #7b8798;
  font-size: 9.5px;
  font-weight: 800;
}

.ce-quality-fields--stacked small.missing {
  color: var(--ce-health-accent);
}

.ce-detail-shell {
  --ce-detail-accent: #2f9138;
  --ce-detail-soft: #f4fbf3;
  --ce-detail-border: rgba(63, 145, 56, 0.18);
  border-color: rgba(218, 229, 238, 0.98);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 18px 42px rgba(21, 35, 60, 0.07);
  container-type: inline-size;
}

.ce-detail-shell.is-warning {
  --ce-detail-accent: #c37412;
  --ce-detail-soft: #fff8eb;
  --ce-detail-border: rgba(216, 139, 28, 0.26);
}

.ce-detail-shell.is-danger {
  --ce-detail-accent: #d63f35;
  --ce-detail-soft: #fff2f0;
  --ce-detail-border: rgba(217, 67, 56, 0.3);
}

.ce-detail-header {
  grid-template-columns: minmax(240px, 1.2fr) minmax(250px, 0.9fr) minmax(210px, 0.72fr) auto 36px;
  gap: 13px;
  padding: 14px 16px;
  border-bottom-color: rgba(221, 231, 240, 0.95);
  background:
    radial-gradient(circle at 0 0, color-mix(in srgb, var(--ce-detail-accent) 10%, transparent), transparent 28%),
    linear-gradient(180deg, #ffffff 0%, #fbfdfc 100%);
}

.ce-detail-title--with-photo {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  align-items: center;
  gap: 13px;
  min-width: 0;
  grid-column: 1;
  grid-row: 1;
}

.ce-access-header-card {
  grid-column: 2;
  grid-row: 1;
}

.ce-progress-cluster--health {
  grid-column: 3;
  grid-row: 1;
}

.ce-detail-actions {
  grid-column: 4;
  grid-row: 1;
}

.ce-detail-menu-button {
  grid-column: 5;
  grid-row: 1;
}

.ce-detail-title-copy small,
.ce-detail-title small {
  color: #65738c;
  font-size: 10.5px;
  font-weight: 850;
  letter-spacing: 0;
}

.ce-title-row h2 {
  color: #12203a;
  font-size: 18px;
  font-weight: 920;
  letter-spacing: 0;
}

.ce-access-header-card {
  min-height: 56px;
  padding: 10px 12px;
  border: 1px solid rgba(206, 219, 232, 0.94);
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
  box-shadow: 0 8px 18px rgba(21, 35, 60, 0.045);
}

.ce-access-header-card > span,
.ce-access-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: #eef3f8;
}

.ce-access-header-card strong {
  color: #173052;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
}

.ce-access-header-card small {
  color: #67758c;
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1.25;
}

.ce-progress-cluster--health {
  gap: 8px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--ce-detail-border);
  border-radius: 14px;
  background: linear-gradient(180deg, #fff, var(--ce-detail-soft));
}

.ce-progress-label-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
}

.ce-progress-label-row span {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.ce-progress-cluster--health strong {
  color: #172238;
  font-size: 11.5px;
  font-weight: 900;
}

.ce-progress-cluster--health b {
  color: var(--ce-detail-accent);
  font-size: 18px;
  font-weight: 920;
  letter-spacing: 0;
  line-height: 1;
}

.ce-progress-cluster--health small {
  overflow: hidden;
  color: #687790;
  font-size: 10.5px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-progress-track {
  height: 8px;
  background: #e8eef3;
}

.ce-progress-track i {
  background: linear-gradient(90deg, var(--ce-detail-accent), color-mix(in srgb, var(--ce-detail-accent) 58%, #b9d884));
}

.ce-detail-actions {
  align-items: center;
  gap: 8px;
}

.ce-detail-menu-button {
  border: 1px solid rgba(217, 226, 236, 0.96);
  border-radius: 12px;
  background: #fff;
  color: #5c6a80;
}

.ce-detail-body {
  gap: 12px;
  padding: 13px 16px 0;
  background:
    linear-gradient(180deg, #ffffff 0%, #ffffff 68%, #fbfcfd 100%);
}

.ce-health-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(250px, 0.92fr);
  gap: 12px;
}

.ce-health-card {
  position: relative;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: center;
  gap: 13px;
  min-width: 0;
  min-height: 112px;
  overflow: hidden;
  padding: 14px 15px;
  border: 1px solid rgba(221, 231, 240, 0.98);
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff, #fbfdff);
  box-shadow: 0 10px 24px rgba(21, 35, 60, 0.045);
}

.ce-health-card--basic {
  order: 1;
}

.ce-health-card--action {
  order: 2;
}

.ce-health-card--complete {
  order: 3;
}

.ce-health-card--basic.complete {
  border-color: rgba(63, 145, 56, 0.2);
}

.ce-health-card--basic.warning,
.ce-health-card--action.warning {
  border-color: rgba(216, 139, 28, 0.3);
  background: linear-gradient(180deg, #fffdfa, #fff);
}

.ce-health-card--basic.danger,
.ce-health-card--action.danger {
  border-color: rgba(217, 67, 56, 0.32);
  background:
    radial-gradient(circle at 100% 0, rgba(217, 67, 56, 0.08), transparent 44%),
    linear-gradient(180deg, #fffafa, #fff);
}

.ce-health-card--action {
  grid-template-columns: 44px minmax(0, 1fr) auto;
}

.ce-health-card--action.is-clear {
  border-color: rgba(63, 145, 56, 0.2);
  background: linear-gradient(180deg, #fbfefb, #fff);
}

.ce-health-ring {
  position: relative;
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(var(--ce-detail-accent) var(--ring-deg), #e8eef3 0deg);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.82), 0 8px 18px rgba(21, 35, 60, 0.08);
}

.ce-health-ring::after {
  position: absolute;
  inset: 7px;
  border-radius: inherit;
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(220, 229, 238, 0.92);
  content: "";
}

.ce-health-ring.is-secondary {
  background: conic-gradient(#4f8ed8 var(--ring-deg), #e5edf8 0deg);
}

.ce-health-ring b {
  position: relative;
  z-index: 1;
  color: #172238;
  font-size: 12px;
  font-weight: 920;
  letter-spacing: 0;
}

.ce-health-card__icon,
.ce-status-signal-icon {
  display: inline-flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
  background: var(--ce-detail-soft);
  color: var(--ce-detail-accent);
}

.ce-health-card__copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.ce-health-card__copy small,
.ce-status-signal-card small {
  color: #708098;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ce-health-card__copy strong,
.ce-status-signal-card strong {
  overflow: hidden;
  color: #14213a;
  font-size: 13.5px;
  font-weight: 920;
  letter-spacing: 0;
  line-height: 1.18;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ce-health-card__copy p,
.ce-status-signal-card p {
  margin: 0;
  overflow: hidden;
  color: #647188;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
}

.ce-health-bar {
  height: 8px;
  margin-top: 3px;
  background: #e8eef3;
}

.ce-health-bar i {
  background: linear-gradient(90deg, var(--ce-detail-accent), color-mix(in srgb, var(--ce-detail-accent) 58%, #a6d384));
}

.ce-health-bar.is-secondary i {
  background: linear-gradient(90deg, #4f8ed8, #7fbdf2);
}

.ce-health-card__copy em {
  color: #56657a;
  font-size: 10.8px;
  font-style: normal;
  font-weight: 780;
}

.ce-health-link,
.ce-health-action-button,
.ce-health-missing-chips button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(212, 223, 234, 0.98);
  background: #fff;
  color: #1f7f33;
  font-weight: 900;
  cursor: pointer;
}

.ce-health-link {
  grid-column: 1 / -1;
  justify-self: start;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 11px;
  font-size: 10.5px;
}

.ce-health-action-button {
  min-height: 36px;
  padding: 0 12px;
  border-color: var(--ce-detail-border);
  border-radius: 12px;
  color: var(--ce-detail-accent);
  font-size: 10.5px;
}

.ce-health-missing-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.ce-health-missing-chips button,
.ce-health-missing-chips span {
  min-height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
}

.ce-health-missing-chips button {
  border-color: var(--ce-detail-border);
  background: var(--ce-detail-soft);
  color: var(--ce-detail-accent);
}

.ce-health-missing-chips span {
  display: inline-flex;
  align-items: center;
  background: #eef2f6;
  color: #5f6f84;
  font-weight: 900;
}

.ce-status-signal-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.ce-status-signal-card {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 72px;
  padding: 11px 12px;
  border: 1px solid rgba(221, 231, 240, 0.98);
  border-radius: 14px;
  background: #fff;
}

.ce-status-signal-card > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.ce-status-signal-card b {
  color: #5c6a80;
  font-size: 10.5px;
  font-weight: 900;
  white-space: nowrap;
}

.ce-status-signal-card.is-complete {
  border-color: rgba(63, 145, 56, 0.2);
  background: #fbfefb;
}

.ce-status-signal-card.is-complete .ce-status-signal-icon,
.ce-family-readiness-card.is-complete > span {
  background: #edf8ea;
  color: #21882e;
}

.ce-status-signal-card.is-warning {
  border-color: rgba(216, 139, 28, 0.28);
  background: #fffdfa;
}

.ce-status-signal-card.is-warning .ce-status-signal-icon,
.ce-family-readiness-card.is-warning > span {
  background: #fff6e7;
  color: #b36b12;
}

.ce-status-signal-card.is-danger {
  border-color: rgba(217, 67, 56, 0.3);
  background: #fffafa;
}

.ce-status-signal-card.is-danger .ce-status-signal-icon,
.ce-family-readiness-card.is-danger > span {
  background: #fff0ef;
  color: #cf4036;
}

.ce-detail-tabs {
  display: flex;
  min-height: 46px;
  gap: 4px;
  overflow-x: auto;
  padding: 0 2px;
  border: 1px solid rgba(224, 232, 241, 0.96);
  border-radius: 14px;
  background: #f7fafc;
}

.ce-detail-tabs button {
  position: relative;
  display: inline-flex;
  min-width: max-content;
  height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #647188;
  font-size: 11px;
  font-weight: 860;
  letter-spacing: 0;
}

.ce-tab-main {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.ce-detail-tabs button.active {
  background: #fff;
  color: #1f8f34;
  box-shadow: 0 6px 16px rgba(21, 35, 60, 0.07);
}

.ce-tab-badge {
  display: inline-flex;
  min-width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border-radius: 999px;
  background: #eef2f6;
  color: #5f6f84;
  font-size: 10px;
  font-weight: 900;
}

.ce-detail-tabs button.is-warning .ce-tab-badge {
  background: #fff1d8;
  color: #b36b12;
}

.ce-detail-tabs button.is-danger .ce-tab-badge {
  background: #ffe4e1;
  color: #cf4036;
}

.ce-form-card.ce-tab-panel,
.ce-family-card,
.ce-complete-nested {
  border: 1px solid rgba(221, 231, 240, 0.98);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 9px 22px rgba(21, 35, 60, 0.035);
}

.ce-form-card.ce-tab-panel {
  padding: 16px;
}

.ce-panel-heading,
.ce-section-heading.compact {
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.ce-section-heading.compact > div {
  min-width: 0;
}

.ce-panel-heading h3,
.ce-section-heading h3,
.ce-family-card-head h3 {
  color: #14213a;
  font-size: 13px;
  font-weight: 920;
  letter-spacing: 0;
}

.ce-panel-heading p,
.ce-section-heading p {
  margin-top: 4px;
  color: #66758c;
  font-size: 11px;
  font-weight: 680;
  line-height: 1.35;
}

.ce-panel-status {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  padding: 0 10px;
  border-radius: 999px;
  background: #eef2f6;
  color: #5f6f84;
  font-size: 10px;
  font-weight: 900;
  white-space: nowrap;
}

.ce-panel-status.complete {
  background: #edf8ea;
  color: #21882e;
}

.ce-panel-status.warning {
  background: #fff6e7;
  color: #b36b12;
}

.ce-panel-status.danger {
  background: #fff0ef;
  color: #cf4036;
}

.ce-form-grid {
  gap: 11px;
}

.ce-form-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.ce-tab-panel .ce-form-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.ce-form-grid label,
.ce-wide-field {
  gap: 6px;
}

.ce-form-grid span,
.ce-wide-field span {
  color: #6b788e;
  font-size: 10px;
  font-weight: 880;
  letter-spacing: 0;
  text-transform: none;
}

.ce-form-grid input,
.ce-form-grid select,
.ce-wide-field textarea {
  min-height: 46px;
  border: 1px solid #d7e2ed;
  border-radius: 12px;
  background: #fbfdff;
  color: #172238;
  font-size: 12px;
  font-weight: 690;
  letter-spacing: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.ce-form-grid input:focus,
.ce-form-grid select:focus,
.ce-wide-field textarea:focus {
  border-color: color-mix(in srgb, var(--ce-detail-accent) 42%, #d7e2ed);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ce-detail-accent) 13%, transparent);
}

.ce-smart-field {
  position: relative;
}

.ce-smart-field small {
  min-height: 15px;
  color: #718095;
  font-size: 10px;
  font-weight: 750;
}

.ce-smart-field.is-ok input,
.ce-smart-field.is-ok select {
  border-color: rgba(63, 145, 56, 0.32);
  background: #fbfefb;
}

.ce-smart-field.is-ok small {
  color: #21882e;
}

.ce-smart-field.is-missing input,
.ce-smart-field.is-missing select,
.ce-smart-field.is-invalid input,
.ce-smart-field.is-invalid select {
  border-color: rgba(217, 67, 56, 0.74);
  background: #fffafa;
  box-shadow: inset 3px 0 0 rgba(217, 67, 56, 0.72);
}

.ce-smart-field.is-missing small,
.ce-smart-field.is-invalid small {
  color: #cf4036;
  font-weight: 860;
}

.ce-derived-card {
  min-height: 60px;
  border: 1px solid rgba(221, 231, 240, 0.98);
  border-radius: 14px;
  background: linear-gradient(180deg, #fbfdff, #fff);
}

.ce-derived-card span,
.ce-derived-card strong {
  letter-spacing: 0;
}

.ce-family-readiness {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}

.ce-family-readiness-card {
  grid-template-columns: 38px minmax(0, 1fr) auto;
  gap: 10px;
  min-height: 92px;
  padding: 12px;
  border-radius: 15px;
}

.ce-family-readiness-card > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.ce-family-readiness-meter,
.ce-family-card-status i {
  display: block;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8eef3;
}

.ce-family-readiness-meter em,
.ce-family-card-status i b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: currentColor;
}

.ce-family-readiness-card.is-complete {
  color: #21882e;
}

.ce-family-readiness-card.is-warning {
  color: #b36b12;
}

.ce-family-readiness-card.is-danger {
  color: #cf4036;
}

.ce-family-readiness-card p,
.ce-family-readiness-card strong,
.ce-family-readiness-card small {
  color: initial;
}

.ce-family-readiness-card p {
  color: #647188;
}

.ce-family-readiness-card b {
  color: currentColor;
  font-size: 10.5px;
  font-weight: 920;
}

.ce-family-metrics-strip {
  min-height: 0;
  margin-bottom: 12px;
}

.ce-family-metric-chip {
  border-color: rgba(217, 67, 56, 0.24);
  background: #fff7f6;
  color: #cf4036;
}

.ce-family-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.ce-family-card {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.ce-family-card.is-warning {
  border-color: rgba(216, 139, 28, 0.26);
}

.ce-family-card.is-danger {
  border-color: rgba(217, 67, 56, 0.3);
}

.ce-family-card-head {
  align-items: start;
}

.ce-family-card-status {
  display: grid;
  min-width: 92px;
  gap: 6px;
  justify-items: end;
}

.ce-family-card-status span {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  padding: 0 10px;
  border-radius: 999px;
  background: #eef2f6;
  color: #5f6f84;
  font-size: 10px;
  font-weight: 900;
}

.ce-family-card-status i {
  width: 92px;
  color: #8a98ab;
}

.ce-family-card.is-complete .ce-family-card-status span {
  background: #edf8ea;
  color: #21882e;
}

.ce-family-card.is-complete .ce-family-card-status i {
  color: #21882e;
}

.ce-family-card.is-warning .ce-family-card-status span,
.ce-family-card.is-warning .ce-family-card-status i {
  color: #b36b12;
}

.ce-family-card.is-danger .ce-family-card-status span,
.ce-family-card.is-danger .ce-family-card-status i {
  color: #cf4036;
}

.ce-wide-field.ce-family-address {
  margin-top: 12px;
}

.ce-detail-footer {
  position: sticky;
  bottom: 0;
  z-index: 7;
  min-height: 66px;
  padding: 10px 16px;
  border-top: 1px solid rgba(221, 231, 240, 0.95);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(16px) saturate(128%);
  box-shadow: 0 -14px 30px rgba(21, 35, 60, 0.07);
}

.ce-save-state {
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 900;
  letter-spacing: 0;
}

.ce-save-state.clean {
  background: #edf8ea;
  color: #21882e;
}

.ce-save-state.dirty {
  background: #fff6e7;
  color: #a35f0d;
}

.ce-save-state.saving {
  background: #eef5ff;
  color: #2b67a6;
}

.ce-save-state.error {
  background: #fff0ef;
  color: #cf4036;
}

.ce-detail-footer :deep(.ui-button) {
  min-height: 42px;
  min-width: 128px;
  border-radius: 14px;
}

@container (max-width: 1180px) {
  .ce-detail-header {
    grid-template-columns: minmax(0, 1fr) 38px;
  }

  .ce-detail-title--with-photo {
    grid-column: 1;
    grid-row: 1;
  }

  .ce-detail-menu-button {
    grid-column: 2;
    grid-row: 1;
  }

  .ce-access-header-card {
    grid-row: 2;
  }

  .ce-progress-cluster--health,
  .ce-access-header-card,
  .ce-detail-actions {
    grid-column: 1 / -1;
  }

  .ce-progress-cluster--health {
    grid-row: 3;
  }

  .ce-detail-actions {
    grid-row: 4;
  }

  .ce-health-overview,
  .ce-status-signal-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 860px) {
  .ce-workspace.has-detail .ce-student-row,
  .ce-workspace.has-empty-detail .ce-student-row,
  .ce-student-row {
    grid-template-columns: minmax(0, 1fr) 40px;
  }

  .ce-row-health {
    grid-column: 1 / -1;
    margin-top: 8px;
  }

  .row-actions {
    grid-column: 2;
    grid-row: 1;
  }

  .ce-detail-header,
  .ce-health-overview,
  .ce-status-signal-grid,
  .ce-family-readiness,
  .ce-family-grid {
    grid-template-columns: minmax(0, 1fr) 38px;
  }

  .ce-access-header-card,
  .ce-progress-cluster--health,
  .ce-detail-actions {
    grid-column: 1;
  }

  .ce-detail-actions {
    justify-content: flex-start;
  }

  .ce-health-overview,
  .ce-status-signal-grid,
  .ce-family-readiness,
  .ce-family-grid {
    grid-template-columns: 1fr;
  }

  .ce-health-card--action {
    grid-template-columns: 44px minmax(0, 1fr);
  }

  .ce-health-action-button {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .ce-tab-panel .ce-form-grid.three,
  .ce-form-grid.two,
  .ce-family-fields {
    grid-template-columns: 1fr;
  }
}

@container (max-width: 560px) {
  .ce-detail-body {
    padding: 11px 12px 0;
  }

  .ce-detail-title--with-photo {
    grid-template-columns: 58px minmax(0, 1fr);
  }

  .ce-health-card,
  .ce-status-signal-card,
  .ce-family-readiness-card {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .ce-status-signal-card b,
  .ce-family-readiness-card b {
    grid-column: 2;
    justify-self: start;
  }

  .ce-detail-footer,
  .ce-detail-footer div {
    align-items: stretch;
  }

  .ce-detail-footer {
    flex-direction: column;
  }

  .ce-detail-footer div {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
  }
}

</style>
