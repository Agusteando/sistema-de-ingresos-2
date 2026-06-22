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
            <StudentsKpiValue as="strong" :value="item.value" />
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
                </div>
                <div class="ce-list-header-actions">
                  <button
                    type="button"
                    class="ce-excel-export-button"
                    :disabled="!selectedAgentId || studentsLoading || !pagination.total"
                    @click="exportCurrentView"
                  >
                    <LucideFileSpreadsheet :size="15" />
                    <span>Exportar Excel</span>
                  </button>
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
                    <div class="ce-profile-identity-cues">
                      <span v-if="curpDerivedIdentity.valid" :class="['ce-profile-cue', 'is-gender', derivedGenderMeta.tone]">
                        <b>{{ derivedGenderMeta.label === 'Femenino' ? '♀' : '♂' }}</b>
                        {{ derivedGenderMeta.label }}
                      </span>
                      <span v-if="curpDerivedIdentity.valid" class="ce-profile-cue is-age">
                        <LucideClock3 :size="13" />
                        {{ derivedAgeLabel }}
                      </span>
                      <span v-if="curpDerivedIdentity.valid" class="ce-profile-cue is-born">
                        {{ curpDerivedIdentity.fechaNacimiento }}
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  class="ce-access-header-card"
                  :class="{ unavailable: !selectedStudent.huskyPassAvailable }"
                >
                  <span class="ce-access-icon ce-access-logo" aria-hidden="true">
                    <img src="/brand/ID-HUSKY-PASS-GREY.png" alt="" />
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
                  <button
                    type="button"
                    :class="['ce-health-card', 'ce-health-card--basic', selectedRecordHealth.tone, { 'is-active': activeDetailTab !== 'advanced' }]"
                    @click="activeDetailTab = 'identity'"
                  >
                    <div
                      :class="['ce-health-ring', selectedRecordHealth.tone]"
                      :style="{ '--ring-deg': `${selectedProfileCompletion * 3.6}deg` }"
                    >
                      <b>{{ selectedProfileCompletion }}%</b>
                    </div>
                    <div class="ce-health-card__copy">
                      <small>Expediente básico</small>
                      <strong>{{ rowHealthHeadline(selectedHealthStudent) }}</strong>
                      <p v-if="selectedMissingCount">{{ selectedNextAction }}</p>
                      <span class="ce-health-bar"><i :style="{ width: `${selectedProfileCompletion}%` }"></i></span>
                      <em>{{ selectedBasicCompletedCount }} de {{ requiredDataFields.length }} campos completos</em>
                    </div>
                  </button>
                  <button
                    type="button"
                    :class="['ce-health-card', 'ce-health-card--complete', { 'is-active': activeDetailTab === 'advanced' }]"
                    @click="activeDetailTab = 'advanced'"
                  >
                    <div
                      class="ce-health-ring is-secondary"
                      :style="{ '--ring-deg': `${selectedAdvancedProfileCompletion * 3.6}deg` }"
                    >
                      <b>{{ selectedAdvancedProfileCompletion }}%</b>
                    </div>
                    <div class="ce-health-card__copy">
                      <small>Expediente avanzado</small>
                      <strong>{{ selectedAdvancedMissingCount ? `${selectedAdvancedMissingCount} pendientes avanzados` : 'Completo' }}</strong>
                      
                      <span class="ce-health-bar is-secondary"><i :style="{ width: `${selectedAdvancedProfileCompletion}%` }"></i></span>
                      <em>{{ selectedAdvancedProfileCompletion }}% · {{ selectedAdvancedMissingCount ? `${selectedAdvancedMissingCount} pendientes` : `${selectedAdvancedCompletedCount}/${selectedAdvancedTotal} completos` }}</em>
                    </div>
                    <span class="ce-health-link">
                      Abrir avanzado
                      <LucideChevronRight :size="16" />
                    </span>
                  </button>
                  <article v-if="selectedRecordIssueCount" :class="['ce-health-card', 'ce-health-card--action', selectedRecordHealth.tone]">
                    <div class="ce-health-card__icon">
                      <component
                        :is="selectedRecordIssueCount ? LucideAlertTriangle : LucideShieldCheck"
                        :size="19"
                      />
                    </div>
                    <div class="ce-health-card__copy">
                      <small>Pendientes</small>
                      <strong>{{ `${selectedRecordIssueCount} dato${selectedRecordIssueCount === 1 ? '' : 's'} por revisar` }}</strong>
                      <p>{{ selectedNextAction }}</p>
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
                  <button
                    v-for="signal in selectedStatusSignals"
                    :key="`signal-${signal.key}`"
                    type="button"
                    :class="['ce-status-signal-card', `is-${signal.tone}`]"
                    @click="goToStatusSignal(signal)"
                  >
                    <span class="ce-status-signal-icon">
                      <component :is="signal.icon" :size="16" />
                    </span>
                    <div>
                      <small>{{ signal.title }}</small>
                      <strong>{{ signal.label }}</strong>
                      <p v-if="signal.summary">{{ signal.summary }}</p>
                    </div>
                    <b>{{ signal.count }}</b>
                  </button>
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
                    <div class="ce-form-grid ce-identity-grid">
                      <label
                        :class="fieldShellClass('apellidoPaterno')"
                        data-ce-field="apellidoPaterno"
                        ><span>A. paterno</span
                        ><input
                          v-model="editForm.apellidoPaterno"
                          autocomplete="off"
                          @blur="formatNameField('apellidoPaterno')"
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
                          @blur="formatNameField('apellidoMaterno')"
                        />
                        <small>{{ fieldValidationMessage('apellidoMaterno') }}</small>
                      </label>
                      <label
                        :class="fieldShellClass('nombres')"
                        data-ce-field="nombres"
                        ><span>Nombre(s)</span
                        ><input v-model="editForm.nombres" autocomplete="off" @blur="formatNameField('nombres')"
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
                    <div class="ce-school-priority-panel">
                      <article class="ce-school-current-pill">
                        <small>Asignación actual</small>
                        <strong>{{ editForm.nivel || 'Sin nivel' }} · {{ editForm.grado || 'Sin grado' }}<template v-if="editForm.grupo"> · {{ editForm.grupo }}</template></strong>
                      </article>
                      <UiButton
                        variant="secondary"
                        type="button"
                        :disabled="savingAcademicPosition"
                        @click="openAcademicPositionModal"
                      >
                        <LucideGraduationCap :size="16" /> Ajustar grado y ciclo
                      </UiButton>
                    </div>
                    <section class="ce-group-picker-card" aria-label="Asignar grupo">
                      <div class="ce-group-picker-card__heading">
                        <span><LucideUsersRound :size="18" /></span>
                        <div>
                          <small>Grupo</small>
                          <strong>{{ editForm.grupo || 'Sin grupo' }}</strong>
                        </div>
                      </div>
                      <div
                        class="ce-group-combobox"
                        :class="{ open: groupPickerOpen }"
                        @focusin="openGroupPicker"
                        @focusout="closeGroupPickerSoon"
                      >
                        <label class="ce-group-combobox__input">
                          <UiGroupIcon :label="editForm.grupo" :missing="!editForm.grupo" />
                          <input
                            v-model="groupPickerInput"
                            autocomplete="off"
                            placeholder="Buscar o escribir grupo"
                            @keydown.enter.prevent="commitGroupPickerInput"
                            @keydown.escape.prevent="groupPickerOpen = false"
                          />
                          <button
                            v-if="editForm.grupo"
                            type="button"
                            aria-label="Limpiar grupo"
                            @mousedown.prevent
                            @click="clearGroupPicker"
                          >
                            <LucideX :size="15" />
                          </button>
                          <LucideChevronDown class="ce-group-combobox__chevron" :size="16" />
                        </label>

                        <div v-if="groupPickerOpen" class="ce-group-combobox__menu" role="listbox">
                          <button
                            v-for="option in filteredGroupOptions"
                            :key="`group-option-${option.value}`"
                            type="button"
                            role="option"
                            :aria-selected="option.selected"
                            :class="['ce-group-option', { selected: option.selected }]"
                            @mousedown.prevent
                            @click="selectGroupOption(option.value)"
                          >
                            <UiGroupIcon :label="option.value" />
                            <span>
                              <strong>{{ option.label }}</strong>
                              <small>{{ option.sourceLabel }}</small>
                            </span>
                            <LucideCheck v-if="option.selected" :size="16" />
                          </button>
                          <button
                            v-if="customGroupOption"
                            type="button"
                            class="ce-group-option custom"
                            role="option"
                            @mousedown.prevent
                            @click="selectGroupOption(customGroupOption.value)"
                          >
                            <UiGroupIcon :label="customGroupOption.value" />
                            <span>
                              <strong>{{ customGroupOption.label }}</strong>
                              <small>Grupo personalizado</small>
                            </span>
                          </button>
                          <div v-if="!filteredGroupOptions.length && !customGroupOption" class="ce-group-empty">
                            Escribe un grupo para guardarlo como personalizado.
                          </div>
                        </div>
                      </div>
                    </section>

                    <div class="ce-form-grid three ce-school-grid-minimal">
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
                    class="ce-tab-panel ce-family-panel"
                  >
                    <div class="ce-panel-heading">
                      <div>
                        <h3>Familia y contactos</h3>
                        <p>Los estados se calculan automáticamente con la información capturada.</p>
                      </div>
                    </div>
                    <section class="ce-family-readiness" aria-label="Estado de contacto familiar">
                      <button
                        v-for="group in selectedFamilySummaryCards"
                        :key="group.key"
                        type="button"
                        :class="['ce-family-readiness-card', group.tone]"
                        @click="goToFamilySummary(group)"
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
                      </button>
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

                    <section class="ce-family-siblings-card" aria-label="Hermanos detectados por Control Escolar">
                      <header>
                        <div>
                          <small>Hermanos</small>
                          <h3>Detección por padre y madre</h3>
                          <p>{{ selectedSiblingMatchLabel }}</p>
                        </div>
                        <span>{{ selectedControlEscolarSiblings.length }}</span>
                      </header>
                      <dl class="ce-family-siblings-match">
                        <div>
                          <dt>Padre</dt>
                          <dd>{{ selectedParentSiblingSignature.fatherName || 'Sin dato suficiente' }}</dd>
                        </div>
                        <div>
                          <dt>Madre</dt>
                          <dd>{{ selectedParentSiblingSignature.motherName || 'Sin dato suficiente' }}</dd>
                        </div>
                      </dl>
                      <div v-if="selectedControlEscolarSiblings.length" class="ce-family-siblings-list">
                        <button
                          v-for="sibling in selectedControlEscolarSiblings"
                          :key="`ce-sibling-${sibling.matricula}`"
                          type="button"
                          @click="selectSiblingStudent(sibling)"
                        >
                          <LucideUsersRound :size="14" />
                          <span>
                            <strong>{{ sibling.fullName || sibling.nombreCompleto }}</strong>
                            <small>{{ sibling.matricula }} · {{ sibling.grado || 'Sin grado' }}<template v-if="sibling.group || sibling.grupo"> {{ sibling.group || sibling.grupo }}</template></small>
                          </span>
                        </button>
                      </div>
                      <p v-else class="ce-family-siblings-empty">
                        {{ selectedParentSiblingSignature.complete ? 'No hay otros alumnos con el mismo padre y la misma madre en el alcance cargado.' : 'Falta completar padre y madre para calcular hermanos.' }}
                      </p>
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
                        <div class="ce-form-grid two ce-family-fields ce-family-fields--father">
                          <label :class="fieldShellClass('nombrePadre')" data-ce-field="nombrePadre">
                            <span>Nombre padre</span>
                            <input v-model="editForm.nombrePadre" autocomplete="off" @blur="formatNameField('nombrePadre')" />
                            <small>{{ fieldValidationMessage('nombrePadre') }}</small>
                          </label>
                          <label :class="fieldShellClass('apellidoPaternoPadre')" data-ce-field="apellidoPaternoPadre">
                            <span>Apellido paterno padre</span>
                            <div class="ce-autocomplete-field">
                              <input
                                v-model="editForm.apellidoPaternoPadre"
                                autocomplete="off"
                                @focus="showParentLastNameSuggestion('apellidoPaternoPadre')"
                                @click="showParentLastNameSuggestion('apellidoPaternoPadre')"
                                @blur="onParentLastNameBlur('apellidoPaternoPadre')"
                              />
                              <div
                                v-if="parentLastNameSuggestionVisible('apellidoPaternoPadre')"
                                class="ce-inline-suggestion-menu"
                              >
                                <button
                                  type="button"
                                  @mousedown.prevent="applyParentLastNameSuggestion('apellidoPaternoPadre')"
                                >
                                  Usar “{{ parentLastNameSuggestion('apellidoPaternoPadre') }}”
                                </button>
                                <button
                                  type="button"
                                  class="ghost"
                                  aria-label="Ocultar sugerencia"
                                  @mousedown.prevent="dismissParentLastNameSuggestion('apellidoPaternoPadre')"
                                >
                                  <LucideX :size="13" />
                                </button>
                              </div>
                            </div>
                            <small>{{ fieldValidationMessage('apellidoPaternoPadre') }}</small>
                          </label>
                          <label
                            ><span>Apellido materno padre</span
                            ><input
                              v-model="editForm.apellidoMaternoPadre"
                              autocomplete="off"
                              @blur="formatNameField('apellidoMaternoPadre')"
                          /></label>
                          <label :class="fieldShellClass('telefonoPadre')" data-ce-field="telefonoPadre">
                            <span>Teléfono padre</span>
                            <input v-model="editForm.telefonoPadre" autocomplete="off" inputmode="tel" />
                            <small>{{ fieldValidationMessage('telefonoPadre') }}</small>
                          </label>
                          <label
                            :class="['ce-family-span-2', ...fieldShellClass('emailPadre')]"
                            data-ce-field="emailPadre"
                          >
                            <span>Email padre</span>
                            <input v-model="editForm.emailPadre" type="email" autocomplete="off" />
                            <small>{{ fieldValidationMessage('emailPadre') }}</small>
                          </label>
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
                        <div class="ce-form-grid two ce-family-fields ce-family-fields--mother">
                          <label :class="fieldShellClass('nombreMadre')" data-ce-field="nombreMadre">
                            <span>Nombre madre</span>
                            <input v-model="editForm.nombreMadre" autocomplete="off" @blur="formatNameField('nombreMadre')" />
                            <small>{{ fieldValidationMessage('nombreMadre') }}</small>
                          </label>
                          <label :class="fieldShellClass('apellidoPaternoMadre')" data-ce-field="apellidoPaternoMadre">
                            <span>Apellido paterno madre</span>
                            <div class="ce-autocomplete-field">
                              <input
                                v-model="editForm.apellidoPaternoMadre"
                                autocomplete="off"
                                @focus="showParentLastNameSuggestion('apellidoPaternoMadre')"
                                @click="showParentLastNameSuggestion('apellidoPaternoMadre')"
                                @blur="onParentLastNameBlur('apellidoPaternoMadre')"
                              />
                              <div
                                v-if="parentLastNameSuggestionVisible('apellidoPaternoMadre')"
                                class="ce-inline-suggestion-menu"
                              >
                                <button
                                  type="button"
                                  @mousedown.prevent="applyParentLastNameSuggestion('apellidoPaternoMadre')"
                                >
                                  Usar “{{ parentLastNameSuggestion('apellidoPaternoMadre') }}”
                                </button>
                                <button
                                  type="button"
                                  class="ghost"
                                  aria-label="Ocultar sugerencia"
                                  @mousedown.prevent="dismissParentLastNameSuggestion('apellidoPaternoMadre')"
                                >
                                  <LucideX :size="13" />
                                </button>
                              </div>
                            </div>
                            <small>{{ fieldValidationMessage('apellidoPaternoMadre') }}</small>
                          </label>
                          <label
                            ><span>Apellido materno madre</span
                            ><input
                              v-model="editForm.apellidoMaternoMadre"
                              autocomplete="off"
                              @blur="formatNameField('apellidoMaternoMadre')"
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
                  </section>

                  <section
                    v-show="activeDetailTab === 'advanced'"
                    class="ce-form-card ce-tab-panel ce-advanced-expediente-panel"
                  >
                    <div class="ce-panel-heading">
                      <div>
                        <h3>Expediente avanzado</h3>
                        <p>Campos complementarios de matrícula del alumno.</p>
                      </div>
                      <span :class="['ce-panel-status', advancedExpedienteStatus.tone]">{{ advancedExpedienteStatus.label }}</span>
                    </div>

                    <section class="ce-advanced-section">
                      <div class="ce-section-heading compact">
                        <span><LucideShieldCheck :size="18" /></span>
                        <h3>Alumno y salud</h3>
                      </div>
                      <div class="ce-form-grid three">
                        <label><span>Lugar nacimiento</span><input v-model="editForm.lugarNacimiento" autocomplete="off" /></label>
                        <label><span>Talla</span><input v-model="editForm.talla" autocomplete="off" /></label>
                        <label><span>Peso</span><input v-model="editForm.peso" autocomplete="off" /></label>
                        <label>
                          <span>Tipo de sangre</span>
                          <select v-model="editForm.tipoSangre">
                            <option value="">Selecciona</option>
                            <option v-for="type in bloodTypeOptions" :key="`blood-${type}`" :value="type">{{ type }}</option>
                          </select>
                        </label>
                        <label class="ce-family-span-2"><span>Alergias</span><input v-model="editForm.alergias" autocomplete="off" /></label>
                      </div>
                    </section>

                    <section class="ce-advanced-section">
                      <div class="ce-section-heading compact">
                        <span><LucideUsersRound :size="18" /></span>
                        <h3>Datos familiares</h3>
                      </div>
                      <div class="ce-form-grid three">
                        <label><span>Estado civil padre</span><input v-model="editForm.estadoCivilPadre" autocomplete="off" /></label>
                        <label><span>Fecha nacimiento padre</span><input v-model="editForm.fechaNacimientoPadre" type="date" autocomplete="off" /></label>
                        <label><span>INE padre</span><input v-model="editForm.inePadre" autocomplete="off" /></label>
                        <label><span>CURP padre</span><input v-model="editForm.curpPadre" maxlength="18" autocomplete="off" /></label>
                        <label><span>Estado civil madre</span><input v-model="editForm.estadoCivilMadre" autocomplete="off" /></label>
                        <label><span>Fecha nacimiento madre</span><input v-model="editForm.fechaNacimientoMadre" type="date" autocomplete="off" /></label>
                        <label><span>INE madre</span><input v-model="editForm.ineMadre" autocomplete="off" /></label>
                        <label><span>CURP madre</span><input v-model="editForm.curpMadre" maxlength="18" autocomplete="off" /></label>
                      </div>
                    </section>

                    <section class="ce-advanced-section">
                      <div class="ce-section-heading compact">
                        <span><LucideBuilding2 :size="18" /></span>
                        <h3>Domicilio</h3>
                      </div>
                      <div class="ce-form-grid three">
                        <label><span>Calle</span><input v-model="editForm.domicilioCalle" autocomplete="off" /></label>
                        <label><span>Número</span><input v-model="editForm.domicilioNumero" autocomplete="off" /></label>
                        <label><span>Colonia</span><input v-model="editForm.domicilioColonia" autocomplete="off" /></label>
                        <label><span>Código postal</span><input v-model="editForm.domicilioCp" maxlength="5" autocomplete="off" /></label>
                        <label><span>Municipio</span><input v-model="editForm.domicilioMunicipio" autocomplete="off" /></label>
                      </div>
                    </section>

                    <section class="ce-advanced-section">
                      <div class="ce-section-heading compact">
                        <span><LucideFileUp :size="18" /></span>
                        <h3>Documentos adjuntos</h3>
                      </div>
                      <div class="ce-advanced-upload-grid">
                        <label
                          v-for="field in advancedFileFields"
                          :key="field.key"
                          class="ce-advanced-upload-card"
                          :class="{ 'is-uploading': uploadingAdvancedField === field.key, 'has-value': Boolean(editForm[field.key]) }"
                        >
                          <span class="ce-advanced-upload-icon"><LucideFileUp :size="17" /></span>
                          <span class="ce-advanced-upload-copy">
                            <strong>{{ field.label }}</strong>
                            <small>{{ advancedFileValueLabel(field.key) }}</small>
                            <em v-if="advancedUploadErrors[field.key]">{{ advancedUploadErrors[field.key] }}</em>
                          </span>
                          <input type="file" :disabled="uploadingAdvancedField === field.key" @change="uploadAdvancedFile(field, $event)" />
                        </label>
                      </div>
                    </section>
                  </section>

                  <section
                    v-show="activeDetailTab === 'system'"
                    class="ce-form-card ce-system-panel ce-tab-panel"
                  >
                    <div class="ce-section-heading compact">
                      <span><LucideKeyRound :size="18" /></span>
                      <h3>Husky Pass</h3>
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
            aria-label="Seleccionar alumno"
          >
            <div class="ce-empty-shell">
              <div class="ce-empty-hero" aria-hidden="true">
                <LucideUserRound :size="34" />
              </div>
              <div class="ce-empty-copy">
                <h2>Selecciona un alumno</h2>
                <p>Elige un registro de la lista para revisar y editar su expediente.</p>
              </div>
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

    <IngresoCycleModal
      v-if="showAcademicPositionModal && selectedStudent"
      :student="selectedStudent"
      :target-ciclo="currentCicloKey"
      :current-tipo-ingreso="selectedStudent.tipoIngresoValue ? { value: selectedStudent.tipoIngresoValue } : { value: 'externo' }"
      :photo-url="controlStudentPhotoUrl(selectedStudent) || ''"
      :saving="savingAcademicPosition"
      :enrollment-concepts="tipoIngresoConcepts.length ? tipoIngresoConcepts : externalConcepts"
      @close="showAcademicPositionModal = false"
      @confirm="saveAcademicPosition"
    />

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
            <small>Estado de carga</small>
            <h2 id="ce-diagnostics-title">Detalle de actualización</h2>
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
                Resumen de la última actualización visible para este plantel y ciclo.
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
                <small>Actualización</small>
                <h3>Secuencia de carga</h3>
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
                    <p class="ce-diagnostics-node__why"><b>Detalle:</b> {{ node.why }}</p>
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
                <dt>Origen</dt>
                <dd>{{ controlSourceModeLabel(lastControlLoadDiagnostics.source.base) }}</dd>
              </div>
              <div>
                <dt>Complementarios</dt>
                <dd>{{ controlSourceModeLabel(lastControlLoadDiagnostics.source.overlay) }}</dd>
              </div>
              <div>
                <dt>Ruta de carga</dt>
                <dd>{{ controlSourceModeLabel(lastControlLoadDiagnostics.server.flow) }}</dd>
              </div>
              <div>
                <dt>Respaldo</dt>
                <dd>{{ lastControlLoadDiagnostics.source.bridgeFallback ? 'Usado' : 'Disponible' }}</dd>
              </div>
              <div>
                <dt>Actualización</dt>
                <dd>{{ controlSourceModeLabel(lastControlLoadDiagnostics.source.cacheFreshness || 'principal') }}</dd>
              </div>
              <div>
                <dt>Rows</dt>
                <dd>principal {{ lastControlLoadDiagnostics.source.localRows }}, matrícula {{ lastControlLoadDiagnostics.source.overlayRows }}, usuarios {{ lastControlLoadDiagnostics.source.usersRows }}</dd>
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
  LucideCheck,
  LucideChevronDown,
  LucideChevronLeft,
  LucideClock3,
  LucideCloudOff,
  LucideComputer,
  LucideChevronRight,
  LucideDatabase,
  LucideDownload,
  LucideFilter,
  LucideFileSpreadsheet,
  LucideFileUp,
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
import StudentsKpiValue from "~/components/students/StudentsKpiValue.vue";
import IngresoCycleModal from "~/components/IngresoCycleModal.vue";
import { useToast } from "~/composables/useToast";
import { normalizeCicloKey, formatCicloLabel } from "~/shared/utils/ciclo";
import {
  normalizeEnrollmentConceptIds,
  normalizeEnrollmentPlantelKey,
  normalizeStudentMatricula,
  parseEnrollmentConceptsForPlantelHistory,
  parseEnrollmentConceptsForScope,
  photoStorageKey,
  studentPresentationStyle,
  resolveControlEscolarCompleteness,
  inferMexicanCurpIdentity,
  CONTROL_ESCOLAR_BASIC_REQUIRED_FIELDS,
  CONTROL_ESCOLAR_COMPLETE_REQUIRED_FIELDS,
} from "~/shared/utils/studentPresentation";
import { NIVELES_ESCOLARES, gradeOptionsForNivel } from "~/shared/utils/grado";
import { STUDENT_GROUP_ICON_LABELS } from "~/shared/utils/studentGroupIcons";
import { buildParentSiblingSignature } from "~/shared/utils/parentSiblingMatch";
import { isControlEscolarNameField, toNameDisplayCase } from "~/shared/utils/nameCase";
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
const tipoIngresoConcepts = ref([]);
const ENROLLMENT_CONCEPTS_CACHE_BASE_KEY = "control-escolar-enrollment-concepts:v3";
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
const currentEnrollmentPlantelKey = computed(() =>
  normalizeEnrollmentPlantelKey(selectedAgentId.value || activePlantelCookie.value || "GLOBAL") || "GLOBAL",
);
const enrollmentConceptsCacheKey = computed(
  () => `${ENROLLMENT_CONCEPTS_CACHE_BASE_KEY}:${currentCicloKey.value}:${currentEnrollmentPlantelKey.value}`,
);
const optionsLoading = ref(false);
const kpisLoading = ref(false);
const studentsLoading = ref(false);
const savingStudent = ref(false);
const massImporting = ref(false);
const sendingHuskyPass = ref(false);
const activeParentLastNameSuggestion = ref("");
const dismissedParentLastNameSuggestions = ref({});
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
const showAcademicPositionModal = ref(false);
const savingAcademicPosition = ref(false);
const uploadingAdvancedField = ref("");
const advancedUploadErrors = reactive({});
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
    if (status === "disabled") return "La lista se actualiza desde la fuente principal para mostrar cambios recientes.";
    if (status === "ready") return "Se usaron datos locales válidos para esta vista.";
    return "Se revisaron datos locales y no aportaron una lista útil para esta carga.";
  }
  if (key === "verified-cache") {
    if (status === "skipped") return reason === "live_bridge_primary_snapshot_only_on_bridge_failure"
      ? "El respaldo quedó reservado porque la fuente principal respondió correctamente."
      : "El respaldo se omitió por la fase actual de carga.";
    if (status === "ready") return "Se usó un respaldo verificado porque la fuente principal no respondió.";
    if (status === "empty") return "Se intentó usar un respaldo, pero no había datos utilizables para este alcance.";
    if (status === "failed") return "La fuente principal no respondió y tampoco se pudo abrir el respaldo verificado.";
  }
  if (key === "bridge-schema") return status === "ready"
    ? "El servidor validó la fuente principal y los datos complementarios disponibles."
    : "La fuente principal respondió con disponibilidad parcial.";
  if (key === "live-base-selector") return status === "ready"
    ? "La lista base se resolvió desde la fuente principal de Control Escolar."
    : "La lectura principal falló y se usó una ruta de respaldo.";
  if (key === "cache-refresh") return status === "ready"
    ? "El respaldo se actualizó con datos recientes."
    : status === "skipped"
      ? "No se actualizó el respaldo porque la consulta no lo requería."
      : "Falló la actualización del respaldo, pero la carga principal continuó.";
  if (key === "matricula-overlay") return status === "ready"
    ? "Se agregaron datos complementarios del expediente escolar."
    : "La carga continuó, aunque algunos datos complementarios no respondieron completamente.";
  if (key === "husky-pass") return status === "ready"
    ? "Se consultó Husky Pass como enriquecimiento adicional de usuarios." 
    : "La consulta de Husky Pass no respondió o no tenía datos para esta carga.";
  if (key === "server-enriched") return status === "ready"
    ? "La pantalla recibió la respuesta final del servidor." 
    : "La solicitud principal al servidor falló antes de entregar una lista usable.";
  if (lane === "server") return "El servidor reportó esta etapa como parte del recorrido real de resolución.";
  return "La etapa se registró automáticamente durante la última carga para explicar la decisión tomada.";
};

