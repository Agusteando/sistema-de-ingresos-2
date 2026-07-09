<template>
  <div
    ref="controlScreenRef"
    :class="[
      'students-screen control-escolar-screen',
      { 'has-selected-student': Boolean(selectedStudent) },
    ]"
    :style="controlScreenStyle"
  >

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
              'is-browsing': !selectedStudent,
            },
          ]"
        >
          <section
            :class="[
              'student-list-panel',
              selectedStudent ? 'is-compact' : 'is-full',
            ]"
          >
            <div
              :class="[
                'filter-bar ce-filter-bar',
                { 'is-filter-expanded': showAdvancedFilters },
              ]"
            >
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
                  class="ce-chip-cluster ce-chip-cluster--quality ce-scrollable-filter-strip"
                  aria-label="Calidad del expediente. Desplázate horizontalmente para ver más filtros."
                  tabindex="0"
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
                  v-if="hasActiveFilters"
                  type="button"
                  class="ce-clear-link"
                  title="Limpiar filtros"
                  aria-label="Limpiar filtros"
                  @click="clearFilters"
                >
                  <LucideRotateCcw :size="15" /> <span>Limpiar filtros</span>
                </button>
              </div>

              <div class="ce-secondary-filter-row">
                <div class="ce-status-tabs ce-scrollable-filter-strip" aria-label="Filtros principales" tabindex="0">
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
                  class="ce-chip-cluster ce-chip-cluster--grade ce-scrollable-filter-strip"
                  aria-label="Filtrar por grado"
                  tabindex="0"
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
                  class="ce-chip-cluster ce-chip-cluster--group ce-scrollable-filter-strip"
                  aria-label="Filtrar por grupo"
                  tabindex="0"
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
                      controlStudentMutationClass(student),
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
                        <span class="student-type-line student-matricula-line">
                          <span
                            :class="[
                              'student-tipo-chip',
                              'student-matricula-token',
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
                      <span
                        v-if="controlStudentMutationStatus(student)"
                        :class="[
                          'ce-row-save-indicator',
                          `is-${controlStudentMutationStatus(student)}`,
                        ]"
                        :title="controlStudentMutationTitle(student)"
                        :aria-label="controlStudentMutationTitle(student)"
                        role="status"
                      >
                        <LucideLoader2
                          v-if="controlStudentMutationStatus(student) === 'saving'"
                          :size="16"
                          class="spinning"
                        />
                        <LucideAlertTriangle
                          v-else-if="controlStudentMutationStatus(student) === 'failed'"
                          :size="16"
                        />
                        <LucideCheck v-else :size="16" />
                      </span>
                      <span v-else class="ce-row-action"
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
            <div
              :class="[
                'ce-detail-shell',
                `is-${selectedRecordHealth.tone}`,
                { 'is-mobile-detail-scrolled': mobileDetailScrolled },
              ]"
            >
              <button
                type="button"
                class="ce-mobile-detail-back"
                aria-label="Volver a la lista de alumnos"
                @click="selectedStudent = null"
              >
                <LucideChevronLeft :size="20" />
                <span>Alumnos</span>
              </button>
              <header :class="['ce-detail-header', 'ce-student-hero-header', `is-${selectedRecordHealth.tone}`]">
                <div class="ce-student-hero-main">
                  <StudentGradePhotoCard
                    class="ce-student-hero-photo"
                    :student="selectedStudent"
                    :photo-url="controlStudentPhotoUrl(selectedStudent)"
                    :photo-loading="
                      isControlStudentPhotoLoading(selectedStudent)
                    "
                    :is-enrolled="selectedStudent.status === 'Activo'"
                    static-photo
                  />
                  <div class="ce-student-hero-copy">
                    <h2>{{ selectedStudent.fullName || "Ficha de alumno" }}</h2>
                    <div class="ce-student-hero-meta" aria-label="Datos rápidos del alumno">
                      <span class="ce-student-hero-meta-token is-matricula">{{ selectedStudent.matricula || "Sin matrícula" }}</span>
                      <span class="ce-student-hero-meta-token is-grade">{{ selectedWorkspaceGradeLabel }}</span>
                      <button
                        type="button"
                        class="ce-student-hero-pass-card"
                        :aria-label="selectedHuskyPassAriaLabel"
                        @click="goToHuskyPassTab"
                      >
                        <img src="/brand/husky-pass-header-gray.png" alt="" aria-hidden="true" />
                        <strong>{{ selectedHuskyPassPasswordLabel }}</strong>
                      </button>
                    </div>
                    <div class="ce-student-hero-cues" aria-label="Identidad y datos personales rápidos">
                      <span
                        v-if="selectedHeaderGenderChip"
                        :class="[
                          'ce-student-identity-chip',
                          'is-symbol',
                          `is-${selectedHeaderGenderChip.tone}`,
                        ]"
                        :aria-label="selectedHeaderGenderChip.label"
                        :title="selectedHeaderGenderChip.label"
                      >
                        <span class="ce-student-identity-glyph" aria-hidden="true">{{ selectedHeaderGenderChip.symbol }}</span>
                      </span>
                      <span
                        v-if="selectedHeaderBirthDateLabel"
                        class="ce-student-identity-chip is-birthday"
                      >
                        <LucideCake :size="15" aria-hidden="true" />
                        {{ selectedHeaderBirthDateLabel }}
                      </span>
                      <button
                        v-if="selectedHeaderAgeChip"
                        type="button"
                        class="ce-student-identity-chip is-age is-action"
                        @click="goToCurpField"
                      >
                        <LucideClock3 :size="15" aria-hidden="true" />
                        {{ selectedHeaderAgeChip }}
                      </button>
                    </div>
                  </div>
                  <div class="ce-student-hero-side">
                    <button
                      v-if="selectedHeaderGroupSigil"
                      :key="`${selectedHeaderGroupSigil.value}-${groupSigilTransitionKey}`"
                      type="button"
                      :class="[
                        'ce-student-hero-group-sigil',
                        `is-${selectedHeaderContextTone}`,
                        { 'is-swapping': groupSigilSwapping },
                      ]"
                      :aria-label="`${selectedHeaderGroupSigil.label}. Editar grupo`"
                      :title="`${selectedHeaderGroupSigil.label}. Editar grupo`"
                      @click="openGroupModal"
                    >
                      <span class="ce-student-hero-group-art" aria-hidden="true">
                        <UiGroupIcon :label="selectedHeaderGroupSigil.value" />
                      </span>
                      <span class="ce-student-hero-group-action">
                        <small>Grupo {{ selectedHeaderGroupSigil.displayLabel }}</small>
                        <strong>
                          Editar grupo
                          <LucideChevronDown :size="13" aria-hidden="true" />
                        </strong>
                      </span>
                    </button>
                    <button
                      v-else
                      type="button"
                      class="ce-student-hero-group-cta"
                      @click="openGroupModal"
                    >
                      <span class="ce-student-hero-group-cta-icon" aria-hidden="true">
                        <LucideShield :size="22" />
                      </span>
                      <span>
                        <strong>ASIGNAR GRUPO</strong>
                        <small>Seleccionar sigil</small>
                      </span>
                    </button>
                    <span
                      :class="[
                        'ce-student-hero-status',
                        statusTone(selectedStudent),
                      ]"
                    >
                      <i aria-hidden="true"></i>
                      {{ selectedStudent.status || "Activo" }}
                    </span>
                    <button
                      type="button"
                      class="detail-shell-close ce-detail-menu-button ce-student-hero-menu"
                      aria-label="Cerrar detalle"
                      @click="selectedStudent = null"
                    >
                      <LucideMoreVertical :size="28" />
                    </button>
                  </div>
                </div>

                <div class="ce-student-hero-progress">
                  <span class="ce-student-hero-progress-icon" aria-hidden="true">
                    <LucideFileSpreadsheet :size="26" />
                  </span>
                  <strong>Expediente básico</strong>
                  <span class="ce-student-hero-progress-divider" aria-hidden="true"></span>
                  <span class="ce-student-hero-progress-state">
                    <LucideCheck v-if="selectedRecordHealth.tone === 'complete'" :size="26" />
                    <LucideAlertTriangle v-else :size="24" />
                    <b>{{ selectedBasicHeaderStatusLabel }}</b>
                  </span>
                  <span class="ce-student-hero-progress-percent">{{ selectedProfileCompletion }}%</span>
                  <span class="ce-student-hero-progress-track" aria-hidden="true">
                    <i :style="{ width: `${selectedProfileCompletion}%` }"></i>
                  </span>
                  <button
                    v-if="selectedRecordIssueCount"
                    type="button"
                    class="ce-student-hero-progress-action"
                    @click="goToFirstPendingField"
                  >
                    Resolver
                    <LucideChevronRight :size="22" />
                  </button>
                </div>
              </header>

              <div
                ref="detailBodyRef"
                class="ce-detail-body"
                @scroll="handleDetailBodyScroll"
              >
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
                    v-show="activeDetailTab === 'summary'"
                    class="ce-primary-pending-panel ce-tab-panel"
                    aria-label="Pendientes principales del expediente"
                  >
                    <article :class="['ce-pending-summary-strip', `is-${selectedPendingSummary.tone}`]">
                      <div class="ce-pending-summary-primary">
                        <span class="ce-pending-summary-primary-icon" aria-hidden="true">
                          <component :is="selectedPendingSummary.icon" :size="24" />
                        </span>
                        <div class="ce-pending-summary-primary-copy">
                          <strong>{{ selectedPendingSummary.title }}</strong>
                          <p>{{ selectedPendingSummary.summary }}</p>
                        </div>
                      </div>
                      <div class="ce-pending-summary-metrics">
                        <div
                          v-for="metric in selectedPendingSummary.metrics"
                          :key="`summary-metric-${metric.key}`"
                          class="ce-pending-summary-metric"
                        >
                          <span class="ce-pending-summary-metric-icon" aria-hidden="true">
                            <component :is="metric.icon" :size="22" />
                          </span>
                          <div>
                            <strong>{{ metric.value }}</strong>
                            <small>{{ metric.label }}</small>
                            <em v-if="metric.caption">{{ metric.caption }}</em>
                          </div>
                        </div>
                      </div>
                    </article>

                    <div class="ce-primary-pending-grid">
                      <button
                        v-for="signal in selectedStatusSignals"
                        :key="`primary-pending-${signal.key}`"
                        type="button"
                        :class="['ce-primary-pending-card', `is-${signal.tone}`]"
                        @click="goToStatusSignal(signal)"
                      >
                        <div class="ce-primary-pending-card-head">
                          <span class="ce-primary-pending-icon">
                            <component :is="signal.icon" :size="22" />
                          </span>
                          <span class="ce-primary-pending-copy">
                            <strong>{{ signal.title }}</strong>
                            <b>{{ signal.label }}</b>
                          </span>
                          <span class="ce-primary-pending-count">{{ signal.count }}</span>
                        </div>
                        <div class="ce-primary-pending-card-body">
                          <span class="ce-primary-pending-meta">{{ signal.summary }}</span>
                        </div>
                        <div class="ce-primary-pending-card-footer">
                          <span v-if="signal.tone === 'complete'" class="ce-primary-pending-checkmark">
                            <LucideCheck :size="20" />
                          </span>
                          <span v-else class="ce-primary-pending-action">
                            Completar
                          </span>
                        </div>
                      </button>
                    </div>
                  </section>

                  <section
                    v-show="activeDetailTab === 'summary' || activeDetailTab === 'identity'"
                    class="ce-form-card ce-tab-panel ce-identity-panel"
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
                        <strong>Sin Husky Pass registrado para esta matrícula.</strong>
                        <small>Genera una contraseña para crear el acceso del alumno en este momento.</small>
                      </div>
                      <div class="ce-husky-actions">
                        <small>{{
                          huskyPassEmailTarget || "Sin correo de padre/tutor"
                        }}</small>
                        <div class="ce-husky-action-buttons">
                          <UiButton
                            variant="primary"
                            type="button"
                            :disabled="savingHuskyPass || !selectedAgentId"
                            @click="generateOrRegenerateHuskyPass"
                          >
                            <LucideRefreshCw
                              v-if="selectedStudent.huskyPassAvailable"
                              :size="16"
                              :class="{ spinning: savingHuskyPass }"
                            />
                            <LucideKeyRound v-else :size="16" />
                            {{ huskyPassGenerateLabel }}
                          </UiButton>
                          <UiButton
                            variant="secondary"
                            type="button"
                            :disabled="savingHuskyPass"
                            @click="toggleManualHuskyPassForm"
                          >
                            <LucideSave :size="16" />
                            Cambiar manualmente
                          </UiButton>
                          <UiButton
                            variant="secondary"
                            type="button"
                            :disabled="
                              sendingHuskyPass ||
                              savingHuskyPass ||
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
                      </div>
                      <form
                        v-if="showManualHuskyPassForm"
                        class="ce-husky-manual-form"
                        @submit.prevent="saveManualHuskyPassPassword"
                      >
                        <label>
                          <span>Nueva contraseña</span>
                          <input
                            v-model.trim="manualHuskyPassPassword"
                            type="text"
                            autocomplete="off"
                            minlength="6"
                            maxlength="64"
                            placeholder="Escribe una contraseña de 6 a 64 caracteres"
                          />
                        </label>
                        <div class="ce-husky-manual-actions">
                          <UiButton
                            variant="secondary"
                            type="button"
                            :disabled="savingHuskyPass"
                            @click="closeManualHuskyPassForm"
                          >
                            Cancelar
                          </UiButton>
                          <UiButton
                            variant="primary"
                            type="submit"
                            :disabled="savingHuskyPass || !huskyPassManualPasswordValid"
                          >
                            <LucideSave :size="16" />
                            {{ savingHuskyPass ? "Guardando..." : "Guardar contraseña" }}
                          </UiButton>
                        </div>
                      </form>
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
                <div class="ce-detail-footer-meta">
                  <span :class="['ce-save-state', saveStateTone]">{{
                    saveStatusText
                  }}</span>
                  <span class="ce-last-update-text">{{ selectedLastUpdateLabel }}</span>
                </div>
                <div class="ce-detail-footer-actions">
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
                    Guardar cambios
                  </UiButton>
                </div>
              </footer>
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
      v-if="groupModalOpen"
      class="ce-group-modal-backdrop"
      role="presentation"
      @mousedown.self="closeGroupModal"
    >
      <section
        class="ce-group-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ce-group-modal-title"
      >
        <header class="ce-group-modal__header">
          <span class="ce-group-modal__icon" aria-hidden="true">
            <LucideShield :size="22" />
          </span>
          <div>
            <small>Grupo del alumno</small>
            <h2 id="ce-group-modal-title">{{ editForm.grupo ? 'Cambiar grupo' : 'Asignar grupo' }}</h2>
            <p>{{ selectedStudent?.fullName || 'Ficha seleccionada' }}</p>
          </div>
          <button type="button" aria-label="Cerrar asignación de grupo" @click="closeGroupModal">
            <LucideX :size="20" />
          </button>
        </header>

        <div class="ce-group-modal__body">
          <div :class="['ce-group-modal__preview', { 'is-empty': !groupModalDraft }]">
            <span class="ce-group-modal__preview-art" aria-hidden="true">
              <UiGroupIcon :label="groupModalDraft" :missing="!groupModalDraft" />
            </span>
            <div>
              <small>Sigil seleccionado</small>
              <strong>{{ groupLabelForUi(groupModalDraft) }}</strong>
              <p>{{ groupModalDraft ? 'Este cambio se aplicará al guardar la ficha.' : 'Elige un sigil para identificar rápidamente al alumno.' }}</p>
            </div>
          </div>

          <label class="ce-group-modal__search">
            <LucideSearch :size="16" aria-hidden="true" />
            <input
              v-model="groupModalPickerInput"
              autocomplete="off"
              placeholder="Buscar grupo o escribir uno nuevo"
              @keydown.enter.prevent="confirmGroupModal"
              @keydown.escape.prevent="closeGroupModal"
            />
            <button
              v-if="groupModalDraft"
              type="button"
              aria-label="Limpiar grupo"
              @click="clearGroupModalPicker"
            >
              <LucideX :size="15" />
            </button>
          </label>

          <div class="ce-group-modal__slider-wrap">
            <div class="ce-group-modal__slider-heading">
              <strong>Elige un sigil</strong>
              <small>Desliza horizontalmente para ver más opciones</small>
            </div>
            <div class="ce-group-sigil-slider" role="listbox" aria-label="Opciones de grupo">
              <button
                v-for="option in filteredGroupModalOptions"
                :key="`group-modal-option-${option.value}`"
                type="button"
                role="option"
                :aria-selected="option.selected"
                :class="['ce-group-sigil-option', { selected: option.selected }]"
                @click="selectGroupModalOption(option.value)"
              >
                <span class="ce-group-sigil-option__art" aria-hidden="true">
                  <UiGroupIcon :label="option.value" />
                </span>
                <strong>{{ option.label }}</strong>
                <small>{{ option.sourceLabel }}</small>
              </button>
              <button
                v-if="customGroupModalOption"
                type="button"
                class="ce-group-sigil-option custom"
                role="option"
                :aria-selected="false"
                @click="selectGroupModalOption(customGroupModalOption.value)"
              >
                <span class="ce-group-sigil-option__art" aria-hidden="true">
                  <UiGroupIcon :label="customGroupModalOption.value" />
                </span>
                <strong>{{ customGroupModalOption.label }}</strong>
                <small>Grupo personalizado</small>
              </button>
              <div v-if="!filteredGroupModalOptions.length && !customGroupModalOption" class="ce-group-empty">
                No hay coincidencias. Escribe el grupo y presiona Enter para aplicarlo.
              </div>
            </div>
          </div>
        </div>

        <footer class="ce-group-modal__footer">
          <button type="button" class="ce-group-modal__secondary" @click="closeGroupModal">Cerrar</button>
          <button type="button" class="ce-group-modal__primary" @click="confirmGroupModal">
            <LucideCheck :size="16" />
            Aplicar grupo
          </button>
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
  LucideCake,
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
  LucideLoader2,
  LucideMail,
  LucideMoreVertical,
  LucidePhone,
  LucideRefreshCw,
  LucideRotateCcw,
  LucideSave,
  LucideSearch,
  LucideSearchX,
  LucideSend,
  LucideShield,
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
import { NIVELES_ESCOLARES, displayGrado, gradeOptionsForNivel } from "~/shared/utils/grado";
import { STUDENT_GROUP_ICON_LABELS, studentGroupIconLabel } from "~/shared/utils/studentGroupIcons";
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
const normalizeControlPlantel = (value) => String(value || "").trim().toUpperCase();
const controlSpecificPlantel = (value) => {
  const normalized = normalizeControlPlantel(value);
  return normalized && normalized !== "GLOBAL" ? normalized : "";
};
const readActiveControlPlantelCookie = () => {
  if (process.client && typeof document !== "undefined") {
    const cookie = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("auth_active_plantel="));
    if (cookie) {
      try {
        return controlSpecificPlantel(decodeURIComponent(cookie.split("=").slice(1).join("=")));
      } catch {
        return controlSpecificPlantel(cookie.split("=").slice(1).join("="));
      }
    }
  }

  return controlSpecificPlantel(activePlantelCookie.value);
};
const initialControlPlantel = readActiveControlPlantelCookie();
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
const controlEscolarTopbarState = useState("controlEscolarTopbarState", () => ({
  plantel: "",
  studentsCount: 0,
  loading: false,
  importing: false,
  syncStatus: "idle",
  syncMessage: "",
}));
const controlEscolarDetailOpen = useState("controlEscolarDetailOpen", () => false);
const currentEnrollmentPlantelKey = computed(() =>
  normalizeEnrollmentPlantelKey(selectedAgentId.value || activePlantelCookie.value || "GLOBAL") || "GLOBAL",
);
const enrollmentConceptsCacheKey = computed(
  () => `${ENROLLMENT_CONCEPTS_CACHE_BASE_KEY}:${currentCicloKey.value}:${currentEnrollmentPlantelKey.value}`,
);
const optionsLoading = ref(false);
const kpisLoading = ref(false);
const studentsLoading = ref(false);
const controlStudentMutationStates = reactive({});
const controlStudentMutationTimers = new Map();
let controlStudentMutationSequence = 0;
const CONTROL_STUDENT_SUCCESS_BADGE_MS = 1400;
const savingStudent = computed(() =>
  selectedStudent.value
    ? controlStudentMutationStatus(selectedStudent.value) === "saving"
    : false,
);
const massImporting = ref(false);
const sendingHuskyPass = ref(false);
const savingHuskyPass = ref(false);
const showManualHuskyPassForm = ref(false);
const manualHuskyPassPassword = ref("");
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
const activeDetailTab = ref("summary");
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
let controlScopeReloadId = 0;
let controlInitialScopeLoading = true;
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
const CONTROL_SCREEN_MOBILE_BREAKPOINT = 820;

const controlScreenRef = ref(null);
const controlScreenScale = ref(1);
const studentsScaleShell = ref(null);
const detailBodyRef = ref(null);
const mobileDetailScrolled = ref(false);
let controlScreenResizeObserver = null;
let controlScreenFrame = null;

const controlScreenStyle = computed(() => ({
  "--ce-screen-scale": controlScreenScale.value,
}));
const studentsScaleShellStyle = computed(() => ({}));
const studentsDesignCanvasStyle = computed(() => ({}));

const updateControlScreenScale = () => {
  if (!process.client) return;
  const viewportWidth = window.innerWidth || CONTROL_SCREEN_DESIGN_WIDTH;
  if (viewportWidth <= CONTROL_SCREEN_MOBILE_BREAKPOINT) {
    controlScreenScale.value = 1;
    return;
  }
  const host = controlScreenRef.value?.parentElement;
  const rect = host?.getBoundingClientRect?.();
  const availableWidth = Math.max(900, rect?.width || viewportWidth || CONTROL_SCREEN_DESIGN_WIDTH);
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

const handleDetailBodyScroll = (event) => {
  if (!process.client) return;
  const target = event?.target || detailBodyRef.value;
  mobileDetailScrolled.value = Number(target?.scrollTop || 0) > 12;
};

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

const publishControlTopbarState = () => {
  controlEscolarTopbarState.value = {
    plantel: selectedAgentId.value || "",
    studentsCount: Number(pagination.total || students.value.length || 0),
    loading: Boolean(loadingAny.value),
    importing: Boolean(massImporting.value),
    syncStatus: String(controlDataFreshness.value || controlCacheStage.value || "idle"),
    syncMessage: controlSyncAriaLabel.value || loadError.value || "Control Escolar",
  };
};

const resetControlTopbarState = () => {
  controlEscolarTopbarState.value = {
    plantel: "",
    studentsCount: 0,
    loading: false,
    importing: false,
    syncStatus: "idle",
    syncMessage: "",
  };
};

const handleControlTopbarAction = async (event) => {
  const action = String(event?.detail?.action || "");
  if (action === "refresh") {
    await refreshAll();
    return;
  }
  if (action === "export-db") {
    exportMatriculaDb();
    return;
  }
  if (action === "import-db") openMassImportModal();
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
const groupModalOpen = ref(false);
const groupModalDraft = ref("");
const openGroupModal = () => {
  groupModalDraft.value = normalizeGroupPickerText(editForm.grupo).slice(0, 40);
  groupModalOpen.value = true;
  groupPickerOpen.value = false;
  nextTick(() => {
    if (!process.client) return;
    document.querySelector('.ce-group-modal__search input')?.focus?.();
  });
};
const closeGroupModal = () => {
  groupModalOpen.value = false;
  groupPickerOpen.value = false;
};
const confirmGroupModal = () => {
  editForm.grupo = normalizeGroupPickerText(groupModalDraft.value).slice(0, 40);
  closeGroupModal();
};
const normalizeGroupPickerText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();
const groupLabelForUi = (value) => {
  const normalized = normalizeGroupPickerText(value);
  if (!normalized) return "Sin grupo asignado";
  return studentGroupIconLabel(normalized) || normalized;
};
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
const groupModalPickerInput = computed({
  get: () => String(groupModalDraft.value || ""),
  set: (value) => {
    groupModalDraft.value = normalizeGroupPickerText(value).slice(0, 40);
  },
});
const normalizedGroupModalSearch = computed(() =>
  normalizeClientText(groupModalPickerInput.value),
);
const filteredGroupModalOptions = computed(() => {
  const query = normalizedGroupModalSearch.value;
  return knownGroupOptions.value
    .filter((value) => !query || normalizeClientText(value).includes(query))
    .map((value) => ({
      value,
      label: groupLabelForUi(value),
      selected:
        normalizeClientText(value) === normalizeClientText(groupModalDraft.value),
      sourceLabel: catalogs.grupos.includes(value)
        ? "Grupo del plantel"
        : "Sigil disponible",
    }));
});
const customGroupModalOption = computed(() => {
  const value = normalizeGroupPickerText(groupModalPickerInput.value).slice(0, 40);
  if (!value) return null;
  const exists = knownGroupOptions.value.some(
    (option) => normalizeClientText(option) === normalizeClientText(value),
  );
  if (exists) return null;
  return { value, label: `Usar “${value}”` };
});
const selectGroupModalOption = (value) => {
  groupModalDraft.value = normalizeGroupPickerText(value).slice(0, 40);
};
const clearGroupModalPicker = () => {
  groupModalDraft.value = "";
};
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
  { key: "summary", label: "Resumen", icon: LucideCheck },
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
    { key: "grupo", label: "Sin grupo", count: data.sinGrupo || 0 },
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
  if (key === "grupo" || key === "group") return LucideGraduationCap;
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
    grupo: "Sin grupo",
    sin_grupo: "Sin grupo",
    group: "Sin grupo",
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
  grupo: "Grupo",
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
    group: editForm.grupo ?? selectedStudent.value.group ?? selectedStudent.value.grupo ?? "",
    direccion: editForm.direccion || selectedStudent.value.direccion || selectedStudent.value.address || "",
  };
});
const selectedRecordHealth = computed(() => recordHealth(selectedHealthStudent.value));