const controlSourceModeLabel = (value = "") => {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (!normalized) return "n/a";
  if (normalized.includes("bridge") || normalized.includes("live") || normalized.includes("principal")) {
    return "Fuente principal";
  }
  if (normalized.includes("verified-cache") || normalized.includes("snapshot") || normalized.includes("cache") || normalized === "fresh" || normalized === "expired") {
    return "Datos guardados";
  }
  if (normalized.includes("overlay") || normalized.includes("matricula")) {
    return "Matrícula";
  }
  if (normalized.includes("server")) return "Servidor";
  return raw.replace(/[-_]/g, " ");
};

const controlStepTitleLabel = (step = {}) => {
  const key = String(step.key || "");
  const labels = {
    "browser-cache": "Datos locales",
    "verified-cache": "Respaldo verificado",
    "bridge-schema": "Validación de origen",
    "live-base-selector": "Fuente principal",
    "cache-refresh": "Actualización de respaldo",
    "matricula-overlay": "Matrícula",
    "husky-pass": "Husky Pass",
    "server-enriched": "Respuesta final",
  };
  return labels[key] || controlSourceModeLabel(step.label || key);
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
      label: "Ruta de carga",
      value: controlSourceModeLabel(diagnostics.server.flow),
      tone: controlStatusTone(diagnostics.status),
    },
    {
      label: "Datos complementarios",
      value: `${diagnostics.source.overlayRows}/${diagnostics.source.localRows || 0}`,
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
      title: controlStepTitleLabel(step),
      decision: controlStepTitleLabel(step),
      why: describeControlWhy(step, "client"),
      tone: controlStatusTone(step.status),
      status: step.status,
      statusLabel: controlStatusLabel(step.status),
      ms: Number(step.ms || 0),
      meta: [
        { label: "Filas", value: step.rows },
        { label: "Motivo", value: controlSourceModeLabel(step.reason || step.freshness || "") },
        { label: "Error", value: step.error || "" },
      ].filter((item) => item.value !== "" && item.value != null),
    }))),
    ...((diagnostics.server.steps || []).map((step) => ({
      id: `server-${step.key}`,
      lane: "server",
      laneLabel: "Servidor",
      title: controlStepTitleLabel(step),
      decision: controlStepTitleLabel(step),
      why: describeControlWhy(step, "server"),
      tone: controlStatusTone(step.status),
      status: step.status,
      statusLabel: controlStatusLabel(step.status),
      ms: Number(step.ms || 0),
      meta: [
        { label: "Filas", value: step.rows },
        { label: "Actualización", value: controlSourceModeLabel(step.freshness || "") },
        { label: "Alcance", value: step.scopeKey || "" },
        { label: "Motivo", value: controlSourceModeLabel(step.reason || "") },
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
      ? "La vista se resolvió con datos de respaldo y datos complementarios."
      : "La vista se resolvió con la fuente principal y datos complementarios.",
    why: diagnostics.source.bridgeFallback
      ? "La fuente principal no respondió y el respaldo verificado sostuvo la carga."
      : "La ruta resolvió la fuente principal y mantuvo el respaldo disponible.",
    tone: controlStatusTone(diagnostics.status),
    status: diagnostics.status,
    statusLabel: controlStatusLabel(diagnostics.status),
    ms: diagnostics.totalMs,
    meta: [
      { label: "Origen", value: controlSourceModeLabel(diagnostics.source.base) },
      { label: "Complementarios", value: controlSourceModeLabel(diagnostics.source.overlay) },
      { label: "Filas", value: `${diagnostics.source.localRows}/${diagnostics.source.overlayRows}/${diagnostics.source.usersRows}` },
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

useModalEscape(closeControlDiagnosticsModal, { enabled: showControlDiagnosticsModal });

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
      ? "Actualización no disponible; mostrando datos guardados."
      : cacheFreshness === "expired"
        ? "Mostrando datos guardados; actualización automática en curso."
        : cacheFreshness === "live-bridge"
          ? "Control Escolar actualizado."
          : cacheFreshness === "fresh"
            ? "Control Escolar usando datos verificados guardados."
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
          ? "Datos verificados guardados disponibles"
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
const knownGroupOptions = computed(() => {
  const byGrade = catalogs.gruposPorGrado || {};
  const scopedGroups =
    editForm.grado && Array.isArray(byGrade[editForm.grado])
      ? byGrade[editForm.grado]
      : [];
  return mergeOptions(scopedGroups, catalogs.grupos, STUDENT_GROUP_ICON_LABELS);
});
const groupOptions = computed(() =>
  mergeOptions(knownGroupOptions.value, [editForm.grupo]),
);
const groupPickerOpen = ref(false);
const normalizeGroupPickerText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();
const groupPickerInput = computed({
  get: () => String(editForm.grupo || ""),
  set: (value) => {
    editForm.grupo = normalizeGroupPickerText(value).slice(0, 40);
    groupPickerOpen.value = true;
  },
});
const normalizedGroupPickerSearch = computed(() =>
  normalizeClientText(groupPickerInput.value),
);
const filteredGroupOptions = computed(() => {
  const query = normalizedGroupPickerSearch.value;
  return knownGroupOptions.value
    .filter((value) => !query || normalizeClientText(value).includes(query))
    .slice(0, 12)
    .map((value) => ({
      value,
      label: value,
      selected:
        normalizeClientText(value) === normalizeClientText(editForm.grupo),
      sourceLabel: catalogs.grupos.includes(value)
        ? "Grupo del plantel"
        : "Opción con icono",
    }));
});
const customGroupOption = computed(() => {
  const value = normalizeGroupPickerText(groupPickerInput.value).slice(0, 40);
  if (!value) return null;
  const exists = knownGroupOptions.value.some(
    (option) => normalizeClientText(option) === normalizeClientText(value),
  );
  if (exists) return null;
  return { value, label: `Usar “${value}”` };
});
const openGroupPicker = () => {
  groupPickerOpen.value = true;
};
const closeGroupPickerSoon = () => {
  if (!process.client) return;
  window.setTimeout(() => {
    groupPickerOpen.value = false;
  }, 120);
};
const selectGroupOption = (value) => {
  editForm.grupo = normalizeGroupPickerText(value).slice(0, 40);
  groupPickerOpen.value = false;
};
const commitGroupPickerInput = () => {
  editForm.grupo = normalizeGroupPickerText(groupPickerInput.value).slice(0, 40);
  groupPickerOpen.value = false;
};
const clearGroupPicker = () => {
  editForm.grupo = "";
  groupPickerOpen.value = true;
};

watch(
  () => editForm.nivel,
  () => {
    const available = gradoOptions.value;
    if (editForm.grado && !available.includes(editForm.grado))
      editForm.grado = available[0] || "";
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
  { key: "advanced", label: "Expediente avanzado", icon: LucideFileUp },
  { key: "system", label: "Husky Pass", icon: LucideKeyRound },
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
  if (value === null || value === undefined || total === null || total === undefined) return 0;
  const safeValue = Math.max(0, Number(value || 0));
  const safeTotal = Math.max(0, Number(total || 0));
  if (!safeTotal) return 0;
  return Math.min(100, Math.round((safeValue / safeTotal) * 100));
};
const withVolume = (card, total) => {
  const hasValue = card.value !== null && card.value !== undefined;
  const hasTotal = total !== null && total !== undefined;
  const percent =
    hasValue && hasTotal && card.key === "inscritos" && Number(card.value || 0) > 0
      ? 100
      : volumePercent(card.value, total);
  return {
    ...card,
    massUnits: hasValue && hasTotal
      ? buildMassUnits(card.key === "inscritos" ? total : card.value, total)
      : buildMassUnits(0, 0),
    volumeAria: hasValue
      ? `${card.label}: ${formatNumber(card.value)}; ${card.key === "inscritos" ? "total de inscritos" : `${percent}% del total de inscritos`}`
      : `${card.label}: sin dato disponible`,
  };
};
const kpiCards = computed(() => {
  if (!kpis.value) {
    return [
      { key: "inscritos", label: "Inscritos", value: null, tone: "kpi-green", icon: LucideUsersRound },
      { key: "internos", label: "Internos", value: null, tone: "kpi-teal", icon: LucideUserCheck },
      { key: "externos", label: "Externos", value: null, tone: "kpi-blue", icon: LucideGlobe2 },
      { key: "no_inscritos", label: "No inscritos", value: null, tone: "kpi-red", icon: LucideUserX },
      { key: "bajas", label: "Bajas", value: null, tone: "kpi-gray", icon: LucideUserX },
    ].map((card) => withVolume(card, null));
  }
  const data = kpis.value;
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
      value: data.internos ?? 0,
      tone: "kpi-teal",
      icon: LucideUserCheck,
    },
    {
      key: "externos",
      label: "Externos",
      value: data.externos ?? 0,
      tone: "kpi-blue",
      icon: LucideGlobe2,
    },
    {
      key: "no_inscritos",
      label: "No inscritos",
      value: data.noInscritos ?? 0,
      tone: "kpi-red",
      icon: LucideUserX,
    },
    {
      key: "bajas",
      label: "Bajas",
      value: data.bajas ?? 0,
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
const selectedAdvancedProfileCompletion = computed(() => {
  const total = selectedAdvancedTotal.value || 1;
  return Math.round((selectedAdvancedCompletedCount.value / total) * 100);
});
const selectedMissingCount = computed(() =>
  studentMissingCount(selectedHealthStudent.value),
);
const selectedAdvancedMissingCount = computed(() => advancedMissingCount.value);
const selectedAdvancedTotal = computed(() => advancedExpedienteFields.length);
const selectedAdvancedCompletedCount = computed(() =>
  Math.max(0, selectedAdvancedTotal.value - selectedAdvancedMissingCount.value),
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
const compactMissingFieldLabels = {
  curp: "CURP",
  padreNombre: "Nombre padre",
  padreApellidoPaterno: "Ap. padre",
  padreTelefono: "Tel. padre",
  padreEmail: "Email padre",
  madreNombre: "Nombre madre",
  madreApellidoPaterno: "Ap. madre",
  madreTelefono: "Tel. madre",
  madreEmail: "Email madre",
};
const compactMissingField = (field = {}) => ({
  ...field,
  label: compactMissingFieldLabels[field.key] || field.label,
});
const rowHealthMetrics = (student = {}, limit = 8) => {
  if (studentCurpIsInvalid(student)) {
    return requiredDataFields
      .filter((field) => field.key === "curp")
      .map((field) => ({ ...compactMissingField(field), label: "CURP inválida", missing: true }));
  }
  const missingKeys = new Set(normalizedMissingFields(student, "basic"));
  const missing = requiredDataFields
    .filter((field) => missingKeys.has(String(field.key || "").toLowerCase()))
    .map((field) => ({ ...compactMissingField(field), missing: true }));
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

const selectedParentSiblingSignature = computed(() => {
  if (!selectedStudent.value) return buildParentSiblingSignature({});
  return buildParentSiblingSignature({
    ...selectedStudent.value,
    nombrePadre: editForm.nombrePadre,
    apellidoPaternoPadre: editForm.apellidoPaternoPadre,
    apellidoMaternoPadre: editForm.apellidoMaternoPadre,
    nombreMadre: editForm.nombreMadre,
    apellidoPaternoMadre: editForm.apellidoPaternoMadre,
    apellidoMaternoMadre: editForm.apellidoMaternoMadre,
  });
});

const selectedControlEscolarSiblings = computed(() => {
  if (!selectedStudent.value || !selectedParentSiblingSignature.value.complete) return [];
  const selectedKey = normalizeMatriculaKey(selectedStudent.value.matricula);
  return controlStudentsIndex.value
    .filter((student) => normalizeMatriculaKey(student.matricula) !== selectedKey)
    .filter((student) => {
      const signature = student.parentSiblingSignature || buildParentSiblingSignature(student);
      return signature.complete && signature.key === selectedParentSiblingSignature.value.key;
    })
    .sort((left, right) => `${left.grado || ''}|${left.group || left.grupo || ''}|${left.fullName || left.nombreCompleto || ''}`.localeCompare(`${right.grado || ''}|${right.group || right.grupo || ''}|${right.fullName || right.nombreCompleto || ''}`, 'es'));
});

const selectedSiblingMatchLabel = computed(() => {
  const signature = selectedParentSiblingSignature.value;
  if (!signature.complete) return "Captura padre y madre completos para detectar hermanos.";
  return "Mismo padre y misma madre registrados.";
});

const selectSiblingStudent = (student) => {
  if (!student?.matricula) return;
  const candidate = controlStudentsIndex.value.find(
    (item) => normalizeMatriculaKey(item.matricula) === normalizeMatriculaKey(student.matricula),
  ) || student;
  selectStudent(candidate);
  activeDetailTab.value = "family";
};
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
const selectedVisibleActionChips = computed(() => selectedRecordActions.value);
const selectedHiddenActionCount = computed(() =>
  Math.max(0, selectedRecordActions.value.length - selectedVisibleActionChips.value.length),
);
const goToMissingField = (field = {}) => {
  if (field.tab) activeDetailTab.value = field.tab;
  nextTick(() => {
    if (!process.client || !field.formField) return;
    const selector = `[data-ce-field="${field.formField}"] input, [data-ce-field="${field.formField}"] select, [data-ce-field="${field.formField}"] textarea`;
    const target = document.querySelector(selector);
    target?.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "nearest" });
    window.requestAnimationFrame(() => target?.focus?.({ preventScroll: true }));
  });
};
const familyTargetFields = {
  padre: ["nombrePadre", "apellidoPaternoPadre", "telefonoPadre", "emailPadre"],
  madre: ["nombreMadre", "apellidoPaternoMadre", "telefonoMadre", "emailMadre"],
  contacto: ["telefonoPadre", "telefonoMadre", "emailPadre", "emailMadre"],
  curp: ["curp"],
};
const targetForFamilyArea = (key = "") => {
  const normalizedKey = String(key || "").toLowerCase();
  const fields = familyTargetFields[normalizedKey] || familyTargetFields.curp;
  const formField = fields.find((field) => fieldValidationState(field) !== "ok") || fields[0];
  return { tab: normalizedKey === "curp" ? "identity" : "family", formField };
};
const goToStatusSignal = (signal = {}) => {
  goToMissingField(targetForFamilyArea(signal.key));
};
const goToFamilySummary = (group = {}) => {
  goToMissingField(targetForFamilyArea(group.key));
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
const inferredParentLastNameSource = (field) =>
  field === "apellidoPaternoMadre"
    ? formValue("apellidoMaterno")
    : formValue("apellidoPaterno");
const parentLastNameSuggestion = (field) => inferredParentLastNameSource(field);
const parentLastNameSuggestionVisible = (field) => {
  const suggestion = parentLastNameSuggestion(field);
  if (!suggestion) return false;
  if (activeParentLastNameSuggestion.value !== field) return false;
  if (dismissedParentLastNameSuggestions.value[field] === suggestion) return false;
  const currentValue = formValue(field);
  return !currentValue || currentValue.toLowerCase() !== suggestion.toLowerCase();
};
const showParentLastNameSuggestion = (field) => {
  activeParentLastNameSuggestion.value = field;
};
const hideParentLastNameSuggestion = () => {
  window.setTimeout(() => {
    activeParentLastNameSuggestion.value = "";
  }, 120);
};
const dismissParentLastNameSuggestion = (field) => {
  const suggestion = parentLastNameSuggestion(field);
  dismissedParentLastNameSuggestions.value = {
    ...dismissedParentLastNameSuggestions.value,
    [field]: suggestion,
  };
  activeParentLastNameSuggestion.value = "";
};
const applyParentLastNameSuggestion = (field) => {
  const suggestion = parentLastNameSuggestion(field);
  if (!suggestion) return;
  editForm[field] = suggestion;
  activeParentLastNameSuggestion.value = "";
  nextTick(() => {
    if (!process.client) return;
    document
      .querySelector(`[data-ce-field="${field}"] input`)
      ?.focus?.();
  });
};
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
    status: missing.length ? `${missing.length} pendiente${missing.length === 1 ? "" : "s"}` : "Listo",
    summary: missing.length
      ? `Falta ${missing.slice(0, 2).map((field) => labels[field]).join(", ")}`
      : "",
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
    summary: missing.length ? `Falta ${missing.join(" y ")}` : "",
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
      : "",
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
const computeAgeFromDate = (value) => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const birth = new Date(`${text}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
};
const derivedAgeLabel = computed(() => {
  const age = computeAgeFromDate(curpDerivedIdentity.value?.fechaNacimiento);
  return age === null ? 'Edad no disponible' : `${age} año${age === 1 ? '' : 's'}`;
});
const curpValidationMeta = (value) => {
  const normalized = normalizeCurpInput(value);
  if (!normalized) return { state: 'missing', message: 'Requerida' };
  if (normalized.length < 18) return { state: 'invalid', message: `Faltan ${18 - normalized.length} caracteres` };
  if (!/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(normalized)) {
    return { state: 'invalid', message: 'Formato oficial inválido' };
  }
  const inferred = inferMexicanCurpIdentity(normalized);
  if (!inferred.valid) return { state: 'invalid', message: 'Fecha o sexo no válidos en CURP' };
  return { state: 'ok', message: '' };
};
const emailIsValid = (value) => {
  const email = String(value || "").trim().toLowerCase();
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
};
const normalizePhoneForValidation = (value) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('521') && digits.length === 13) digits = digits.slice(3);
  else if (digits.startsWith('52') && digits.length === 12) digits = digits.slice(2);
  return digits;
};
const phoneIsValid = (value) => {
  const digits = normalizePhoneForValidation(value);
  return digits.length === 10;
};
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
  if (config.kind === "curp") return curpValidationMeta(value).state === 'ok' ? 'ok' : 'invalid';
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
  if (state === "ok") return "";
  if (field === "curp") {
    return curpValidationMeta(editForm.curp).message;
  }
  if (field.toLowerCase().includes("telefono")) {
    if (state === "missing") return "Requerido";
    if (state === "invalid") return "Usa 10 dígitos válidos";
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
  return { tone: "complete", label: "Listo", count: 0 };
});
const selectedSchoolStatus = computed(() => {
  const schoolKeys = ["nivel", "grado", "grupo"];
  const missing = schoolKeys.filter((key) =>
    normalizedMissingFields(selectedHealthStudent.value, "complete").includes(key),
  );
  if (!missing.length)
    return { tone: "complete", label: "Listo", count: 0, summary: "" };
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
    curpState === "ok" ? "Lista" : curpState === "invalid" ? "Inválida" : "Pendiente";
  const curpSummary =
    curpState === "ok"
      ? `${curpDerivedIdentity.value.fechaNacimiento} · ${derivedGenderMeta.value.label} · ${derivedAgeLabel.value}`
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
    advanced: {
      tone: advancedExpedienteStatus.value.tone,
      count: advancedMissingCount.value,
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
const bloodTypeOptions = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const advancedTextFields = [
  { key: "lugarNacimiento", label: "Lugar nacimiento" },
  { key: "talla", label: "Talla" },
  { key: "peso", label: "Peso" },
  { key: "tipoSangre", label: "Tipo de sangre" },
  { key: "alergias", label: "Alergias" },
  { key: "estadoCivilPadre", label: "Estado civil padre" },
  { key: "fechaNacimientoPadre", label: "Fecha nacimiento padre" },
  { key: "inePadre", label: "INE padre" },
  { key: "curpPadre", label: "CURP padre" },
  { key: "estadoCivilMadre", label: "Estado civil madre" },
  { key: "fechaNacimientoMadre", label: "Fecha nacimiento madre" },
  { key: "ineMadre", label: "INE madre" },
  { key: "curpMadre", label: "CURP madre" },
  { key: "domicilioCalle", label: "Calle" },
  { key: "domicilioNumero", label: "Número" },
  { key: "domicilioColonia", label: "Colonia" },
  { key: "domicilioCp", label: "Código postal" },
  { key: "domicilioMunicipio", label: "Municipio" },
];
const advancedFileFields = [
  { key: "certificadoMedicoAdjunto", label: "Certificado médico" },
  { key: "certificadoVacunacionCovid19Adjunto", label: "Certificado vacunación COVID-19" },
  { key: "actaNacimientoAdjunta", label: "Acta nacimiento" },
  { key: "curpAlumnoAdjunto", label: "CURP alumno" },
  { key: "certificadoPrimariaAdjunto", label: "Certificado primaria" },
  { key: "boletaSextoPrimariaAdjunta", label: "Boleta sexto primaria" },
  { key: "boletaPrimeroSecundariaAdjunta", label: "Boleta primero secundaria" },
  { key: "boletaSegundoSecundariaAdjunta", label: "Boleta segundo secundaria" },
];
const advancedExpedienteFields = [...advancedTextFields, ...advancedFileFields];
const fieldValueIsPresent = (value) => String(value ?? "").trim().length > 0;
const advancedMissingCount = computed(() =>
  advancedExpedienteFields.filter((field) => !fieldValueIsPresent(editForm[field.key])).length,
);
const advancedExpedienteStatus = computed(() => {
  const missing = advancedMissingCount.value;
  if (!missing) return { tone: "complete", label: "Completo" };
  return {
    tone: missing >= 8 ? "danger" : "warning",
    label: missing === 1 ? "1 pendiente" : `${missing} pendientes`,
  };
});
const advancedFileValueLabel = (fieldKey) => {
  if (uploadingAdvancedField.value === fieldKey) return "Subiendo archivo...";
  const value = String(editForm[fieldKey] || "").trim();
  if (!value) return "Seleccionar archivo";
  try {
    const parsed = JSON.parse(value);
    return parsed?.fileName || parsed?.path || parsed?.url || "Archivo cargado";
  } catch {
    return value.split("/").filter(Boolean).pop() || "Archivo cargado";
  }
};

const EDIT_FORM_FIELDS = [
  "nombres",
  "apellidoPaterno",
  "apellidoMaterno",
  "curp",
  "nombreVerificado",
  "nombreCompletoAlumno",
  "lugarNacimiento",
  "sexo",
  "talla",
  "peso",
  "tipoSangre",
  "alergias",
  "foto",
  "grupo",
  "baja",
  "motivoBaja",
  "categoriaBaja",
  "seguimientoBaja",
  "nombrePadre",
  "apellidoPaternoPadre",
  "apellidoMaternoPadre",
  "estadoCivilPadre",
  "fechaNacimientoPadre",
  "inePadre",
  "curpPadre",
  "nombreMadre",
  "apellidoPaternoMadre",
  "apellidoMaternoMadre",
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
];
const CONTROL_ESCOLAR_EDIT_NAME_FIELDS = EDIT_FORM_FIELDS.filter((field) => isControlEscolarNameField(field));

const formatNameField = (field) => {
  if (!isControlEscolarNameField(field)) return;
  editForm[field] = toNameDisplayCase(editForm[field]);
};

const formatEditNameFields = () => {
  CONTROL_ESCOLAR_EDIT_NAME_FIELDS.forEach(formatNameField);
};

const onParentLastNameBlur = (field) => {
  hideParentLastNameSuggestion();
  formatNameField(field);
};

const readEditForm = () => {
  formatEditNameFields();
  return EDIT_FORM_FIELDS.reduce((draft, field) => {
    draft[field] = editForm[field] ?? "";
    return draft;
  }, {});
};
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
  tipoConcepts: tipoIngresoConcepts.value.join(",") || undefined,
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
    kpis.value = null;
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
    "Datos locales",
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
    publishControlSyncIndicatorState({ status: "cached", message: "Datos visibles mientras se actualiza." });
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
  activeParentLastNameSuggestion.value = "";
  dismissedParentLastNameSuggestions.value = {};
  if (copy) resetEditForm(student, { restoreDraft: true });
  queueControlStudentPhotos([student], { priority: true });
  nextTick(scheduleWorkspaceScaleUpdate);
};

const resetEditForm = (student = selectedStudent.value, options = {}) => {
  if (!student) return;
  Object.assign(editForm, {
    nombres: toNameDisplayCase(student.nombres || ""),
    apellidoPaterno: toNameDisplayCase(student.apellidoPaterno || ""),
    apellidoMaterno: toNameDisplayCase(student.apellidoMaterno || ""),
    curp: student.curp || "",
    nombreVerificado: toNameDisplayCase(student.nombreVerificado || ""),
    nombreCompletoAlumno: toNameDisplayCase(student.nombreCompletoAlumno || student.fullName || ""),
    lastGrade: student.lastGrade || "",
    lastCiclo: student.lastCiclo || "",
    lugarNacimiento: student.lugarNacimiento || "",
    sexo: student.sexo || "",
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
    nombrePadre: toNameDisplayCase(student.nombrePadre || ""),
    apellidoPaternoPadre: toNameDisplayCase(student.apellidoPaternoPadre || ""),
    apellidoMaternoPadre: toNameDisplayCase(student.apellidoMaternoPadre || ""),
    lugarTrabajoPadre: student.lugarTrabajoPadre || "",
    puestoPadre: student.puestoPadre || "",
    estadoCivilPadre: student.estadoCivilPadre || "",
    fechaNacimientoPadre: normalizeDateInput(student.fechaNacimientoPadre),
    inePadre: student.inePadre || "",
    curpPadre: student.curpPadre || "",
    nombreMadre: toNameDisplayCase(student.nombreMadre || ""),
    apellidoPaternoMadre: toNameDisplayCase(student.apellidoPaternoMadre || ""),
    apellidoMaternoMadre: toNameDisplayCase(student.apellidoMaternoMadre || ""),
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
  if (uploadingAdvancedField.value) {
    saveError.value = "Espera a que termine la carga del archivo.";
    return;
  }
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

useModalEscape(closeMassImportModal, { enabled: showMassImportModal });

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

const openAcademicPositionModal = () => {
  if (!selectedStudent.value || savingAcademicPosition.value) return;
  showAcademicPositionModal.value = true;
};

const saveAcademicPosition = async (payload) => {
  if (!selectedStudent.value?.matricula || savingAcademicPosition.value) return;
  savingAcademicPosition.value = true;
  try {
    const ciclo = typeof payload === "object" && payload !== null ? payload.ciclo : payload;
    const response = await $fetch(
      `/api/students/${encodeURIComponent(selectedStudent.value.matricula)}/ingreso-cycle`,
      {
        method: "PUT",
        body: {
          ciclo,
          targetCiclo: payload?.targetCiclo || currentCicloKey.value,
          targetNivel: payload?.targetNivel,
          targetGrado: payload?.targetGrado,
        },
      },
    );
    showAcademicPositionModal.value = false;
    const updated = response?.student;
    const current = selectedStudent.value;
    if (updated && current && normalizeMatriculaKey(updated.matricula) === normalizeMatriculaKey(current.matricula)) {
      const mergedStudent = {
        ...current,
        ...updated,
        group: current.group || current.grupo || updated.group || updated.grupo || "",
        grupo: current.grupo || current.group || updated.grupo || updated.group || "",
      };
      replaceControlStudentInIndex(mergedStudent);
      selectedStudent.value = mergedStudent;
      pendingSelectedStudentRefresh.value = null;
      resetEditForm(mergedStudent, { restoreDraft: false });
      persistCurrentControlStudentsCache();
    }
    show("Grado y ciclo actualizados.", "success");
    await loadStudents({ useCache: false, clearExisting: false, forceLoading: false });
    await loadKpis();
  } catch (error) {
    show(error?.data?.message || error?.message || "No se pudo actualizar el ciclo y la posición.", "danger");
  } finally {
    savingAcademicPosition.value = false;
  }
};

const uploadAdvancedFile = async (field, event) => {
  const file = event?.target?.files?.[0];
  if (event?.target) event.target.value = "";
  if (!file || !field?.key || uploadingAdvancedField.value) return;
  uploadingAdvancedField.value = field.key;
  advancedUploadErrors[field.key] = "";
  try {
    const form = new FormData();
    form.append("file", file);
    form.append("folder", `control-escolar/${selectedStudent.value?.matricula || "sin-matricula"}/${field.key}`);
    form.append("includeUrl", "true");
    const response = await $fetch("https://expediente.casitaapps.com", {
      method: "POST",
      body: form,
    });
    if (!response?.success) throw new Error("El servicio de carga no confirmó la operación.");
    editForm[field.key] = response.url || response.path || response.fileName || JSON.stringify(response);
    show("Archivo cargado. Guarda la ficha para conservar el cambio.", "success");
  } catch (error) {
    advancedUploadErrors[field.key] = error?.data?.message || error?.message || "No se pudo cargar el archivo.";
    show(advancedUploadErrors[field.key], "danger");
  } finally {
    uploadingAdvancedField.value = "";
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

const cacheEnrollmentConcepts = ({ current = [], tipoIngreso = [] } = {}) => {
  const currentConceptIds = normalizeEnrollmentConceptIds(current);
  const tipoIngresoConceptIds = normalizeEnrollmentConceptIds(tipoIngreso);
  if (!process.client || (!currentConceptIds.length && !tipoIngresoConceptIds.length))
    return;
  try {
    localStorage.setItem(
      enrollmentConceptsCacheKey.value,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        currentConcepts: currentConceptIds,
        tipoIngresoConcepts: tipoIngresoConceptIds,
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
      localStorage.getItem(enrollmentConceptsCacheKey.value) || "null",
    );
    const currentConceptIds = normalizeEnrollmentConceptIds(parsed?.currentConcepts || parsed?.concepts);
    const tipoIngresoConceptIds = normalizeEnrollmentConceptIds(parsed?.tipoIngresoConcepts || currentConceptIds);
    if (currentConceptIds.length) externalConcepts.value = currentConceptIds;
    if (tipoIngresoConceptIds.length) tipoIngresoConcepts.value = tipoIngresoConceptIds;
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo leer la configuración de inscripción.",
      error,
    );
  }
};

const parseEnrollmentConfig = (obj) => {
  const currentConceptIds = parseEnrollmentConceptsForScope(obj, {
    ciclo: currentCicloKey.value,
    plantel: currentEnrollmentPlantelKey.value,
  });
  const tipoIngresoConceptIds = parseEnrollmentConceptsForPlantelHistory(obj, {
    plantel: currentEnrollmentPlantelKey.value,
  });
  if (!currentConceptIds.length) return;
  externalConcepts.value = currentConceptIds;
  tipoIngresoConcepts.value = tipoIngresoConceptIds.length ? tipoIngresoConceptIds : currentConceptIds;
  cacheEnrollmentConcepts({ current: externalConcepts.value, tipoIngreso: tipoIngresoConcepts.value });
};

const loadEnrollmentConfig = async ({ refreshStudents = false } = {}) => {
  const previousConcepts = externalConcepts.value.join("|");
  const previousTipoConcepts = tipoIngresoConcepts.value.join("|");

  try {
    const configData = await $fetch("/api/control-escolar/enrollment-config");
    parseEnrollmentConfig(configData);
  } catch (serverError) {
    console.warn(
      "[Control Escolar] Usando configuración de inscripción local o por defecto.",
      serverError,
    );
  }

  if (
    refreshStudents &&
    (externalConcepts.value.join("|") !== previousConcepts ||
      tipoIngresoConcepts.value.join("|") !== previousTipoConcepts)
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
  scrollbar-width: none;
  scrollbar-gutter: stable;
}

.ce-filter-bar::-webkit-scrollbar {
  display: none;
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
  .ce-empty-flow ol {
    gap: 18px;
  }
  .ce-empty-flow li:not(:last-child)::after {
    right: -18px;
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

/* Control Escolar selected record layout */
.control-escolar-screen {
  --ce-green: #2f9138;
  --ce-green-strong: #20842f;
  --ce-ink: #13213a;
  --ce-muted: #66758c;
  --ce-line: #dfe8f1;
  --ce-soft: #f7fafc;
  --ce-warning: #c37412;
  --ce-danger: #d63f35;
  --ce-blue: #4f8ed8;
  --ce-scrollbar-size: 8px;
  --ce-scrollbar-thumb: rgba(85, 101, 116, 0.28);
  --ce-scrollbar-thumb-hover: rgba(68, 84, 99, 0.42);
}

.control-escolar-screen .students-scale-shell,
.control-escolar-screen .ce-list-scroll,
.control-escolar-screen .ce-detail-panel,
.control-escolar-screen .ce-detail-body,
.control-escolar-screen .ce-detail-tabs {
  scrollbar-color: var(--ce-scrollbar-thumb) transparent;
  scrollbar-width: thin;
}

.control-escolar-screen .students-scale-shell::-webkit-scrollbar,
.control-escolar-screen .ce-list-scroll::-webkit-scrollbar,
.control-escolar-screen .ce-detail-panel::-webkit-scrollbar,
.control-escolar-screen .ce-detail-body::-webkit-scrollbar,
.control-escolar-screen .ce-detail-tabs::-webkit-scrollbar {
  width: var(--ce-scrollbar-size);
  height: var(--ce-scrollbar-size);
}

.control-escolar-screen .students-scale-shell::-webkit-scrollbar-track,
.control-escolar-screen .ce-list-scroll::-webkit-scrollbar-track,
.control-escolar-screen .ce-detail-panel::-webkit-scrollbar-track,
.control-escolar-screen .ce-detail-body::-webkit-scrollbar-track,
.control-escolar-screen .ce-detail-tabs::-webkit-scrollbar-track {
  background: transparent;
}

.control-escolar-screen .students-scale-shell::-webkit-scrollbar-thumb,
.control-escolar-screen .ce-list-scroll::-webkit-scrollbar-thumb,
.control-escolar-screen .ce-detail-panel::-webkit-scrollbar-thumb,
.control-escolar-screen .ce-detail-body::-webkit-scrollbar-thumb,
.control-escolar-screen .ce-detail-tabs::-webkit-scrollbar-thumb {
  min-height: 42px;
  border: 2px solid transparent;
  border-radius: 999px;
  background: var(--ce-scrollbar-thumb);
  background-clip: padding-box;
}

.control-escolar-screen .students-scale-shell::-webkit-scrollbar-thumb:hover,
.control-escolar-screen .ce-list-scroll::-webkit-scrollbar-thumb:hover,
.control-escolar-screen .ce-detail-panel::-webkit-scrollbar-thumb:hover,
.control-escolar-screen .ce-detail-body::-webkit-scrollbar-thumb:hover,
.control-escolar-screen .ce-detail-tabs::-webkit-scrollbar-thumb:hover {
  background: var(--ce-scrollbar-thumb-hover);
  background-clip: padding-box;
}

.control-escolar-screen .ce-quality-fields--stacked,
.control-escolar-screen .ce-health-missing-chips {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.control-escolar-screen .ce-quality-fields--stacked::-webkit-scrollbar,
.control-escolar-screen .ce-health-missing-chips::-webkit-scrollbar {
  display: none;
}

.control-escolar-screen .students-scale-shell {
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
}

.control-escolar-screen .students-design-canvas {
  min-width: 1280px;
}

.control-escolar-screen .ce-workspace.has-detail,
.control-escolar-screen .ce-workspace.has-empty-detail {
  display: grid;
  grid-template-columns: minmax(510px, 0.86fr) minmax(760px, 1.14fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 10px;
  min-width: 1280px;
  height: 100%;
}

.control-escolar-screen .ce-list-card,
.control-escolar-screen .ce-detail-panel {
  height: 100%;
  min-height: 0;
  border-color: var(--ce-line);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(21, 35, 60, 0.045);
}

.control-escolar-screen .ce-list-card {
  --student-list-balance-col: 238px;
  --student-list-action-col: 38px;
  --student-list-row-height: 72px;
  --student-list-grade-size: 52px;
  --student-list-grade-height: 54px;
  --student-list-crest-size: 32px;
  grid-template-rows: 44px 36px minmax(0, 1fr) 38px;
}

.control-escolar-screen .ce-list-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding: 0 14px 0 16px;
  border-bottom: 1px solid rgba(224, 232, 241, 0.96);
  background: #fff;
}

.control-escolar-screen .ce-list-titlebar h2 {
  margin: 0;
  color: var(--ce-ink);
  font-size: 14px;
  font-weight: 920;
  letter-spacing: 0;
}

.control-escolar-screen .ce-list-titlebar h2 span {
  color: var(--ce-green-strong);
}

.control-escolar-screen .ce-list-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.control-escolar-screen .ce-excel-export-button {
  display: inline-flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid rgba(39, 106, 52, 0.18);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(245, 250, 246, 0.96)),
    radial-gradient(circle at 20% 0%, rgba(117, 184, 93, 0.18), transparent 52%);
  box-shadow: 0 8px 18px rgba(21, 35, 60, 0.055);
  color: #1f5c2f;
  font-size: 10.5px;
  font-weight: 900;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease, color 0.18s ease;
}

.control-escolar-screen .ce-excel-export-button:hover:not(:disabled) {
  border-color: rgba(39, 106, 52, 0.32);
  box-shadow: 0 10px 22px rgba(21, 35, 60, 0.08);
  color: #173d24;
  transform: translateY(-1px);
}

.control-escolar-screen .ce-excel-export-button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.control-escolar-screen .ce-pagination-mini {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #63728a;
  font-size: 10.5px;
  font-weight: 850;
}

.control-escolar-screen .ce-pagination-mini button {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(218, 228, 238, 0.98);
  border-radius: 9px;
  background: #fff;
  color: #5f6e85;
}

.control-escolar-screen .ce-pagination-mini button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.control-escolar-screen .ce-list-scroll {
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px 8px 0;
  scrollbar-gutter: stable;
}

.control-escolar-screen .ce-list-columns {
  display: grid;
  grid-template-columns: minmax(268px, 1fr) minmax(208px, 228px) 38px;
  align-items: center;
  gap: 8px;
  min-width: 588px;
  padding: 0 45px 0 18px;
  border-bottom: 1px solid rgba(224, 232, 241, 0.96);
  background: #fff;
  color: #647188;
  font-size: 9px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.control-escolar-screen .ce-student-row {
  display: grid;
  grid-template-columns: minmax(268px, 1fr) minmax(208px, 228px) 38px;
  grid-template-areas: none;
  align-items: center;
  gap: 8px;
  width: calc(100% - 5px);
  min-width: 588px;
  min-height: var(--student-list-row-height);
  margin: 0 5px 7px 0;
  padding: 6px 6px 6px 10px;
  border: 1px solid rgba(219, 230, 240, 0.98);
  border-radius: 14px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--grade-soft, #f2f8ef) 24%, #fff), #fff 58%),
    #fff;
  box-shadow: 0 6px 15px rgba(21, 35, 60, 0.04);
}

.control-escolar-screen .ce-student-row.selected,
.control-escolar-screen .ce-student-row.multi-selected {
  border-color: color-mix(in srgb, var(--grade-accent, var(--ce-green)) 54%, #d7e8d2);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--grade-accent, var(--ce-green)) 10%, #fff), #fff 68%),
    #fff;
  box-shadow: 0 10px 24px rgba(63, 145, 56, 0.12);
}

.control-escolar-screen .ce-student-identity {
  grid-area: auto;
  grid-template-columns: 24px var(--student-list-grade-size) var(--student-list-crest-size) minmax(0, 1fr);
  gap: 9px;
  min-width: 0;
}

.control-escolar-screen .student-row-grade-card {
  --student-grade-photo-width: var(--student-list-grade-size);
  --student-grade-photo-height: var(--student-list-grade-height);
  --student-grade-photo-radius: 12px;
}

.control-escolar-screen .student-group-sigil {
  display: inline-flex;
}

.control-escolar-screen .ce-row-check {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  font-size: 12px;
}

.control-escolar-screen .ce-student-row .student-copy {
  min-width: 0;
  gap: 4px;
}

.control-escolar-screen .ce-student-row .student-copy strong {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: var(--ce-ink);
  font-size: 13.5px;
  font-weight: 900;
  line-height: 1.12;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .student-tipo-chip {
  min-height: 20px;
  padding-inline: 7px;
  font-size: 9.5px;
  font-weight: 840;
}

.control-escolar-screen .ce-state-card {
  display: flex;
  min-height: 180px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--ce-muted);
  font-size: 12px;
  font-weight: 760;
  text-align: center;
}

.control-escolar-screen .ce-state-card.error {
  color: var(--ce-danger);
}

.control-escolar-screen .ce-inline-action {
  border: 0;
  background: transparent;
  color: var(--ce-green-strong);
  font-weight: 900;
  cursor: pointer;
}

.control-escolar-screen .ce-skeleton-stack {
  display: grid;
  gap: 8px;
  padding-right: 12px;
}

.control-escolar-screen .ce-skeleton-row {
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

.control-escolar-screen .ce-row-health {
  --ce-health-accent: var(--ce-green);
  --ce-health-soft: #f6fbf5;
  --ce-health-border: rgba(63, 145, 56, 0.2);
  display: grid;
  grid-area: auto;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  min-width: 0;
  min-height: 58px;
  padding: 7px 9px;
  border: 1px solid var(--ce-health-border);
  border-radius: 13px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(255, 255, 255, 0.99)),
    var(--ce-health-soft);
  color: var(--ce-health-accent);
  text-align: left;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.94);
}

.control-escolar-screen .ce-row-health.warning {
  --ce-health-accent: var(--ce-warning);
  --ce-health-soft: #fff8eb;
  --ce-health-border: rgba(216, 139, 28, 0.3);
}

.control-escolar-screen .ce-row-health.danger {
  --ce-health-accent: var(--ce-danger);
  --ce-health-soft: #fff2f0;
  --ce-health-border: rgba(217, 67, 56, 0.32);
}

.control-escolar-screen .ce-row-health .ce-quality-score {
  position: relative;
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(var(--ce-health-accent) var(--quality-score), #e8edf2 0deg);
}

.control-escolar-screen .ce-row-health .ce-quality-score::after {
  position: absolute;
  inset: 5px;
  border-radius: inherit;
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(220, 229, 238, 0.9);
  content: "";
}

.control-escolar-screen .ce-row-health .ce-quality-score b {
  position: relative;
  z-index: 1;
  color: var(--ce-ink);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0;
}

.control-escolar-screen .ce-quality-cell--expanded {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 0;
}

.control-escolar-screen .ce-quality-cell--expanded strong {
  overflow: hidden;
  color: var(--ce-ink);
  font-size: 10.8px;
  font-weight: 920;
  line-height: 1.12;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-row-health-summary {
  overflow: hidden;
  color: var(--ce-health-accent);
  font-size: 9.8px;
  font-weight: 840;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-quality-fields--stacked {
  display: flex;
  flex-wrap: nowrap;
  min-width: 0;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 1px;
}

.control-escolar-screen .ce-quality-fields--stacked small {
  display: inline-flex;
  flex: 0 0 auto;
  min-width: 0;
  align-items: center;
  gap: 3px;
  overflow: visible;
  padding: 3px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ce-health-accent) 10%, #fff);
  color: var(--ce-health-accent);
  font-size: 8.8px;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.control-escolar-screen .row-actions {
  grid-area: auto;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.control-escolar-screen .ce-row-action {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(218, 228, 238, 0.98);
  border-radius: 11px;
  background: #fff;
  color: #66758c;
  box-shadow: 0 8px 16px rgba(21, 35, 60, 0.055);
}

.control-escolar-screen .ce-list-footer {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-top: 1px solid rgba(224, 232, 241, 0.96);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), #fff 48%);
  color: #66758c;
  font-size: 10.5px;
  font-weight: 720;
}

.control-escolar-screen .ce-list-pages {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.control-escolar-screen .ce-list-pages button {
  display: inline-flex;
  min-width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(218, 228, 238, 0.98);
  border-radius: 8px;
  background: #fff;
  color: #60708a;
  font-size: 9.5px;
  font-weight: 880;
}

.control-escolar-screen .ce-list-pages button.active {
  border-color: var(--ce-green);
  background: linear-gradient(180deg, #58b951, #2f9239);
  color: #fff;
  box-shadow: 0 8px 14px rgba(63, 145, 56, 0.2);
}

.control-escolar-screen .ce-list-pages button.ellipsis {
  min-width: 18px;
  border-color: transparent;
  background: transparent;
}

.control-escolar-screen .ce-list-pages button:disabled:not(.ellipsis) {
  opacity: 0.5;
  cursor: not-allowed;
}

.control-escolar-screen .ce-detail-panel {
  overflow-x: auto;
}

.control-escolar-screen .ce-detail-shell {
  --ce-detail-accent: var(--ce-green);
  --ce-detail-soft: #f4fbf3;
  --ce-detail-border: rgba(63, 145, 56, 0.2);
  display: flex;
  width: 100%;
  min-width: 760px;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(219, 230, 240, 0.98);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(21, 35, 60, 0.045);
}

.control-escolar-screen .ce-detail-shell.is-warning {
  --ce-detail-accent: var(--ce-warning);
  --ce-detail-soft: #fff8eb;
  --ce-detail-border: rgba(216, 139, 28, 0.3);
}

.control-escolar-screen .ce-detail-shell.is-danger {
  --ce-detail-accent: var(--ce-danger);
  --ce-detail-soft: #fff2f0;
  --ce-detail-border: rgba(217, 67, 56, 0.32);
}

.control-escolar-screen .ce-detail-header {
  display: grid;
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  grid-template-columns: minmax(280px, 1.18fr) minmax(180px, 0.68fr) minmax(170px, 0.62fr) 38px;
  align-items: center;
  gap: 14px;
  min-height: 106px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(221, 231, 240, 0.95);
  background:
    radial-gradient(circle at 0 0, color-mix(in srgb, var(--ce-detail-accent) 9%, transparent), transparent 30%),
    linear-gradient(180deg, #ffffff, #fbfdfc);
}

.control-escolar-screen .ce-detail-title--with-photo {
  display: grid;
  grid-column: 1;
  grid-row: 1;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.control-escolar-screen .ce-detail-header-photo {
  --student-grade-photo-width: 58px;
  --student-grade-photo-height: 58px;
  --student-grade-photo-radius: 13px;
}

.control-escolar-screen .ce-detail-title-copy,
.control-escolar-screen .ce-detail-title-copy > div {
  min-width: 0;
}

.control-escolar-screen .ce-detail-title-copy small {
  display: block;
  margin-bottom: 6px;
  overflow: hidden;
  color: #65738c;
  font-size: 10px;
  font-weight: 880;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.control-escolar-screen .ce-title-row h2 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--ce-ink);
  font-size: 17px;
  font-weight: 950;
  letter-spacing: 0;
  line-height: 1.08;
  text-overflow: ellipsis;
}

.control-escolar-screen .ce-status-pill {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  justify-content: center;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 900;
  white-space: nowrap;
}

.control-escolar-screen .ce-status-pill.success {
  background: #edf8ea;
  color: var(--ce-green-strong);
}

.control-escolar-screen .ce-status-pill.danger {
  background: #fff0ef;
  color: var(--ce-danger);
}

.control-escolar-screen .ce-status-pill.neutral {
  background: #f2f5f8;
  color: #657083;
}

.control-escolar-screen .ce-status-pill.large {
  min-height: 32px;
  padding-inline: 13px;
  flex: 0 0 auto;
  font-size: 10.5px;
}

.control-escolar-screen .ce-access-header-card {
  display: grid;
  grid-column: 2;
  grid-row: 1;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 56px;
  padding: 8px 10px;
  border: 1px solid rgba(215, 226, 237, 0.9);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: none;
}

.control-escolar-screen .ce-access-header-card > span,
.control-escolar-screen .ce-access-icon {
  display: inline-flex;
  width: 54px;
  height: 38px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid #e1e9f1;
  border-radius: 13px;
  background: linear-gradient(180deg, #f8fafc, #ffffff);
}

.control-escolar-screen .ce-access-icon img {
  display: block;
  width: 44px;
  max-height: 28px;
  object-fit: contain;
  opacity: 0.88;
}

.control-escolar-screen .ce-access-header-card strong {
  color: #173052;
  font-size: 11.5px;
  font-weight: 920;
  letter-spacing: 0;
}

.control-escolar-screen .ce-access-header-card small {
  display: block;
  overflow: hidden;
  color: #67758c;
  font-size: 10px;
  font-weight: 720;
  line-height: 1.22;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-progress-cluster--health {
  display: grid;
  grid-column: 3;
  grid-row: 1;
  gap: 7px;
  min-width: 0;
  min-height: 56px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--ce-detail-accent) 20%, #dfe8f1);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.78);
}

.control-escolar-screen .ce-progress-label-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 9px;
}

.control-escolar-screen .ce-progress-label-row span {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.control-escolar-screen .ce-progress-cluster--health strong {
  overflow: hidden;
  color: var(--ce-ink);
  font-size: 11px;
  font-weight: 920;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-progress-cluster--health small {
  overflow: hidden;
  color: #687790;
  font-size: 9.8px;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-progress-cluster--health b {
  color: var(--ce-detail-accent);
  font-size: 17px;
  font-weight: 950;
  letter-spacing: 0;
  line-height: 1;
}

.control-escolar-screen .ce-progress-track {
  height: 7px;
  background: #e8eef3;
}

.control-escolar-screen .ce-progress-track i {
  background: linear-gradient(90deg, var(--ce-detail-accent), color-mix(in srgb, var(--ce-detail-accent) 58%, #a6d384));
}

.control-escolar-screen .ce-detail-actions {
  display: none;
}

.control-escolar-screen .ce-detail-menu-button {
  display: inline-flex;
  grid-column: 4;
  grid-row: 1;
  width: 38px;
  height: 38px;
  align-self: start;
  justify-self: end;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(217, 226, 236, 0.96);
  border-radius: 11px;
  background: #fff;
  color: #5c6a80;
}

@media (max-width: 1180px) {
  .control-escolar-screen .ce-detail-header {
    grid-template-columns: minmax(0, 1fr) 38px;
    grid-template-rows: auto auto auto;
  }

  .control-escolar-screen .ce-access-header-card,
  .control-escolar-screen .ce-progress-cluster--health {
    grid-column: 1 / -1;
  }

  .control-escolar-screen .ce-access-header-card {
    grid-row: 2;
  }

  .control-escolar-screen .ce-progress-cluster--health {
    grid-row: 3;
  }

  .control-escolar-screen .ce-detail-menu-button {
    grid-column: 2;
    grid-row: 1;
  }
}

.control-escolar-screen .ce-detail-body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  position: relative;
  z-index: 1;
  gap: 10px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px 14px 16px;
  background: linear-gradient(180deg, #fff 0%, #fff 72%, #fbfcfd 100%);
  scrollbar-gutter: stable;
}

.control-escolar-screen .ce-health-overview {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 0.95fr) minmax(0, 1.15fr);
  align-items: stretch;
  gap: 7px;
  min-width: 0;
  padding: 7px;
  border: 1px solid rgba(224, 232, 241, 0.92);
  border-radius: 17px;
  background: linear-gradient(180deg, #f8fbfd, #ffffff);
}

.control-escolar-screen .ce-health-card {
  position: relative;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  min-width: 0;
  min-height: 68px;
  overflow: hidden;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: none;
  cursor: pointer;
  text-align: left;
}

.control-escolar-screen button.ce-health-card {
  appearance: none;
  border-width: 1px;
}

.control-escolar-screen .ce-health-card.is-active {
  border-color: rgba(79, 163, 70, 0.18);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: inset 0 0 0 1px rgba(79, 163, 70, 0.08), 0 8px 18px rgba(21, 35, 60, 0.035);
}

.control-escolar-screen .ce-health-card--complete {
  grid-template-columns: 40px minmax(0, 1fr) auto;
  border-color: transparent;
  background: rgba(248, 251, 255, 0.8);
}

.control-escolar-screen .ce-health-card--complete.is-active {
  border-color: rgba(89, 140, 232, 0.2);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: inset 0 0 0 1px rgba(89, 140, 232, 0.1), 0 8px 18px rgba(21, 35, 60, 0.035);
}

.control-escolar-screen .ce-health-card--basic.complete,
.control-escolar-screen .ce-health-card--action.is-clear {
  border-color: rgba(63, 145, 56, 0.18);
  background: rgba(251, 254, 251, 0.82);
}

.control-escolar-screen .ce-health-card--basic.warning,
.control-escolar-screen .ce-health-card--action.warning {
  border-color: rgba(216, 139, 28, 0.22);
  background: rgba(255, 253, 250, 0.84);
}

.control-escolar-screen .ce-health-card--basic.danger,
.control-escolar-screen .ce-health-card--action.danger {
  border-color: rgba(217, 67, 56, 0.24);
  background: rgba(255, 250, 250, 0.86);
}

.control-escolar-screen .ce-health-card--action {
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  border-color: rgba(224, 83, 74, 0.2);
  background: rgba(255, 250, 250, 0.86);
}

.control-escolar-screen .ce-health-ring {
  position: relative;
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(var(--ce-detail-accent) var(--ring-deg), #e8eef3 0deg);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.82), 0 7px 16px rgba(21, 35, 60, 0.07);
}

.control-escolar-screen .ce-health-ring::after {
  position: absolute;
  inset: 5px;
  border-radius: inherit;
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(220, 229, 238, 0.92);
  content: "";
}

.control-escolar-screen .ce-health-ring.is-secondary {
  background: conic-gradient(var(--ce-blue) var(--ring-deg), #e5edf8 0deg);
}

.control-escolar-screen .ce-health-ring b {
  position: relative;
  z-index: 1;
  color: var(--ce-ink);
  font-size: 10.5px;
  font-weight: 950;
  letter-spacing: 0;
}

.control-escolar-screen .ce-health-card__icon,
.control-escolar-screen .ce-status-signal-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ce-detail-soft);
  color: var(--ce-detail-accent);
}

.control-escolar-screen .ce-health-card__icon {
  width: 30px;
  height: 30px;
  border-radius: 10px;
}

.control-escolar-screen .ce-status-signal-icon {
  width: 28px;
  height: 28px;
  border-radius: 9px;
}

.control-escolar-screen .ce-health-card__copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.control-escolar-screen .ce-health-card__copy small,
.control-escolar-screen .ce-status-signal-card small {
  overflow: hidden;
  color: #708098;
  font-size: 9.5px;
  font-weight: 900;
  letter-spacing: 0;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}

.control-escolar-screen .ce-health-card__copy strong,
.control-escolar-screen .ce-status-signal-card strong {
  overflow: hidden;
  color: var(--ce-ink);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0;
  line-height: 1.14;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-health-card__copy p,
.control-escolar-screen .ce-status-signal-card p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: #647188;
  font-size: 10px;
  font-weight: 720;
  line-height: 1.18;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.control-escolar-screen .ce-health-bar {
  display: block;
  height: 4px;
  margin-top: 1px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8eef3;
}

.control-escolar-screen .ce-health-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--ce-detail-accent), color-mix(in srgb, var(--ce-detail-accent) 58%, #a6d384));
}

.control-escolar-screen .ce-health-bar.is-secondary i {
  background: linear-gradient(90deg, var(--ce-blue), #7fbdf2);
}

.control-escolar-screen .ce-health-card__copy em {
  color: #56657a;
  font-size: 9.8px;
  font-style: normal;
  font-weight: 800;
}

.control-escolar-screen .ce-health-link,
.control-escolar-screen .ce-health-action-button,
.control-escolar-screen .ce-health-missing-chips button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid rgba(212, 223, 234, 0.98);
  background: #fff;
  color: var(--ce-green-strong);
  font-weight: 900;
  cursor: pointer;
}

.control-escolar-screen .ce-health-link {
  grid-column: 3;
  grid-row: 1;
  align-self: center;
  justify-self: end;
  min-height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #2f62b8;
  font-size: 10px;
  white-space: nowrap;
}

.control-escolar-screen .ce-health-action-button {
  min-height: 28px;
  padding: 0 8px;
  border-color: var(--ce-detail-border);
  border-radius: 9px;
  color: var(--ce-detail-accent);
  font-size: 10px;
  white-space: nowrap;
}

.control-escolar-screen .ce-health-missing-chips {
  display: flex;
  flex-wrap: nowrap;
  gap: 5px;
  min-width: 0;
  max-width: 100%;
  margin-top: 1px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 1px;
}

.control-escolar-screen .ce-health-missing-chips button,
.control-escolar-screen .ce-health-missing-chips span {
  display: inline-flex;
  min-height: 20px;
  align-items: center;
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 9px;
  line-height: 1;
  white-space: nowrap;
}

.control-escolar-screen .ce-health-missing-chips button {
  border-color: var(--ce-detail-border);
  background: var(--ce-detail-soft);
  color: var(--ce-detail-accent);
}

.control-escolar-screen .ce-health-missing-chips span {
  background: #eef2f6;
  color: #5f6f84;
  font-weight: 900;
}

.control-escolar-screen .ce-status-signal-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  min-width: 0;
  padding: 6px;
  border: 1px solid rgba(224, 232, 241, 0.88);
  border-radius: 16px;
  background: linear-gradient(180deg, #fafcff, #ffffff);
}

.control-escolar-screen .ce-status-signal-card {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: 46px;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: 11px;
  appearance: none;
  background: rgba(255, 255, 255, 0.58);
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color .18s ease, background-color .18s ease, box-shadow .18s ease, transform .18s ease;
}

.control-escolar-screen .ce-status-signal-card:hover,
.control-escolar-screen .ce-status-signal-card:focus-visible {
  border-color: color-mix(in srgb, var(--ce-detail-accent) 28%, #dbe6f0);
  box-shadow: 0 8px 16px rgba(21, 35, 60, 0.045);
  outline: 0;
  transform: translateY(-1px);
}

.control-escolar-screen .ce-status-signal-card > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.control-escolar-screen .ce-status-signal-card b {
  color: #5c6a80;
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
}

.control-escolar-screen .ce-status-signal-card.is-complete {
  border-color: rgba(63, 145, 56, 0.12);
  background: rgba(251, 254, 251, 0.66);
}

.control-escolar-screen .ce-status-signal-card.is-warning {
  border-color: rgba(216, 139, 28, 0.14);
  background: rgba(255, 253, 250, 0.68);
}

.control-escolar-screen .ce-status-signal-card.is-danger {
  border-color: rgba(217, 67, 56, 0.16);
  background: rgba(255, 250, 250, 0.7);
}

.control-escolar-screen .ce-status-signal-card.is-complete .ce-status-signal-icon,
.control-escolar-screen .ce-family-readiness-card.is-complete > span {
  background: #edf8ea;
  color: var(--ce-green-strong);
}

.control-escolar-screen .ce-status-signal-card.is-warning .ce-status-signal-icon,
.control-escolar-screen .ce-family-readiness-card.is-warning > span {
  background: #fff6e7;
  color: var(--ce-warning);
}

.control-escolar-screen .ce-status-signal-card.is-danger .ce-status-signal-icon,
.control-escolar-screen .ce-family-readiness-card.is-danger > span {
  background: #fff0ef;
  color: var(--ce-danger);
}

.control-escolar-screen .ce-detail-tabs {
  display: flex;
  min-width: 760px;
  min-height: 42px;
  gap: 3px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 2px;
  border: 1px solid rgba(224, 232, 241, 0.96);
  border-radius: 13px;
  background: #f7fafc;
}

.control-escolar-screen .ce-detail-tabs button {
  position: relative;
  display: inline-flex;
  min-width: max-content;
  height: 40px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 10px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: #647188;
  font-size: 10.5px;
  font-weight: 860;
  letter-spacing: 0;
}

.control-escolar-screen .ce-tab-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.control-escolar-screen .ce-detail-tabs button.active {
  background: #fff;
  color: var(--ce-green-strong);
  box-shadow: 0 6px 15px rgba(21, 35, 60, 0.07);
}

.control-escolar-screen .ce-tab-badge {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border-radius: 999px;
  background: #eef2f6;
  color: #5f6f84;
  font-size: 9.5px;
  font-weight: 950;
}

.control-escolar-screen .ce-detail-tabs button.is-warning .ce-tab-badge {
  background: #fff1d8;
  color: var(--ce-warning);
}

.control-escolar-screen .ce-detail-tabs button.is-danger .ce-tab-badge {
  background: #ffe4e1;
  color: var(--ce-danger);
}

.control-escolar-screen .ce-edit-form {
  display: grid;
  min-width: 760px;
  gap: 11px;
}

.control-escolar-screen .ce-form-card.ce-tab-panel,
.control-escolar-screen .ce-family-card,
.control-escolar-screen .ce-complete-nested {
  border: 1px solid rgba(221, 231, 240, 0.98);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(21, 35, 60, 0.035);
}

.control-escolar-screen .ce-form-card.ce-tab-panel {
  padding: 14px;
}

.control-escolar-screen .ce-panel-heading,
.control-escolar-screen .ce-section-heading.compact {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.control-escolar-screen .ce-section-heading.compact > div {
  min-width: 0;
}

.control-escolar-screen .ce-panel-heading h3,
.control-escolar-screen .ce-section-heading h3,
.control-escolar-screen .ce-family-card-head h3 {
  margin: 0;
  color: var(--ce-ink);
  font-size: 12.5px;
  font-weight: 950;
  letter-spacing: 0;
}

.control-escolar-screen .ce-panel-heading p,
.control-escolar-screen .ce-section-heading p {
  margin: 3px 0 0;
  color: var(--ce-muted);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1.28;
}

.control-escolar-screen .ce-panel-status,
.control-escolar-screen .ce-family-card-status span {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 0 9px;
  border-radius: 999px;
  background: #eef2f6;
  color: #5f6f84;
  font-size: 9.5px;
  font-weight: 950;
  white-space: nowrap;
}

.control-escolar-screen .ce-panel-status.complete,
.control-escolar-screen .ce-family-card.is-complete .ce-family-card-status span {
  background: #edf8ea;
  color: var(--ce-green-strong);
}

.control-escolar-screen .ce-panel-status.warning,
.control-escolar-screen .ce-family-card.is-warning .ce-family-card-status span {
  background: #fff6e7;
  color: var(--ce-warning);
}

.control-escolar-screen .ce-panel-status.danger,
.control-escolar-screen .ce-family-card.is-danger .ce-family-card-status span {
  background: #fff0ef;
  color: var(--ce-danger);
}

.control-escolar-screen .ce-form-grid {
  gap: 10px;
}

.control-escolar-screen .ce-form-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.control-escolar-screen .ce-tab-panel .ce-form-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.control-escolar-screen .ce-form-grid label,
.control-escolar-screen .ce-wide-field {
  gap: 5px;
}

.control-escolar-screen .ce-form-grid span,
.control-escolar-screen .ce-wide-field span {
  color: #6b788e;
  font-size: 9.7px;
  font-weight: 890;
  letter-spacing: 0;
  text-transform: none;
}

.control-escolar-screen .ce-form-grid input,
.control-escolar-screen .ce-form-grid select,
.control-escolar-screen .ce-wide-field textarea {
  min-height: 42px;
  border: 1px solid #d7e2ed;
  border-radius: 11px;
  background: #fbfdff;
  color: var(--ce-ink);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.control-escolar-screen .ce-form-grid input:focus,
.control-escolar-screen .ce-form-grid select:focus,
.control-escolar-screen .ce-wide-field textarea:focus {
  border-color: color-mix(in srgb, var(--ce-detail-accent) 42%, #d7e2ed);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ce-detail-accent) 13%, transparent);
}

.control-escolar-screen .ce-smart-field {
  position: relative;
}

.control-escolar-screen .ce-smart-field small {
  min-height: 13px;
  color: #718095;
  font-size: 9.5px;
  font-weight: 760;
}

.control-escolar-screen .ce-smart-field.is-ok input,
.control-escolar-screen .ce-smart-field.is-ok select {
  border-color: rgba(63, 145, 56, 0.32);
  background: #fbfefb;
}

.control-escolar-screen .ce-smart-field.is-ok small {
  color: var(--ce-green-strong);
}

.control-escolar-screen .ce-smart-field.is-missing input,
.control-escolar-screen .ce-smart-field.is-missing select,
.control-escolar-screen .ce-smart-field.is-invalid input,
.control-escolar-screen .ce-smart-field.is-invalid select {
  border-color: rgba(217, 67, 56, 0.74);
  background: #fffafa;
  box-shadow: inset 3px 0 0 rgba(217, 67, 56, 0.72);
}

.control-escolar-screen .ce-smart-field.is-missing small,
.control-escolar-screen .ce-smart-field.is-invalid small {
  color: var(--ce-danger);
  font-weight: 880;
}

.control-escolar-screen .ce-derived-card {
  min-height: 56px;
  border: 1px solid rgba(221, 231, 240, 0.98);
  border-radius: 13px;
  background: linear-gradient(180deg, #fbfdff, #fff);
}

.control-escolar-screen .ce-derived-card span,
.control-escolar-screen .ce-derived-card strong {
  letter-spacing: 0;
}

.control-escolar-screen .ce-family-readiness {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  min-width: 760px;
  margin-bottom: 9px;
}

.control-escolar-screen .ce-family-readiness-card {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: start;
  gap: 9px;
  min-height: 64px;
  padding: 9px 10px;
  border: 1px solid rgba(221, 231, 240, 0.98);
  border-radius: 13px;
  background: #fff;
}

.control-escolar-screen .ce-family-readiness-card > span {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
}

.control-escolar-screen .ce-family-readiness-card > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.control-escolar-screen .ce-family-readiness-card small {
  overflow: hidden;
  color: #708098;
  font-size: 9.5px;
  font-weight: 900;
  letter-spacing: 0;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}

.control-escolar-screen .ce-family-readiness-card strong {
  overflow: hidden;
  color: var(--ce-ink);
  font-size: 12px;
  font-weight: 930;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-family-readiness-card p {
  overflow: hidden;
  margin: 0;
  color: #647188;
  font-size: 10px;
  font-weight: 720;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-family-readiness-meter,
.control-escolar-screen .ce-family-card-status i {
  display: block;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8eef3;
}

.control-escolar-screen .ce-family-readiness-meter em,
.control-escolar-screen .ce-family-card-status i b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: currentColor;
}

.control-escolar-screen .ce-family-readiness-card.is-complete {
  border-color: rgba(63, 145, 56, 0.2);
  background: #fbfefb;
  color: var(--ce-green-strong);
}

.control-escolar-screen .ce-family-readiness-card.is-warning {
  border-color: rgba(216, 139, 28, 0.3);
  background: #fffdfa;
  color: var(--ce-warning);
}

.control-escolar-screen .ce-family-readiness-card.is-danger {
  border-color: rgba(217, 67, 56, 0.32);
  background: #fffafa;
  color: var(--ce-danger);
}

.control-escolar-screen .ce-family-readiness-card b {
  align-self: start;
  color: currentColor;
  font-size: 10.5px;
  font-weight: 950;
  white-space: nowrap;
}

.control-escolar-screen .ce-family-metrics-strip {
  display: none;
  min-width: 760px;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 11px;
}

.control-escolar-screen .ce-family-metric-chip {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid rgba(63, 145, 56, 0.2);
  border-radius: 999px;
  background: #f9fdf9;
  color: var(--ce-green-strong);
  font-size: 10px;
  font-weight: 880;
}

.control-escolar-screen .ce-family-metric-chip.missing {
  border-color: rgba(217, 67, 56, 0.24);
  background: #fff7f7;
  color: var(--ce-danger);
}


.control-escolar-screen .ce-family-siblings-card {
  display: grid;
  min-width: 760px;
  gap: 10px;
  margin-bottom: 11px;
  padding: 13px;
  border: 1px solid rgba(221, 231, 240, 0.98);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(21, 35, 60, 0.035);
}

.control-escolar-screen .ce-family-siblings-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.control-escolar-screen .ce-family-siblings-card header > div {
  min-width: 0;
}

.control-escolar-screen .ce-family-siblings-card small,
.control-escolar-screen .ce-family-siblings-card dt {
  color: #708098;
  font-size: 9.5px;
  font-weight: 900;
}

.control-escolar-screen .ce-family-siblings-card h3 {
  margin: 2px 0 0;
  color: var(--ce-ink);
  font-size: 12.5px;
  font-weight: 950;
}

.control-escolar-screen .ce-family-siblings-card p {
  margin: 3px 0 0;
  color: #647188;
  font-size: 10px;
  font-weight: 720;
  line-height: 1.3;
}

.control-escolar-screen .ce-family-siblings-card header > span {
  display: inline-flex;
  min-width: 28px;
  min-height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #eef2f6;
  color: #5f6f84;
  font-size: 10px;
  font-weight: 950;
}

.control-escolar-screen .ce-family-siblings-match {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.control-escolar-screen .ce-family-siblings-match div {
  display: grid;
  gap: 3px;
  padding: 9px 10px;
  border: 1px solid #e6edf4;
  border-radius: 12px;
  background: #fbfdff;
}

.control-escolar-screen .ce-family-siblings-match dd {
  overflow: hidden;
  margin: 0;
  color: var(--ce-ink);
  font-size: 11px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-family-siblings-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.control-escolar-screen .ce-family-siblings-list button {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid #e1e9f2;
  border-radius: 12px;
  background: #fbfdff;
  color: var(--ce-ink);
  text-align: left;
}

.control-escolar-screen .ce-family-siblings-list button:hover {
  border-color: color-mix(in srgb, var(--ce-detail-accent) 34%, #e1e9f2);
  background: #fff;
}

.control-escolar-screen .ce-family-siblings-list button > span {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.control-escolar-screen .ce-family-siblings-list strong,
.control-escolar-screen .ce-family-siblings-list small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-family-siblings-list strong {
  color: var(--ce-ink);
  font-size: 11px;
  font-weight: 900;
}

.control-escolar-screen .ce-family-siblings-empty {
  padding: 9px 10px;
  border: 1px dashed #d8e2ec;
  border-radius: 12px;
  background: #fbfdff;
}

.control-escolar-screen .ce-family-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 11px;
  min-width: 760px;
}

.control-escolar-screen .ce-family-card {
  display: grid;
  gap: 11px;
  padding: 13px;
}

.control-escolar-screen .ce-family-card.is-warning {
  border-color: rgba(216, 139, 28, 0.28);
}

.control-escolar-screen .ce-family-card.is-danger {
  border-color: rgba(217, 67, 56, 0.32);
}

.control-escolar-screen .ce-family-card-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
}

.control-escolar-screen .ce-family-card-status {
  display: grid;
  min-width: 86px;
  gap: 5px;
  justify-items: end;
}

.control-escolar-screen .ce-family-card-status i {
  width: 86px;
  color: #8a98ab;
}

.control-escolar-screen .ce-family-card.is-complete .ce-family-card-status i {
  color: var(--ce-green-strong);
}

.control-escolar-screen .ce-family-card.is-warning .ce-family-card-status i {
  color: var(--ce-warning);
}

.control-escolar-screen .ce-family-card.is-danger .ce-family-card-status i {
  color: var(--ce-danger);
}

.control-escolar-screen .ce-family-fields {
  gap: 10px;
}

.control-escolar-screen .ce-family-fields--mother {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.control-escolar-screen .ce-family-span-2 {
  grid-column: span 2;
}

.control-escolar-screen .ce-wide-field.ce-family-address {
  min-width: 760px;
  margin-top: 11px;
}

.control-escolar-screen .ce-detail-footer {
  position: sticky;
  bottom: 0;
  z-index: 7;
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
  border-top: 1px solid rgba(221, 231, 240, 0.95);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(16px) saturate(128%);
  box-shadow: 0 -12px 26px rgba(21, 35, 60, 0.065);
}

.control-escolar-screen .ce-detail-footer .ce-save-state,
.control-escolar-screen .ce-save-state {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  padding: 0 11px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 920;
  letter-spacing: 0;
}

.control-escolar-screen .ce-save-state.clean {
  background: #edf8ea;
  color: var(--ce-green-strong);
}

.control-escolar-screen .ce-save-state.dirty {
  background: #fff6e7;
  color: #a35f0d;
}

.control-escolar-screen .ce-save-state.saving {
  background: #eef5ff;
  color: #2b67a6;
}

.control-escolar-screen .ce-save-state.error {
  background: #fff0ef;
  color: var(--ce-danger);
}

.control-escolar-screen .ce-detail-footer div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-escolar-screen .ce-detail-footer :deep(.ui-button) {
  min-height: 40px;
  min-width: 126px;
  border-radius: 13px;
}

/* Empty detail state and shared form primitives. */
.ce-empty-detail-panel {
  display: grid;
  min-height: 0;
}

.ce-empty-detail-panel .ce-empty-shell {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 16px;
  min-height: 100%;
  padding: clamp(28px, 5vw, 56px);
  border: 1px solid #dfe8f1;
  border-radius: 18px;
  background:
    radial-gradient(circle at 50% 32%, rgba(75, 169, 86, 0.1), transparent 210px),
    linear-gradient(180deg, #ffffff, #fbfdfb);
  box-shadow: 0 12px 32px rgba(21, 35, 60, 0.055);
  text-align: center;
}

.ce-empty-detail-panel .ce-empty-hero {
  display: inline-grid;
  width: 74px;
  height: 74px;
  place-items: center;
  border: 1px solid rgba(64, 149, 73, 0.2);
  border-radius: 24px;
  background: #f2fbf1;
  color: #2f9138;
  box-shadow: 0 16px 36px rgba(63, 145, 56, 0.12);
}

.ce-empty-detail-panel .ce-empty-copy {
  display: grid;
  gap: 6px;
  max-width: 420px;
}

.ce-empty-detail-panel .ce-empty-copy h2 {
  margin: 0;
  color: #10203a;
  font-size: clamp(18px, 2vw, 24px);
  font-weight: 920;
  letter-spacing: -0.035em;
}

.ce-empty-detail-panel .ce-empty-copy p {
  margin: 0;
  color: #5f6e86;
  font-size: 13px;
  font-weight: 680;
  line-height: 1.45;
}

.ce-panel-heading p,
.ce-health-card__copy p,
.ce-status-signal-card p,
.ce-family-readiness-card p {
  max-width: 56ch;
}

.ce-form-grid label > span,
.ce-wide-field > span {
  display: block;
  margin-bottom: 6px;
  color: #5d6b83;
  font-size: 10.5px;
  font-weight: 900;
  letter-spacing: 0.035em;
  line-height: 1.1;
  text-transform: uppercase;
}

.ce-smart-field small:empty,
.ce-form-grid label > small:empty {
  display: none;
  min-height: 0;
  margin: 0;
}

.ce-smart-field small,
.ce-form-grid label > small {
  display: block;
  margin-top: 6px;
  line-height: 1.25;
}

.ce-derived-card {
  align-items: center;
  min-height: 50px;
}

.ce-derived-card strong {
  font-size: 12.5px;
  line-height: 1.25;
}

.ce-status-signal-card.is-complete p,
.ce-family-readiness-card.is-complete p {
  display: none;
}

.ce-health-card--complete .ce-health-card__copy > p:empty,
.ce-health-card__copy > p:empty {
  display: none;
}

@container (max-width: 720px) {
  .ce-empty-detail-panel .ce-empty-shell {
    min-height: 360px;
    padding: 28px 18px;
  }
}

/* Compact form and panel layout. */
.control-escolar-screen .ce-list-titlebar {
  min-height: 44px;
  padding-inline: 14px 10px;
}

.control-escolar-screen .ce-list-titlebar .list-heading-copy {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
}

.control-escolar-screen .ce-list-titlebar h2 {
  flex: 0 0 auto;
  font-size: 13.5px;
  line-height: 1;
}

.control-escolar-screen .ce-list-titlebar p {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #66758c;
  font-size: 11px;
  font-weight: 760;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-empty-detail-panel {
  overflow: hidden;
  background: transparent;
  box-shadow: none;
}

.control-escolar-screen .ce-empty-detail-panel .ce-empty-shell {
  min-height: 100%;
  border-radius: 16px;
  background:
    radial-gradient(circle at 50% 38%, rgba(63, 145, 56, 0.12), transparent 170px),
    linear-gradient(180deg, #ffffff 0%, #fbfdfb 100%);
}

.control-escolar-screen .ce-empty-detail-panel .ce-empty-copy h2 {
  font-size: clamp(17px, 1.7vw, 22px);
}

.control-escolar-screen .ce-empty-detail-panel .ce-empty-copy p,
.control-escolar-screen .ce-empty-review,
.control-escolar-screen .ce-empty-flow,
.control-escolar-screen .ce-empty-tip {
  display: none;
}

.control-escolar-screen .ce-health-overview,
.control-escolar-screen .ce-status-signal-grid,
.control-escolar-screen .ce-family-readiness,
.control-escolar-screen .ce-family-grid,
.control-escolar-screen .ce-edit-form,
.control-escolar-screen .ce-wide-field.ce-family-address {
  min-width: 0;
}

.control-escolar-screen .ce-form-card.ce-tab-panel {
  padding: 14px 15px 12px;
  border-radius: 15px;
}

.control-escolar-screen .ce-panel-heading {
  min-height: 0;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(224, 232, 241, 0.8);
}

.control-escolar-screen .ce-panel-heading h3 {
  font-size: 13px;
  line-height: 1.15;
}

.control-escolar-screen .ce-panel-heading p {
  margin-top: 3px;
  font-size: 10.5px;
  line-height: 1.25;
}

.control-escolar-screen .ce-form-grid,
.control-escolar-screen .ce-form-grid.two,
.control-escolar-screen .ce-form-grid.three,
.control-escolar-screen .ce-tab-panel .ce-form-grid.three {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(205px, 1fr));
  gap: 12px 14px;
  min-width: 0;
}

.control-escolar-screen .ce-form-grid label,
.control-escolar-screen .ce-wide-field {
  display: grid;
  align-content: start;
  gap: 6px;
  min-width: 0;
}

.control-escolar-screen .ce-form-grid label > span,
.control-escolar-screen .ce-wide-field > span {
  display: block;
  min-height: 12px;
  margin: 0;
  overflow: hidden;
  color: #5d6b83;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.025em;
  line-height: 1.1;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}

.control-escolar-screen .ce-form-grid input,
.control-escolar-screen .ce-form-grid select,
.control-escolar-screen .ce-wide-field textarea {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 42px;
  padding: 0 12px;
  border-radius: 11px;
  font-size: 12px;
  line-height: 1.2;
}

.control-escolar-screen .ce-form-grid label > small,
.control-escolar-screen .ce-smart-field small {
  display: block;
  min-height: 0;
  margin: 0;
  font-size: 9.5px;
  line-height: 1.15;
}

.control-escolar-screen .ce-form-grid label > small:empty,
.control-escolar-screen .ce-smart-field small:empty {
  display: none;
}

.control-escolar-screen .ce-derived-card {
  grid-column: 1 / -1;
  min-height: 44px;
  padding: 8px 11px;
  border-radius: 12px;
}

.control-escolar-screen .ce-derived-card strong {
  font-size: 12px;
  line-height: 1.2;
}

.control-escolar-screen .ce-family-card {
  min-width: 0;
}

.control-escolar-screen .ce-family-fields--mother,
.control-escolar-screen .ce-family-fields {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.control-escolar-screen .ce-family-span-2 {
  grid-column: auto;
}

@container (max-width: 920px) {
  .control-escolar-screen .ce-form-grid,
  .control-escolar-screen .ce-form-grid.two,
  .control-escolar-screen .ce-form-grid.three,
  .control-escolar-screen .ce-tab-panel .ce-form-grid.three {
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  }
}

@container (max-width: 560px) {
  .control-escolar-screen .ce-list-titlebar .list-heading-copy {
    display: grid;
    gap: 3px;
  }

  .control-escolar-screen .ce-list-titlebar p {
    font-size: 10px;
  }

  .control-escolar-screen .ce-form-grid,
  .control-escolar-screen .ce-form-grid.two,
  .control-escolar-screen .ce-form-grid.three,
  .control-escolar-screen .ce-tab-panel .ce-form-grid.three {
    grid-template-columns: 1fr;
  }
}

/* Empty detail and identity layout. */
.control-escolar-screen .ce-list-titlebar {
  align-items: center;
}

.control-escolar-screen .ce-list-titlebar .list-heading-copy {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.control-escolar-screen .ce-list-titlebar .list-heading-copy p {
  display: none;
}

.control-escolar-screen .ce-empty-detail-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.control-escolar-screen .ce-empty-detail-panel .ce-empty-shell {
  width: min(100%, 360px);
  min-height: 220px;
  margin: auto;
  padding: 28px 24px;
  border: 1px solid #e2eaf2;
  border-radius: 24px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdfc 100%);
  box-shadow: 0 16px 40px rgba(20, 46, 90, 0.06);
  text-align: center;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 14px;
}

.control-escolar-screen .ce-empty-detail-panel .ce-empty-hero {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: #f4faf4;
  color: #2a9b3d;
}

.control-escolar-screen .ce-empty-detail-panel .ce-empty-copy h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.15;
}

.control-escolar-screen .ce-empty-detail-panel .ce-empty-copy p {
  display: block;
  margin: 0;
  color: #66758c;
  font-size: 13px;
  line-height: 1.5;
}

.control-escolar-screen .ce-panel-heading {
  align-items: center;
  margin-bottom: 16px;
}

.control-escolar-screen .ce-panel-heading p {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.35;
}

.control-escolar-screen .ce-form-card.ce-tab-panel {
  padding: 18px 20px 16px;
}

.control-escolar-screen .ce-identity-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 18px;
  align-items: start;
}

.control-escolar-screen .ce-identity-grid > label,
.control-escolar-screen .ce-identity-grid > .ce-derived-card {
  min-width: 0;
}

.control-escolar-screen .ce-identity-grid > .ce-derived-card {
  grid-column: 1 / -1;
}

.control-escolar-screen .ce-form-grid label,
.control-escolar-screen .ce-wide-field {
  gap: 7px;
}

.control-escolar-screen .ce-form-grid label > span,
.control-escolar-screen .ce-wide-field > span {
  min-height: auto;
  color: #5b6880;
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0.02em;
  line-height: 1.2;
}

.control-escolar-screen .ce-form-grid input,
.control-escolar-screen .ce-form-grid select,
.control-escolar-screen .ce-wide-field textarea {
  min-height: 46px;
  padding: 0 14px;
  border-radius: 13px;
  font-size: 13px;
  font-weight: 700;
}

.control-escolar-screen .ce-form-grid label > small,
.control-escolar-screen .ce-smart-field small {
  font-size: 10px;
  line-height: 1.25;
}

.control-escolar-screen .ce-derived-card {
  min-height: 52px;
  padding: 10px 14px;
  border-radius: 14px;
}

.control-escolar-screen .ce-derived-card strong {
  font-size: 13px;
  line-height: 1.25;
}

.control-escolar-screen .ce-derived-card__icon {
  width: 36px;
  height: 36px;
}

.control-escolar-screen .ce-derived-card__icon b {
  font-size: 18px;
  line-height: 1;
}

@container (max-width: 860px) {
  .control-escolar-screen .ce-identity-grid {
    grid-template-columns: 1fr;
  }
}

/* Student list, profile cues, and family panels. */
.control-escolar-screen .ce-list-card {
  grid-template-rows: 38px 0 minmax(0, 1fr) 38px;
}

.control-escolar-screen .ce-list-titlebar {
  min-height: 38px;
  padding: 0 11px 0 14px;
  border-bottom: 1px solid #e5edf4;
}

.control-escolar-screen .ce-list-titlebar .list-heading-copy {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.control-escolar-screen .ce-list-titlebar h2 {
  margin: 0;
  font-size: 14px;
  line-height: 1;
}

.control-escolar-screen .ce-list-titlebar h2 span {
  font-size: 14px;
}

.control-escolar-screen .ce-list-columns {
  height: 0;
  min-height: 0;
  max-height: 0;
  padding: 0;
  border: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}

.control-escolar-screen .ce-panel-heading {
  margin-bottom: 12px;
}

.control-escolar-screen .ce-form-card.ce-tab-panel {
  padding: 16px 18px 14px;
}

.control-escolar-screen .ce-identity-grid,
.control-escolar-screen .ce-form-grid.ce-identity-grid {
  grid-template-columns: repeat(4, minmax(118px, 1fr));
  gap: 13px 14px;
  align-items: start;
  width: 100%;
}

.control-escolar-screen .ce-identity-grid > .ce-derived-card {
  grid-column: 1 / -1;
}

.control-escolar-screen .ce-identity-grid label {
  min-width: 0;
}

.control-escolar-screen .ce-identity-grid input {
  min-height: 44px;
}

.control-escolar-screen .ce-identity-grid label > span {
  font-size: 10.5px;
  line-height: 1.2;
}

.control-escolar-screen .ce-identity-grid label > small,
.control-escolar-screen .ce-identity-grid .ce-smart-field small {
  min-height: 12px;
  font-size: 9.5px;
  line-height: 1.2;
}

.control-escolar-screen .ce-identity-grid .ce-derived-card {
  min-height: 48px;
}

@container (max-width: 760px) {
  .control-escolar-screen .ce-identity-grid,
  .control-escolar-screen .ce-form-grid.ce-identity-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 520px) {
  .control-escolar-screen .ce-identity-grid,
  .control-escolar-screen .ce-form-grid.ce-identity-grid {
    grid-template-columns: 1fr;
  }
}

.control-escolar-screen .ce-list-card {
  grid-template-rows: clamp(34px, 2.45vw, 38px) minmax(0, 1fr);
}

.control-escolar-screen .ce-list-card .list-columns {
  display: none;
}

.control-escolar-screen .ce-list-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 0 14px 0 10px;
}

.control-escolar-screen .list-heading-copy h2 {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.control-escolar-screen .ce-row-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 2px solid #c8d2df;
  border-radius: 7px;
  background: #fff;
  color: transparent;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.92);
  font-size: 13px;
  font-weight: 900;
  transition: all .18s ease;
}

.control-escolar-screen .ce-row-check.active {
  border-color: #4fa346;
  background: #4fa346;
  color: #fff;
}

.control-escolar-screen .ce-profile-identity-cues {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.control-escolar-screen .ce-profile-cue {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid #dbe5ef;
  border-radius: 999px;
  background: #fff;
  color: #4c5b75;
  font-size: 12px;
  font-weight: 760;
}

.control-escolar-screen .ce-profile-cue b {
  font-size: 15px;
  line-height: 1;
}

.control-escolar-screen .ce-profile-cue.is-gender.female {
  border-color: rgba(200, 94, 150, .26);
  background: rgba(253, 243, 248, .96);
  color: #b74f82;
}

.control-escolar-screen .ce-profile-cue.is-gender.male {
  border-color: rgba(57, 123, 224, .24);
  background: rgba(240, 247, 255, .96);
  color: #2f69c9;
}

.control-escolar-screen .ce-profile-cue.is-age,
.control-escolar-screen .ce-profile-cue.is-born {
  background: rgba(247, 250, 252, .96);
}

.control-escolar-screen .ce-grade-pickers {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.control-escolar-screen .ce-picker-group {
  display: grid;
  gap: 8px;
}

.control-escolar-screen .ce-picker-group > small {
  color: #6f7d93;
  font-size: 11px;
  font-weight: 760;
}

.control-escolar-screen .ce-grade-picker-grid,
.control-escolar-screen .ce-group-picker-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.control-escolar-screen .ce-grade-picker-chip,
.control-escolar-screen .ce-group-picker-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid #d8e3ee;
  border-radius: 12px;
  background: #fff;
  color: #4b5b72;
  font-size: 12px;
  font-weight: 780;
  transition: all .18s ease;
}

.control-escolar-screen .ce-grade-picker-chip.active,
.control-escolar-screen .ce-group-picker-chip.active {
  border-color: rgba(79,163,70,.34);
  background: rgba(240, 249, 238, .98);
  color: #2f7f32;
  box-shadow: 0 8px 20px rgba(79,163,70,.12);
}

.control-escolar-screen .ce-family-readiness-meter,
.control-escolar-screen .ce-family-card-status i {
  display: none;
}

.control-escolar-screen .ce-family-card-head {
  align-items: flex-start;
}

.control-escolar-screen .ce-family-card-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.control-escolar-screen .ce-family-card-status > span {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(240, 247, 239, .98);
  color: #36843c;
  font-size: 11px;
  font-weight: 820;
}

.control-escolar-screen .ce-family-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.control-escolar-screen .ce-family-fields,
.control-escolar-screen .ce-family-fields--mother {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.control-escolar-screen .ce-system-panel {
  border-color: rgba(113, 128, 150, .18);
  background: linear-gradient(180deg, rgba(250, 252, 255, .98), rgba(255,255,255,.98));
}

.control-escolar-screen .ce-detail-tabs button.is-complete.active,
.control-escolar-screen .ce-detail-tabs button.is-warning.active,
.control-escolar-screen .ce-detail-tabs button.is-danger.active {
  box-shadow: 0 10px 24px rgba(17, 24, 39, .08);
}

.control-escolar-screen .ce-detail-tabs button.is-complete.active {
  border-color: rgba(79,163,70,.28);
}

.control-escolar-screen .ce-detail-tabs button.is-warning.active {
  border-color: rgba(225, 155, 32, .28);
}

.control-escolar-screen .ce-detail-tabs button.is-danger.active {
  border-color: rgba(228, 82, 82, .28);
}

@media (max-width: 1100px) {
  .control-escolar-screen .ce-family-grid {
    grid-template-columns: 1fr;
  }
}

/* Academic position, family, and advanced expediente panels. */
.control-escolar-screen .ce-identity-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.control-escolar-screen .ce-identity-span-2 {
  grid-column: span 2;
}

.control-escolar-screen .ce-school-priority-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 14px;
  border: 1px solid #e1eaf3;
  border-radius: 16px;
  background: linear-gradient(180deg, #fbfdfd, #ffffff);
}

.control-escolar-screen .ce-school-priority-panel p {
  margin: 0;
  max-width: 520px;
  color: #6b7a90;
  font-size: 11.5px;
  line-height: 1.4;
  font-weight: 700;
}

.control-escolar-screen .ce-school-current-pill {
  display: grid;
  gap: 4px;
  min-width: 200px;
  padding: 10px 14px;
  border-radius: 14px;
  background: #f2f7f1;
  color: #224d2b;
}

.control-escolar-screen .ce-school-current-pill small {
  color: #5f7085;
  font-size: 10.5px;
  font-weight: 820;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.control-escolar-screen .ce-school-current-pill strong {
  font-size: 16px;
  font-weight: 900;
}


.control-escolar-screen .ce-group-picker-card {
  display: grid;
  grid-template-columns: minmax(190px, 0.38fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  margin-bottom: 14px;
  padding: 14px 16px;
  border: 1px solid #e1eaf3;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff, #fbfdfd);
}

.control-escolar-screen .ce-group-picker-card__heading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.control-escolar-screen .ce-group-picker-card__heading > span {
  display: inline-flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 13px;
  background: #eef5ff;
  color: #2f72d9;
}

.control-escolar-screen .ce-group-picker-card__heading div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.control-escolar-screen .ce-group-picker-card__heading small {
  color: #6f7d93;
  font-size: 10.5px;
  font-weight: 820;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.control-escolar-screen .ce-group-picker-card__heading strong {
  overflow: hidden;
  color: #14233c;
  font-size: 15px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-group-combobox {
  position: relative;
  min-width: 0;
}

.control-escolar-screen .ce-group-combobox__input {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 12px;
  border: 1px solid #d8e3ee;
  border-radius: 14px;
  background: #fff;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.96);
  transition: border-color .18s ease, box-shadow .18s ease;
}

.control-escolar-screen .ce-group-combobox.open .ce-group-combobox__input,
.control-escolar-screen .ce-group-combobox__input:focus-within {
  border-color: rgba(47, 114, 217, .42);
  box-shadow: 0 10px 24px rgba(47, 114, 217, .08);
}

.control-escolar-screen .ce-group-combobox__input input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #15233a;
  font-size: 13px;
  font-weight: 760;
}

.control-escolar-screen .ce-group-combobox__input button {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: #eef2f7;
  color: #60708a;
}

.control-escolar-screen .ce-group-combobox__chevron {
  color: #7c8aa0;
  transition: transform .18s ease;
}

.control-escolar-screen .ce-group-combobox.open .ce-group-combobox__chevron {
  transform: rotate(180deg);
}

.control-escolar-screen .ce-group-combobox__menu {
  position: absolute;
  z-index: 40;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  display: grid;
  gap: 6px;
  max-height: 310px;
  overflow: auto;
  padding: 8px;
  border: 1px solid #dbe5f0;
  border-radius: 16px;
  background: rgba(255,255,255,.98);
  box-shadow: 0 20px 44px rgba(21, 35, 60, .16);
}

.control-escolar-screen .ce-group-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: #14233c;
  text-align: left;
  transition: background .16s ease, border-color .16s ease;
}

.control-escolar-screen .ce-group-option:hover,
.control-escolar-screen .ce-group-option.selected {
  border-color: rgba(47, 114, 217, .18);
  background: #f6f9ff;
}

.control-escolar-screen .ce-group-option.custom {
  background: #fbfdfd;
}

.control-escolar-screen .ce-group-option span:not(.ui-group-icon) {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.control-escolar-screen .ce-group-option strong {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 860;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-group-option small,
.control-escolar-screen .ce-group-empty {
  color: #718096;
  font-size: 11px;
  font-weight: 720;
}

.control-escolar-screen .ce-group-empty {
  padding: 12px;
  text-align: center;
}

.control-escolar-screen .ce-school-grid-minimal {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.control-escolar-screen .ce-grade-pickers {
  gap: 14px;
  padding-top: 10px;
}

.control-escolar-screen .ce-grade-picker-chip,
.control-escolar-screen .ce-group-picker-chip {
  min-height: 42px;
  border-radius: 14px;
  font-weight: 820;
}

.control-escolar-screen .ce-family-card {
  grid-template-rows: auto 1fr;
}

.control-escolar-screen .ce-family-fields--father,
.control-escolar-screen .ce-family-fields--mother {
  grid-auto-rows: minmax(74px, auto);
  align-content: start;
}

.control-escolar-screen .ce-family-fields--father .ce-family-span-2,
.control-escolar-screen .ce-family-fields--mother .ce-family-span-2 {
  grid-column: 1 / -1;
}

.control-escolar-screen .ce-family-card-status > span {
  background: rgba(241,247,240,.98);
}

.control-escolar-screen .ce-family-card input,
.control-escolar-screen .ce-family-card select,
.control-escolar-screen .ce-family-card textarea {
  min-height: 46px;
}

.control-escolar-screen .ce-advanced-expediente-panel {
  display: grid;
  gap: 14px;
}

.control-escolar-screen .ce-advanced-section {
  padding: 14px;
  border: 1px solid rgba(221, 231, 240, .98);
  border-radius: 14px;
  background: linear-gradient(180deg, #fbfdff, #fff);
}

.control-escolar-screen .ce-advanced-upload-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.control-escolar-screen .ce-advanced-upload-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 76px;
  padding: 13px;
  overflow: hidden;
  border: 1px solid #dfe8f1;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(21, 35, 60, .035);
  cursor: pointer;
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
}

.control-escolar-screen .ce-advanced-upload-card:hover {
  border-color: rgba(38, 132, 82, .36);
  box-shadow: 0 12px 24px rgba(21, 35, 60, .06);
  transform: translateY(-1px);
}

.control-escolar-screen .ce-advanced-upload-card.has-value {
  border-color: rgba(79, 163, 70, .32);
  background: linear-gradient(180deg, rgba(247, 252, 246, .98), #fff);
}

.control-escolar-screen .ce-advanced-upload-card.is-uploading {
  pointer-events: none;
  opacity: .72;
}

.control-escolar-screen .ce-advanced-upload-card input[type="file"] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.control-escolar-screen .ce-advanced-upload-icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #eef7ed;
  color: #2f7d3d;
}

.control-escolar-screen .ce-advanced-upload-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.control-escolar-screen .ce-advanced-upload-copy strong {
  color: #203147;
  font-size: 12px;
  font-weight: 900;
}

.control-escolar-screen .ce-advanced-upload-copy small {
  overflow: hidden;
  color: #65758a;
  font-size: 11px;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-advanced-upload-copy em {
  color: #c24135;
  font-size: 10.5px;
  font-style: normal;
  font-weight: 820;
}

.control-escolar-screen .ce-system-panel {
  display: grid;
  gap: 14px;
}

.control-escolar-screen .ce-system-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.control-escolar-screen .ce-system-grid article {
  display: grid;
  gap: 5px;
  min-height: 76px;
  padding: 13px 14px;
  border: 1px solid #dfe8f1;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(21, 35, 60, .035);
}

.control-escolar-screen .ce-system-grid span {
  color: #65758a;
  font-size: 10.5px;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: .035em;
}

.control-escolar-screen .ce-system-grid strong {
  color: #1f2f45;
  font-size: 15px;
  font-weight: 920;
}

.control-escolar-screen .ce-husky-card.compact {
  display: grid;
  gap: 14px;
  margin-top: 0;
  padding: 14px;
  border: 1px solid #dfe8f1;
  border-radius: 16px;
  background: linear-gradient(180deg, #fbfdff, #fff);
  box-shadow: 0 8px 20px rgba(21, 35, 60, .04);
}

.control-escolar-screen .ce-husky-heading {
  align-items: center;
}

.control-escolar-screen .ce-husky-heading img {
  width: 52px;
  height: auto;
  flex: 0 0 auto;
  border-radius: 12px;
}

.control-escolar-screen .ce-husky-credentials {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.control-escolar-screen .ce-husky-credentials span,
.control-escolar-screen .ce-husky-empty {
  display: grid;
  gap: 4px;
  padding: 13px;
  border: 1px solid #dfe8f1;
  border-radius: 14px;
  background: #fff;
}

.control-escolar-screen .ce-husky-credentials small {
  color: #65758a;
  font-size: 10.5px;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: .035em;
}

.control-escolar-screen .ce-husky-credentials strong {
  overflow-wrap: anywhere;
  color: #1f2f45;
  font-size: 14px;
  font-weight: 920;
}

.control-escolar-screen .ce-husky-empty {
  color: #65758a;
  font-size: 12px;
  font-weight: 760;
}

.control-escolar-screen .ce-husky-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 2px;
}

.control-escolar-screen .ce-husky-actions small {
  min-width: 0;
  overflow: hidden;
  color: #65758a;
  font-size: 11px;
  font-weight: 760;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1280px) {
  .control-escolar-screen .ce-identity-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .control-escolar-screen .ce-school-priority-panel {
    flex-direction: column;
    align-items: flex-start;
  }

  .control-escolar-screen .ce-group-picker-card,
  .control-escolar-screen .ce-school-grid-minimal,
  .control-escolar-screen .ce-system-grid,
  .control-escolar-screen .ce-advanced-upload-grid,
  .control-escolar-screen .ce-husky-credentials {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .control-escolar-screen .ce-identity-grid {
    grid-template-columns: 1fr;
  }

  .control-escolar-screen .ce-identity-span-2 {
    grid-column: auto;
  }
}

/* Controlled inline suggestions. */
.control-escolar-screen .ce-autocomplete-field {
  position: relative;
}

.control-escolar-screen .ce-autocomplete-field > input {
  width: 100%;
}

.control-escolar-screen .ce-inline-suggestion-menu {
  position: absolute;
  z-index: 8;
  top: calc(100% + 6px);
  left: 0;
  display: flex;
  min-width: min(100%, 260px);
  max-width: 320px;
  align-items: stretch;
  gap: 6px;
  padding: 6px;
  border: 1px solid #dbe6f1;
  border-radius: 13px;
  background: rgba(255, 255, 255, .98);
  box-shadow: 0 16px 34px rgba(21, 35, 60, .13);
}

.control-escolar-screen .ce-inline-suggestion-menu button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 1px solid rgba(79, 163, 70, .2);
  border-radius: 10px;
  background: #f4fbf2;
  color: #286f32;
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
  white-space: nowrap;
}

.control-escolar-screen .ce-inline-suggestion-menu button.ghost {
  width: 34px;
  flex: 0 0 auto;
  padding: 0;
  border-color: #e0e8f1;
  background: #fff;
  color: #6b788e;
}

.control-escolar-screen .ce-advanced-expediente-panel .ce-form-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

</style>