const gradoOrdinalByName = {
  primero: "1°",
  primer: "1°",
  "1": "1°",
  segundo: "2°",
  "2": "2°",
  tercero: "3°",
  tercer: "3°",
  "3": "3°",
  cuarto: "4°",
  "4": "4°",
  quinto: "5°",
  "5": "5°",
  sexto: "6°",
  "6": "6°",
};
const gradoHeaderOrdinal = (grado) => {
  const key = String(grado || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return gradoOrdinalByName[key] || displayGrado(grado);
};
const selectedWorkspaceGradeLabel = computed(() => {
  const grade = selectedHealthStudent.value?.grado || selectedStudent.value?.grado;
  const ordinal = gradoHeaderOrdinal(grade);
  return ordinal ? `${ordinal} grado` : "Sin grado";
});
const selectedHuskyPassPasswordLabel = computed(() => {
  if (!selectedStudent.value?.huskyPassAvailable) return "Pendiente";
  const credential =
    selectedStudent.value?.huskyPassPlaintext ||
    selectedStudent.value?.huskyPassUsername ||
    "";
  return credential || "Activo";
});
const selectedHuskyPassAriaLabel = computed(() =>
  selectedStudent.value?.huskyPassAvailable
    ? `Abrir Husky Pass ${selectedHuskyPassPasswordLabel.value}`
    : "Abrir Husky Pass pendiente",
);
const goToHuskyPassTab = () => {
  activeDetailTab.value = "system";
};
const selectedBasicHeaderStatusLabel = computed(() => {
  if (selectedRecordHealth.value?.tone === "complete") return "Completo";
  if (studentCurpIsInvalid(selectedHealthStudent.value)) return "CURP inválida";
  const missing = selectedMissingCount.value;
  if (!missing) return selectedRecordHealth.value?.label || "Revisar";
  return missing === 1 ? "1 faltante" : `${missing} faltantes`;
});

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
  grupo: { tab: "school", formField: "grupo", shortLabel: "Grupo", label: "Grupo pendiente", icon: LucideGraduationCap },
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
const selectedLastUpdateLabel = computed(() => {
  const value = selectedStudent.value?.updatedAt || selectedStudent.value?.lastUpdatedAt || draftSavedAt.value;
  if (!value) return "Última actualización no disponible";
  try {
    const formatted = new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
    return `Última actualización: ${formatted}`;
  } catch (_) {
    return "Última actualización no disponible";
  }
});
const selectedVerificationRecencyLabel = computed(() => {
  const value = selectedStudent.value?.updatedAt || selectedStudent.value?.lastUpdatedAt || draftSavedAt.value;
  if (!value) return "Sin verificación reciente";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin verificación reciente";
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86400000);
  if (days <= 0) return "Última verificación: hoy";
  if (days === 1) return "Última verificación: ayer";
  try {
    return `Última verificación: ${new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date)}`;
  } catch (_) {
    return "Última verificación reciente";
  }
});
const selectedVisibleActionChips = computed(() => selectedRecordActions.value);
const selectedHiddenActionCount = computed(() =>
  Math.max(0, selectedRecordActions.value.length - selectedVisibleActionChips.value.length),
);
const goToMissingField = (field = {}) => {
  if (field.formField === "grupo") {
    activeDetailTab.value = "school";
    openGroupModal();
    return;
  }
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
  grupo: ["grupo"],
  curp: ["curp"],
};
const targetForFamilyArea = (key = "") => {
  const normalizedKey = String(key || "").toLowerCase();
  if (normalizedKey === "grupo") return { tab: "school", formField: "grupo" };
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
const normalizeHeaderGender = (value) => {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return "";
  if (["1", "h", "hombre", "masculino", "male", "nino", "niño"].includes(raw)) return "male";
  if (["0", "m", "mujer", "f", "femenino", "female", "nina", "niña"].includes(raw)) return "female";
  return "";
};
const selectedHeaderGenderChip = computed(() => {
  const explicit =
    normalizeHeaderGender(selectedHealthStudent.value?.sexo) ||
    normalizeHeaderGender(selectedStudent.value?.genero) ||
    normalizeHeaderGender(selectedStudent.value?.gender) ||
    normalizeHeaderGender(curpDerivedIdentity.value?.sexoCorto);
  if (explicit === "male") return { label: "Niño", tone: "male", symbol: "♂" };
  if (explicit === "female") return { label: "Niña", tone: "female", symbol: "♀" };
  return null;
});
const selectedHeaderContextTone = computed(() => selectedHeaderGenderChip.value?.tone || "neutral");
const normalizeHeaderBirthDate = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slash) return `${slash[3]}-${String(slash[2]).padStart(2, "0")}-${String(slash[1]).padStart(2, "0")}`;
  return "";
};
const selectedHeaderBirthDate = computed(() =>
  normalizeHeaderBirthDate(curpDerivedIdentity.value?.fechaNacimiento) ||
  normalizeHeaderBirthDate(selectedStudent.value?.fechaNacimiento) ||
  normalizeHeaderBirthDate(selectedStudent.value?.birth) ||
  normalizeHeaderBirthDate(selectedStudent.value?.birthDate) ||
  normalizeHeaderBirthDate(selectedStudent.value?.nacimiento),
);
const selectedHeaderBirthDateLabel = computed(() => {
  if (!selectedHeaderBirthDate.value) return "";
  const [year, month, day] = selectedHeaderBirthDate.value.split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
});
const selectedHeaderAgeChip = computed(() => {
  const age = computeAgeFromDate(selectedHeaderBirthDate.value);
  return age === null ? "" : `${age} año${age === 1 ? "" : "s"}`;
});
const goToCurpField = () => {
  goToMissingField({ tab: "identity", formField: "curp" });
};
const groupSigilTransitionKey = ref(0);
const groupSigilSwapping = ref(false);
let groupSigilSwapTimer = null;
const selectedHeaderGroupSigil = computed(() => {
  const group = normalizeGroupPickerText(editForm.grupo);
  if (!group) return null;
  const displayLabel = groupLabelForUi(group);
  return {
    value: group,
    displayLabel,
    label: `Grupo ${displayLabel}`,
  };
});
watch(
  () => normalizeGroupPickerText(editForm.grupo),
  (nextGroup, previousGroup) => {
    if (nextGroup === previousGroup || !selectedStudent.value) return;
    groupSigilTransitionKey.value += 1;
    groupSigilSwapping.value = true;
    if (groupSigilSwapTimer) globalThis.clearTimeout(groupSigilSwapTimer);
    groupSigilSwapTimer = globalThis.setTimeout(() => {
      groupSigilSwapping.value = false;
      groupSigilSwapTimer = null;
    }, 720);
  },
);
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
const selectedGroupState = computed(() => {
  const group = controlGroupLabel(selectedHealthStudent.value || selectedStudent.value);
  const missing = !group;
  return {
    key: "grupo",
    title: "Grupo",
    total: 1,
    completed: missing ? 0 : 1,
    missing: missing ? ["grupo"] : [],
    tone: missing ? "warning" : "complete",
    status: missing ? "Sin grupo" : "Listo",
    summary: missing ? "Asigna un grupo para completar el expediente básico." : `Grupo ${group} asignado.`,
  };
});
const selectedStatusSignals = computed(() => {
  const curpState = fieldValidationState("curp");
  const father = familyPersonState("padre");
  const mother = familyPersonState("madre");
  const contact = familyCriticalContactState.value;
  const group = selectedGroupState.value;
  const curpLabel =
    curpState === "ok" ? "Listo" : curpState === "invalid" ? "Inválida" : "Pendiente";
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
      key: "grupo",
      title: "Grupo",
      label: group.status,
      summary: group.summary,
      count: `${group.completed}/${group.total}`,
      tone: group.tone,
      icon: LucideGraduationCap,
    },
    {
      key: "padre",
      title: "Padre",
      label: father.status,
      summary: father.summary || "Información completa y verificada.",
      count: `${father.completed}/${father.total}`,
      tone: father.tone,
      icon: LucideUserRound,
    },
    {
      key: "madre",
      title: "Madre",
      label: mother.status,
      summary: mother.summary || "Información completa y verificada.",
      count: `${mother.completed}/${mother.total}`,
      tone: mother.tone,
      icon: LucideUsersRound,
    },
    {
      key: "contacto",
      title: "Contacto",
      label: contact.status,
      summary: contact.summary || "Información completa y verificada.",
      count: `${contact.completed}/${contact.total}`,
      tone: contact.tone,
      icon: LucidePhone,
    },
  ];
});
const selectedPendingSummary = computed(() => {
  const signals = selectedStatusSignals.value;
  const completeCount = signals.filter((signal) => signal.tone === "complete").length;
  const total = signals.length || 1;
  const allComplete = completeCount === total && selectedRecordIssueCount.value === 0;
  const tone = allComplete
    ? "complete"
    : selectedRecordHealth.value?.tone === "danger"
      ? "danger"
      : "warning";
  return {
    tone,
    icon: allComplete ? LucideCheck : LucideAlertTriangle,
    title: allComplete ? "Todo al día" : tone === "danger" ? "Requiere atención" : "Pendientes en revisión",
    summary: allComplete
      ? `Las ${completeCount} secciones requeridas están completas.`
      : `${selectedRecordIssueCount.value} pendiente${selectedRecordIssueCount.value === 1 ? "" : "s"} por resolver para completar el expediente.`,
    metrics: [
      {
        key: "sections",
        icon: LucideFileSpreadsheet,
        value: `${completeCount} de ${total}`,
        label: "Secciones completas",
      },
      {
        key: "expediente",
        icon: LucideShieldCheck,
        value: `${selectedProfileCompletion.value}%`,
        label: "Expediente básico",
      },
      allComplete
        ? {
            key: "updated",
            icon: LucideClock3,
            value: "Actualizado",
            label: selectedVerificationRecencyLabel.value,
          }
        : {
            key: "issues",
            icon: LucideAlertTriangle,
            value: `${selectedRecordIssueCount.value}`,
            label: "Pendientes activos",
            caption: selectedNextAction.value,
          },
    ],
  };
});
const detailTabState = (key) => {
  const father = familyPersonState("padre");
  const mother = familyPersonState("madre");
  const contact = familyCriticalContactState.value;
  const familyPending = father.missing.length + mother.missing.length + contact.missing.length;
  const states = {
    summary: {
      tone: selectedRecordIssueCount.value ? selectedRecordHealth.value.tone : "complete",
      count: selectedRecordIssueCount.value,
    },
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
const EDIT_FORM_SAVE_VALIDATION_FIELDS = [
  "curp",
  "telefonoPadre",
  "telefonoMadre",
  "emailPadre",
  "emailMadre",
];

const editableInvalidFields = (fields = EDIT_FORM_SAVE_VALIDATION_FIELDS) =>
  fields.filter(
    (field) =>
      EDIT_FORM_SAVE_VALIDATION_FIELDS.includes(field) &&
      fieldValidationState(field) === "invalid",
  );
const huskyPassEmailTarget = computed(
  () =>
    selectedStudent.value?.emailPadre ||
    selectedStudent.value?.emailMadre ||
    selectedStudent.value?.email ||
    selectedStudent.value?.huskyPassEmail ||
    "",
);
const huskyPassManualPasswordValid = computed(() => {
  const value = String(manualHuskyPassPassword.value || "").trim();
  return value.length >= 6 && value.length <= 64;
});
const huskyPassGenerateLabel = computed(() => {
  if (savingHuskyPass.value) return "Guardando...";
  return selectedStudent.value?.huskyPassAvailable ? "Regenerar contraseña" : "Generar acceso";
});
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

const formatNameValue = (value) => toNameDisplayCase(value);

const formatNameField = (field) => {
  if (!isControlEscolarNameField(field)) return;
  editForm[field] = formatNameValue(editForm[field]);
};

const formatEditNameFields = () => {
  CONTROL_ESCOLAR_EDIT_NAME_FIELDS.forEach(formatNameField);
};

const onParentLastNameBlur = (field) => {
  hideParentLastNameSuggestion();
  formatNameField(field);
};

const readEditForm = ({ normalizeNames = false } = {}) =>
  EDIT_FORM_FIELDS.reduce((draft, field) => {
    const value = editForm[field] ?? "";
    draft[field] = normalizeNames && isControlEscolarNameField(field)
      ? formatNameValue(value)
      : value;
    return draft;
  }, {});

const parseEditSnapshot = () => {
  try {
    const parsed = JSON.parse(editSnapshot.value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const editFieldValuesEqual = (field, currentValue, snapshotValue) => {
  if (field === "baja") return Number(currentValue || 0) === Number(snapshotValue || 0);
  return String(currentValue ?? "") === String(snapshotValue ?? "");
};

const readDirtyEditForm = ({ normalizeNames = false } = {}) => {
  const current = readEditForm({ normalizeNames });
  const snapshot = parseEditSnapshot();
  return EDIT_FORM_FIELDS.reduce((draft, field) => {
    if (!editFieldValuesEqual(field, current[field], snapshot[field])) {
      draft[field] = current[field];
    }
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
  saveError.value
    ? "error"
    : hasUnsavedChanges.value
      ? "dirty"
      : "clean",
);
const saveStatusText = computed(() => {
  if (saveError.value) return "Error al guardar";
  if (hasUnsavedChanges.value)
    return draftSavedAt.value
      ? `Borrador local ${draftSavedAt.value}`
      : "Cambios sin guardar";
  return selectedStudent.value?.overlayExists ? "Al día" : "Guardar";
});
const draftKey = computed(() =>
  draftStorageKeyFor(selectedAgentId.value, selectedStudent.value?.matricula),
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

const normalizeControlScopeConcepts = (value = "") =>
  String(value || "")
    .split(",")
    .map((concept) => concept.trim())
    .filter(Boolean)
    .join(",");

const controlScopeSignatureFromQuery = (query = buildScopeQuery()) =>
  JSON.stringify({
    agentId: String(query?.agentId || "").trim(),
    ciclo: normalizeCicloKey(query?.ciclo || ""),
    concepts: normalizeControlScopeConcepts(query?.concepts),
    tipoConcepts: normalizeControlScopeConcepts(query?.tipoConcepts),
  });

const currentControlScopeSignature = () =>
  controlScopeSignatureFromQuery(buildScopeQuery());

const isCurrentControlScopeSignature = (scopeSignature = "") =>
  scopeSignature === currentControlScopeSignature();

const loadOptions = async () => {
  optionsLoading.value = true;
  try {
    const activeCookiePlantel = readActiveControlPlantelCookie();
    const response = await $fetch("/api/control-escolar/options", {
      cache: "no-store",
      query: { _scope: Date.now() },
    });
    const responsePlantel = controlSpecificPlantel(response?.activePlantel);
    loadError.value = "";

    if (activeCookiePlantel && responsePlantel && responsePlantel !== activeCookiePlantel) {
      console.warn("[Control Escolar] Ignorando opciones con plantel activo obsoleto.", {
        cookiePlantel: activeCookiePlantel,
        responsePlantel,
      });
      selectedAgentId.value = activeCookiePlantel;
      return;
    }

    selectedAgentId.value = responsePlantel || activeCookiePlantel || "";
  } catch (error) {
    selectedAgentId.value = readActiveControlPlantelCookie();
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
      cache: "no-store",
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

const draftStorageKeyFor = (agentId, matricula) => {
  const key = normalizeMatriculaKey(matricula);
  if (!agentId || !key) return "";
  return `control-escolar:draft:${agentId}:${key}`;
};

const mutationKeyFor = (studentOrMatricula) =>
  normalizeMatriculaKey(
    typeof studentOrMatricula === "object"
      ? studentOrMatricula?.matricula
      : studentOrMatricula,
  );

const clearControlStudentMutationTimer = (key) => {
  const timer = controlStudentMutationTimers.get(key);
  if (timer) globalThis.clearTimeout(timer);
  controlStudentMutationTimers.delete(key);
};

const setControlStudentMutationState = (studentOrMatricula, state = null) => {
  const key = mutationKeyFor(studentOrMatricula);
  if (!key) return;
  clearControlStudentMutationTimer(key);
  if (!state) {
    delete controlStudentMutationStates[key];
    return;
  }
  controlStudentMutationStates[key] = {
    status: "saving",
    message: "",
    operationId: 0,
    updatedAt: Date.now(),
    ...state,
  };
};

const scheduleControlStudentMutationClear = (studentOrMatricula, operationId, delay = CONTROL_STUDENT_SUCCESS_BADGE_MS) => {
  const key = mutationKeyFor(studentOrMatricula);
  if (!key) return;
  clearControlStudentMutationTimer(key);
  const timer = globalThis.setTimeout(() => {
    if (controlStudentMutationStates[key]?.operationId === operationId) {
      delete controlStudentMutationStates[key];
    }
    controlStudentMutationTimers.delete(key);
  }, delay);
  controlStudentMutationTimers.set(key, timer);
};

const clearControlStudentMutationStates = () => {
  controlStudentMutationTimers.forEach((timer) => globalThis.clearTimeout(timer));
  controlStudentMutationTimers.clear();
  Object.keys(controlStudentMutationStates).forEach((key) => {
    delete controlStudentMutationStates[key];
  });
};

const controlStudentMutationState = (studentOrMatricula) =>
  controlStudentMutationStates[mutationKeyFor(studentOrMatricula)] || null;

const controlStudentMutationStatus = (studentOrMatricula) =>
  controlStudentMutationState(studentOrMatricula)?.status || "";

const controlStudentMutationClass = (studentOrMatricula) => {
  const status = controlStudentMutationStatus(studentOrMatricula);
  return status ? `is-mutation-${status}` : "";
};

const controlStudentMutationTitle = (studentOrMatricula) => {
  const state = controlStudentMutationState(studentOrMatricula);
  if (!state) return "";
  if (state.status === "saving") return "Guardando cambios";
  if (state.status === "failed") return state.message || "No se pudo guardar";
  return "Cambios guardados";
};

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
  if (normalized === "grupo" || normalized === "group" || normalized === "sin_grupo")
    return controlMissingGroup(student);
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
  clearControlStudentMutationStates();
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
    sinGrupo: progressRows.filter(controlMissingGroup).length,
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
  const requestScopeSignature = controlScopeSignatureFromQuery(query);
  const hadVisibleStudents =
    controlStudentsIndex.value.length > 0 || students.value.length > 0;
  if (clearExisting) resetControlStudentsView();
  const hasVisibleStudents =
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
    studentsLoading.value = forceLoading || clearExisting || !hasVisibleStudents;
    controlDataFreshness.value =
      hasVisibleStudents ? controlDataFreshness.value : "empty";
    controlDataSavedAt.value = "";
    if (!hasVisibleStudents) controlExternalDbRows.value = 0;
  }

  const canKeepVisibleData = () =>
    Boolean(cached) ||
    (!clearExisting &&
      isCurrentControlScopeSignature(requestScopeSignature) &&
      (hadVisibleStudents ||
        controlStudentsIndex.value.length > 0 ||
        students.value.length > 0));

  try {
    controlBaseStage.value = "loading";
    controlExternalDbStage.value = "loading";
    controlCompleteStage.value = "loading";
    const requestStartedAt = controlNow();
    const response = await $fetch("/api/control-escolar/students", {
      cache: "no-store",
      query: { ...query, phase: "enriched" },
    });
    markClientStep(
      "server-enriched",
      "Base como selector + matricula enriquecida",
      requestStartedAt,
      "ready",
      { rows: Array.isArray(response?.data) ? response.data.length : 0 },
    );
    if (
      requestId !== controlStudentsRequestId ||
      !isCurrentControlScopeSignature(requestScopeSignature)
    )
      return;

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
    if (
      requestId !== controlStudentsRequestId ||
      !isCurrentControlScopeSignature(requestScopeSignature)
    )
      return;
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

const reloadControlStudentsForCurrentScope = async ({
  clearExisting = true,
  refreshEnrollmentConfig = true,
} = {}) => {
  if (!selectedAgentId.value) return;

  const reloadId = ++controlScopeReloadId;
  pagination.page = 1;

  if (clearExisting) resetControlStudentsView();
  loadError.value = "";
  studentsLoading.value = true;
  kpisLoading.value = true;
  publishControlSyncIndicatorState({
    status: "syncing",
    message: "Cargando Control Escolar",
  });

  try {
    if (refreshEnrollmentConfig) {
      hydrateCachedEnrollmentConcepts({ replaceExisting: true });
      await loadEnrollmentConfig({ refreshStudents: false });
      if (reloadId !== controlScopeReloadId) return;
    }

    await refreshAll({
      clearExisting,
      forceLoading: true,
      forceNetwork: true,
    });
  } finally {
    if (reloadId === controlScopeReloadId) {
      studentsLoading.value = false;
      kpisLoading.value = false;
    }
  }
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

const clearEditDraftForStudent = (matricula, agentId = selectedAgentId.value) => {
  const key = draftStorageKeyFor(agentId, matricula);
  if (!process.client || !key) return;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo limpiar el borrador local.",
      error,
    );
  }
};

const clearEditDraft = () => {
  if (selectedStudent.value?.matricula) {
    clearEditDraftForStudent(selectedStudent.value.matricula);
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
  activeDetailTab.value = "summary";
  closeManualHuskyPassForm();
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

const readEditFormFromStudent = (student = {}) => ({
  nombres: toNameDisplayCase(student.nombres || ""),
  apellidoPaterno: toNameDisplayCase(student.apellidoPaterno || ""),
  apellidoMaterno: toNameDisplayCase(student.apellidoMaterno || ""),
  curp: student.curp || "",
  nombreVerificado: toNameDisplayCase(student.nombreVerificado || ""),
  nombreCompletoAlumno: toNameDisplayCase(student.nombreCompletoAlumno || student.fullName || ""),
  lugarNacimiento: student.lugarNacimiento || "",
  sexo: student.sexo || "",
  talla: student.talla || "",
  peso: student.peso || "",
  tipoSangre: student.tipoSangre || "",
  alergias: student.alergias || "",
  foto: student.foto || "",
  grupo: student.group || student.grupo || "",
  baja: Number(student.baja || 0),
  motivoBaja: student.motivoBaja || "",
  categoriaBaja: student.categoriaBaja || "",
  seguimientoBaja: student.seguimientoBaja || "",
  nombrePadre: toNameDisplayCase(student.nombrePadre || ""),
  apellidoPaternoPadre: toNameDisplayCase(student.apellidoPaternoPadre || ""),
  apellidoMaternoPadre: toNameDisplayCase(student.apellidoMaternoPadre || ""),
  estadoCivilPadre: student.estadoCivilPadre || "",
  fechaNacimientoPadre: normalizeDateInput(student.fechaNacimientoPadre),
  inePadre: student.inePadre || "",
  curpPadre: student.curpPadre || "",
  nombreMadre: toNameDisplayCase(student.nombreMadre || ""),
  apellidoPaternoMadre: toNameDisplayCase(student.apellidoPaternoMadre || ""),
  apellidoMaternoMadre: toNameDisplayCase(student.apellidoMaternoMadre || ""),
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

const buildOptimisticControlStudent = (baseStudent = {}, payload = {}) => {
  const hasPayloadField = (field) => Object.prototype.hasOwnProperty.call(payload, field);
  const next = {
    ...baseStudent,
    ...payload,
  };
  const fullName = [next.nombres, next.apellidoPaterno, next.apellidoMaterno]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  next.fullName = fullName || next.nombreCompletoAlumno || baseStudent.fullName || "";
  next.nombreCompletoAlumno = next.fullName;
  next.address = hasPayloadField("direccion")
    ? payload.direccion
    : baseStudent.address ?? baseStudent.direccion ?? "";
  next.direccion = next.address;
  next.group = hasPayloadField("grupo")
    ? payload.grupo
    : baseStudent.group ?? baseStudent.grupo ?? "";
  next.grupo = next.group;
  next.baja = Number(hasPayloadField("baja") ? payload.baja : baseStudent.baja || 0);
  next.status = next.baja
    ? "Baja"
    : hasPayloadField("baja")
      ? "Activo"
      : baseStudent.status || "Activo";
  const completenessTiers = resolveControlEscolarCompleteness(next, { honorEnrollmentState: true });
  next.completenessTiers = completenessTiers;
  next.completion = completenessTiers?.basic?.progress ?? next.completion ?? 0;
  next.completeness = next.completion;
  next.missingFields = completenessTiers?.basic?.missingFields || [];
  return next;
};

const persistEditDraftForStudent = (matricula, values) => {
  const key = draftStorageKeyFor(selectedAgentId.value, matricula);
  if (!process.client || !key || !values || typeof values !== "object") return;
  const savedAt = new Date().toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt, values }));
    if (normalizeMatriculaKey(selectedStudent.value?.matricula) === normalizeMatriculaKey(matricula)) {
      draftSavedAt.value = savedAt;
      draftRestored.value = true;
    }
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo conservar el borrador fallido.",
      error,
    );
  }
};

const reconcileControlKpisInBackground = () => {
  kpis.value = buildClientKpisFromStudents(controlStudentsIndex.value);
  const query = buildScopeQuery();
  const scopeSignature = controlScopeSignatureFromQuery(query);
  $fetch("/api/control-escolar/kpis", { cache: "no-store", query })
    .then((response) => {
      if (isCurrentControlScopeSignature(scopeSignature) && response?.kpis) {
        kpis.value = response.kpis;
      }
    })
    .catch((error) => {
      console.warn(
        "[Control Escolar] No se pudo reconciliar KPIs después de guardar.",
        error?.message || error,
      );
    });
};

const saveStudent = async () => {
  if (!selectedStudent.value || !selectedAgentId.value) return;
  const selectedKey = normalizeMatriculaKey(selectedStudent.value.matricula);
  if (!selectedKey || controlStudentMutationStatus(selectedStudent.value) === "saving") return;
  if (uploadingAdvancedField.value) {
    saveError.value = "Espera a que termine la carga del archivo.";
    return;
  }
  formatEditNameFields();
  const payload = readDirtyEditForm({ normalizeNames: true });
  const dirtyFields = Object.keys(payload);
  if (!dirtyFields.length) {
    clearEditDraft();
    saveError.value = "";
    editSnapshot.value = formSnapshot();
    return;
  }

  const invalidFields = editableInvalidFields(dirtyFields);
  if (invalidFields.length) {
    const fieldLabels = invalidFields
      .map((field) => invalidFieldTargets[field]?.shortLabel || field)
      .join(", ");
    saveError.value = `Revisa ${fieldLabels} antes de guardar.`;
    return;
  }
  const rollbackStudent = { ...selectedStudent.value };
  const optimisticStudent = buildOptimisticControlStudent(rollbackStudent, payload);
  const operationId = ++controlStudentMutationSequence;

  saveError.value = "";
  setControlStudentMutationState(selectedKey, { status: "saving", operationId });
  replaceControlStudentInIndex(optimisticStudent);
  selectedStudent.value = optimisticStudent;
  pendingSelectedStudentRefresh.value = null;
  resetEditForm(optimisticStudent, { restoreDraft: false });
  kpis.value = buildClientKpisFromStudents(controlStudentsIndex.value);
  persistCurrentControlStudentsCache({ optimistic: true });

  try {
    const response = await $fetch(
      `/api/control-escolar/students/${encodeURIComponent(rollbackStudent.matricula)}`,
      {
        method: "PATCH",
        query: buildScopeQuery(),
        body: payload,
      },
    );
    if (controlStudentMutationState(selectedKey)?.operationId !== operationId) return;

    if (response.student) {
      replaceControlStudentInIndex(response.student);
      clearEditDraftForStudent(rollbackStudent.matricula);
      if (normalizeMatriculaKey(selectedStudent.value?.matricula) === selectedKey) {
        selectedStudent.value = response.student;
        pendingSelectedStudentRefresh.value = null;
        clearEditDraft();
        resetEditForm(response.student, { restoreDraft: false });
      }
      persistCurrentControlStudentsCache();
      kpis.value = buildClientKpisFromStudents(controlStudentsIndex.value);
    }
    setControlStudentMutationState(selectedKey, { status: "saved", operationId });
    scheduleControlStudentMutationClear(selectedKey, operationId);
    show("Ficha de Control Escolar guardada.", "success");
    reconcileControlKpisInBackground();
  } catch (error) {
    if (controlStudentMutationState(selectedKey)?.operationId !== operationId) return;
    const message =
      error?.data?.message || error?.message || "No se pudo guardar la ficha.";
    replaceControlStudentInIndex(rollbackStudent);
    kpis.value = buildClientKpisFromStudents(controlStudentsIndex.value);
    persistCurrentControlStudentsCache({ rollback: true });
    persistEditDraftForStudent(rollbackStudent.matricula, payload);
    setControlStudentMutationState(selectedKey, {
      status: "failed",
      operationId,
      message,
    });
    if (normalizeMatriculaKey(selectedStudent.value?.matricula) === selectedKey) {
      selectedStudent.value = rollbackStudent;
      Object.assign(editForm, payload);
      editSnapshot.value = JSON.stringify(readEditFormFromStudent(rollbackStudent));
      saveError.value = message;
    }
    show(message, "error");
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
  params.set("_scope", String(Date.now()));
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
  params.set("_scope", String(Date.now()));
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

const applyHuskyPassStudentUpdate = (student) => {
  if (!student?.matricula) return;
  replaceControlStudentInIndex(student);
  selectedStudent.value = student;
  pendingSelectedStudentRefresh.value = null;
  persistCurrentControlStudentsCache();
};

const closeManualHuskyPassForm = () => {
  showManualHuskyPassForm.value = false;
  manualHuskyPassPassword.value = "";
};

const toggleManualHuskyPassForm = () => {
  showManualHuskyPassForm.value = !showManualHuskyPassForm.value;
  manualHuskyPassPassword.value = selectedStudent.value?.huskyPassPlaintext || "";
};

const saveHuskyPassPassword = async (body) => {
  if (!selectedStudent.value || !selectedAgentId.value || savingHuskyPass.value)
    return;
  savingHuskyPass.value = true;
  try {
    const response = await $fetch(
      `/api/control-escolar/students/${encodeURIComponent(selectedStudent.value.matricula)}/husky-pass`,
      {
        method: "POST",
        query: buildScopeQuery(),
        body,
      },
    );
    if (response.student) applyHuskyPassStudentUpdate(response.student);
    closeManualHuskyPassForm();
    show("Husky Pass actualizado.", "success");
    await loadKpis();
  } catch (error) {
    show(
      error?.data?.message || error?.message || "No se pudo actualizar Husky Pass.",
      "danger",
    );
  } finally {
    savingHuskyPass.value = false;
  }
};

const generateOrRegenerateHuskyPass = async () => {
  await saveHuskyPassPassword({
    action: selectedStudent.value?.huskyPassAvailable ? "regenerate" : "generate",
  });
};

const saveManualHuskyPassPassword = async () => {
  if (!huskyPassManualPasswordValid.value) {
    show("La contraseña debe tener entre 6 y 64 caracteres.", "danger");
    return;
  }
  await saveHuskyPassPassword({
    action: "manual",
    plaintext: manualHuskyPassPassword.value,
  });
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
  if (!process.client) return;
  try {
    if (!currentConceptIds.length && !tipoIngresoConceptIds.length) {
      localStorage.removeItem(enrollmentConceptsCacheKey.value);
      return;
    }
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

const hydrateCachedEnrollmentConcepts = ({ replaceExisting = false } = {}) => {
  if (!process.client) return;
  if (!replaceExisting && externalConcepts.value.length) return;

  try {
    const parsed = JSON.parse(
      localStorage.getItem(enrollmentConceptsCacheKey.value) || "null",
    );
    const currentConceptIds = normalizeEnrollmentConceptIds(parsed?.currentConcepts || parsed?.concepts);
    const tipoIngresoConceptIds = normalizeEnrollmentConceptIds(parsed?.tipoIngresoConcepts || currentConceptIds);
    externalConcepts.value = currentConceptIds;
    tipoIngresoConcepts.value = tipoIngresoConceptIds.length
      ? tipoIngresoConceptIds
      : currentConceptIds;
  } catch (error) {
    if (replaceExisting) {
      externalConcepts.value = [];
      tipoIngresoConcepts.value = [];
    }
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
  externalConcepts.value = currentConceptIds;
  tipoIngresoConcepts.value = tipoIngresoConceptIds.length
    ? tipoIngresoConceptIds
    : currentConceptIds;
  cacheEnrollmentConcepts({ current: externalConcepts.value, tipoIngreso: tipoIngresoConcepts.value });
};

const loadEnrollmentConfig = async ({ refreshStudents = false } = {}) => {
  const previousConcepts = externalConcepts.value.join("|");
  const previousTipoConcepts = tipoIngresoConcepts.value.join("|");

  try {
    const configData = await $fetch("/api/control-escolar/enrollment-config", { cache: "no-store" });
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
      clearExisting: true,
      forceLoading: true,
      forceNetwork: true,
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
  () => [selectedAgentId.value, currentCicloKey.value],
  ([nextAgent], [previousAgent]) => {
    if (!nextAgent || controlInitialScopeLoading) return;
    if (
      !previousAgent &&
      controlStudentsIndex.value.length === 0 &&
      studentsLoading.value
    )
      return;
    reloadControlStudentsForCurrentScope({
      clearExisting: true,
      refreshEnrollmentConfig: true,
    });
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
watch(
  selectedStudent,
  (student) => {
    controlEscolarDetailOpen.value = Boolean(student);
    mobileDetailScrolled.value = false;
    nextTick(() => {
      if (detailBodyRef.value) detailBodyRef.value.scrollTop = 0;
    });
    queueControlStudentPhotos(student ? [student] : [], { priority: true });
  },
  { immediate: true },
);
watch(
  [
    selectedAgentId,
    () => pagination.total,
    () => students.value.length,
    loadingAny,
    massImporting,
    controlDataFreshness,
    controlCacheStage,
    controlBaseStage,
    controlExternalDbStage,
    controlCompleteStage,
    loadError,
  ],
  publishControlTopbarState,
  { immediate: true },
);

const handleCicloChanged = (event) => {
  const previousCiclo = currentCicloKey.value;
  const cicloKey = normalizeCicloOption(
    event?.detail?.ciclo || cicloCookie.value || state.value?.ciclo,
  );
  if (state.value.ciclo !== cicloKey) state.value.ciclo = cicloKey;
  cicloCookie.value = cicloKey;
  if (normalizeCicloKey(cicloKey) === previousCiclo)
    reloadControlStudentsForCurrentScope({
      clearExisting: true,
      refreshEnrollmentConfig: true,
    });
};

onMounted(async () => {
  scheduleControlScreenScaleUpdate();
  if (process.client) {
    clearControlStudentsBrowserCache();
    localHour.value = new Date().getHours();
    window.addEventListener("ingresos:ciclo-changed", handleCicloChanged);
    window.addEventListener("control-escolar:open-sync-diagnostics", openControlDiagnosticsModal);
    window.addEventListener("control-escolar:topbar-action", handleControlTopbarAction);
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
  hydrateCachedEnrollmentConcepts({ replaceExisting: true });

  try {
    await loadOptions();

    if (selectedAgentId.value) {
      await reloadControlStudentsForCurrentScope({
        clearExisting: true,
        refreshEnrollmentConfig: true,
      });
    }
  } finally {
    controlInitialScopeLoading = false;
  }
});

onBeforeUnmount(() => {
  if (process.client) {
    window.removeEventListener("ingresos:ciclo-changed", handleCicloChanged);
    window.removeEventListener("control-escolar:open-sync-diagnostics", openControlDiagnosticsModal);
    window.removeEventListener("control-escolar:topbar-action", handleControlTopbarAction);
    window.removeEventListener("resize", scheduleControlScreenScaleUpdate);
    if (controlScreenFrame) window.cancelAnimationFrame(controlScreenFrame);
  }
  controlScreenResizeObserver?.disconnect?.();
  if (groupSigilSwapTimer) {
    globalThis.clearTimeout(groupSigilSwapTimer);
    groupSigilSwapTimer = null;
  }
  clearControlStudentMutationStates();
  controlEscolarDetailOpen.value = false;
  resetControlTopbarState();
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
  overflow: visible;
  color: var(--ce-ink);
  font-size: 13.5px;
  font-weight: 900;
  line-height: 1.12;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
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

.control-escolar-screen .ce-row-save-indicator {
  --ce-row-save-accent: #2b67a6;
  --ce-row-save-soft: #eef5ff;
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--ce-row-save-accent) 28%, #dce7f2);
  border-radius: 11px;
  background: var(--ce-row-save-soft);
  color: var(--ce-row-save-accent);
  box-shadow: 0 8px 16px color-mix(in srgb, var(--ce-row-save-accent) 12%, transparent);
}

.control-escolar-screen .ce-row-save-indicator.is-saved {
  --ce-row-save-accent: var(--ce-green-strong);
  --ce-row-save-soft: #edf8ea;
}

.control-escolar-screen .ce-row-save-indicator.is-failed {
  --ce-row-save-accent: var(--ce-danger);
  --ce-row-save-soft: #fff0ef;
}

.control-escolar-screen .ce-student-row.is-mutation-saving {
  border-color: color-mix(in srgb, #2b67a6 32%, rgba(219, 230, 240, 0.98));
}

.control-escolar-screen .ce-student-row.is-mutation-failed {
  border-color: color-mix(in srgb, var(--ce-danger) 34%, rgba(219, 230, 240, 0.98));
}

.control-escolar-screen .ce-student-row.is-mutation-saved {
  border-color: color-mix(in srgb, var(--ce-green-strong) 30%, rgba(219, 230, 240, 0.98));
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


.control-escolar-screen .ce-student-hero-group-cta {
  width: clamp(198px, 16.5vw, 252px);
  justify-content: start;
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

.control-escolar-screen .ce-group-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 29, 53, .23);
  backdrop-filter: blur(12px);
}

.control-escolar-screen .ce-group-modal {
  display: grid;
  width: min(720px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  border: 1px solid rgba(216, 228, 239, .98);
  border-radius: 30px;
  background:
    radial-gradient(circle at 0 0, rgba(63, 145, 56, .07), transparent 32%),
    rgba(255,255,255,.98);
  box-shadow: 0 32px 88px rgba(15, 29, 53, .25), inset 0 1px 0 rgba(255,255,255,.94);
}

.control-escolar-screen .ce-group-modal__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 22px 24px 16px;
  border-bottom: 1px solid #e4edf5;
}

.control-escolar-screen .ce-group-modal__icon,
.control-escolar-screen .ce-group-modal__header > button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
}

.control-escolar-screen .ce-group-modal__icon {
  width: 50px;
  height: 50px;
  background: #eef8eb;
  color: var(--ce-green-strong);
}

.control-escolar-screen .ce-group-modal__header div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.control-escolar-screen .ce-group-modal__header small {
  color: #4c8d51;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.control-escolar-screen .ce-group-modal__header h2 {
  margin: 0;
  color: #13213a;
  font-size: 24px;
  font-weight: 950;
  letter-spacing: -.04em;
}

.control-escolar-screen .ce-group-modal__header p {
  margin: 0;
  overflow: hidden;
  color: #6c7a91;
  font-size: 12px;
  font-weight: 760;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-group-modal__header > button {
  width: 44px;
  height: 44px;
  border: 1px solid #dbe6f0;
  background: #fff;
  color: #63738b;
  cursor: pointer;
}

.control-escolar-screen .ce-group-modal__body {
  display: grid;
  align-content: start;
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding: 18px 24px 20px;
}

.control-escolar-screen .ce-group-modal__preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  min-height: 108px;
  padding: 16px;
  border: 1px solid #dfeaf3;
  border-radius: 24px;
  background:
    radial-gradient(circle at 24% 14%, rgba(255,255,255,.98), transparent 35%),
    linear-gradient(135deg, #ffffff 0%, #f8fbf9 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
}

.control-escolar-screen .ce-group-modal__preview.is-empty {
  border-color: rgba(213, 139, 33, .22);
  background: linear-gradient(135deg, #fff 0%, #fff9ed 100%);
}

.control-escolar-screen .ce-group-modal__preview-art {
  display: inline-grid;
  width: 76px;
  height: 76px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--ce-green-strong) 18%, #dfeaf3);
  border-radius: 24px;
  background:
    radial-gradient(circle at 35% 26%, rgba(255,255,255,.98), rgba(255,255,255,.52) 48%, transparent 49%),
    #f3faf1;
  color: var(--ce-green-strong);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.76), 0 14px 24px rgba(63,145,56,.08);
}

.control-escolar-screen .ce-group-modal__preview-art .ui-group-icon {
  --group-icon-size: 54px;
  --group-icon-letter-font-size: .52em;
  --group-icon-stroke-width: .052em;
}

.control-escolar-screen .ce-group-modal__preview div {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.control-escolar-screen .ce-group-modal__preview small {
  color: #4c8d51;
  font-size: 10.5px;
  font-weight: 900;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.control-escolar-screen .ce-group-modal__preview strong {
  overflow: hidden;
  color: #14233c;
  font-size: 22px;
  font-weight: 950;
  letter-spacing: -.035em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-group-modal__preview p {
  margin: 0;
  color: #6f7d93;
  font-size: 12px;
  font-weight: 740;
}

.control-escolar-screen .ce-group-modal__search {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 13px;
  border: 1px solid #d8e3ee;
  border-radius: 16px;
  background: rgba(255,255,255,.96);
  color: #69788e;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.96);
  transition: border-color .18s ease, box-shadow .18s ease;
}

.control-escolar-screen .ce-group-modal__search:focus-within {
  border-color: rgba(63,145,56,.36);
  box-shadow: 0 12px 24px rgba(63,145,56,.08), inset 0 1px 0 rgba(255,255,255,.96);
}

.control-escolar-screen .ce-group-modal__search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #15233a;
  font-size: 13px;
  font-weight: 800;
}

.control-escolar-screen .ce-group-modal__search button {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: #eef2f7;
  color: #60708a;
  cursor: pointer;
}

.control-escolar-screen .ce-group-modal__slider-wrap {
  display: grid;
  gap: 10px;
}

.control-escolar-screen .ce-group-modal__slider-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  padding-inline: 2px;
}

.control-escolar-screen .ce-group-modal__slider-heading strong {
  color: #14233c;
  font-size: 13px;
  font-weight: 930;
}

.control-escolar-screen .ce-group-modal__slider-heading small {
  color: #7b8798;
  font-size: 11px;
  font-weight: 760;
}

.control-escolar-screen .ce-group-sigil-slider {
  display: grid;
  grid-auto-columns: minmax(116px, 132px);
  grid-auto-flow: column;
  gap: 10px;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  padding: 2px 2px 12px;
  scroll-snap-type: inline proximity;
  scrollbar-color: rgba(63,145,56,.48) rgba(221,231,240,.7);
  scrollbar-width: thin;
}

.control-escolar-screen .ce-group-sigil-slider::-webkit-scrollbar {
  height: 8px;
}

.control-escolar-screen .ce-group-sigil-slider::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(221,231,240,.7);
}

.control-escolar-screen .ce-group-sigil-slider::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(63,145,56,.48);
}

.control-escolar-screen .ce-group-sigil-option {
  display: grid;
  min-height: 142px;
  align-content: center;
  justify-items: center;
  gap: 8px;
  padding: 12px 10px;
  border: 1px solid #dfe8f1;
  border-radius: 22px;
  background: rgba(255,255,255,.92);
  color: #53637a;
  font-family: inherit;
  text-align: center;
  scroll-snap-align: start;
  cursor: pointer;
  transition: border-color .18s ease, background .18s ease, box-shadow .18s ease, transform .18s ease, color .18s ease;
}

.control-escolar-screen .ce-group-sigil-option:hover,
.control-escolar-screen .ce-group-sigil-option.selected {
  border-color: rgba(63,145,56,.34);
  background: linear-gradient(180deg, #fff 0%, #f5fbf3 100%);
  color: var(--ce-green-strong);
  box-shadow: 0 14px 28px rgba(63,145,56,.11), inset 0 1px 0 rgba(255,255,255,.92);
  transform: translateY(-1px);
}

.control-escolar-screen .ce-group-sigil-option.custom {
  border-style: dashed;
}

.control-escolar-screen .ce-group-sigil-option__art {
  display: inline-grid;
  width: 60px;
  height: 60px;
  place-items: center;
  border: 1px solid color-mix(in srgb, currentColor 18%, #dfe8f1);
  border-radius: 20px;
  background:
    radial-gradient(circle at 35% 26%, rgba(255,255,255,.98), rgba(255,255,255,.52) 48%, transparent 49%),
    color-mix(in srgb, currentColor 7%, #fff);
}

.control-escolar-screen .ce-group-sigil-option__art .ui-group-icon {
  --group-icon-size: 42px;
  --group-icon-letter-font-size: .52em;
  --group-icon-stroke-width: .052em;
}

.control-escolar-screen .ce-group-sigil-option strong {
  overflow: hidden;
  max-width: 100%;
  color: #15233a;
  font-size: 12px;
  font-weight: 920;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-group-sigil-option small,
.control-escolar-screen .ce-group-empty {
  color: #718096;
  font-size: 10.5px;
  font-weight: 760;
  line-height: 1.15;
}

.control-escolar-screen .ce-group-empty {
  display: grid;
  min-height: 118px;
  align-content: center;
  padding: 12px;
  text-align: center;
}

.control-escolar-screen .ce-group-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 22px;
  border-top: 1px solid #e4edf5;
  background: rgba(255,255,255,.9);
}

.control-escolar-screen .ce-group-modal__secondary,
.control-escolar-screen .ce-group-modal__primary {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 17px;
  border-radius: 15px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.control-escolar-screen .ce-group-modal__secondary {
  border: 1px solid #dbe6f0;
  background: #fff;
  color: #5f7088;
}

.control-escolar-screen .ce-group-modal__primary {
  border: 1px solid rgba(63, 145, 56, .26);
  background: linear-gradient(180deg, #43ad44, #2d982f);
  color: #fff;
  box-shadow: 0 12px 24px rgba(45, 152, 47, .22);
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

.control-escolar-screen .ce-husky-action-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.control-escolar-screen .ce-husky-empty strong {
  color: #1f2f45;
  font-size: 12px;
  font-weight: 900;
}

.control-escolar-screen .ce-husky-empty small {
  color: #65758a;
  font-size: 11px;
  font-weight: 720;
}

.control-escolar-screen .ce-husky-manual-form {
  display: grid;
  gap: 10px;
  padding: 13px;
  border: 1px solid rgba(63, 145, 56, .18);
  border-radius: 14px;
  background: #f8fcf6;
}

.control-escolar-screen .ce-husky-manual-form label {
  display: grid;
  gap: 6px;
}

.control-escolar-screen .ce-husky-manual-form label span {
  color: #65758a;
  font-size: 10.5px;
  font-weight: 850;
  letter-spacing: .035em;
  text-transform: uppercase;
}

.control-escolar-screen .ce-husky-manual-form input {
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid #d8e4ef;
  border-radius: 12px;
  background: #fff;
  color: #1f2f45;
  font-size: 13px;
  font-weight: 780;
  outline: none;
}

.control-escolar-screen .ce-husky-manual-form input:focus {
  border-color: rgba(63, 145, 56, .45);
  box-shadow: 0 0 0 3px rgba(63, 145, 56, .1);
}

.control-escolar-screen .ce-husky-manual-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
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

/* Production readability pass. */
.control-escolar-screen {
  --ce-control-height: 44px;
  --ce-row-height-comfortable: 80px;
  --ce-radius-panel: 16px;
  --ce-radius-card: 14px;
}

.control-escolar-screen :is(h1, h2, h3, h4) {
  letter-spacing: 0;
}

.control-escolar-screen .ce-hero {
  min-height: 54px;
  margin-bottom: 10px;
}

.control-escolar-screen .ce-hero-actions {
  gap: 12px;
}

.control-escolar-screen .ce-hero-actions :deep(.ui-button) {
  min-height: var(--ce-control-height);
  padding-inline: 16px;
  border-radius: 14px;
  font-size: 13px;
}

.control-escolar-screen .ce-selected-plantel {
  min-width: 154px;
  min-height: var(--ce-control-height);
  padding: 7px 16px;
  border-radius: 15px;
}

.control-escolar-screen .ce-selected-plantel span {
  font-size: 11px;
}

.control-escolar-screen .ce-selected-plantel strong {
  font-size: 23px;
}

.control-escolar-screen .ce-kpi-system {
  margin-bottom: 12px;
}

.control-escolar-screen .ce-kpi-strip {
  min-height: 98px;
  overflow: hidden;
  border: 1px solid var(--students-border);
  border-radius: var(--ce-radius-panel);
  box-shadow: 0 10px 26px rgba(21, 35, 60, 0.045);
}

.control-escolar-screen .ce-kpi-strip .kpi-card {
  grid-template-columns: 58px minmax(0, 1fr);
  min-height: 88px;
  height: 88px;
  gap: 16px;
  padding: 0 20px;
}

.control-escolar-screen .ce-kpi-strip .kpi-icon {
  width: 52px;
  height: 52px;
}

.control-escolar-screen .ce-kpi-strip .kpi-icon svg {
  width: 25px;
  height: 25px;
}

.control-escolar-screen .ce-kpi-strip .kpi-text span {
  font-size: 12px;
}

.control-escolar-screen .ce-kpi-strip .kpi-text strong {
  font-size: clamp(27px, 2vw, 34px);
}

.control-escolar-screen .ce-kpi-mass {
  right: 14px;
  bottom: 12px;
  grid-template-columns: repeat(10, 5px);
  gap: 4px;
}

.control-escolar-screen .ce-kpi-mass i {
  width: 5px;
  height: 18px;
}

.control-escolar-screen .ce-kpi-mass i:nth-child(2n) {
  height: 22px;
}

.control-escolar-screen .ce-kpi-mass i:nth-child(3n) {
  height: 14px;
}

.control-escolar-screen .ce-filter-bar {
  min-height: 96px;
  gap: 10px;
  margin-bottom: 12px;
  padding: 10px 0 12px;
}

.control-escolar-screen .ce-primary-filter-row {
  grid-template-columns: minmax(460px, 1fr) max-content minmax(430px, 0.95fr) auto;
  gap: 12px;
  min-width: max(100%, 1260px);
}

.control-escolar-screen .ce-secondary-filter-row {
  gap: 10px;
  min-width: max(100%, 1260px);
}

.control-escolar-screen .ce-filter-bar .search-control {
  height: 46px;
  border-radius: 15px;
  padding-inline: 14px;
}

.control-escolar-screen .ce-filter-bar .search-control input {
  font-size: 14px;
  font-weight: 650;
}

.control-escolar-screen .search-filter-icon {
  width: 28px;
  height: 28px;
}

.control-escolar-screen .ce-filter-button,
.control-escolar-screen .ce-clear-link {
  min-height: 42px;
  gap: 8px;
  border-radius: 13px;
  font-size: 13px;
}

.control-escolar-screen .ce-filter-button {
  padding: 0 16px;
}

.control-escolar-screen .ce-status-tabs {
  gap: 8px;
}

.control-escolar-screen .ce-status-tab {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  font-size: 12px;
}

.control-escolar-screen .ce-chip-cluster {
  gap: 8px;
  padding: 7px 12px;
  border-radius: 16px;
}

.control-escolar-screen .ce-chip-label {
  font-size: 11px;
}

.control-escolar-screen .ce-chip-cluster :deep(.ui-chip),
.control-escolar-screen .ce-secondary-filter-row :deep(.ui-chip) {
  min-height: 34px;
  padding-inline: 14px;
  font-size: 11.5px;
}

.control-escolar-screen .ce-chip-count {
  min-width: 22px;
  height: 22px;
  font-size: 10.5px;
}

.control-escolar-screen .ce-workspace.has-detail,
.control-escolar-screen .ce-workspace.has-empty-detail {
  grid-template-columns: minmax(570px, 0.92fr) minmax(800px, 1.08fr);
  gap: 14px;
  min-width: 1384px;
}

.control-escolar-screen .ce-list-card,
.control-escolar-screen .ce-detail-panel {
  border-radius: var(--ce-radius-panel);
  box-shadow: 0 12px 28px rgba(21, 35, 60, 0.052);
}

.control-escolar-screen .ce-list-card {
  --student-list-balance-col: 276px;
  --student-list-action-col: 44px;
  --student-list-row-height: var(--ce-row-height-comfortable);
  --student-list-grade-size: 60px;
  --student-list-grade-height: 62px;
  --student-list-crest-size: 36px;
  grid-template-rows: 50px minmax(0, 1fr);
}

.control-escolar-screen .ce-list-titlebar {
  min-height: 50px;
  padding: 0 18px 0 16px;
}

.control-escolar-screen .ce-list-titlebar h2,
.control-escolar-screen .ce-list-titlebar h2 span {
  font-size: 16px;
}

.control-escolar-screen .ce-excel-export-button {
  height: 36px;
  padding-inline: 14px;
  font-size: 12px;
}

.control-escolar-screen .ce-pagination-mini {
  font-size: 12px;
}

.control-escolar-screen .ce-pagination-mini button {
  width: 34px;
  height: 34px;
  border-radius: 11px;
}

.control-escolar-screen .ce-list-scroll {
  padding: 10px 10px 0;
}

.control-escolar-screen .ce-student-row {
  grid-template-columns: minmax(300px, 1fr) minmax(244px, 286px) 44px;
  gap: 10px;
  min-width: 672px;
  min-height: var(--ce-row-height-comfortable);
  margin: 0 7px 8px 0;
  padding: 8px 8px 8px 12px;
  border-radius: 16px;
}

.control-escolar-screen .ce-student-identity {
  grid-template-columns: 28px var(--student-list-grade-size) var(--student-list-crest-size) minmax(0, 1fr);
  gap: 11px;
}

.control-escolar-screen .ce-row-check {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 15px;
}

.control-escolar-screen .ce-student-row .student-copy {
  gap: 6px;
}

.control-escolar-screen .ce-student-row .student-copy strong {
  font-size: 15px;
  line-height: 1.18;
}

.control-escolar-screen .student-tipo-chip {
  min-height: 24px;
  padding-inline: 9px;
  font-size: 11px;
}

.control-escolar-screen .ce-row-health {
  grid-template-columns: 50px minmax(0, 1fr);
  gap: 11px;
  min-height: 64px;
  padding: 8px 10px;
  border-radius: 14px;
}

.control-escolar-screen .ce-row-health .ce-quality-score {
  width: 50px;
  height: 50px;
}

.control-escolar-screen .ce-row-health .ce-quality-score b {
  font-size: 11.5px;
}

.control-escolar-screen .ce-quality-cell--expanded {
  gap: 5px;
}

.control-escolar-screen .ce-quality-cell--expanded strong {
  font-size: 12.6px;
  line-height: 1.18;
}

.control-escolar-screen .ce-row-health-summary {
  font-size: 11.4px;
  line-height: 1.18;
}

.control-escolar-screen .ce-quality-fields--stacked {
  gap: 5px;
}

.control-escolar-screen .ce-quality-fields--stacked small {
  min-height: 22px;
  gap: 4px;
  padding: 0 8px;
  font-size: 10px;
}

.control-escolar-screen .ce-row-action,
.control-escolar-screen .ce-row-save-indicator {
  width: 40px;
  height: 40px;
  border-radius: 13px;
}

.control-escolar-screen .ce-list-footer {
  min-height: 46px;
  padding: 0 18px;
  font-size: 12px;
}

.control-escolar-screen .ce-list-pages button {
  min-width: 32px;
  height: 32px;
  border-radius: 10px;
  font-size: 11px;
}

.control-escolar-screen .ce-detail-shell {
  min-width: 800px;
  border-radius: var(--ce-radius-panel);
}

.control-escolar-screen .ce-detail-header {
  grid-template-columns: minmax(330px, 1.22fr) minmax(220px, 0.74fr) minmax(210px, 0.7fr) 44px;
  gap: 16px;
  min-height: 132px;
  padding: 18px 20px;
}

.control-escolar-screen .ce-detail-title--with-photo {
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 15px;
}

.control-escolar-screen .ce-detail-header-photo {
  --student-grade-photo-width: 72px;
  --student-grade-photo-height: 72px;
  --student-grade-photo-radius: 15px;
}

.control-escolar-screen .ce-detail-title-copy small {
  margin-bottom: 7px;
  font-size: 12px;
}

.control-escolar-screen .ce-title-row {
  gap: 12px;
}

.control-escolar-screen .ce-title-row h2 {
  font-size: clamp(21px, 1.55vw, 25px);
  line-height: 1.12;
}

.control-escolar-screen .ce-status-pill.large {
  min-height: 36px;
  padding-inline: 15px;
  font-size: 12px;
}

.control-escolar-screen .ce-profile-identity-cues {
  gap: 9px;
  margin-top: 9px;
}

.control-escolar-screen .ce-profile-cue {
  min-height: 32px;
  padding-inline: 12px;
  font-size: 12.5px;
}

.control-escolar-screen .ce-access-header-card {
  grid-template-columns: 64px minmax(0, 1fr);
  min-height: 72px;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 15px;
}

.control-escolar-screen .ce-access-header-card > span,
.control-escolar-screen .ce-access-icon {
  width: 60px;
  height: 46px;
  border-radius: 14px;
}

.control-escolar-screen .ce-access-icon img {
  width: 48px;
  max-height: 32px;
}

.control-escolar-screen .ce-access-header-card strong {
  font-size: 13px;
}

.control-escolar-screen .ce-access-header-card small {
  font-size: 11.5px;
  line-height: 1.28;
}

.control-escolar-screen .ce-progress-cluster--health {
  min-height: 72px;
  gap: 9px;
  padding: 10px 12px;
  border-radius: 15px;
}

.control-escolar-screen .ce-progress-cluster--health strong {
  font-size: 13px;
}

.control-escolar-screen .ce-progress-cluster--health small {
  font-size: 11.4px;
}

.control-escolar-screen .ce-progress-cluster--health b {
  font-size: 21px;
}

.control-escolar-screen .ce-progress-track {
  height: 8px;
}

.control-escolar-screen .ce-detail-menu-button {
  width: 44px;
  height: 44px;
  border-radius: 13px;
}

.control-escolar-screen .ce-detail-body {
  gap: 14px;
  padding: 16px 16px 18px;
}

.control-escolar-screen .ce-health-overview {
  gap: 10px;
  padding: 10px;
  border-radius: 18px;
}

.control-escolar-screen .ce-health-card {
  grid-template-columns: 50px minmax(0, 1fr);
  gap: 12px;
  min-height: 84px;
  padding: 12px 13px;
  border-radius: 15px;
}

.control-escolar-screen .ce-health-card--complete {
  grid-template-columns: 50px minmax(0, 1fr) auto;
}

.control-escolar-screen .ce-health-card--action {
  grid-template-columns: 38px minmax(0, 1fr) auto;
}

.control-escolar-screen .ce-health-ring {
  width: 48px;
  height: 48px;
}

.control-escolar-screen .ce-health-ring b {
  font-size: 12px;
}

.control-escolar-screen .ce-health-card__icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
}

.control-escolar-screen .ce-health-card__copy {
  gap: 4px;
}

.control-escolar-screen .ce-health-card__copy small,
.control-escolar-screen .ce-status-signal-card small {
  font-size: 11px;
}

.control-escolar-screen .ce-health-card__copy strong,
.control-escolar-screen .ce-status-signal-card strong {
  font-size: 13.5px;
  line-height: 1.18;
}

.control-escolar-screen .ce-health-card__copy p,
.control-escolar-screen .ce-status-signal-card p {
  font-size: 11.5px;
  line-height: 1.28;
}

.control-escolar-screen .ce-health-link {
  min-height: 32px;
  font-size: 12px;
}

.control-escolar-screen .ce-health-action-button {
  min-height: 36px;
  padding-inline: 12px;
  border-radius: 11px;
  font-size: 12px;
}

.control-escolar-screen .ce-health-missing-chips {
  gap: 6px;
}

.control-escolar-screen .ce-health-missing-chips button,
.control-escolar-screen .ce-health-missing-chips span {
  min-height: 26px;
  padding-inline: 9px;
  font-size: 10.5px;
}

.control-escolar-screen .ce-status-signal-grid {
  gap: 9px;
  padding: 9px;
  border-radius: 17px;
}

.control-escolar-screen .ce-status-signal-card {
  grid-template-columns: 38px minmax(0, 1fr) auto;
  gap: 10px;
  min-height: 62px;
  padding: 10px 12px;
  border-radius: 14px;
}

.control-escolar-screen .ce-status-signal-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
}

.control-escolar-screen .ce-status-signal-card b {
  font-size: 12px;
}

.control-escolar-screen .ce-detail-tabs {
  min-width: 800px;
  min-height: 52px;
  gap: 5px;
  padding: 3px;
  border-radius: 15px;
}

.control-escolar-screen .ce-detail-tabs button {
  height: 46px;
  gap: 9px;
  padding: 0 14px;
  border-radius: 13px;
  font-size: 12.5px;
}

.control-escolar-screen .ce-tab-badge {
  min-width: 22px;
  height: 22px;
  font-size: 10.5px;
}

.control-escolar-screen .ce-edit-form {
  min-width: 800px;
  gap: 14px;
}

.control-escolar-screen .ce-form-card.ce-tab-panel {
  padding: 20px 22px 18px;
  border-radius: 16px;
}

.control-escolar-screen .ce-panel-heading {
  margin-bottom: 18px;
  padding-bottom: 12px;
}

.control-escolar-screen .ce-panel-heading h3,
.control-escolar-screen .ce-section-heading h3,
.control-escolar-screen .ce-family-card-head h3 {
  font-size: 15px;
}

.control-escolar-screen .ce-panel-heading p,
.control-escolar-screen .ce-section-heading p {
  font-size: 13px;
  line-height: 1.42;
}

.control-escolar-screen .ce-panel-status,
.control-escolar-screen .ce-family-card-status span {
  min-height: 30px;
  padding-inline: 12px;
  font-size: 11.5px;
}

.control-escolar-screen .ce-form-grid,
.control-escolar-screen .ce-form-grid.two,
.control-escolar-screen .ce-form-grid.three,
.control-escolar-screen .ce-tab-panel .ce-form-grid.three {
  gap: 16px 18px;
}

.control-escolar-screen .ce-form-grid label,
.control-escolar-screen .ce-wide-field {
  gap: 8px;
}

.control-escolar-screen .ce-form-grid label > span,
.control-escolar-screen .ce-wide-field > span,
.control-escolar-screen .ce-husky-manual-form label span {
  font-size: 12px;
}

.control-escolar-screen .ce-form-grid input,
.control-escolar-screen .ce-form-grid select,
.control-escolar-screen .ce-wide-field textarea,
.control-escolar-screen .ce-husky-manual-form input {
  min-height: 48px;
  padding-inline: 14px;
  border-radius: 13px;
  font-size: 14px;
}

.control-escolar-screen .ce-form-grid label > small,
.control-escolar-screen .ce-smart-field small {
  font-size: 11px;
  line-height: 1.3;
}

.control-escolar-screen .ce-derived-card {
  min-height: 58px;
  padding: 12px 15px;
}

.control-escolar-screen .ce-derived-card strong {
  font-size: 14px;
}

.control-escolar-screen .ce-family-readiness {
  gap: 12px;
  margin-bottom: 12px;
}

.control-escolar-screen .ce-family-readiness-card {
  grid-template-columns: 40px minmax(0, 1fr) auto;
  min-height: 78px;
  gap: 12px;
  padding: 12px 13px;
  border-radius: 15px;
}

.control-escolar-screen .ce-family-readiness-card > span {
  width: 40px;
  height: 40px;
}

.control-escolar-screen .ce-family-readiness-card small,
.control-escolar-screen .ce-family-siblings-card small,
.control-escolar-screen .ce-family-siblings-card dt {
  font-size: 11px;
}

.control-escolar-screen .ce-family-readiness-card strong,
.control-escolar-screen .ce-family-siblings-list strong {
  font-size: 13.5px;
}

.control-escolar-screen .ce-family-readiness-card p,
.control-escolar-screen .ce-family-siblings-card p {
  font-size: 11.5px;
  line-height: 1.35;
}

.control-escolar-screen .ce-family-grid {
  gap: 14px;
}

.control-escolar-screen .ce-family-card,
.control-escolar-screen .ce-family-siblings-card,
.control-escolar-screen .ce-advanced-section,
.control-escolar-screen .ce-husky-card.compact {
  padding: 16px;
  border-radius: 16px;
}

.control-escolar-screen .ce-family-fields--father,
.control-escolar-screen .ce-family-fields--mother {
  grid-auto-rows: minmax(82px, auto);
}

.control-escolar-screen .ce-school-priority-panel,
.control-escolar-screen .ce-group-picker-card {
  padding: 16px 18px;
  border-radius: 16px;
}

.control-escolar-screen .ce-school-priority-panel p {
  font-size: 13px;
}

.control-escolar-screen .ce-school-current-pill strong {
  font-size: 18px;
}

.control-escolar-screen .ce-group-combobox__input {
  min-height: 50px;
}

.control-escolar-screen .ce-group-combobox__input input {
  font-size: 14px;
}

.control-escolar-screen .ce-grade-picker-chip,
.control-escolar-screen .ce-group-picker-chip,
.control-escolar-screen .ce-group-option {
  min-height: 44px;
  font-size: 13px;
}

.control-escolar-screen .ce-advanced-upload-card {
  min-height: 88px;
  gap: 12px;
  padding: 15px;
}

.control-escolar-screen .ce-advanced-upload-icon {
  width: 40px;
  height: 40px;
}

.control-escolar-screen .ce-advanced-upload-copy strong,
.control-escolar-screen .ce-husky-empty strong {
  font-size: 13.5px;
}

.control-escolar-screen .ce-advanced-upload-copy small,
.control-escolar-screen .ce-husky-empty small,
.control-escolar-screen .ce-husky-actions small {
  font-size: 12px;
}

.control-escolar-screen .ce-husky-credentials span,
.control-escolar-screen .ce-husky-empty,
.control-escolar-screen .ce-husky-manual-form {
  padding: 15px;
}

.control-escolar-screen .ce-husky-credentials small {
  font-size: 11.5px;
}

.control-escolar-screen .ce-husky-credentials strong {
  font-size: 15px;
}

.control-escolar-screen .ce-husky-action-buttons :deep(.ui-button),
.control-escolar-screen .ce-husky-manual-actions :deep(.ui-button) {
  min-height: 42px;
}

.control-escolar-screen .ce-detail-footer {
  min-height: 72px;
  padding: 12px 16px;
}

.control-escolar-screen .ce-detail-footer .ce-save-state,
.control-escolar-screen .ce-save-state {
  min-height: 34px;
  padding-inline: 14px;
  font-size: 12px;
}

.control-escolar-screen .ce-detail-footer :deep(.ui-button) {
  min-height: 44px;
  min-width: 138px;
  border-radius: 14px;
  font-size: 14px;
}

.control-escolar-screen .ce-state-card {
  font-size: 14px;
}

.control-escolar-screen .ce-empty-detail-panel .ce-empty-shell {
  width: min(100%, 420px);
  min-height: 260px;
}

.control-escolar-screen .ce-empty-detail-panel .ce-empty-copy h2 {
  font-size: 25px;
}

.control-escolar-screen .ce-empty-detail-panel .ce-empty-copy p {
  font-size: 14px;
}

@media (max-width: 1380px) {
  .control-escolar-screen .ce-workspace.has-detail,
  .control-escolar-screen .ce-workspace.has-empty-detail {
    grid-template-columns: minmax(520px, 0.9fr) minmax(720px, 1.1fr);
    min-width: 1254px;
  }

  .control-escolar-screen .ce-detail-shell,
  .control-escolar-screen .ce-detail-tabs,
  .control-escolar-screen .ce-edit-form {
    min-width: 720px;
  }

  .control-escolar-screen .ce-primary-filter-row,
  .control-escolar-screen .ce-secondary-filter-row {
    min-width: max(100%, 1160px);
  }

  .control-escolar-screen .ce-kpi-strip .kpi-card {
    padding-inline: 16px;
  }
}


/* Full-height selected student workspace. */
.control-escolar-screen .ce-workspace.has-detail,
.control-escolar-screen .ce-workspace.has-empty-detail {
  grid-template-columns: minmax(520px, 0.82fr) minmax(760px, 1.32fr);
  align-items: stretch;
}

.control-escolar-screen .ce-detail-panel {
  display: flex;
  min-width: 0;
  overflow: hidden;
  border: 0;
  border-radius: 18px;
  background: transparent;
  box-shadow: none;
}

.control-escolar-screen .ce-detail-shell {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(219, 230, 240, 0.98);
  border-radius: 18px;
  background:
    radial-gradient(circle at 100% 0, color-mix(in srgb, var(--ce-detail-accent) 7%, transparent), transparent 230px),
    linear-gradient(180deg, #ffffff 0%, #f9fbfc 100%);
  box-shadow: 0 16px 36px rgba(21, 35, 60, 0.055);
}

.control-escolar-screen .ce-detail-header {
  position: sticky;
  top: 0;
  z-index: 8;
  grid-template-columns: minmax(260px, 1fr) minmax(230px, 0.48fr) minmax(180px, 0.34fr) 34px;
  gap: 11px;
  min-height: 74px;
  padding: 10px 13px 9px;
  border-bottom: 1px solid rgba(221, 231, 240, 0.9);
  background:
    radial-gradient(circle at 0 0, color-mix(in srgb, var(--ce-detail-accent) 8%, transparent), transparent 240px),
    rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(14px) saturate(130%);
}

.control-escolar-screen .ce-detail-title--with-photo {
  grid-template-columns: 50px minmax(0, 1fr);
  gap: 10px;
}

.control-escolar-screen .ce-detail-header-photo {
  --student-grade-photo-width: 50px;
  --student-grade-photo-height: 50px;
  --student-grade-photo-radius: 13px;
}

.control-escolar-screen .ce-detail-title-copy small {
  margin-bottom: 4px;
  color: #5f6e85;
  font-size: 10.5px;
}

.control-escolar-screen .ce-title-row {
  align-items: flex-start;
  gap: 8px;
}

.control-escolar-screen .ce-title-row h2 {
  display: -webkit-box;
  overflow: hidden;
  font-size: clamp(15px, 1.15vw, 18px);
  line-height: 1.12;
  text-overflow: clip;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.control-escolar-screen .ce-status-pill.large {
  min-height: 26px;
  padding-inline: 10px;
  font-size: 10px;
}

.control-escolar-screen .ce-profile-identity-cues {
  gap: 5px;
  margin-top: 5px;
}

.control-escolar-screen .ce-profile-cue {
  min-height: 23px;
  padding-inline: 8px;
  font-size: 10.5px;
}

.control-escolar-screen .ce-access-header-card,
.control-escolar-screen .ce-progress-cluster--health {
  min-height: 50px;
  padding: 7px 9px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
}

.control-escolar-screen .ce-access-header-card {
  grid-template-columns: 48px minmax(0, 1fr);
}

.control-escolar-screen .ce-access-header-card > span,
.control-escolar-screen .ce-access-icon {
  width: 46px;
  height: 34px;
  border-radius: 12px;
}

.control-escolar-screen .ce-access-icon img {
  width: 38px;
  max-height: 24px;
}

.control-escolar-screen .ce-access-header-card strong,
.control-escolar-screen .ce-progress-cluster--health strong {
  font-size: 11.5px;
}

.control-escolar-screen .ce-access-header-card small,
.control-escolar-screen .ce-progress-cluster--health small {
  display: -webkit-box;
  overflow: hidden;
  font-size: 10px;
  line-height: 1.25;
  text-overflow: clip;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.control-escolar-screen .ce-progress-cluster--health b {
  font-size: 18px;
}

.control-escolar-screen .ce-detail-menu-button {
  width: 34px;
  height: 34px;
  border-radius: 11px;
}

.control-escolar-screen .ce-detail-body {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  min-height: 0;
  padding: 10px 12px 12px;
  overflow-x: hidden;
  overflow-y: auto;
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
  scrollbar-gutter: stable;
}

.control-escolar-screen .ce-detail-tabs {
  position: sticky;
  top: 0;
  z-index: 5;
  min-width: 0;
  min-height: 38px;
  padding: 3px;
  border-radius: 14px;
  background: rgba(244, 248, 251, 0.94);
  backdrop-filter: blur(12px) saturate(128%);
}

.control-escolar-screen .ce-detail-tabs button {
  height: 32px;
  min-height: 32px;
  padding-inline: 9px;
  border-radius: 11px;
  font-size: 10.5px;
  cursor: pointer;
}

.control-escolar-screen .ce-edit-form {
  min-width: 0;
  gap: 12px;
}

.control-escolar-screen .ce-form-card.ce-tab-panel,
.control-escolar-screen .ce-family-card,
.control-escolar-screen .ce-family-siblings-card,
.control-escolar-screen .ce-advanced-section,
.control-escolar-screen .ce-husky-card.compact {
  border-color: rgba(221, 231, 240, 0.86);
  box-shadow: none;
}

.control-escolar-screen .ce-form-card.ce-tab-panel {
  padding: 15px 16px;
  border-radius: 16px;
}

.control-escolar-screen .ce-panel-heading {
  margin-bottom: 12px;
  padding-bottom: 10px;
}

.control-escolar-screen .ce-panel-heading h3,
.control-escolar-screen .ce-section-heading h3,
.control-escolar-screen .ce-family-siblings-card h3 {
  font-size: 13px;
  line-height: 1.2;
}

.control-escolar-screen .ce-panel-heading p,
.control-escolar-screen .ce-section-heading p,
.control-escolar-screen .ce-family-siblings-card p {
  overflow: visible;
  font-size: 11px;
  line-height: 1.35;
  text-overflow: clip;
  white-space: normal;
}

.control-escolar-screen .ce-family-readiness {
  gap: 8px;
  margin-bottom: 10px;
}

.control-escolar-screen .ce-family-readiness-card {
  min-height: 58px;
  padding: 9px;
}

.control-escolar-screen .ce-family-readiness-card strong,
.control-escolar-screen .ce-family-readiness-card p,
.control-escolar-screen .ce-family-siblings-match dd,
.control-escolar-screen .ce-family-siblings-list strong,
.control-escolar-screen .ce-family-siblings-list small {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}

.control-escolar-screen .ce-family-grid {
  gap: 10px;
}

.control-escolar-screen .ce-family-card {
  padding: 12px;
  border-radius: 15px;
}

.control-escolar-screen .ce-family-fields,
.control-escolar-screen .ce-family-fields--father,
.control-escolar-screen .ce-family-fields--mother {
  grid-auto-rows: auto;
  gap: 10px 12px;
}

.control-escolar-screen .ce-detail-footer {
  position: sticky;
  bottom: 0;
  z-index: 8;
  min-height: 52px;
  padding: 7px 12px;
  border-top: 1px solid rgba(221, 231, 240, 0.92);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(15px) saturate(130%);
  box-shadow: 0 -8px 22px rgba(21, 35, 60, 0.055);
}

.control-escolar-screen .ce-detail-footer .ce-save-state,
.control-escolar-screen .ce-save-state {
  min-height: 28px;
  padding-inline: 11px;
  font-size: 10.5px;
}

.control-escolar-screen .ce-detail-footer :deep(.ui-button) {
  min-height: 36px;
  min-width: 112px;
  border-radius: 12px;
  font-size: 12.5px;
}

@media (max-width: 1380px) {
  .control-escolar-screen .ce-workspace.has-detail,
  .control-escolar-screen .ce-workspace.has-empty-detail {
    grid-template-columns: minmax(510px, 0.76fr) minmax(720px, 1.24fr);
    min-width: 1240px;
  }

  .control-escolar-screen .ce-detail-shell,
  .control-escolar-screen .ce-detail-tabs,
  .control-escolar-screen .ce-edit-form {
    min-width: 0;
  }

  .control-escolar-screen .ce-detail-header {
    grid-template-columns: minmax(240px, 1fr) minmax(210px, 0.5fr) minmax(168px, 0.36fr) 34px;
    gap: 9px;
    padding-inline: 11px;
  }

}

@media (max-width: 1180px) {
  .control-escolar-screen .ce-detail-header {
    grid-template-columns: minmax(0, 1fr) 34px;
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


/* Control Escolar full-height workspace refinement: keep filters/list in the left rail
   so the selected student record can use the full vertical lane beside it. */
.control-escolar-screen .students-scale-shell {
  flex: 1 1 0;
  min-height: 0;
}

.control-escolar-screen .ce-workspace.has-detail,
.control-escolar-screen .ce-workspace.has-empty-detail {
  align-items: stretch;
  min-height: 0;
}

.control-escolar-screen .student-list-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  align-self: stretch;
  gap: 10px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar {
  width: 100%;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0 0 2px;
  border: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-primary-filter-row {
  grid-template-columns: minmax(0, 1fr) max-content max-content;
  min-width: 0;
  gap: 8px;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .search-control {
  height: 41px;
  min-width: 0;
  border-radius: 14px;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-filter-button,
.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-clear-link {
  min-height: 41px;
  border-radius: 14px;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-clear-link {
  width: 42px;
  min-width: 42px;
  padding: 0;
  font-size: 0;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-clear-link svg {
  flex: 0 0 auto;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster--quality {
  grid-column: 1 / -1;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster--quality::-webkit-scrollbar {
  display: none;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-secondary-filter-row {
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  gap: 8px;
  overflow: visible;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-status-tabs,
.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster--grade,
.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster--group {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-status-tabs::-webkit-scrollbar,
.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster--grade::-webkit-scrollbar,
.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster--group::-webkit-scrollbar {
  display: none;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster {
  padding: 5px;
  border-radius: 15px;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-status-tab,
.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar :deep(.ui-chip) {
  min-height: 34px;
  padding-inline: 12px;
}

.control-escolar-screen .ce-list-card {
  height: 100%;
  min-height: 0;
}

.control-escolar-screen .ce-detail-panel {
  align-self: stretch;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.control-escolar-screen .ce-detail-shell {
  height: 100%;
  min-width: 0;
  min-height: 0;
  border-radius: 18px;
}

.control-escolar-screen .ce-detail-header {
  position: sticky;
  top: 0;
  z-index: 12;
  min-height: 104px;
  padding: 15px 17px;
}


.control-escolar-screen .ce-detail-body {
  flex: 1 1 auto;
  min-height: 0;
}

.control-escolar-screen .ce-detail-footer {
  flex: 0 0 auto;
  min-height: 48px;
  padding-block: 6px;
}

@media (max-width: 1380px) {
  .control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-primary-filter-row {
    grid-template-columns: minmax(0, 1fr) max-content max-content;
    min-width: 0;
  }

  .control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-secondary-filter-row {
    min-width: 0;
  }
}


/* Browsing mode keeps filters spacious until a student workspace is opened. */
.control-escolar-screen .ce-workspace.is-browsing {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 0;
  min-width: max(100%, 1280px);
  height: 100%;
}

.control-escolar-screen .ce-workspace.is-browsing .student-list-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar {
  width: 100%;
  min-width: 0;
  min-height: 96px;
  gap: 10px;
  margin: 0;
  padding: 10px 0 12px;
  border-top: 1px solid var(--students-border-soft);
  border-bottom: 1px solid var(--students-border-soft);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar::-webkit-scrollbar {
  display: none;
}

.control-escolar-screen .ce-workspace.is-browsing .ce-primary-filter-row {
  grid-template-columns: minmax(460px, 1fr) max-content minmax(430px, 0.95fr) auto;
  gap: 12px;
  min-width: max(100%, 1260px);
}

.control-escolar-screen .ce-workspace.is-browsing .ce-secondary-filter-row {
  min-width: max(100%, 1260px);
  max-width: none;
  flex-wrap: nowrap;
  gap: 10px;
  overflow: visible;
}

.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .search-control {
  height: 46px;
  min-width: 0;
  border-radius: 15px;
  padding-inline: 14px;
}

.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-filter-button,
.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-clear-link {
  width: auto;
  min-width: 0;
  min-height: 42px;
  padding-inline: 16px;
  border-radius: 13px;
  font-size: 13px;
}

.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-chip-cluster--quality {
  grid-column: auto;
  min-width: 0;
  max-width: none;
  padding: 7px 12px;
  border: 1px solid rgba(217, 227, 238, 0.9);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 6px 14px rgba(21, 35, 60, 0.035);
  overflow: visible;
}

.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-status-tabs,
.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-chip-cluster--grade,
.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-chip-cluster--group {
  min-width: 0;
  max-width: none;
  overflow: visible;
}

.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-status-tab,
.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar :deep(.ui-chip) {
  min-height: 34px;
  padding-inline: 14px;
}

.control-escolar-screen .ce-workspace.is-browsing .ce-list-card {
  height: 100%;
  min-height: 0;
}

@media (max-width: 1380px) {
  .control-escolar-screen .ce-workspace.is-browsing {
    min-width: max(100%, 1180px);
  }

  .control-escolar-screen .ce-workspace.is-browsing .ce-primary-filter-row,
  .control-escolar-screen .ce-workspace.is-browsing .ce-secondary-filter-row {
    min-width: max(100%, 1160px);
  }
}


/* Control Escolar filter ergonomics: no dead reset row; visible horizontal filter rails. */
.control-escolar-screen .ce-scrollable-filter-strip {
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
  scrollbar-color: rgba(63, 145, 56, 0.38) rgba(220, 232, 221, 0.75);
}

.control-escolar-screen .ce-scrollable-filter-strip::-webkit-scrollbar {
  display: block !important;
  width: 6px;
  height: 6px;
}

.control-escolar-screen .ce-scrollable-filter-strip::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(220, 232, 221, 0.72);
}

.control-escolar-screen .ce-scrollable-filter-strip::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(63, 145, 56, 0.42);
}

.control-escolar-screen .ce-scrollable-filter-strip:focus-visible {
  outline: 2px solid rgba(63, 145, 56, 0.32);
  outline-offset: 2px;
}

.control-escolar-screen .ce-scrollable-filter-strip > * {
  scroll-snap-align: start;
}

.control-escolar-screen .ce-clear-link span {
  display: inline-flex;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-primary-filter-row {
  grid-template-columns: minmax(0, 1fr) max-content max-content;
  align-items: start;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-filter-button {
  grid-column: 2;
  grid-row: 1;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-clear-link {
  grid-column: 3;
  grid-row: 1;
  width: 42px;
  min-width: 42px;
  min-height: 41px;
  padding: 0;
  border: 1px solid rgba(217, 227, 238, 0.94);
  background: #fff;
  color: #6f7b8f;
  box-shadow: 0 5px 12px rgba(21, 35, 60, 0.04);
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-clear-link span {
  display: none;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-clear-link:hover,
.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-clear-link:focus-visible {
  border-color: rgba(63, 145, 56, 0.32);
  color: #20882d;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster--quality {
  grid-column: 1 / -1;
  grid-row: 2;
  max-width: 100%;
  padding: 0 0 8px;
  border: 0;
  background: transparent;
  box-shadow: inset -22px 0 18px -24px rgba(21, 35, 60, 0.58);
  gap: 7px;
  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%);
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster--quality :deep(.ui-chip),
.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster--quality button {
  flex: 0 0 auto;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-secondary-filter-row {
  flex-wrap: nowrap;
  overflow: hidden;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-status-tabs,
.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster--grade,
.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster--group {
  padding-bottom: 7px;
  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 22px), transparent 100%);
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-status-tabs {
  flex: 1 1 auto;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster--grade,
.control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-chip-cluster--group {
  flex: 0 1 auto;
  min-width: 150px;
}

.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-clear-link {
  border: 1px solid rgba(217, 227, 238, 0.94);
  background: #fff;
  color: #20882d;
}

.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-clear-link:hover,
.control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-clear-link:focus-visible {
  border-color: rgba(63, 145, 56, 0.32);
  background: #f4fbf2;
}

.control-escolar-screen .ce-detail-tabs {
  padding-bottom: 7px;
  scrollbar-color: rgba(63, 145, 56, 0.38) rgba(220, 232, 221, 0.75);
  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 24px), transparent 100%);
}

.control-escolar-screen .ce-detail-tabs::-webkit-scrollbar {
  display: block !important;
  height: 6px;
}

.control-escolar-screen .ce-detail-tabs::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(220, 232, 221, 0.72);
}

.control-escolar-screen .ce-detail-tabs::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(63, 145, 56, 0.42);
}


/* Control Escolar: reference-style full-height student workbench. */
.control-escolar-screen .ce-workspace.has-detail {
  grid-template-columns: minmax(430px, 0.74fr) minmax(800px, 1.36fr);
  gap: 10px;
  min-width: 1260px;
  align-items: stretch;
}

.control-escolar-screen .ce-workspace.has-detail .student-list-panel.is-compact {
  min-width: 0;
}

.control-escolar-screen .ce-workspace.has-detail .ce-list-card {
  --student-list-balance-col: 218px;
  --student-list-action-col: 34px;
  --student-list-row-height: 78px;
  border-radius: 15px;
  box-shadow: 0 10px 24px rgba(16, 32, 58, 0.045);
}

.control-escolar-screen .ce-workspace.has-detail .ce-list-columns {
  display: none;
}

.control-escolar-screen .ce-workspace.has-detail .ce-student-row {
  grid-template-columns: minmax(0, 1fr) minmax(180px, 218px) 28px;
  width: calc(100% - 4px);
  min-height: 78px;
  margin-bottom: 8px;
  border-radius: 14px;
}

.control-escolar-screen .ce-workspace.has-detail .ce-student-row.selected {
  border-color: rgba(63, 145, 56, 0.42);
  background:
    linear-gradient(90deg, rgba(239, 249, 236, 0.96), rgba(255, 255, 255, 0.98)),
    #fff;
  box-shadow: 0 10px 22px rgba(63, 145, 56, 0.12);
}

.control-escolar-screen .ce-detail-panel {
  overflow: hidden;
  border: 1px solid rgba(218, 228, 238, 0.98);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 26px rgba(16, 32, 58, 0.05);
}

.control-escolar-screen .ce-detail-shell {
  height: 100%;
  min-width: 0;
  border: 0;
  border-radius: 16px;
  background: #fff;
  box-shadow: none;
}

.control-escolar-screen .ce-detail-header {
  grid-template-columns: minmax(330px, 1fr) minmax(230px, 0.62fr) minmax(220px, 0.54fr) 38px;
  gap: 14px;
  min-height: 104px;
  padding: 17px 18px;
  border-bottom: 1px solid #e5edf5;
  background: #fff;
}

.control-escolar-screen .ce-detail-title--with-photo {
  grid-template-columns: 62px minmax(0, 1fr);
  gap: 14px;
}

.control-escolar-screen .ce-detail-header-photo {
  --student-grade-photo-width: 62px;
  --student-grade-photo-height: 62px;
  --student-grade-photo-radius: 14px;
}

.control-escolar-screen .ce-detail-title-copy small {
  margin-bottom: 5px;
  color: #718098;
  font-size: 10.5px;
  font-weight: 900;
}

.control-escolar-screen .ce-title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.control-escolar-screen .ce-title-row h2 {
  margin: 0;
  color: #13213a;
  font-size: clamp(18px, 1.15vw, 22px);
  font-weight: 950;
  line-height: 1.04;
  letter-spacing: -0.035em;
  white-space: normal;
}

.control-escolar-screen .ce-status-pill.large {
  min-height: 26px;
  padding-inline: 12px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 920;
}

.control-escolar-screen .ce-profile-identity-cues {
  display: none;
}

.control-escolar-screen .ce-access-header-card {
  min-height: 58px;
  padding: 9px 12px;
  border: 1px solid #e2ebf3;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(16, 32, 58, 0.035);
}

.control-escolar-screen .ce-access-header-card strong {
  color: #13213a;
  font-size: 12px;
  font-weight: 940;
}

.control-escolar-screen .ce-access-header-card small {
  max-width: none;
  color: #64738b;
  font-size: 10px;
  line-height: 1.2;
  white-space: normal;
}

.control-escolar-screen .ce-progress-cluster--health {
  min-height: 58px;
  padding: 10px 12px;
  border: 1px solid rgba(217, 67, 56, 0.22);
  border-radius: 14px;
  background: #fffafa;
  box-shadow: 0 8px 18px rgba(16, 32, 58, 0.035);
}

.control-escolar-screen .ce-progress-cluster--health.complete {
  border-color: rgba(63, 145, 56, 0.22);
  background: #fbfefb;
}

.control-escolar-screen .ce-progress-cluster--health.warning {
  border-color: rgba(216, 139, 28, 0.22);
  background: #fffdfa;
}

.control-escolar-screen .ce-progress-label-row strong {
  color: #13213a;
  font-size: 11.5px;
  font-weight: 940;
}

.control-escolar-screen .ce-progress-label-row small {
  margin-top: 2px;
  color: #64738b;
  font-size: 10px;
  line-height: 1.18;
  white-space: normal;
}

.control-escolar-screen .ce-progress-label-row b {
  color: var(--ce-detail-accent);
  font-size: 18px;
  font-weight: 950;
}

.control-escolar-screen .ce-detail-menu-button {
  width: 36px;
  height: 36px;
  border-color: #e2ebf3;
  border-radius: 12px;
  background: #fff;
}

.control-escolar-screen .ce-detail-body {
  gap: 0;
  padding: 0;
  background: #fff;
}

.control-escolar-screen .ce-detail-tabs {
  position: sticky;
  top: 0;
  z-index: 5;
  min-width: 0;
  min-height: 52px;
  align-items: stretch;
  gap: 6px;
  padding: 0 18px;
  border: 0;
  border-bottom: 1px solid #e5edf5;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: none;
  mask-image: none;
  backdrop-filter: blur(14px) saturate(130%);
}

.control-escolar-screen .ce-detail-tabs button {
  height: 51px;
  padding: 0 10px;
  border-radius: 0;
  color: #6a788f;
  font-size: 11px;
  font-weight: 850;
  box-shadow: none;
}

.control-escolar-screen .ce-detail-tabs button::after {
  content: "";
  position: absolute;
  right: 10px;
  bottom: 0;
  left: 10px;
  height: 3px;
  border-radius: 999px 999px 0 0;
  background: transparent;
}

.control-escolar-screen .ce-detail-tabs button.active {
  background: transparent;
  color: var(--ce-green-strong);
  box-shadow: none;
}

.control-escolar-screen .ce-detail-tabs button.active::after {
  background: var(--ce-green-strong);
}

.control-escolar-screen .ce-tab-badge {
  min-width: 19px;
  height: 19px;
  background: #ffe8e5;
  color: #d63f35;
  font-size: 9.5px;
}

.control-escolar-screen .ce-edit-form {
  min-width: 0;
  gap: 14px;
  padding: 14px 18px 18px;
  background: linear-gradient(180deg, #fff, #fbfcfd 100%);
}

.control-escolar-screen .ce-primary-pending-panel,
.control-escolar-screen .ce-form-card.ce-tab-panel {
  border: 1px solid #e3ebf4;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(16, 32, 58, 0.035);
}

.control-escolar-screen .ce-primary-pending-panel {
  padding: 18px;
}

.control-escolar-screen .ce-panel-heading--pending {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.control-escolar-screen .ce-panel-heading-copy {
  display: flex;
  min-width: 0;
  gap: 12px;
}

.control-escolar-screen .ce-panel-heading-copy--with-icon {
  align-items: center;
}

.control-escolar-screen .ce-panel-heading-icon {
  display: inline-flex;
  width: 50px;
  height: 50px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  background: linear-gradient(180deg, #eff8ef, #f7fbf5 100%);
  border: 1px solid #d9edd9;
  color: #2b9d44;
}

.control-escolar-screen .ce-panel-heading--pending h3,
.control-escolar-screen .ce-panel-heading h3 {
  color: #13213a;
  font-size: 15px;
  font-weight: 950;
  letter-spacing: -0.015em;
}

.control-escolar-screen .ce-panel-heading--pending p,
.control-escolar-screen .ce-panel-heading p {
  margin-top: 3px;
  color: #66758c;
  font-size: 11px;
  font-weight: 760;
  line-height: 1.32;
}

.control-escolar-screen .ce-view-all-pending {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: #d63f35;
  font-size: 10.5px;
  font-weight: 900;
  cursor: pointer;
}

.control-escolar-screen .ce-pending-summary-strip {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1.75fr);
  gap: 0;
  padding: 16px 18px;
  border: 1px solid #dcebdc;
  border-radius: 18px;
  background: linear-gradient(180deg, #fcfefb, #ffffff 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.84);
}

.control-escolar-screen .ce-pending-summary-strip.is-warning {
  border-color: #f1e4be;
  background: linear-gradient(180deg, #fffef8, #ffffff 100%);
}

.control-escolar-screen .ce-pending-summary-strip.is-danger {
  border-color: #f2d9d4;
  background: linear-gradient(180deg, #fffafa, #ffffff 100%);
}

.control-escolar-screen .ce-pending-summary-primary {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding-right: 20px;
}

.control-escolar-screen .ce-pending-summary-primary-icon {
  display: inline-flex;
  width: 54px;
  height: 54px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #2f9f43;
  color: #fff;
  box-shadow: 0 10px 18px rgba(47, 159, 67, 0.18);
}

.control-escolar-screen .ce-pending-summary-strip.is-warning .ce-pending-summary-primary-icon {
  background: #dbb24d;
  box-shadow: 0 10px 18px rgba(219, 178, 77, 0.18);
}

.control-escolar-screen .ce-pending-summary-strip.is-danger .ce-pending-summary-primary-icon {
  background: #e16355;
  box-shadow: 0 10px 18px rgba(225, 99, 85, 0.16);
}

.control-escolar-screen .ce-pending-summary-primary-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.control-escolar-screen .ce-pending-summary-primary-copy strong {
  color: #1b8d32;
  font-size: 16px;
  font-weight: 950;
  letter-spacing: -0.02em;
}

.control-escolar-screen .ce-pending-summary-strip.is-warning .ce-pending-summary-primary-copy strong {
  color: #ad780d;
}

.control-escolar-screen .ce-pending-summary-strip.is-danger .ce-pending-summary-primary-copy strong {
  color: #d14338;
}

.control-escolar-screen .ce-pending-summary-primary-copy p {
  margin: 0;
  color: #66758c;
  font-size: 11.5px;
  font-weight: 740;
  line-height: 1.45;
}

.control-escolar-screen .ce-pending-summary-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
}

.control-escolar-screen .ce-pending-summary-metric {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 2px 16px;
}

.control-escolar-screen .ce-pending-summary-metric + .ce-pending-summary-metric {
  border-left: 1px solid #dce8da;
}

.control-escolar-screen .ce-pending-summary-strip.is-warning .ce-pending-summary-metric + .ce-pending-summary-metric {
  border-left-color: #efe3c8;
}

.control-escolar-screen .ce-pending-summary-strip.is-danger .ce-pending-summary-metric + .ce-pending-summary-metric {
  border-left-color: #f0ddd9;
}

.control-escolar-screen .ce-pending-summary-metric-icon {
  display: inline-flex;
  color: #2b9d44;
  flex: 0 0 auto;
}

.control-escolar-screen .ce-pending-summary-strip.is-warning .ce-pending-summary-metric-icon {
  color: #cb8c16;
}

.control-escolar-screen .ce-pending-summary-strip.is-danger .ce-pending-summary-metric-icon {
  color: #d85143;
}

.control-escolar-screen .ce-pending-summary-metric div {
  display: grid;
  min-width: 0;
}

.control-escolar-screen .ce-pending-summary-metric strong {
  color: #1f9338;
  font-size: 13px;
  font-weight: 950;
  letter-spacing: -0.015em;
}

.control-escolar-screen .ce-pending-summary-strip.is-warning .ce-pending-summary-metric strong {
  color: #b98318;
}

.control-escolar-screen .ce-pending-summary-strip.is-danger .ce-pending-summary-metric strong {
  color: #d14338;
}

.control-escolar-screen .ce-pending-summary-metric small,
.control-escolar-screen .ce-pending-summary-metric em {
  color: #66758c;
  font-style: normal;
  line-height: 1.35;
}

.control-escolar-screen .ce-pending-summary-metric small {
  font-size: 10.5px;
  font-weight: 780;
}

.control-escolar-screen .ce-pending-summary-metric em {
  font-size: 10px;
  font-weight: 700;
}

.control-escolar-screen .ce-primary-pending-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(138px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.control-escolar-screen .ce-primary-pending-card {
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr auto;
  align-items: stretch;
  gap: 0;
  min-height: 178px;
  padding: 18px 18px 16px;
  border: 1px solid #dce8da;
  border-radius: 18px;
  background: linear-gradient(180deg, #fdfffd, #fff 100%);
  color: #d63f35;
  text-align: left;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.control-escolar-screen .ce-primary-pending-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(16, 32, 58, 0.065);
}

.control-escolar-screen .ce-primary-pending-card.is-complete {
  border-color: #dcebdc;
  background: linear-gradient(180deg, #fcfffc, #fff);
  color: #20842f;
}

.control-escolar-screen .ce-primary-pending-card.is-warning {
  border-color: #f0e0b7;
  background: linear-gradient(180deg, #fffef9, #fff);
  color: #c37412;
}

.control-escolar-screen .ce-primary-pending-card.is-danger {
  border-color: #f0d7d1;
  background: linear-gradient(180deg, #fffafa, #fff);
}

.control-escolar-screen .ce-primary-pending-card-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
}

.control-escolar-screen .ce-primary-pending-icon {
  display: inline-flex;
  width: 52px;
  height: 52px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid currentColor;
  background: rgba(255, 255, 255, 0.84);
  color: currentColor;
  opacity: 0.92;
}

.control-escolar-screen .ce-primary-pending-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.control-escolar-screen .ce-primary-pending-copy strong {
  color: #15233b;
  font-size: 13px;
  font-weight: 950;
  line-height: 1.1;
}

.control-escolar-screen .ce-primary-pending-copy b {
  color: currentColor;
  font-size: 18px;
  font-weight: 950;
  line-height: 1.05;
}

.control-escolar-screen .ce-primary-pending-count {
  justify-self: end;
  color: currentColor;
  font-size: 13px;
  font-weight: 950;
  line-height: 1;
}

.control-escolar-screen .ce-primary-pending-card-body {
  display: flex;
  align-items: flex-end;
  min-height: 62px;
  padding: 16px 0 14px;
  border-top: 1px solid rgba(17, 34, 60, 0.08);
  margin-top: 18px;
}

.control-escolar-screen .ce-primary-pending-meta {
  color: #66758c;
  font-size: 11.5px;
  font-weight: 740;
  line-height: 1.55;
}

.control-escolar-screen .ce-primary-pending-card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.control-escolar-screen .ce-primary-pending-action {
  display: inline-flex;
  min-width: 118px;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  padding: 0 18px;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: #fff;
  color: currentColor;
  font-size: 11px;
  font-weight: 930;
}

.control-escolar-screen .ce-primary-pending-checkmark {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  color: #2a993f;
  background: #eef8ea;
  border: 1px solid #d6ead2;
  border-radius: 999px;
}

.control-escolar-screen .ce-form-card.ce-tab-panel {
  padding: 18px;
}

.control-escolar-screen .ce-identity-panel .ce-form-grid,
.control-escolar-screen .ce-identity-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.control-escolar-screen .ce-smart-field span,
.control-escolar-screen .ce-wide-field span {
  color: #65738b;
  font-size: 11px;
  font-weight: 860;
}

.control-escolar-screen .ce-smart-field input,
.control-escolar-screen .ce-smart-field select,
.control-escolar-screen .ce-wide-field input,
.control-escolar-screen .ce-wide-field select,
.control-escolar-screen .ce-wide-field textarea {
  min-height: 43px;
  border-radius: 11px;
  border-color: #dfe8f1;
  background: #fff;
  color: #13213a;
  font-size: 13px;
  font-weight: 820;
}

.control-escolar-screen .ce-smart-field.is-ok input,
.control-escolar-screen .ce-smart-field.is-ok select {
  border-color: rgba(63, 145, 56, 0.32);
  background: linear-gradient(180deg, #fbfefb, #fff);
}

.control-escolar-screen .ce-smart-field.is-missing input,
.control-escolar-screen .ce-smart-field.is-invalid input,
.control-escolar-screen .ce-smart-field.is-missing select,
.control-escolar-screen .ce-smart-field.is-invalid select {
  border-color: rgba(217, 67, 56, 0.62);
  background: #fffafa;
  box-shadow: none;
}

.control-escolar-screen .ce-detail-footer {
  min-height: 60px;
  padding: 9px 18px;
  border-top: 1px solid #e5edf5;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 -12px 26px rgba(16, 32, 58, 0.055);
}

.control-escolar-screen .ce-detail-footer-meta {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.control-escolar-screen .ce-last-update-text {
  color: #7a879a;
  font-size: 11px;
  font-weight: 760;
  white-space: nowrap;
}

.control-escolar-screen .ce-detail-footer-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.control-escolar-screen .ce-detail-footer :deep(.ui-button) {
  min-height: 40px;
  min-width: 132px;
  border-radius: 12px;
  font-weight: 900;
}

.control-escolar-screen .ce-detail-footer :deep(.ui-button.primary),
.control-escolar-screen .ce-detail-footer :deep(.ui-button--primary) {
  min-width: 160px;
}

@media (max-width: 1480px) {
  .control-escolar-screen .ce-workspace.has-detail {
    grid-template-columns: minmax(410px, 0.68fr) minmax(760px, 1.32fr);
    min-width: 1200px;
  }

  .control-escolar-screen .ce-pending-summary-strip {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .control-escolar-screen .ce-pending-summary-primary {
    padding-right: 0;
  }

  .control-escolar-screen .ce-primary-pending-grid {
    gap: 10px;
  }

  .control-escolar-screen .ce-primary-pending-card {
    min-height: 164px;
    padding: 14px;
  }
}

@media (max-width: 1240px) {
  .control-escolar-screen .ce-detail-header {
    grid-template-columns: minmax(0, 1fr) 38px;
    grid-template-rows: auto auto auto;
  }

  .control-escolar-screen .ce-access-header-card,
  .control-escolar-screen .ce-progress-cluster--health {
    grid-column: 1 / -1;
  }

  .control-escolar-screen .ce-pending-summary-metrics {
    grid-template-columns: 1fr;
  }

  .control-escolar-screen .ce-pending-summary-metric {
    padding: 10px 0;
  }

  .control-escolar-screen .ce-pending-summary-metric + .ce-pending-summary-metric {
    border-left: 0;
    border-top: 1px solid #dce8da;
  }

  .control-escolar-screen .ce-pending-summary-strip.is-warning .ce-pending-summary-metric + .ce-pending-summary-metric {
    border-top-color: #efe3c8;
  }

  .control-escolar-screen .ce-pending-summary-strip.is-danger .ce-pending-summary-metric + .ce-pending-summary-metric {
    border-top-color: #f0ddd9;
  }

  .control-escolar-screen .ce-primary-pending-grid,
  .control-escolar-screen .ce-identity-panel .ce-form-grid,
  .control-escolar-screen .ce-identity-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}


/* Reference-style selected-student hero header. */
.control-escolar-screen .ce-student-hero-header {
  --hero-accent: var(--ce-green);
  --hero-accent-strong: var(--ce-green-strong);
  --hero-soft: #f5fbf3;
  --hero-border: rgba(63, 145, 56, 0.2);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  border-bottom: 1px solid #dfe9f2;
  border-radius: 16px 16px 0 0;
  background: #fff;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.8) inset;
}

.control-escolar-screen .ce-student-hero-header.is-danger {
  --hero-accent: #ef4337;
  --hero-accent-strong: #d7352c;
  --hero-soft: #fff5f3;
  --hero-border: rgba(239, 67, 55, 0.24);
}

.control-escolar-screen .ce-student-hero-header.is-warning {
  --hero-accent: #dd8b21;
  --hero-accent-strong: #bd7015;
  --hero-soft: #fff9ed;
  --hero-border: rgba(221, 139, 33, 0.24);
}

.control-escolar-screen .ce-student-hero-header.is-neutral {
  --hero-accent: #7b8797;
  --hero-accent-strong: #5c6878;
  --hero-soft: #f6f8fa;
  --hero-border: rgba(123, 135, 151, 0.22);
}

.control-escolar-screen .ce-student-hero-main {
  display: grid;
  grid-template-columns: clamp(76px, 6.5vw, 96px) minmax(0, 1fr) auto;
  align-items: center;
  column-gap: clamp(18px, 2vw, 32px);
  min-height: clamp(124px, 12vh, 158px);
  padding: clamp(20px, 2vw, 30px) clamp(22px, 2.4vw, 34px);
  background:
    radial-gradient(circle at 0 0, rgba(63, 145, 56, 0.055), transparent 32%),
    linear-gradient(180deg, #fff 0%, #fff 70%, #fcfefd 100%);
}

.control-escolar-screen .ce-student-hero-photo {
  --student-grade-photo-width: clamp(76px, 6.5vw, 96px);
  --student-grade-photo-height: clamp(76px, 6.5vw, 96px);
  --student-grade-photo-radius: clamp(18px, 1.5vw, 22px);
  --student-grade-photo-number-size: 38px;
  justify-self: center;
  border-color: var(--hero-border);
  box-shadow: 0 14px 30px rgba(16, 32, 58, 0.07);
}

.control-escolar-screen .ce-student-hero-copy {
  display: grid;
  min-width: 0;
  gap: 16px;
}

.control-escolar-screen .ce-student-hero-copy h2 {
  margin: 0;
  overflow: visible;
  color: #13213a;
  font-size: clamp(25px, 2.1vw, 38px);
  font-weight: 950;
  letter-spacing: -0.055em;
  line-height: 1.03;
  text-wrap: balance;
}

.control-escolar-screen .ce-student-hero-meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 18px;
  color: #6f7d92;
  font-size: clamp(14px, 1.08vw, 18px);
  font-weight: 860;
  line-height: 1.25;
}

.control-escolar-screen .ce-student-hero-meta > span {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  gap: 9px;
  white-space: nowrap;
}

.control-escolar-screen .ce-student-hero-meta > i {
  display: inline-block;
  width: 1px;
  height: 24px;
  margin-inline: 3px;
  border-radius: 999px;
  background: #d5dde7;
}

.control-escolar-screen .ce-student-hero-pass-card {
  display: inline-grid;
  grid-template-columns: auto minmax(0, auto);
  min-height: 34px;
  align-items: center;
  gap: 9px;
  padding: 3px 11px 3px 7px;
  border: 1px solid #dfe8f1;
  border-radius: 12px;
  background: linear-gradient(180deg, #fff 0%, #f8fbfd 100%);
  color: #5e6f86;
  font: inherit;
  font-size: clamp(13px, .98vw, 16px);
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(16, 32, 58, 0.04), inset 0 1px 0 rgba(255, 255, 255, .92);
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease, color .18s ease;
}

.control-escolar-screen .ce-student-hero-pass-card:hover {
  border-color: rgba(63, 145, 56, .28);
  color: #213a2a;
  box-shadow: 0 12px 24px rgba(63, 145, 56, .08), inset 0 1px 0 rgba(255, 255, 255, .94);
  transform: translateY(-1px);
}

.control-escolar-screen .ce-student-hero-pass-card img {
  width: 33px;
  height: 24px;
  object-fit: contain;
  opacity: .82;
  filter: grayscale(18%);
}

.control-escolar-screen .ce-student-hero-pass-card strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-escolar-screen .ce-student-hero-cues {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.control-escolar-screen .ce-student-identity-chip {
  display: inline-flex;
  min-height: 31px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid rgba(214, 225, 235, 0.9);
  border-radius: 999px;
  background: rgba(247, 250, 252, 0.9);
  color: #66758b;
  font-size: clamp(12px, 0.9vw, 14px);
  font-weight: 870;
  line-height: 1;
  white-space: nowrap;
  box-shadow: 0 7px 15px rgba(16, 32, 58, 0.025), inset 0 1px 0 rgba(255, 255, 255, 0.84);
}

.control-escolar-screen .ce-student-identity-chip > i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.72;
}

.control-escolar-screen .ce-student-identity-chip.is-symbol {
  min-width: 31px;
  padding-inline: 0;
}

.control-escolar-screen .ce-student-identity-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 950;
  line-height: 1;
}

.control-escolar-screen .ce-student-identity-chip.is-symbol > i {
  display: none;
}

.control-escolar-screen .ce-student-identity-chip.is-female {
  border-color: rgba(223, 129, 174, 0.28);
  background: linear-gradient(180deg, #fff7fb 0%, #fdeef6 100%);
  color: #b65386;
}

.control-escolar-screen .ce-student-identity-chip.is-male {
  border-color: rgba(98, 159, 234, 0.3);
  background: linear-gradient(180deg, #f7fbff 0%, #edf6ff 100%);
  color: #376fca;
}

.control-escolar-screen .ce-student-identity-chip.is-neutral,
.control-escolar-screen .ce-student-identity-chip.is-age {
  border-color: rgba(210, 222, 233, 0.9);
  background: linear-gradient(180deg, #ffffff 0%, #f4f8fb 100%);
  color: #657286;
}

.control-escolar-screen .ce-student-identity-chip.is-birthday {
  border-color: rgba(221, 139, 33, 0.18);
  background: linear-gradient(180deg, #fffdf8 0%, #fff7e7 100%);
  color: #8b6f3d;
}

.control-escolar-screen button.ce-student-identity-chip {
  font-family: inherit;
  cursor: pointer;
}

.control-escolar-screen .ce-student-identity-chip.is-action:hover {
  border-color: rgba(63, 145, 56, .24);
  color: #315e37;
  box-shadow: 0 10px 20px rgba(63, 145, 56, .07), inset 0 1px 0 rgba(255, 255, 255, .9);
  transform: translateY(-1px);
}

.control-escolar-screen .ce-student-identity-chip svg {
  flex: 0 0 auto;
  stroke-width: 2.25;
}

.control-escolar-screen .ce-student-hero-side {
  display: flex;
  min-width: max-content;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
}

.control-escolar-screen .ce-student-hero-group-sigil {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, auto);
  width: clamp(150px, 13vw, 184px);
  min-height: clamp(82px, 7.2vw, 104px);
  align-items: center;
  justify-content: start;
  gap: 12px;
  isolation: isolate;
  padding: 10px 14px 10px 10px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--hero-accent) 18%, #dce8f0);
  border-radius: clamp(24px, 1.8vw, 30px);
  background:
    radial-gradient(circle at 20% 14%, rgba(255, 255, 255, 0.96), transparent 34%),
    radial-gradient(circle at 84% 90%, color-mix(in srgb, var(--hero-accent) 12%, transparent), transparent 42%),
    linear-gradient(135deg, color-mix(in srgb, var(--hero-accent) 10%, #fff) 0%, #fff 58%, color-mix(in srgb, var(--hero-accent) 8%, #f6faf8) 100%);
  color: var(--hero-accent-strong);
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 18px 34px color-mix(in srgb, var(--hero-accent) 11%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.92);
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
}

.control-escolar-screen .ce-student-hero-group-sigil::after {
  content: "";
  position: absolute;
  inset: 10px 10px 10px auto;
  width: 54%;
  border-radius: inherit;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.62));
  pointer-events: none;
}

.control-escolar-screen .ce-student-hero-group-sigil.is-female {
  border-color: rgba(223, 129, 174, 0.24);
  background:
    radial-gradient(circle at 20% 14%, rgba(255, 255, 255, 0.96), transparent 34%),
    radial-gradient(circle at 84% 90%, rgba(223, 129, 174, .13), transparent 42%),
    linear-gradient(135deg, #fff6fb 0%, #ffffff 58%, #fdf0f7 100%);
  color: #b65386;
  box-shadow: 0 18px 34px rgba(182, 83, 134, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.control-escolar-screen .ce-student-hero-group-sigil.is-male {
  border-color: rgba(98, 159, 234, 0.25);
  background:
    radial-gradient(circle at 20% 14%, rgba(255, 255, 255, 0.96), transparent 34%),
    radial-gradient(circle at 84% 90%, rgba(98, 159, 234, .14), transparent 42%),
    linear-gradient(135deg, #f5fbff 0%, #ffffff 58%, #edf6ff 100%);
  color: #376fca;
  box-shadow: 0 18px 34px rgba(55, 111, 202, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.control-escolar-screen button.ce-student-hero-group-sigil:hover {
  border-color: color-mix(in srgb, currentColor 34%, #dce8f0);
  box-shadow: 0 22px 42px rgba(16, 32, 58, .11), inset 0 1px 0 rgba(255, 255, 255, .94);
  transform: translateY(-1px) scale(1.012);
}

.control-escolar-screen .ce-student-hero-group-sigil.is-swapping .ce-student-hero-group-art {
  animation: ceGroupSigilSwap .68s cubic-bezier(.18,.8,.22,1);
}

.control-escolar-screen .ce-student-hero-group-art {
  position: relative;
  z-index: 1;
  display: inline-grid;
  width: clamp(62px, 5.8vw, 82px);
  height: clamp(62px, 5.8vw, 82px);
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid color-mix(in srgb, currentColor 20%, #e2ebf3);
  border-radius: 24px;
  background:
    radial-gradient(circle at 35% 26%, rgba(255,255,255,.98), rgba(255,255,255,.5) 48%, transparent 49%),
    color-mix(in srgb, currentColor 8%, #fff);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.76), 0 12px 22px color-mix(in srgb, currentColor 9%, transparent);
}

.control-escolar-screen .ce-student-hero-group-art .ui-group-icon {
  --group-icon-size: clamp(42px, 4.15vw, 60px);
  --group-icon-letter-font-size: .52em;
  --group-icon-stroke-width: .052em;
  opacity: .94;
}

.control-escolar-screen .ce-student-hero-group-caption {
  position: relative;
  z-index: 1;
  display: grid;
  min-width: 0;
  gap: 4px;
  text-align: left;
}

.control-escolar-screen .ce-student-hero-group-caption strong {
  overflow: hidden;
  color: #15233a;
  font-size: clamp(13px, 1vw, 15px);
  font-weight: 950;
  letter-spacing: -.025em;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 74px;
}

.control-escolar-screen .ce-student-hero-group-caption em {
  color: currentColor;
  font-size: 10.5px;
  font-style: normal;
  font-weight: 920;
  letter-spacing: .045em;
  line-height: 1;
  text-transform: uppercase;
}

.control-escolar-screen .ce-student-hero-group-cta {
  display: inline-grid;
  grid-template-columns: auto minmax(0, 1fr);
  min-height: clamp(66px, 6vw, 82px);
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 10px 16px 10px 12px;
  border: 1px solid rgba(63, 145, 56, .28);
  border-radius: 24px;
  background:
    radial-gradient(circle at 22% 18%, rgba(255,255,255,.98), transparent 35%),
    linear-gradient(180deg, #f6fbf4 0%, #edf8ea 100%);
  color: var(--ce-green-strong);
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 16px 32px rgba(63, 145, 56, .11), inset 0 1px 0 rgba(255, 255, 255, .9);
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
}

.control-escolar-screen .ce-student-hero-group-cta-icon {
  display: inline-grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 16px;
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(63,145,56,.12);
}

.control-escolar-screen .ce-student-hero-group-cta span:not(.ce-student-hero-group-cta-icon) {
  display: grid;
  gap: 3px;
  text-align: left;
}

.control-escolar-screen .ce-student-hero-group-cta strong {
  font-size: 12px;
  font-weight: 950;
  letter-spacing: .04em;
  white-space: nowrap;
}

.control-escolar-screen .ce-student-hero-group-cta small {
  color: #6f9272;
  font-size: 10.5px;
  font-weight: 820;
  white-space: nowrap;
}

.control-escolar-screen .ce-student-hero-group-cta:hover {
  border-color: rgba(63, 145, 56, .45);
  box-shadow: 0 20px 38px rgba(63, 145, 56, .15), inset 0 1px 0 rgba(255, 255, 255, .94);
  transform: translateY(-1px);
}

@keyframes ceGroupSigilSwap {
  0% { opacity: .35; transform: scale(.72) rotate(-8deg); filter: blur(2px); }
  54% { opacity: 1; transform: scale(1.08) rotate(3deg); filter: blur(0); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); filter: blur(0); }
}

.control-escolar-screen .ce-student-hero-status {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 11px;
  padding: 0 22px;
  border: 1px solid rgba(63, 145, 56, 0.12);
  border-radius: 999px;
  background: #eaf7e8;
  color: var(--ce-green-strong);
  font-size: clamp(14px, 1.15vw, 20px);
  font-weight: 940;
  white-space: nowrap;
}

.control-escolar-screen .ce-student-hero-status > i {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 12%, transparent);
}

.control-escolar-screen .ce-student-hero-status.danger {
  border-color: rgba(217, 67, 56, 0.16);
  background: #fff0ef;
  color: #d94338;
}

.control-escolar-screen .ce-student-hero-status.neutral {
  border-color: rgba(99, 111, 129, 0.16);
  background: #f2f5f8;
  color: #657083;
}

.control-escolar-screen .ce-student-hero-menu {
  width: 54px;
  height: 54px;
  align-self: center;
  justify-self: end;
  border: 1px solid #dfe9f2;
  border-radius: 18px;
  background: #fff;
  color: #68778d;
  box-shadow: 0 10px 24px rgba(16, 32, 58, 0.045);
}

.control-escolar-screen .ce-student-hero-menu:hover {
  border-color: #cbd9e8;
  color: #14233d;
  transform: translateY(-1px);
}

.control-escolar-screen .ce-student-hero-progress {
  display: grid;
  grid-template-columns: 58px minmax(145px, auto) 1px minmax(112px, auto) auto minmax(140px, 1fr) auto;
  align-items: center;
  gap: clamp(11px, 1.25vw, 22px);
  min-height: clamp(74px, 8.5vh, 96px);
  padding: clamp(14px, 1.5vw, 20px) clamp(22px, 2.4vw, 34px);
  border-top: 1px solid var(--hero-border);
  background:
    radial-gradient(circle at 0 100%, color-mix(in srgb, var(--hero-accent) 7%, transparent), transparent 34%),
    linear-gradient(90deg, var(--hero-soft), #ffffff 62%);
  color: var(--hero-accent-strong);
}

.control-escolar-screen .ce-student-hero-progress-icon {
  display: inline-flex;
  width: 58px;
  height: 58px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--hero-border);
  border-radius: 999px;
  background: #fff;
  color: var(--hero-accent-strong);
  box-shadow: 0 10px 22px rgba(16, 32, 58, 0.055);
}

.control-escolar-screen .ce-student-hero-progress > strong {
  color: #13213a;
  font-size: clamp(18px, 1.35vw, 24px);
  font-weight: 930;
  letter-spacing: -0.025em;
  line-height: 1.1;
  white-space: nowrap;
}

.control-escolar-screen .ce-student-hero-progress-divider {
  width: 1px;
  height: 38px;
  background: #dce5ee;
}

.control-escolar-screen .ce-student-hero-progress-state {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  color: var(--hero-accent-strong);
  white-space: nowrap;
}

.control-escolar-screen .ce-student-hero-progress-state svg {
  flex: 0 0 auto;
  stroke-width: 2.7;
}

.control-escolar-screen .ce-student-hero-progress-state b {
  color: var(--hero-accent-strong);
  font-size: clamp(17px, 1.35vw, 24px);
  font-weight: 930;
  letter-spacing: -0.025em;
}

.control-escolar-screen .ce-student-hero-progress-percent {
  justify-self: end;
  color: var(--hero-accent-strong);
  font-size: clamp(20px, 1.8vw, 30px);
  font-weight: 950;
  letter-spacing: -0.055em;
  line-height: 1;
}

.control-escolar-screen .ce-student-hero-progress-track {
  position: relative;
  display: block;
  height: 14px;
  min-width: 120px;
  overflow: hidden;
  border-radius: 999px;
  background: #e9eff5;
  box-shadow: inset 0 0 0 1px rgba(212, 222, 232, 0.5);
}

.control-escolar-screen .ce-student-hero-progress-track i {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--hero-accent), color-mix(in srgb, var(--hero-accent) 82%, #73c56a));
}

.control-escolar-screen .ce-student-hero-progress-track::after {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    90deg,
    transparent 0,
    transparent calc(12.5% - 1px),
    rgba(255, 255, 255, 0.72) calc(12.5% - 1px),
    rgba(255, 255, 255, 0.72) 12.5%
  );
}

.control-escolar-screen .ce-student-hero-progress-action {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 18px;
  border: 2px solid var(--hero-accent);
  border-radius: 16px;
  background: #fff;
  color: var(--hero-accent-strong);
  font-size: clamp(14px, 1vw, 18px);
  font-weight: 930;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.control-escolar-screen .ce-student-hero-progress-action:hover {
  background: color-mix(in srgb, var(--hero-accent) 7%, #fff);
  box-shadow: 0 12px 22px color-mix(in srgb, var(--hero-accent) 14%, transparent);
  transform: translateY(-1px);
}

@media (max-width: 1480px) {
  .control-escolar-screen .ce-student-hero-main {
    grid-template-columns: 74px minmax(0, 1fr) auto;
    column-gap: 16px;
    min-height: 112px;
    padding: 18px 20px;
  }

  .control-escolar-screen .ce-student-hero-photo {
    --student-grade-photo-width: 74px;
    --student-grade-photo-height: 74px;
    --student-grade-photo-radius: 17px;
  }

  .control-escolar-screen .ce-student-hero-copy {
    gap: 11px;
  }

  .control-escolar-screen .ce-student-hero-copy h2 {
    font-size: clamp(21px, 1.6vw, 29px);
  }

  .control-escolar-screen .ce-student-hero-meta {
    gap: 0 12px;
    font-size: 13.5px;
  }

  .control-escolar-screen .ce-student-hero-meta > i {
    height: 20px;
  }

  .control-escolar-screen .ce-student-hero-status {
    min-height: 38px;
    padding-inline: 16px;
    font-size: 13.5px;
  }

  .control-escolar-screen .ce-student-identity-chip {
    min-height: 27px;
    padding-inline: 10px;
    font-size: 12px;
  }

  .control-escolar-screen .ce-student-hero-side {
    gap: 10px;
  }

  .control-escolar-screen .ce-student-hero-group-sigil {
    width: 132px;
    min-height: 68px;
    gap: 9px;
    padding: 8px 10px 8px 8px;
    border-radius: 21px;
  }

  .control-escolar-screen .ce-student-hero-group-art {
    width: 52px;
    height: 52px;
    border-radius: 18px;
  }

  .control-escolar-screen .ce-student-hero-group-art .ui-group-icon {
    --group-icon-size: 38px;
  }

  .control-escolar-screen .ce-student-hero-group-caption strong {
    max-width: 58px;
    font-size: 12px;
  }

  .control-escolar-screen .ce-student-hero-group-caption em {
    font-size: 9.5px;
  }

  .control-escolar-screen .ce-student-hero-menu {
    width: 44px;
    height: 44px;
    border-radius: 14px;
  }

  .control-escolar-screen .ce-student-hero-progress {
    grid-template-columns: 46px minmax(128px, auto) 1px minmax(104px, auto) auto minmax(110px, 1fr) auto;
    gap: 10px;
    min-height: 72px;
    padding: 12px 20px;
  }

  .control-escolar-screen .ce-student-hero-progress-icon {
    width: 46px;
    height: 46px;
  }

  .control-escolar-screen .ce-student-hero-progress > strong,
  .control-escolar-screen .ce-student-hero-progress-state b {
    font-size: 16px;
  }

  .control-escolar-screen .ce-student-hero-progress-percent {
    font-size: 22px;
  }

  .control-escolar-screen .ce-student-hero-progress-track {
    height: 11px;
    min-width: 92px;
  }

  .control-escolar-screen .ce-student-hero-progress-action {
    min-height: 38px;
    padding-inline: 14px;
    border-radius: 13px;
    font-size: 13px;
  }
}

@media (max-width: 1240px) {
  .control-escolar-screen .ce-student-hero-main {
    grid-template-columns: 68px minmax(0, 1fr);
    grid-template-rows: auto auto;
  }

  .control-escolar-screen .ce-student-hero-side {
    grid-column: 2;
    grid-row: 2;
    min-width: 0;
    justify-content: flex-start;
    flex-wrap: wrap;
    margin-top: 10px;
  }

  .control-escolar-screen .ce-student-hero-status {
    justify-self: start;
  }

  .control-escolar-screen .ce-student-hero-copy {
    gap: 8px;
  }

  .control-escolar-screen .ce-student-hero-meta,
  .control-escolar-screen .ce-student-hero-cues {
    row-gap: 8px;
  }


  .control-escolar-screen .ce-student-hero-progress {
    grid-template-columns: 42px minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
  }

  .control-escolar-screen .ce-student-hero-progress-divider {
    display: none;
  }

  .control-escolar-screen .ce-student-hero-progress-state,
  .control-escolar-screen .ce-student-hero-progress-action {
    grid-column: auto;
  }

  .control-escolar-screen .ce-student-hero-progress-track {
    grid-column: 2 / 4;
  }
}

/* Control Escolar refinements: compact one-row identity cues, wider group sigil, and safer workspace scrolling. */
.control-escolar-screen .ce-student-hero-copy {
  gap: 10px;
}

.control-escolar-screen .ce-student-hero-meta {
  flex-wrap: wrap;
  gap: 8px;
  max-width: 100%;
  overflow: visible;
  padding-bottom: 1px;
  color: #6d7b91;
  font-size: clamp(12.5px, 0.86vw, 15px);
  scrollbar-width: none;
}

.control-escolar-screen .ce-student-hero-meta::-webkit-scrollbar {
  display: none;
}

.control-escolar-screen .ce-student-hero-meta > i {
  display: none;
}

.control-escolar-screen .ce-student-hero-meta-token {
  flex: 0 0 auto;
  min-height: 30px;
}

.control-escolar-screen .ce-student-hero-meta-token.is-matricula,
.control-escolar-screen .ce-student-hero-meta-token.is-grade {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(214, 225, 235, 0.9);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%);
  color: #657286;
  font-size: clamp(11.5px, 0.78vw, 13px);
  font-weight: 860;
  line-height: 1;
  white-space: nowrap;
  box-shadow: 0 7px 15px rgba(16, 32, 58, 0.025), inset 0 1px 0 rgba(255, 255, 255, 0.84);
}

.control-escolar-screen .ce-student-hero-meta-token.is-matricula {
  border-color: rgba(149, 202, 143, 0.44);
  background: linear-gradient(180deg, #f9fdf8 0%, #f0f8ee 100%);
  color: #39723d;
}

.control-escolar-screen .ce-student-hero-cues {
  gap: 8px;
}

.control-escolar-screen .ce-student-hero-pass-card {
  flex: 0 0 auto;
  min-height: 31px;
  padding: 3px 10px 3px 6px;
  font-size: clamp(12px, 0.82vw, 14px);
}

.control-escolar-screen .ce-student-identity-chip {
  flex: 0 0 auto;
  min-height: 29px;
  padding-inline: 10px;
  font-size: clamp(11.5px, 0.78vw, 13px);
}

.control-escolar-screen .ce-student-hero-group-sigil {
  width: clamp(198px, 16.5vw, 252px);
  grid-template-columns: auto minmax(92px, 1fr);
  gap: 14px;
  padding-right: 18px;
}

.control-escolar-screen .ce-student-hero-group-caption strong {
  max-width: 128px;
}

.control-escolar-screen .ce-student-hero-group-caption em {
  white-space: nowrap;
  font-size: 10px;
  letter-spacing: .035em;
}

.control-escolar-screen .ce-student-hero-group-art {
  width: clamp(66px, 5.9vw, 86px);
  height: clamp(66px, 5.9vw, 86px);
}

.control-escolar-screen .ce-detail-body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow-y: auto;
  scroll-padding-bottom: 96px;
}

.control-escolar-screen .ce-edit-form {
  flex: 0 0 auto;
  padding-bottom: max(92px, calc(24px + env(safe-area-inset-bottom)));
}

.control-escolar-screen .ce-primary-pending-card {
  min-height: 168px;
  padding: 16px 14px 14px;
}

.control-escolar-screen .ce-primary-pending-icon {
  width: 46px;
  height: 46px;
}

.control-escolar-screen .ce-primary-pending-copy b {
  font-size: 16px;
}

.control-escolar-screen .ce-primary-pending-card-body {
  min-height: 58px;
  margin-top: 14px;
  padding: 14px 0 12px;
}

.control-escolar-screen .ce-primary-pending-action {
  min-width: 104px;
  min-height: 34px;
}

@media (max-width: 1480px) {
  .control-escolar-screen .ce-primary-pending-grid {
    grid-template-columns: repeat(5, minmax(124px, 1fr));
    gap: 9px;
  }

  .control-escolar-screen .ce-primary-pending-card {
    min-height: 154px;
    padding: 13px 11px 12px;
  }

  .control-escolar-screen .ce-primary-pending-icon {
    width: 40px;
    height: 40px;
  }

  .control-escolar-screen .ce-primary-pending-copy strong,
  .control-escolar-screen .ce-primary-pending-count,
  .control-escolar-screen .ce-primary-pending-meta {
    font-size: 10.5px;
  }

  .control-escolar-screen .ce-primary-pending-copy b {
    font-size: 14px;
  }

  .control-escolar-screen .ce-primary-pending-action {
    min-width: 88px;
  }
}


/* Final UX cleanup: remove instructional pending header, expose the group sigil as a direct decorative control, and ensure the summary scroll reaches the bottom. */
.control-escolar-screen .ce-primary-pending-panel {
  padding: 14px 18px 18px;
}

.control-escolar-screen .ce-pending-summary-strip {
  margin-top: 0;
}

.control-escolar-screen .ce-edit-form {
  padding-bottom: max(136px, calc(68px + env(safe-area-inset-bottom)));
}

.control-escolar-screen .ce-detail-body {
  scroll-padding-bottom: 132px;
}

.control-escolar-screen .ce-student-hero-side {
  gap: clamp(12px, 1.2vw, 18px);
}

.control-escolar-screen .ce-student-hero-group-sigil {
  position: relative;
  display: inline-grid;
  width: clamp(74px, 6.2vw, 96px);
  min-width: 0;
  height: clamp(74px, 6.2vw, 96px);
  grid-template-columns: 1fr;
  place-items: center;
  gap: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #c65c9a;
  box-shadow: none;
  isolation: isolate;
}

.control-escolar-screen .ce-student-hero-group-sigil::after {
  display: none;
}

.control-escolar-screen button.ce-student-hero-group-sigil:hover {
  border-color: transparent;
  box-shadow: none;
  transform: translateY(-1px) scale(1.025);
}

.control-escolar-screen .ce-student-hero-group-art {
  width: clamp(72px, 6vw, 92px);
  height: clamp(72px, 6vw, 92px);
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.control-escolar-screen .ce-student-hero-group-art .ui-group-icon {
  --group-icon-size: clamp(66px, 5.45vw, 86px);
  --group-icon-letter-font-size: .47em;
  --group-icon-stroke-width: .045em;
  opacity: .96;
  filter: drop-shadow(0 16px 24px rgba(168, 75, 131, .14));
}

.control-escolar-screen .ce-student-hero-group-caption {
  display: none;
}

.control-escolar-screen .ce-student-hero-group-edit {
  position: absolute;
  right: clamp(0px, .25vw, 4px);
  bottom: clamp(2px, .35vw, 6px);
  z-index: 2;
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(206, 92, 158, .2);
  border-radius: 999px;
  background: rgba(255, 255, 255, .96);
  color: currentColor;
  box-shadow: 0 8px 18px rgba(16, 32, 58, .11);
}

.control-escolar-screen .ce-student-hero-group-sigil.is-male {
  color: #5d93d8;
}

.control-escolar-screen .ce-student-hero-group-sigil.is-neutral {
  color: #8491a3;
}

.control-escolar-screen .ce-student-hero-group-cta {
  width: auto;
  min-width: clamp(156px, 12vw, 184px);
  min-height: 54px;
  padding: 8px 14px 8px 10px;
  border-radius: 18px;
}

.control-escolar-screen .ce-student-hero-group-cta strong {
  font-size: 11px;
  letter-spacing: .02em;
}

.control-escolar-screen .ce-student-hero-group-cta small {
  display: none;
}

@media (max-width: 1480px) {
  .control-escolar-screen .ce-primary-pending-panel {
    padding: 12px 14px 16px;
  }

  .control-escolar-screen .ce-edit-form {
    padding-bottom: max(148px, calc(76px + env(safe-area-inset-bottom)));
  }

  .control-escolar-screen .ce-student-hero-group-sigil {
    width: 68px;
    height: 68px;
  }

  .control-escolar-screen .ce-student-hero-group-art,
  .control-escolar-screen .ce-student-hero-group-art .ui-group-icon {
    --group-icon-size: 64px;
    width: 64px;
    height: 64px;
  }

  .control-escolar-screen .ce-student-hero-group-edit {
    width: 24px;
    height: 24px;
  }
}

/* Corrected group CTA: keep the sigil decorative, but expose a compact action instead of hiding the CTA. */
.control-escolar-screen .ce-student-hero-group-sigil {
  width: auto;
  min-width: clamp(142px, 11vw, 172px);
  height: auto;
  min-height: clamp(76px, 6.4vw, 94px);
  display: inline-grid;
  grid-template-columns: auto auto;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: #c65c9a;
}

.control-escolar-screen .ce-student-hero-group-sigil::after {
  display: none;
}

.control-escolar-screen button.ce-student-hero-group-sigil:hover {
  border-color: transparent;
  box-shadow: none;
  transform: translateY(-1px);
}

.control-escolar-screen .ce-student-hero-group-art {
  width: clamp(76px, 6.2vw, 96px);
  height: clamp(76px, 6.2vw, 96px);
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.control-escolar-screen .ce-student-hero-group-art .ui-group-icon {
  --group-icon-size: clamp(70px, 5.7vw, 90px);
  --group-icon-letter-font-size: .47em;
  --group-icon-stroke-width: .045em;
  opacity: .96;
  filter: drop-shadow(0 16px 24px rgba(168, 75, 131, .14));
}

.control-escolar-screen .ce-student-hero-group-action {
  position: relative;
  z-index: 2;
  display: inline-grid;
  gap: 2px;
  min-width: 70px;
  padding: 8px 12px;
  border: 1px solid rgba(206, 92, 158, .2);
  border-radius: 999px;
  background: rgba(255, 255, 255, .92);
  color: currentColor;
  text-align: left;
  box-shadow: 0 10px 22px rgba(16, 32, 58, .08), inset 0 1px 0 rgba(255,255,255,.9);
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
}

.control-escolar-screen button.ce-student-hero-group-sigil:hover .ce-student-hero-group-action {
  border-color: color-mix(in srgb, currentColor 32%, #dfe6ef);
  box-shadow: 0 14px 28px rgba(16, 32, 58, .11), inset 0 1px 0 rgba(255,255,255,.94);
  transform: translateX(1px);
}

.control-escolar-screen .ce-student-hero-group-action strong,
.control-escolar-screen .ce-student-hero-group-action small {
  white-space: nowrap;
}

.control-escolar-screen .ce-student-hero-group-action strong {
  color: #16243b;
  font-size: 11px;
  font-weight: 950;
  letter-spacing: -.01em;
  line-height: 1;
}

.control-escolar-screen .ce-student-hero-group-action small {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: currentColor;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .03em;
  line-height: 1;
  text-transform: uppercase;
}

.control-escolar-screen .ce-student-hero-group-sigil.is-male {
  color: #5d93d8;
}

.control-escolar-screen .ce-student-hero-group-sigil.is-neutral {
  color: #8491a3;
}

.control-escolar-screen .ce-student-hero-group-edit,
.control-escolar-screen .ce-student-hero-group-caption {
  display: none;
}

.control-escolar-screen .ce-student-hero-group-cta {
  display: inline-grid;
  grid-template-columns: auto minmax(0, auto);
  width: auto;
  min-width: clamp(150px, 12vw, 184px);
  min-height: 54px;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 10px;
  border: 1px solid rgba(63, 145, 56, .24);
  border-radius: 999px;
  background: rgba(255,255,255,.92);
  color: var(--ce-green-strong);
  box-shadow: 0 12px 24px rgba(63, 145, 56, .09), inset 0 1px 0 rgba(255,255,255,.9);
}

.control-escolar-screen .ce-student-hero-group-cta-icon {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  background: #eef8ea;
}

.control-escolar-screen .ce-student-hero-group-cta strong {
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .015em;
  white-space: nowrap;
}

.control-escolar-screen .ce-student-hero-group-cta small {
  display: block;
  color: #6f9272;
  font-size: 9.5px;
  font-weight: 820;
  white-space: nowrap;
}

@media (max-width: 1480px) {
  .control-escolar-screen .ce-student-hero-group-sigil {
    min-width: 128px;
    min-height: 70px;
    gap: 6px;
  }

  .control-escolar-screen .ce-student-hero-group-art,
  .control-escolar-screen .ce-student-hero-group-art .ui-group-icon {
    --group-icon-size: 64px;
    width: 68px;
    height: 68px;
  }

  .control-escolar-screen .ce-student-hero-group-action {
    min-width: 62px;
    padding: 7px 10px;
  }

  .control-escolar-screen .ce-student-hero-group-action strong {
    font-size: 10px;
  }

  .control-escolar-screen .ce-student-hero-group-action small {
    font-size: 9px;
  }
}


/* Group CTA polish: remove decorative CTA panel gradients and make the action explicit. */
.control-escolar-screen .ce-student-hero-side {
  min-width: 0;
}

.control-escolar-screen .ce-student-hero-group-sigil {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  overflow: visible;
}

.control-escolar-screen .ce-student-hero-group-sigil::after {
  display: none !important;
}

.control-escolar-screen .ce-student-hero-group-sigil.is-female,
.control-escolar-screen .ce-student-hero-group-sigil.is-male,
.control-escolar-screen .ce-student-hero-group-sigil.is-neutral {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.control-escolar-screen .ce-student-hero-group-art {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.control-escolar-screen .ce-student-hero-group-art .ui-group-icon {
  filter: drop-shadow(0 10px 18px color-mix(in srgb, currentColor 14%, transparent));
}

.control-escolar-screen .ce-student-hero-group-action {
  min-width: 96px;
  gap: 4px;
  padding: 8px 11px 8px 12px;
  border: 1px solid color-mix(in srgb, currentColor 24%, #dfe7ef);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
  color: currentColor;
  box-shadow: 0 10px 22px rgba(16, 32, 58, 0.07), inset 0 1px 0 rgba(255,255,255,.92);
}

.control-escolar-screen .ce-student-hero-group-action small {
  order: 1;
  color: #738198;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: .035em;
  line-height: 1;
  text-transform: uppercase;
}

.control-escolar-screen .ce-student-hero-group-action strong {
  order: 2;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #16243b;
  font-size: 11px;
  font-weight: 950;
  letter-spacing: -.01em;
  line-height: 1.05;
}

.control-escolar-screen .ce-student-hero-group-action strong svg {
  color: currentColor;
  stroke-width: 3;
}

.control-escolar-screen button.ce-student-hero-group-sigil:hover .ce-student-hero-group-action {
  border-color: color-mix(in srgb, currentColor 38%, #dfe7ef);
  background: #ffffff;
  box-shadow: 0 14px 28px rgba(16, 32, 58, .1), inset 0 1px 0 rgba(255,255,255,.96);
  transform: translateY(-1px);
}

.control-escolar-screen button.ce-student-hero-group-sigil:focus-visible .ce-student-hero-group-action {
  outline: 3px solid color-mix(in srgb, currentColor 22%, transparent);
  outline-offset: 3px;
}


/* Mobile Control Escolar workbench: phone-native flow layered after all desktop rules. */
.control-escolar-screen .ce-mobile-detail-back {
  display: none;
}

@media (max-width: 820px) {
  .control-escolar-screen {
    --ce-mobile-footer-height: 78px;
    display: flex;
    width: 100% !important;
    height: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
    transform: none !important;
    transform-origin: center;
  }

  .control-escolar-screen,
  .control-escolar-screen * {
    -webkit-tap-highlight-color: transparent;
  }

  .control-escolar-screen .ce-kpi-system {
    flex: 0 0 auto;
    margin: 0 0 8px;
    padding: 0;
  }

  .control-escolar-screen .ce-kpi-strip {
    display: flex;
    min-height: 74px;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 4px 2px 8px;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }

  .control-escolar-screen .ce-kpi-strip::-webkit-scrollbar {
    display: none;
  }

  .control-escolar-screen .ce-kpi-strip .kpi-card {
    position: relative;
    flex: 0 0 clamp(132px, 39vw, 160px);
    min-width: clamp(132px, 39vw, 160px);
    height: 66px;
    min-height: 66px;
    scroll-snap-align: start;
    border-radius: 18px;
    padding: 9px 10px;
    box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
  }

  .control-escolar-screen .ce-kpi-strip .kpi-icon {
    width: 34px;
    height: 34px;
  }

  .control-escolar-screen .ce-kpi-strip .kpi-icon svg {
    width: 19px;
    height: 19px;
  }

  .control-escolar-screen .ce-kpi-strip .kpi-text span {
    max-width: 82px;
    overflow: hidden;
    font-size: 9px;
    line-height: 1.05;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .control-escolar-screen .ce-kpi-strip .kpi-text strong {
    font-size: 22px;
    line-height: 1;
  }

  .control-escolar-screen .ce-kpi-mass {
    right: 9px;
    bottom: 7px;
    grid-template-columns: repeat(6, 3px);
    gap: 2px;
    opacity: 0.72;
  }

  .control-escolar-screen .ce-kpi-mass i {
    width: 3px;
    height: 11px;
  }

  .control-escolar-screen .students-scale-shell {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0 !important;
    min-height: 0;
    overflow: hidden;
    overscroll-behavior: contain;
  }

  .control-escolar-screen .students-design-canvas {
    width: 100% !important;
    height: 100% !important;
    min-width: 0 !important;
    min-height: 0;
    transform: none !important;
  }

  .control-escolar-screen .ce-workspace,
  .control-escolar-screen .ce-workspace.is-browsing,
  .control-escolar-screen .ce-workspace.has-detail,
  .control-escolar-screen .ce-workspace.has-empty-detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: minmax(0, 1fr);
    width: 100%;
    min-width: 0 !important;
    height: 100%;
    gap: 0;
    overflow: hidden;
  }

  .control-escolar-screen .student-list-panel,
  .control-escolar-screen .ce-workspace.is-browsing .student-list-panel,
  .control-escolar-screen .ce-workspace.has-detail .student-list-panel.is-compact {
    width: 100%;
    min-width: 0 !important;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .control-escolar-screen .ce-workspace.has-detail .student-list-panel {
    display: none !important;
  }

  .control-escolar-screen .ce-filter-bar,
  .control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar,
  .control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar {
    position: relative;
    z-index: 4;
    display: grid;
    gap: 8px;
    min-height: 0;
    margin: 0 0 8px;
    padding: 0 1px 2px;
    overflow: visible;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .control-escolar-screen .ce-primary-filter-row,
  .control-escolar-screen .ce-workspace.is-browsing .ce-primary-filter-row,
  .control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-primary-filter-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0 !important;
  }

  .control-escolar-screen .ce-filter-bar .search-control,
  .control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .search-control,
  .control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .search-control {
    width: 100%;
    height: 44px;
    min-width: 0;
    border: 1px solid rgba(213, 225, 237, 0.96);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.045);
  }

  .control-escolar-screen .ce-filter-bar .search-control input {
    min-width: 0;
    font-size: 13px;
  }

  .control-escolar-screen .ce-filter-bar .search-control input::placeholder {
    color: transparent;
  }

  .control-escolar-screen .ce-filter-button,
  .control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-filter-button,
  .control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-filter-button {
    width: 44px;
    min-width: 44px;
    height: 44px;
    min-height: 44px;
    padding: 0;
    border-radius: 16px;
    font-size: 0;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.045);
  }

  .control-escolar-screen .ce-filter-button svg {
    width: 18px;
    height: 18px;
  }

  .control-escolar-screen .ce-filter-button b {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 19px;
    height: 19px;
    border: 2px solid #fff;
    font-size: 9px;
  }

  .control-escolar-screen .ce-primary-filter-row > .ce-chip-cluster--quality,
  .control-escolar-screen .ce-secondary-filter-row {
    display: none !important;
  }

  .control-escolar-screen .ce-filter-bar.is-filter-expanded .ce-primary-filter-row > .ce-chip-cluster--quality {
    display: flex !important;
    grid-column: 1 / -1;
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    padding: 7px;
    border-radius: 16px;
    scroll-snap-type: x proximity;
  }

  .control-escolar-screen .ce-filter-bar.is-filter-expanded .ce-secondary-filter-row {
    display: flex !important;
    width: 100%;
    min-width: 0 !important;
    max-width: 100%;
    gap: 7px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 0 2px;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }

  .control-escolar-screen .ce-filter-bar.is-filter-expanded .ce-secondary-filter-row::-webkit-scrollbar {
    display: none;
  }

  .control-escolar-screen .ce-status-tabs,
  .control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-status-tabs,
  .control-escolar-screen .ce-filter-bar .ce-chip-cluster--grade,
  .control-escolar-screen .ce-filter-bar .ce-chip-cluster--group {
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-align: start;
    scrollbar-width: none;
  }

  .control-escolar-screen .ce-status-tabs::-webkit-scrollbar,
  .control-escolar-screen .ce-filter-bar .ce-chip-cluster--grade::-webkit-scrollbar,
  .control-escolar-screen .ce-filter-bar .ce-chip-cluster--group::-webkit-scrollbar {
    display: none;
  }

  .control-escolar-screen .ce-status-tab,
  .control-escolar-screen .ce-filter-bar :deep(.ui-chip),
  .control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-status-tab,
  .control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar :deep(.ui-chip) {
    min-height: 34px;
    border-radius: 999px;
    padding-inline: 12px;
    font-size: 10px;
  }

  .control-escolar-screen .ce-clear-link,
  .control-escolar-screen .ce-workspace.is-browsing .ce-filter-bar .ce-clear-link,
  .control-escolar-screen .ce-workspace.has-detail .student-list-panel > .ce-filter-bar .ce-clear-link {
    display: none !important;
  }

  .control-escolar-screen .ce-list-card,
  .control-escolar-screen .ce-workspace.is-browsing .ce-list-card,
  .control-escolar-screen .ce-workspace.has-detail .ce-list-card {
    display: flex;
    width: 100%;
    min-width: 0 !important;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
    padding: 0;
    border: 1px solid rgba(219, 230, 240, 0.96);
    border-radius: 20px;
    background: linear-gradient(180deg, #fff, #fbfdff);
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.06);
  }

  .control-escolar-screen .ce-list-titlebar {
    flex: 0 0 auto;
    min-height: 48px;
    padding: 0 10px 0 14px;
  }

  .control-escolar-screen .list-heading-copy h2 {
    font-size: 15px;
    line-height: 1;
  }

  .control-escolar-screen .list-heading-copy h2 span {
    font-size: 13px;
  }

  .control-escolar-screen .ce-list-header-actions {
    gap: 7px;
  }

  .control-escolar-screen .ce-excel-export-button {
    width: 38px;
    min-width: 38px;
    height: 38px;
    padding: 0;
    border-radius: 13px;
  }

  .control-escolar-screen .ce-excel-export-button span {
    display: none;
  }

  .control-escolar-screen .ce-pagination-mini {
    min-height: 34px;
    gap: 4px;
    font-size: 10px;
  }

  .control-escolar-screen .ce-pagination-mini button {
    width: 32px;
    height: 32px;
    border-radius: 11px;
  }

  .control-escolar-screen .ce-list-columns {
    display: none !important;
  }

  .control-escolar-screen .ce-list-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 0 8px 8px;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }

  .control-escolar-screen .ce-list-scroll::-webkit-scrollbar {
    display: none;
  }

  .control-escolar-screen .ce-student-row,
  .control-escolar-screen .ce-workspace.is-browsing .ce-student-row,
  .control-escolar-screen .ce-workspace.has-detail .ce-student-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 36px;
    grid-template-areas:
      "identity action"
      "health health";
    width: 100%;
    min-width: 0 !important;
    min-height: 0;
    gap: 8px 9px;
    margin: 0 0 8px;
    padding: 10px;
    border-radius: 18px;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--grade-soft, #f2f8ef) 24%, #fff), #fff 66%),
      #fff;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.055);
  }

  .control-escolar-screen .student-group-watermark {
    right: 46px;
    opacity: 0.08;
  }

  .control-escolar-screen .ce-student-identity,
  .control-escolar-screen .ce-workspace.is-browsing .ce-student-identity,
  .control-escolar-screen .ce-workspace.has-detail .ce-student-identity {
    grid-area: identity;
    grid-template-columns: var(--student-list-grade-size) var(--student-list-crest-size) minmax(0, 1fr);
    gap: 9px;
    align-items: center;
    min-width: 0;
  }

  .control-escolar-screen .ce-row-check {
    display: none;
  }

  .control-escolar-screen .student-row-grade-card {
    --student-grade-photo-width: 48px;
    --student-grade-photo-height: 52px;
    --student-grade-photo-radius: 14px;
  }

  .control-escolar-screen .student-group-sigil {
    width: 30px;
    height: 30px;
  }

  .control-escolar-screen .student-group-sigil .ui-group-icon {
    --group-icon-size: 30px;
  }

  .control-escolar-screen .ce-student-row .student-copy {
    min-width: 0;
    gap: 5px;
  }

  .control-escolar-screen .ce-student-row .student-copy strong {
    display: block;
    max-width: 100%;
    overflow: visible;
    color: #12213a;
    font-size: 14px;
    line-height: 1.16;
    overflow-wrap: anywhere;
    text-overflow: clip;
    white-space: normal;
  }

  .control-escolar-screen .student-type-line {
    min-height: 20px;
  }

  .control-escolar-screen .student-tipo-chip {
    min-height: 21px;
    padding-inline: 8px;
    font-size: 10px;
  }

  .control-escolar-screen .ce-row-health,
  .control-escolar-screen .ce-workspace.is-browsing .ce-row-health,
  .control-escolar-screen .ce-workspace.has-detail .ce-row-health {
    grid-area: health;
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 9px;
    min-height: 50px;
    padding: 7px 9px;
    border-radius: 15px;
  }

  .control-escolar-screen .ce-row-health .ce-quality-score {
    width: 38px;
    height: 38px;
  }

  .control-escolar-screen .ce-row-health .ce-quality-score b {
    font-size: 9px;
  }

  .control-escolar-screen .ce-quality-cell--expanded strong {
    font-size: 11px;
    line-height: 1.12;
  }

  .control-escolar-screen .ce-row-health-summary {
    font-size: 9.3px;
  }

  .control-escolar-screen .ce-quality-fields--stacked {
    display: none;
  }

  .control-escolar-screen .row-actions {
    grid-area: action;
    align-self: center;
    justify-self: end;
    width: 34px;
    min-width: 34px;
    height: 34px;
  }

  .control-escolar-screen .ce-row-action,
  .control-escolar-screen .ce-row-save-indicator {
    width: 34px;
    height: 34px;
    border-radius: 13px;
  }

  .control-escolar-screen .ce-list-footer {
    flex: 0 0 auto;
    min-height: 46px;
    padding: 0 10px 0 14px;
    font-size: 10px;
  }

  .control-escolar-screen .ce-list-footer > span {
    max-width: 46vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .control-escolar-screen .ce-list-pages {
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .control-escolar-screen .ce-list-pages::-webkit-scrollbar {
    display: none;
  }

  .control-escolar-screen .ce-list-pages button {
    min-width: 28px;
    height: 28px;
    border-radius: 10px;
    font-size: 10px;
  }

  .control-escolar-screen .ce-detail-panel {
    display: flex;
    width: 100%;
    min-width: 0 !important;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .control-escolar-screen .ce-detail-shell {
    width: 100%;
    min-width: 0 !important;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border: 1px solid rgba(219, 230, 240, 0.96);
    border-radius: 22px;
    background: #fff;
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.07);
  }

  .control-escolar-screen .ce-mobile-detail-back {
    position: sticky;
    top: 0;
    z-index: 14;
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    justify-content: flex-start;
    gap: 5px;
    padding: 0 14px;
    border: 0;
    border-bottom: 1px solid rgba(224, 232, 241, 0.96);
    background: rgba(255, 255, 255, 0.96);
    color: #23405e;
    font-size: 13px;
    font-weight: 900;
    text-align: left;
    backdrop-filter: blur(16px);
  }

  .control-escolar-screen .ce-student-hero-header {
    flex: 0 0 auto;
    padding: 10px 10px 8px;
    border-radius: 0;
  }

  .control-escolar-screen .ce-student-hero-main {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
  }

  .control-escolar-screen .ce-student-hero-photo {
    --student-grade-photo-width: 58px;
    --student-grade-photo-height: 64px;
    --student-grade-photo-radius: 16px;
  }

  .control-escolar-screen .ce-student-hero-copy {
    min-width: 0;
  }

  .control-escolar-screen .ce-student-hero-copy h2 {
    display: block;
    max-height: none;
    overflow: visible;
    font-size: 18px;
    line-height: 1.08;
    overflow-wrap: anywhere;
    text-overflow: clip;
    white-space: normal;
  }

  .control-escolar-screen .ce-student-hero-meta {
    max-width: 100%;
    flex-wrap: wrap;
    gap: 5px;
    overflow: visible;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .control-escolar-screen .ce-student-hero-meta::-webkit-scrollbar {
    display: none;
  }

  .control-escolar-screen .ce-student-hero-meta > i {
    display: none;
  }

  .control-escolar-screen .ce-student-hero-meta-token,
  .control-escolar-screen .ce-student-identity-chip,
  .control-escolar-screen .ce-student-hero-pass-card {
    flex: 0 0 auto;
    min-height: 26px;
    border-radius: 999px;
    font-size: 10px;
  }

  .control-escolar-screen .ce-student-hero-cues {
    gap: 5px;
  }

  .control-escolar-screen .ce-student-identity-chip.is-symbol {
    min-width: 26px;
  }

  .control-escolar-screen .ce-student-hero-side {
    display: grid;
    justify-items: end;
    gap: 6px;
    min-width: 0;
  }

  .control-escolar-screen .ce-student-hero-group-sigil,
  .control-escolar-screen .ce-student-hero-group-cta {
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .control-escolar-screen .ce-student-hero-group-art,
  .control-escolar-screen .ce-student-hero-group-art .ui-group-icon {
    --group-icon-size: 46px;
    width: 46px;
    height: 46px;
  }

  .control-escolar-screen .ce-student-hero-group-action,
  .control-escolar-screen .ce-student-hero-group-cta > span:last-child {
    display: none;
  }

  .control-escolar-screen .ce-student-hero-group-cta-icon {
    width: 44px;
    height: 44px;
  }

  .control-escolar-screen .ce-student-hero-status {
    min-height: 23px;
    padding: 0 8px;
    font-size: 9px;
  }

  .control-escolar-screen .ce-student-hero-menu {
    display: none;
  }

  .control-escolar-screen .ce-student-hero-progress {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 6px 8px;
    align-items: center;
    margin-top: 8px;
    padding: 8px;
    border-radius: 16px;
  }

  .control-escolar-screen .ce-student-hero-progress-icon,
  .control-escolar-screen .ce-student-hero-progress-divider,
  .control-escolar-screen .ce-student-hero-progress-state svg {
    display: none;
  }

  .control-escolar-screen .ce-student-hero-progress strong {
    font-size: 10px;
  }

  .control-escolar-screen .ce-student-hero-progress-state b {
    font-size: 10px;
  }

  .control-escolar-screen .ce-student-hero-progress-percent {
    font-size: 13px;
  }

  .control-escolar-screen .ce-student-hero-progress-track {
    grid-column: 1 / -1;
    height: 7px;
  }

  .control-escolar-screen .ce-student-hero-progress-action {
    min-height: 28px;
    padding: 0 9px;
    border-radius: 999px;
    font-size: 10px;
  }

  .control-escolar-screen .ce-detail-body {
    flex: 1 1 auto;
    min-height: 0;
    gap: 8px;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 0 9px 10px;
    background: linear-gradient(180deg, #fff 0%, #fbfcfe 100%);
    overscroll-behavior: contain;
    scrollbar-width: none;
  }

  .control-escolar-screen .ce-detail-body::-webkit-scrollbar {
    display: none;
  }

  .control-escolar-screen .ce-detail-tabs {
    position: sticky;
    top: 0;
    z-index: 12;
    display: flex;
    width: calc(100% + 18px);
    max-width: none;
    gap: 7px;
    overflow-x: auto;
    overflow-y: hidden;
    margin: 0 -9px;
    padding: 8px 9px;
    border-bottom: 1px solid rgba(224, 232, 241, 0.9);
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(16px);
    scrollbar-width: none;
  }

  .control-escolar-screen .ce-detail-tabs::-webkit-scrollbar {
    display: none;
  }

  .control-escolar-screen .ce-detail-tabs button {
    flex: 0 0 auto;
    min-height: 38px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 10px;
  }

  .control-escolar-screen .ce-tab-main {
    gap: 5px;
    white-space: nowrap;
  }

  .control-escolar-screen .ce-tab-badge {
    min-width: 18px;
    height: 18px;
    font-size: 9px;
  }

  .control-escolar-screen .ce-edit-form {
    width: 100%;
    min-width: 0 !important;
    gap: 10px;
    padding-bottom: max(116px, calc(90px + env(safe-area-inset-bottom)));
  }

  .control-escolar-screen .ce-form-card.ce-tab-panel,
  .control-escolar-screen .ce-primary-pending-panel,
  .control-escolar-screen .ce-advanced-section,
  .control-escolar-screen .ce-family-card,
  .control-escolar-screen .ce-complete-nested,
  .control-escolar-screen .ce-husky-card,
  .control-escolar-screen .ce-system-panel {
    width: 100%;
    min-width: 0 !important;
    border-radius: 18px;
    padding: 13px;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.045);
  }

  .control-escolar-screen .ce-panel-heading,
  .control-escolar-screen .ce-section-heading.compact {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
    margin-bottom: 10px;
  }

  .control-escolar-screen .ce-panel-heading h3,
  .control-escolar-screen .ce-section-heading.compact h3 {
    font-size: 14px;
    line-height: 1.15;
  }

  .control-escolar-screen .ce-panel-heading p,
  .control-escolar-screen .ce-section-heading.compact p {
    font-size: 11px;
    line-height: 1.25;
  }

  .control-escolar-screen .ce-panel-status {
    align-self: start;
    min-height: 25px;
    padding-inline: 8px;
    border-radius: 999px;
    font-size: 9px;
    white-space: nowrap;
  }

  .control-escolar-screen .ce-primary-pending-grid,
  .control-escolar-screen .ce-pending-summary-metrics,
  .control-escolar-screen .ce-health-overview,
  .control-escolar-screen .ce-complete-grid,
  .control-escolar-screen .ce-family-grid,
  .control-escolar-screen .ce-family-fields,
  .control-escolar-screen .ce-family-fields--father,
  .control-escolar-screen .ce-family-fields--mother,
  .control-escolar-screen .ce-form-grid,
  .control-escolar-screen .ce-form-grid.two,
  .control-escolar-screen .ce-form-grid.three,
  .control-escolar-screen .ce-form-grid.ce-identity-grid,
  .control-escolar-screen .ce-advanced-upload-grid,
  .control-escolar-screen .ce-husky-actions,
  .control-escolar-screen .ce-husky-manual-actions,
  .control-escolar-screen .ce-husky-credentials {
    display: grid;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 10px;
    min-width: 0 !important;
  }

  .control-escolar-screen .ce-school-priority-panel,
  .control-escolar-screen .ce-group-picker-card,
  .control-escolar-screen .ce-pending-summary-strip {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    min-width: 0;
  }

  .control-escolar-screen .ce-family-span-2,
  .control-escolar-screen .ce-wide-field,
  .control-escolar-screen .ce-wide-field.ce-family-address,
  .control-escolar-screen .standalone {
    grid-column: auto !important;
    width: 100%;
    min-width: 0 !important;
  }

  .control-escolar-screen .ce-form-grid label,
  .control-escolar-screen .ce-wide-field,
  .control-escolar-screen .ce-family-card label,
  .control-escolar-screen .ce-husky-manual-form label {
    min-width: 0 !important;
  }

  .control-escolar-screen .ce-form-grid input,
  .control-escolar-screen .ce-form-grid select,
  .control-escolar-screen .ce-form-grid textarea,
  .control-escolar-screen .ce-wide-field textarea,
  .control-escolar-screen .ce-family-card input,
  .control-escolar-screen .ce-husky-manual-form input,
  .control-escolar-screen .ce-group-combobox input {
    min-height: 46px;
    border-radius: 14px;
    font-size: 16px;
  }

  .control-escolar-screen textarea {
    min-height: 112px;
  }

  .control-escolar-screen .ce-inline-suggestion-menu,
  .control-escolar-screen .ce-group-options {
    max-width: calc(100vw - 42px);
  }

  .control-escolar-screen .ce-detail-footer {
    position: sticky;
    bottom: 0;
    z-index: 18;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: var(--ce-mobile-footer-height);
    gap: 9px;
    padding: 10px max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
    border-top: 1px solid rgba(218, 228, 238, 0.98);
    background: rgba(255, 255, 255, 0.97);
    box-shadow: 0 -16px 34px rgba(15, 23, 42, 0.09);
  }

  .control-escolar-screen .ce-detail-footer-meta {
    display: grid !important;
    min-width: 0;
    gap: 4px;
  }

  .control-escolar-screen .ce-detail-footer .ce-save-state,
  .control-escolar-screen .ce-save-state {
    width: max-content;
    max-width: 100%;
    min-height: 27px;
    padding: 0 9px;
    font-size: 9px;
  }

  .control-escolar-screen .ce-last-update-text {
    max-width: 45vw;
    overflow: hidden;
    color: #647188;
    font-size: 10px;
    font-weight: 760;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .control-escolar-screen .ce-detail-footer-actions {
    display: flex !important;
    align-items: center;
    gap: 7px;
  }

  .control-escolar-screen .ce-detail-footer :deep(.ui-button) {
    min-width: 0;
    min-height: 44px;
    border-radius: 15px;
    padding-inline: 12px;
    font-size: 12px;
  }


  .control-escolar-screen .ce-save-error {
    border-radius: 15px;
    font-size: 12px;
    line-height: 1.25;
  }

  .control-escolar-screen .ce-source-unavailable,
  .control-escolar-screen .ce-state-card {
    min-height: 260px;
    margin: 8px;
    border-radius: 18px;
    padding: 18px;
  }

  .control-escolar-screen .ce-import-modal,
  .control-escolar-screen .ce-diagnostics-modal {
    width: min(100%, calc(100vw - 24px));
    max-height: calc(100dvh - 32px);
    border-radius: 22px;
  }
}

@media (max-width: 430px) {
  .control-escolar-screen .ce-kpi-strip .kpi-card {
    flex-basis: 128px;
    min-width: 128px;
  }

  .control-escolar-screen .ce-student-hero-main {
    grid-template-columns: 54px minmax(0, 1fr) 48px;
    gap: 8px;
  }

  .control-escolar-screen .ce-student-hero-copy h2 {
    font-size: 16px;
  }

  .control-escolar-screen .ce-student-row .student-copy strong {
    font-size: 13.5px;
  }

  .control-escolar-screen .ce-detail-footer {
    grid-template-columns: minmax(0, 1fr);
  }

  .control-escolar-screen .ce-detail-footer-actions {
    justify-content: stretch;
  }

  .control-escolar-screen .ce-detail-footer-actions :deep(.ui-button:last-child) {
    flex: 1 1 auto;
  }
}


/* Mobile polish pass: focused detail mode, calmer KPI cards, and collapsible student chrome. */
@media (max-width: 820px) {
  .control-escolar-screen.has-selected-student .ce-kpi-system {
    display: none;
  }

  .control-escolar-screen .ce-kpi-system {
    margin: 0 0 10px;
  }

  .control-escolar-screen .ce-kpi-strip {
    min-height: 92px;
    gap: 10px;
    padding: 6px 2px 10px;
  }

  .control-escolar-screen .ce-kpi-strip .kpi-card {
    isolation: isolate;
    flex: 0 0 clamp(156px, 42vw, 188px);
    min-width: clamp(156px, 42vw, 188px);
    height: 82px;
    min-height: 82px;
    grid-template-columns: 38px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    overflow: hidden;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--kpi-color, #3f9138) 18%, rgba(220, 231, 240, 0.98));
    border-radius: 22px;
    background:
      radial-gradient(circle at 0 0, color-mix(in srgb, var(--kpi-color, #3f9138) 15%, transparent), transparent 58%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.98), color-mix(in srgb, var(--kpi-color, #3f9138) 4%, #ffffff));
    box-shadow: 0 14px 30px rgba(15, 23, 42, 0.075);
  }

  .control-escolar-screen .ce-kpi-strip .kpi-card::after {
    content: "";
    position: absolute;
    inset: auto 10px 9px 58px;
    z-index: -1;
    height: 4px;
    border-radius: 999px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--kpi-color, #3f9138) 45%, transparent), transparent);
    opacity: 0.34;
  }

  .control-escolar-screen .ce-kpi-strip .kpi-card.active {
    border-color: color-mix(in srgb, var(--kpi-color, #3f9138) 42%, rgba(220, 231, 240, 0.98));
    background:
      radial-gradient(circle at 0 0, color-mix(in srgb, var(--kpi-color, #3f9138) 22%, transparent), transparent 64%),
      linear-gradient(180deg, #ffffff, color-mix(in srgb, var(--kpi-color, #3f9138) 9%, #ffffff));
    box-shadow: 0 16px 34px color-mix(in srgb, var(--kpi-color, #3f9138) 14%, rgba(15, 23, 42, 0.08));
  }

  .control-escolar-screen .ce-kpi-strip .kpi-icon {
    width: 38px;
    height: 38px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--kpi-color, #3f9138) 10%, #ffffff);
  }

  .control-escolar-screen .ce-kpi-strip .kpi-icon svg {
    width: 19px;
    height: 19px;
  }

  .control-escolar-screen .ce-kpi-strip .kpi-text {
    min-width: 0;
    gap: 4px;
  }

  .control-escolar-screen .ce-kpi-strip .kpi-text span {
    max-width: none;
    overflow: visible;
    font-size: 9.5px;
    line-height: 1.1;
    letter-spacing: .045em;
    text-overflow: clip;
    white-space: normal;
  }

  .control-escolar-screen .ce-kpi-strip .kpi-text strong {
    font-size: 25px;
    line-height: .95;
    letter-spacing: -.04em;
  }

  .control-escolar-screen .ce-kpi-mass {
    display: none;
  }

  .control-escolar-screen .ce-detail-shell,
  .control-escolar-screen .ce-mobile-detail-back,
  .control-escolar-screen .ce-student-hero-header,
  .control-escolar-screen .ce-student-hero-main,
  .control-escolar-screen .ce-student-hero-photo,
  .control-escolar-screen .ce-student-hero-copy h2,
  .control-escolar-screen .ce-student-hero-meta,
  .control-escolar-screen .ce-student-hero-progress,
  .control-escolar-screen .ce-detail-body {
    transition:
      min-height .22s ease,
      height .22s ease,
      max-height .22s ease,
      padding .22s ease,
      gap .22s ease,
      opacity .18s ease,
      transform .22s ease;
  }

  .control-escolar-screen .ce-student-hero-header {
    position: relative;
    z-index: 13;
    box-shadow: 0 1px 0 rgba(223, 232, 241, 0.72);
  }

  .control-escolar-screen .ce-detail-shell.is-mobile-detail-scrolled .ce-mobile-detail-back {
    min-height: 38px;
    padding-inline: 12px;
    background: rgba(255, 255, 255, 0.985);
  }

  .control-escolar-screen .ce-detail-shell.is-mobile-detail-scrolled .ce-student-hero-header {
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.985);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
    backdrop-filter: blur(18px) saturate(140%);
  }

  .control-escolar-screen .ce-detail-shell.is-mobile-detail-scrolled .ce-student-hero-main {
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 8px;
  }

  .control-escolar-screen .ce-detail-shell.is-mobile-detail-scrolled .ce-student-hero-photo {
    --student-grade-photo-width: 42px;
    --student-grade-photo-height: 46px;
    --student-grade-photo-radius: 13px;
  }

  .control-escolar-screen .ce-detail-shell.is-mobile-detail-scrolled .ce-student-hero-copy h2 {
    display: -webkit-box;
    overflow: hidden;
    max-height: 34px;
    font-size: 14.5px;
    line-height: 1.08;
    text-overflow: clip;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .control-escolar-screen .ce-detail-shell.is-mobile-detail-scrolled .ce-student-hero-meta,
  .control-escolar-screen .ce-detail-shell.is-mobile-detail-scrolled .ce-student-hero-cues {
    max-height: 0;
    overflow: hidden;
    padding: 0;
    opacity: 0;
    transform: translateY(-4px);
    pointer-events: none;
  }

  .control-escolar-screen .ce-detail-shell.is-mobile-detail-scrolled .ce-student-hero-side,
  .control-escolar-screen .ce-detail-shell.is-mobile-detail-scrolled .ce-student-hero-progress {
    display: none;
  }

  .control-escolar-screen .ce-detail-shell.is-mobile-detail-scrolled .ce-detail-tabs {
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.055);
  }

  .control-escolar-screen .ce-detail-footer {
    --ce-mobile-footer-height: 64px;
    min-height: var(--ce-mobile-footer-height);
    padding-top: 8px;
  }

  .control-escolar-screen .ce-detail-footer .ce-save-state,
  .control-escolar-screen .ce-save-state {
    min-height: 24px;
  }

  .control-escolar-screen .ce-last-update-text {
    font-size: 9.5px;
  }

  .control-escolar-screen .ce-edit-form {
    padding-bottom: max(104px, calc(80px + env(safe-area-inset-bottom)));
  }
}

@media (max-width: 430px) {
  .control-escolar-screen .ce-kpi-strip .kpi-card {
    flex-basis: 152px;
    min-width: 152px;
  }

  .control-escolar-screen .ce-detail-shell.is-mobile-detail-scrolled .ce-student-hero-main {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .control-escolar-screen .ce-detail-shell.is-mobile-detail-scrolled .ce-student-hero-photo {
    --student-grade-photo-width: 40px;
    --student-grade-photo-height: 44px;
  }

  .control-escolar-screen .ce-detail-shell.is-mobile-detail-scrolled .ce-student-hero-copy h2 {
    font-size: 13.8px;
  }
}


/* Control Escolar row composition polish: compact rails must keep identity readable and aligned. */
.control-escolar-screen .student-list-panel.is-compact .ce-list-card {
  --student-list-grade-size: 52px;
  --student-list-grade-height: 56px;
  --student-list-crest-size: 32px;
}

.control-escolar-screen .ce-workspace.has-detail .ce-student-row {
  position: relative;
  grid-template-columns: minmax(0, 1fr) 38px 30px;
  grid-template-areas: "identity health action";
  align-items: center;
  width: 100%;
  min-width: 0 !important;
  min-height: 82px;
  gap: 8px;
  padding: 8px 9px 8px 8px;
  overflow: hidden;
}

.control-escolar-screen .ce-workspace.has-detail .ce-student-identity {
  grid-area: identity;
  grid-template-columns: var(--student-list-grade-size) var(--student-list-crest-size) minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  justify-items: start;
  min-width: 0;
}

.control-escolar-screen .ce-workspace.has-detail .ce-row-check {
  display: none;
}

.control-escolar-screen .student-list-panel.is-compact .ce-student-row .student-copy,
.control-escolar-screen .ce-workspace.has-detail .ce-student-row .student-copy {
  display: flex;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 5px;
  text-align: left;
}

.control-escolar-screen .student-list-panel.is-compact .ce-student-row .student-copy strong,
.control-escolar-screen .ce-workspace.has-detail .ce-student-row .student-copy strong {
  grid-area: auto;
  width: 100%;
  max-width: 100%;
  color: #14223b;
  font-size: 13.6px;
  font-weight: 930;
  line-height: 1.12;
  letter-spacing: -0.012em;
  text-align: left;
  text-wrap: pretty;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
}

.control-escolar-screen .student-list-panel.is-compact .ce-student-row .student-type-line,
.control-escolar-screen .ce-workspace.has-detail .ce-student-row .student-type-line {
  grid-area: auto;
  display: flex;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  justify-content: flex-start;
  justify-self: start;
  align-self: flex-start;
}

.control-escolar-screen .ce-workspace.has-detail .ce-student-row .student-tipo-chip {
  max-width: 100%;
  min-height: 20px;
  padding-inline: 8px;
  font-size: 9.6px;
}

.control-escolar-screen .ce-workspace.has-detail .ce-row-health {
  grid-area: health;
  display: flex;
  width: 38px;
  min-width: 38px;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  justify-self: end;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  box-shadow: none;
}

.control-escolar-screen .ce-workspace.has-detail .ce-row-health .ce-quality-score {
  width: 32px;
  height: 32px;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--ce-health-accent, var(--ce-green)) 13%, rgba(15, 23, 42, 0.08));
}

.control-escolar-screen .ce-workspace.has-detail .ce-row-health .ce-quality-score::after {
  inset: 4px;
}

.control-escolar-screen .ce-workspace.has-detail .ce-row-health .ce-quality-score b {
  font-size: 7.8px;
}

.control-escolar-screen .ce-workspace.has-detail .ce-quality-cell--expanded,
.control-escolar-screen .ce-workspace.has-detail .ce-quality-fields--stacked {
  display: none;
}

.control-escolar-screen .ce-workspace.has-detail .row-actions {
  grid-area: action;
  width: 30px;
  min-width: 30px;
  justify-self: end;
}

.control-escolar-screen .ce-workspace.has-detail .ce-row-action,
.control-escolar-screen .ce-workspace.has-detail .ce-row-save-indicator {
  width: 30px;
  height: 30px;
  border-radius: 11px;
}

@media (max-width: 820px) {
  .control-escolar-screen .student-list-panel.is-compact .ce-list-card {
    --student-list-grade-size: 48px;
    --student-list-grade-height: 52px;
    --student-list-crest-size: 30px;
  }

  .control-escolar-screen .ce-student-row .student-copy,
  .control-escolar-screen .ce-workspace.is-browsing .ce-student-row .student-copy,
  .control-escolar-screen .ce-workspace.has-detail .ce-student-row .student-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    text-align: left;
  }

  .control-escolar-screen .ce-student-row .student-copy strong,
  .control-escolar-screen .ce-workspace.is-browsing .ce-student-row .student-copy strong,
  .control-escolar-screen .ce-workspace.has-detail .ce-student-row .student-copy strong {
    width: 100%;
    text-align: left;
    text-wrap: pretty;
  }

  .control-escolar-screen .ce-student-row .student-type-line,
  .control-escolar-screen .ce-workspace.is-browsing .ce-student-row .student-type-line,
  .control-escolar-screen .ce-workspace.has-detail .ce-student-row .student-type-line {
    justify-content: flex-start;
    align-self: flex-start;
  }
}


/* Control Escolar matrícula token polish: the row identifier should read as quiet metadata, not a long pill. */
.control-escolar-screen .ce-student-row .student-matricula-token,
.control-escolar-screen .ce-student-row .student-matricula-token.interno,
.control-escolar-screen .ce-student-row .student-matricula-token.externo,
.control-escolar-screen .student-list-panel.is-compact .ce-student-row .student-matricula-token,
.control-escolar-screen .ce-workspace.has-detail .ce-student-row .student-matricula-token {
  position: relative;
  display: inline-flex;
  width: auto;
  min-width: 0;
  max-width: none;
  min-height: auto;
  align-items: center;
  justify-content: flex-start;
  gap: 5px;
  padding: 0;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: color-mix(in srgb, var(--grade-accent, var(--ce-green)) 70%, #16321f);
  font-size: 12px;
  font-weight: 880;
  letter-spacing: 0.018em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
}

.control-escolar-screen .ce-student-row .student-matricula-token::before {
  content: "";
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.38;
}

.control-escolar-screen .ce-student-row .student-matricula-token.externo {
  color: #315fa7;
}

.control-escolar-screen .ce-student-row .student-matricula-line {
  min-height: auto;
  align-items: center;
}

.control-escolar-screen .student-list-panel.is-compact .ce-student-row .student-matricula-line,
.control-escolar-screen .ce-workspace.has-detail .ce-student-row .student-matricula-line {
  width: auto;
  max-width: 100%;
  overflow: visible;
}

@media (max-width: 820px) {
  .control-escolar-screen .ce-student-row .student-matricula-token,
  .control-escolar-screen .ce-workspace.is-browsing .ce-student-row .student-matricula-token,
  .control-escolar-screen .ce-workspace.has-detail .ce-student-row .student-matricula-token {
    font-size: 11.4px;
    letter-spacing: 0.016em;
  }
}

</style>
