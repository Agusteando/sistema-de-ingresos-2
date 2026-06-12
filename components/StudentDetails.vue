<template>
  <div
    v-if="detailsExpanded"
    ref="detailsPlaceholder"
    class="student-detail-shell-placeholder"
    aria-hidden="true"
  ></div>
  <Teleport to="body" :disabled="!detailsExpanded">
    <div
      ref="detailsShell"
      :class="[
        'student-details-shell',
        {
          'student-details-shell--expanded': detailsExpanded,
          'is-detail-transitioning': detailTransitioning,
        },
      ]"
      :aria-expanded="detailsExpanded"
      :style="detailShellRootStyle"
      @keydown.esc.stop="setDetailsExpanded(false)"
    >
      <div
        :class="[
          'detail-expand-rail',
          { 'detail-expand-rail--expanded': detailsExpanded },
        ]"
      >
        <button
          class="detail-expand-zone"
          type="button"
          :aria-label="
            detailsExpanded
              ? 'Contraer panel del estado de cuenta'
              : 'Ampliar panel del estado de cuenta'
          "
          :aria-expanded="detailsExpanded"
          :title="
            detailsExpanded ? 'Contraer panel' : 'Ampliar estado de cuenta'
          "
          @click.stop="toggleDetailsExpanded"
        >
          <span class="detail-expand-preview" aria-hidden="true">
            <LucideMinimize2 v-if="detailsExpanded" :size="14" />
            <LucideMaximize2 v-else :size="14" />
          </span>
          <span class="detail-expand-copy">{{
            detailsExpanded ? "Contraer vista" : "Ampliar estado de cuenta"
          }}</span>
        </button>
        <button
          v-if="detailsExpanded"
          class="detail-shell-close"
          type="button"
          aria-label="Cerrar vista ampliada"
          title="Cerrar vista ampliada"
          @click.stop="setDetailsExpanded(false)"
        >
          <LucideX :size="18" />
        </button>
      </div>
      <section
        ref="accountCard"
        :class="[
          'account-card',
          {
            'account-card--embedded': !detailsExpanded,
            'account-card--workspace': detailsExpanded,
            'is-account-transitioning': detailTransitioning,
            'is-account-refreshing': isAccountRefreshing,
            'is-account-stale':
              accountStateSyncState.status === 'failed' &&
              accountStateSyncState.hasCache,
          },
        ]"
        role="region"
        aria-label="Estado de cuenta"
        :aria-expanded="detailsExpanded"
        :style="studentPresentationStyle(student)"
      >
        <UiGroupIcon
          v-if="!detailsExpanded"
          class="account-card-watermark"
          :class="{ 'is-missing-group': studentMissingGroup(student) }"
          :label="studentGroupLabel(student)"
          :missing="studentMissingGroup(student)"
        />

        <section
          v-if="!detailsExpanded"
          class="account-student-composition"
          :class="{
            inactive: student.estatus !== 'Activo',
            unenrolled: !isEnrolled,
          }"
          aria-label="Alumno seleccionado"
        >
          <UiGroupIcon
            class="account-student-watermark"
            :class="{ 'is-missing-group': studentMissingGroup(student) }"
            :label="studentGroupLabel(student)"
            :missing="studentMissingGroup(student)"
          />
          <div class="profile-main">
            <div class="profile-identity">
              <StudentAccountPhotoCard
                :student="student"
                :photo-url="photoUrl || ''"
                :photo-loading="photoLoading"
              />

              <div class="profile-copy">
                <h2 :title="student.nombreCompleto">
                  <span
                    v-if="student.estatus !== 'Activo'"
                    class="state-badge red"
                    >BAJA</span
                  >
                  <span v-else-if="!isEnrolled" class="state-badge orange"
                    >NO INSCRITO</span
                  >
                  <span
                    :class="
                      student.estatus !== 'Activo'
                        ? 'line-through decoration-red-400/50'
                        : ''
                    "
                    >{{ student.nombreCompleto }}</span
                  >
                </h2>
                <p>
                  <span class="student-code">{{ student.matricula }}</span>
                  <i></i>
                  {{ resolvedNivelLabel }} · {{ gradeVisualTitle(student) }} ·
                  {{ studentGroupInlineLabel(student) }}
                  <template v-if="student.matriculaAnterior">
                    <i></i>
                    Ant. {{ student.matriculaAnterior }}
                  </template>
                  <template v-if="student.matriculaSiguiente">
                    <i></i>
                    Sig. {{ student.matriculaSiguiente }}
                  </template>
                  <em v-if="student.estatus !== 'Activo'"
                    >(Motivo: {{ student.estatus }})</em
                  >
                </p>
                <div class="tipo-ingreso-row">
                  <span
                    :class="['tipo-ingreso-badge', resolvedTipoIngreso.value]"
                    :title="`${resolvedTipoIngresoLabel} en ${selectedCicloLabel}. ${resolvedTipoIngreso.reason}`"
                  >
                    <LucideBuilding2
                      v-if="resolvedTipoIngreso.value === 'interno'"
                      :size="12"
                      :stroke-width="2.4"
                    />
                    <LucideGlobe2 v-else :size="12" :stroke-width="2.4" />
                    {{ resolvedTipoIngresoLabel }}
                  </span>
                  <span
                    v-if="tipoIngresoOverrideActive"
                    class="tipo-ingreso-override-chip"
                    title="Override manual activo: fuerza Externo y omite la regla automática"
                  >
                    Override
                  </span>
                </div>
                <div
                  v-if="student.customSections?.length"
                  class="detail-section-badges"
                >
                  <b
                    v-for="section in student.customSections"
                    :key="`detail-section-${student.matricula}-${section.id}`"
                    >{{ section.name }}</b
                  >
                </div>
              </div>
            </div>

            <div class="profile-top-actions">
              <button
                class="ingreso-icon-button"
                type="button"
                aria-label="Corregir ciclo de ingreso"
                title="Ciclo de ingreso"
                @click="showIngresoCycleModal = true"
              >
                <LucideCalendarClock :size="18" />
              </button>
              <button
                v-if="student.estatus === 'Activo'"
                class="danger-icon-button"
                title="Dar de baja"
                @click="$emit('baja', student)"
              >
                <LucideUserX :size="19" />
              </button>
              <button
                class="plain-icon-button"
                @click="$emit('close')"
                title="Cerrar detalles"
              >
                <LucideX :size="20" />
              </button>
            </div>
          </div>

          <div
            class="profile-actions profile-toolbar"
            role="toolbar"
            aria-label="Acciones del alumno"
          >
            <button
              class="profile-action-button profile-action-button--primary profile-action-button--document-primary"
              title="Agregar documento"
              @click="showDocModal = true"
            >
              <LucideFilePlus :size="15" />
              <span class="profile-action-label">Agregar documento</span>
            </button>
            <button
              class="profile-action-button profile-action-button--pay-compact"
              title="Pagar conceptos seleccionados"
              :disabled="!selectedDebts.length"
              @click="showPaymentModal = true"
            >
              <LucideCreditCard :size="15" />
              <span class="profile-action-label">Pagar</span>
              <span v-if="selectedDebts.length" class="profile-action-count">{{ selectedDebts.length }}</span>
            </button>
            <button
              class="profile-action-button"
              title="Facturar conceptos seleccionados"
              :disabled="!selectedDebts.length"
              @click="showInvoiceModal = true"
            >
              <LucideFileText :size="15" />
              <span class="profile-action-label">Facturar</span>
            </button>
            <button
              class="profile-action-button"
              type="button"
              title="Carta de no adeudo"
              @click="showNoAdeudoModal = true"
            >
              <LucideShieldCheck :size="15" />
              <span class="profile-action-label">No adeudo</span>
            </button>
            <button
              class="profile-action-button profile-action-button--menu"
              type="button"
              aria-label="Más acciones"
              title="Más acciones"
              @click="showStudentActionsMenu"
            >
              <LucideMoreVertical :size="15" />
              <span class="profile-action-label">Más</span>
              <LucideChevronDown class="profile-action-caret" :size="14" />
            </button>
          </div>

          <section
            v-if="siblings.length"
            class="account-family-strip"
            aria-label="Familia y hermanos"
          >
            <div class="account-family-header">
              <h4>Familia / Hermanos</h4>
              <small>Control Escolar</small>
            </div>
            <div class="account-family-list">
              <button
                v-for="sib in siblings"
                :key="sib.matricula"
                @click="$emit('switch-student', sib.matricula)"
              >
                <LucideUsers :size="13" /> {{ sib.nombreCompleto }} ({{
                  sib.grado
                }})
              </button>
            </div>
          </section>
        </section>

        <div class="account-header">
          <div class="account-title-area">
            <div class="account-title-copy">
              <div class="account-title-row">
                <h3>Estado de Cuenta</h3>
                <span
                  :class="[
                    'account-sync-indicator',
                    accountStateSyncState.status,
                    { 'is-hidden': !accountSyncVisible },
                  ]"
                  :title="accountStateSyncState.message"
                  :aria-hidden="!accountSyncVisible"
                  aria-live="polite"
                  role="button"
                  :tabindex="accountSyncVisible ? 0 : -1"
                  @click.stop="openFinancialSyncDiagnostics"
                  @keydown.enter.prevent="openFinancialSyncDiagnostics"
                  @keydown.space.prevent="openFinancialSyncDiagnostics"
                >
                  <i aria-hidden="true"></i>
                  <span class="account-sync-label">{{ accountSyncLabel }}</span>
                </span>
                <button
                  class="account-expediente-button"
                  type="button"
                  :class="{ complete: accountExpedienteProgress.complete }"
                  :title="accountExpedienteTitle"
                  @click.stop="emit('open-operator-info', accountOverlaySource)"
                >
                  <LucideShieldCheck :size="13" />
                  <span class="account-expediente-label">Expediente</span>
                  <span class="account-expediente-short">Exp.</span>
                  {{ accountExpedienteProgress.progress }}%
                </button>
              </div>
            </div>
          </div>

          <div v-if="detailsExpanded" class="account-expanded-student">
            <StudentAccountPhotoCard
              :student="student"
              :photo-url="photoUrl || ''"
              :photo-loading="photoLoading"
            />
            <div class="account-expanded-student-copy">
              <strong>{{ student.nombreCompleto }}</strong>
              <p>
                <span class="student-code">{{ student.matricula }}</span>
                <i></i>
                {{ resolvedNivelLabel }} · {{ gradeVisualTitle(student) }} ·
                {{ studentGroupInlineLabel(student) }}
              </p>
              <div
                v-if="accountMetaItems.length"
                class="account-student-meta"
                aria-label="Datos complementarios del alumno"
              >
                <span v-for="item in accountMetaItems" :key="item.label">
                  <small>{{ item.label }}</small
                  >{{ item.value }}
                </span>
              </div>
            </div>
            <span
              :class="['tipo-ingreso-badge', resolvedTipoIngreso.value]"
              :title="`${resolvedTipoIngresoLabel} en ${selectedCicloLabel}. ${resolvedTipoIngreso.reason}`"
            >
              <LucideBuilding2
                v-if="resolvedTipoIngreso.value === 'interno'"
                :size="12"
                :stroke-width="2.4"
              />
              <LucideGlobe2 v-else :size="12" :stroke-width="2.4" />
              {{ resolvedTipoIngresoLabel }}
            </span>
            <span
              v-if="tipoIngresoOverrideActive"
              class="tipo-ingreso-override-chip"
              title="Override manual activo: fuerza Externo y omite la regla automática"
            >
              Override
            </span>
          </div>

          <template v-else>
            <label class="account-search-control">
              <LucideSearch :size="15" aria-hidden="true" />
              <input
                v-model="accountSearchQuery"
                type="search"
                placeholder="Buscar concepto o mes..."
              />
            </label>
            <button
              type="button"
              :class="[
                'account-view-toggle',
                { active: accountViewMode === 'timeline' },
              ]"
              :aria-label="accountViewToggleLabel"
              :title="accountViewToggleLabel"
              @click="toggleAccountView"
            >
              <LucideHistory
                v-if="accountViewMode === 'classic'"
                :size="15"
                aria-hidden="true"
              />
              <LucideFileText v-else :size="15" aria-hidden="true" />
            </button>
            <div class="account-totals">
              <span>
                <small>Deuda</small>
                <b>${{ format(accountDebtTotal) }}</b>
              </span>
            </div>
          </template>
        </div>

        <div
          v-if="detailsExpanded"
          class="account-summary-grid"
          aria-label="Resumen del estado de cuenta"
        >
          <article
            v-for="metric in accountSummaryMetrics"
            :key="metric.label"
            :class="[
              'account-summary-card',
              `account-summary-card--${metric.tone}`,
            ]"
          >
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
          </article>
        </div>

        <div v-if="detailsExpanded" class="account-expanded-controls">
          <label
            class="account-search-control account-search-control--expanded"
          >
            <LucideSearch :size="15" aria-hidden="true" />
            <input
              v-model="accountSearchQuery"
              type="search"
              placeholder="Buscar concepto o mes..."
            />
          </label>
          <button
            type="button"
            :class="[
              'account-view-toggle',
              { active: accountViewMode === 'timeline' },
            ]"
            :aria-label="accountViewToggleLabel"
            :title="accountViewToggleLabel"
            @click="toggleAccountView"
          >
            <LucideHistory
              v-if="accountViewMode === 'classic'"
              :size="15"
              aria-hidden="true"
            />
            <LucideFileText v-else :size="15" aria-hidden="true" />
          </button>
          <div class="account-totals">
            <span>
              <small>Deuda</small>
              <b>${{ format(accountDebtTotal) }}</b>
            </span>
          </div>
          <button
            class="account-filter-button"
            type="button"
            @click="showAccountFilterMenu"
          >
            <LucideSlidersHorizontal :size="14" />
            Filtros
          </button>
        </div>


        <div
          :class="[
            'account-workspace-body',
            { 'account-workspace-body--expanded': detailsExpanded },
          ]"
        >
          <Transition name="account-flow" mode="out-in">
            <div
              v-if="accountViewMode === 'timeline'"
              ref="accountTableWrap"
              class="account-timeline-wrap"
              :key="`${student.matricula}-timeline`"
            >
              <div
                v-if="showBlockingAccountLoader"
                class="account-empty timeline-empty"
              >
                <span class="liquid-loader small" aria-hidden="true"
                  ><i></i><i></i><i></i
                ></span>
                Cargando estado de cuenta...
              </div>
              <div
                v-else-if="!debts.length"
                class="account-empty muted timeline-empty"
              >
                Sin adeudos o documentos registrados en este ciclo escolar.
              </div>
              <div
                v-else-if="!filteredDebts.length"
                class="account-empty muted timeline-empty"
              >
                Sin resultados para la búsqueda actual.
              </div>
              <div v-else class="timeline-list">
                <article
                  v-for="group in accountTimelineGroups"
                  :key="`timeline-${group.documento}`"
                  class="timeline-card"
                >
                  <header class="timeline-card-header">
                    <div>
                      <strong>{{ group.conceptoNombre }}</strong>
                      <span>Doc. {{ group.documento }} · {{ group.rangeLabel }}</span>
                    </div>
                    <div class="timeline-card-actions">
                      <button
                        v-if="group.pendingDebts.length"
                        class="timeline-action primary"
                        type="button"
                        @click="payTimelineGroup(group)"
                      >
                        Pagar
                      </button>
                      <button
                        class="timeline-action"
                        type="button"
                        @click="invoiceTimelineGroup(group)"
                      >
                        Facturar
                      </button>
                    </div>
                  </header>

                  <div
                    class="timeline-track"
                    :style="{ '--timeline-months': group.totalMonths }"
                  >
                    <button
                      v-for="segment in group.segments"
                      :key="`${group.documento}-${segment.startMes}-${segment.endMes}-${segment.conceptoNombre}`"
                      type="button"
                      :class="[
                        'timeline-segment',
                        timelineSegmentTone(segment),
                      ]"
                      :disabled="segment.cancelled"
                      @click="openTimelineSegmentChange(group, segment)"
                    >
                      <span>{{ timelineSegmentRange(segment) }}</span>
                      <strong>{{ segment.conceptoNombre }}</strong>
                      <em>{{ timelineSegmentStatus(segment) }}</em>
                    </button>
                  </div>

                  <div
                    v-if="group.linkedDifferentials.length"
                    class="timeline-differentials"
                  >
                    <div
                      v-for="item in group.linkedDifferentials"
                      :key="`diff-${group.documento}-${item.documento}`"
                      class="timeline-differential"
                    >
                      <span>Diferencia · Doc. {{ item.documento }}</span>
                      <strong>${{ format(item.saldo || item.monto) }}</strong>
                    </div>
                  </div>
                </article>
              </div>
            </div>
            <div
              v-else
              ref="accountTableWrap"
              class="account-table-wrap"
              :key="`${student.matricula}-classic`"
            >
              <table>
                <colgroup>
                  <col class="col-check" />
                  <col class="col-progress" />
                  <col class="col-concept" />
                  <col class="col-money col-amount" />
                  <col class="col-money col-payments" />
                  <col class="col-money col-balance" />
                  <col class="col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="check-cell">
                      <input
                        type="checkbox"
                        @change="toggleAll"
                        :checked="allVisibleDebtsSelected"
                        class="debt-check"
                      />
                    </th>
                    <th class="progress-cell">Progreso</th>
                    <th>Concepto / Mes</th>
                    <th class="money-cell amount-cell">Importe</th>
                    <th class="money-cell payments-cell">Pagos</th>
                    <th class="money-cell balance-cell">Saldo</th>
                    <th class="menu-cell"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="showBlockingAccountLoader">
                    <td colspan="7" class="account-empty">
                      <span class="liquid-loader small" aria-hidden="true"
                        ><i></i><i></i><i></i
                      ></span>
                      Cargando estado de cuenta...
                    </td>
                  </tr>
                  <tr v-else-if="!debts.length">
                    <td colspan="7" class="account-empty muted">
                      Sin adeudos o documentos registrados en este ciclo
                      escolar.
                    </td>
                  </tr>
                  <tr v-else-if="!filteredDebts.length">
                    <td colspan="7" class="account-empty muted">
                      Sin resultados para la búsqueda actual.
                    </td>
                  </tr>
                  <template
                    v-else
                    v-for="debt in filteredDebts"
                    :key="`${debt.documento}-${debt.mes}`"
                  >
                    <tr
                      :class="{
                        selected: selectedDebts.includes(debt),
                        cleared:
                          Number(debt.pagosDepurados) > 0 && debt.saldo <= 0,
                      }"
                      class="debt-row"
                      @contextmenu.prevent="showDebtContextMenu($event, debt)"
                    >
                      <td class="check-cell" data-label="Seleccionar">
                        <input
                          type="checkbox"
                          :value="debt"
                          v-model="selectedDebts"
                          :disabled="debt.saldo <= 0"
                          class="debt-check"
                        />
                      </td>
                      <td class="progress-cell" data-label="Progreso">
                        <div class="progress-track">
                          <span
                            class="paid-progress"
                            :style="{
                              width: progressPaidWidth(debt),
                              backgroundColor: progressColor(debt),
                            }"
                          ></span>
                          <span
                            v-if="Number(debt.pagosDepurados) > 0"
                            class="cleanup-progress"
                            :style="{ width: progressCleanupWidth(debt) }"
                          ></span>
                        </div>
                        <em :class="{ complete: debt.saldo <= 0 }">{{
                          progressStatusLabel(debt)
                        }}</em>
                      </td>
                      <td class="concept-cell" data-label="Concepto / Mes">
                        <strong>{{ debt.conceptoNombre }}</strong>
                        <small>
                          {{ debt.mesLabel }}
                          <span
                            v-if="detailsExpanded && debt.documento"
                            class="concept-meta"
                            >Doc. {{ debt.documento }}</span
                          >
                          <span
                            v-if="detailsExpanded && Number(debt.beca || 0) > 0"
                            class="concept-meta"
                            >Beca {{ Number(debt.beca).toFixed(0) }}%</span
                          >
                          <span v-if="debt.hasRecargo" class="recargo-badge"
                            >Recargo</span
                          >
                        </small>
                      </td>
                      <td class="money-cell amount-cell" data-label="Importe">
                        ${{ format(debt.subtotal) }}
                        <button
                          v-if="debt.montoFinalPendiente"
                          class="final-amount-link"
                          type="button"
                          @click="setMontoFinal(debt)"
                        >
                          Fijar
                        </button>
                      </td>
                      <td class="money-cell payments-cell paid" data-label="Pagos">
                        ${{ format(debt.pagos) }}
                      </td>
                      <td
                        class="money-cell balance-cell"
                        :class="{ danger: debt.saldo > 0 }"
                        data-label="Saldo"
                      >
                        ${{ format(debt.saldo) }}
                      </td>
                      <td class="menu-cell" data-label="Opciones">
                        <button
                          @click="openConceptChange(debt)"
                          title="Ajustar concepto"
                        >
                          <LucideSettings :size="16" />
                        </button>
                        <button
                          v-if="canDirectCorrectConcept(debt)"
                          @click="openDirectConceptCorrection(debt)"
                          title="Cambiar concepto"
                        >
                          <LucidePencilLine :size="16" />
                        </button>
                        <button
                          v-if="debt.historialPagos?.length"
                          @click="toggleHistory(debt)"
                          title="Historial"
                        >
                          <LucideHistory :size="16" />
                        </button>
                      </td>
                    </tr>
                    <tr
                      v-if="expandedHistory === `${debt.documento}-${debt.mes}`"
                      class="history-row"
                    >
                      <td colspan="7">
                        <table class="history-table">
                          <thead>
                            <tr>
                              <th>Folio</th>
                              <th>Fecha</th>
                              <th>Forma de Pago</th>
                              <th class="money-cell">Importe</th>
                              <th class="menu-cell">Opciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="h in debt.historialPagos" :key="h.folio">
                              <td class="folio">#{{ h.folio }}</td>
                              <td>
                                {{ new Date(h.fecha).toLocaleString("es-MX") }}
                              </td>
                              <td>
                                <span
                                  :class="[
                                    'method-pill',
                                    h.depurado ? 'cleanup' : '',
                                  ]"
                                  >{{ h.formaDePago }}</span
                                >
                              </td>
                              <td class="money-cell paid">
                                ${{ format(h.monto) }}
                              </td>
                              <td class="history-actions">
                                <button
                                  class="history-action history-action-pdf"
                                  @click="reprintPayment(h)"
                                >
                                  <LucidePrinter :size="11" /> PDF
                                </button>
                                <button
                                  v-if="!h.depurado"
                                  class="history-action history-action-pdf"
                                  @click="invoicePaymentReceipt(debt, h)"
                                >
                                  <LucideFileText :size="11" /> Facturar
                                </button>
                                <button
                                  class="history-action history-action-danger"
                                  @click="cancelPayment(h)"
                                >
                                  <LucideUndo :size="11" /> Anular
                                </button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </Transition>
        </div>

        <div class="account-footer">
          <span>{{ accountFooterLabel }}</span>
          <strong
            >Saldo actual <b>${{ format(accountDebtTotal) }}</b></strong
          >
        </div>
      </section>

      <PaymentModal
        v-if="showPaymentModal"
        :debts="selectedDebts"
        :student="student"
        @close="showPaymentModal = false"
        @success="handleSuccess"
      />
      <DocumentModal
        v-if="showDocModal"
        :student="student"
        @close="showDocModal = false"
        @success="handleSuccess"
      />
      <InvoiceModal
        v-if="showInvoiceModal"
        :debts="selectedDebts"
        :student="accountOverlaySource"
        @close="showInvoiceModal = false"
        @success="handleInvoiceSuccess"
      />
      <ConceptChangeModal
        v-if="showConceptModal"
        :debt="selectedConceptDebt"
        @close="closeConceptModal"
        @success="handleSuccess"
      />
      <ConceptDirectCorrectionModal
        v-if="showDirectConceptModal"
        :debt="selectedDirectConceptDebt"
        @close="closeDirectConceptModal"
        @success="handleSuccess"
      />
      <IngresoCycleModal
        v-if="showIngresoCycleModal"
        :student="student"
        :target-ciclo="selectedCicloKey"
        :current-tipo-ingreso="resolvedTipoIngreso"
        :photo-url="photoUrl || ''"
        :saving="savingIngresoCycle"
        :enrollment-concepts="tipoIngresoConcepts.length ? tipoIngresoConcepts : externalConcepts"
        @close="showIngresoCycleModal = false"
        @confirm="saveIngresoCycle"
      />
      <NoAdeudoModal
        v-if="showNoAdeudoModal"
        :students="[accountOverlaySource]"
        :ciclo="selectedCicloKey"
        @close="showNoAdeudoModal = false"
        @sent="handleNoAdeudoSent"
      />
    </div>
  </Teleport>
</template>

<script>
// Photo requests stay detail-only: opening Estado de Cuenta resolves the photo,
// then the matrícula-keyed session cache lets the list reuse it later.
const studentPhotoRequests = new Map();
</script>

<script setup>
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import {
  LucideCreditCard,
  LucideFileText,
  LucideFilePlus,
  LucideHistory,
  LucideSettings,
  LucideBell,
  LucidePrinter,
  LucideUndo,
  LucideAward,
  LucideUsers,
  LucideX,
  LucideUserX,
  LucideLoader2,
  LucideShieldCheck,
  LucideTags,
  LucideCalendarClock,
  LucideBuilding2,
  LucideGlobe2,
  LucideMoreVertical,
  LucideSearch,
  LucideChevronDown,
  LucideMaximize2,
  LucideMinimize2,
  LucideSlidersHorizontal,
  LucidePencilLine,
} from "lucide-vue-next";
import { useState, useCookie } from "#app";
import { useToast } from "~/composables/useToast";
import { useContextMenu } from "~/composables/useContextMenu";
import { useOptimisticSync } from "~/composables/useOptimisticSync";
import { useAccountStateCacheSync } from "~/composables/useAccountStateCacheSync";
import { formatCicloLabel, normalizeCicloKey } from "~/shared/utils/ciclo";
import {
  formatTipoIngresoValue,
  resolveTipoIngreso,
} from "~/shared/utils/tipoIngreso";
import {
  gradeVisualTitle,
  studentGroupLabel,
  studentNivelLabel,
  studentPresentationStyle,
  resolveControlEscolarProgress,
} from "~/shared/utils/studentPresentation";
import PaymentModal from "./PaymentModal.vue";
import DocumentModal from "./DocumentModal.vue";
import InvoiceModal from "./InvoiceModal.vue";
import ConceptChangeModal from "./ConceptChangeModal.vue";
import ConceptDirectCorrectionModal from "./ConceptDirectCorrectionModal.vue";
import IngresoCycleModal from "./IngresoCycleModal.vue";
import NoAdeudoModal from "~/components/NoAdeudoModal.vue";
import StudentAccountPhotoCard from "~/components/students/StudentAccountPhotoCard.vue";
import UiGroupIcon from "~/components/ui/UiGroupIcon.vue";

const props = defineProps({
  student: Object,
  isEnrolled: { type: Boolean, default: true },
  externalConcepts: { type: Array, default: () => [] },
  tipoIngresoConcepts: { type: Array, default: () => [] },
  // Dev visual lab only: lets auth-heavy layouts render deterministic account rows.
  visualLabDebts: { type: Array, default: null },
});
const emit = defineEmits([
  "refresh",
  "edit",
  "close",
  "switch-student",
  "baja",
  "photo-loaded",
  "manage-sections",
  "ingreso-cycle-updated",
  "open-operator-info",
]);
const { show } = useToast();
const { openMenu, closeMenu } = useContextMenu();
const { executeOptimistic } = useOptimisticSync();
const {
  accountStateSyncState,
  getAccountStateCacheKey,
  readCachedAccountState,
  writeCachedAccountState,
  setAccountStateSyncState,
} = useAccountStateCacheSync();
const state = useState("globalState");
const authRoleCookie = useCookie("auth_role");
const roleTokens = computed(() =>
  String(authRoleCookie.value || "")
    .split(",")
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean),
);
const isSuperAdmin = computed(() => roleTokens.value.includes("superadmin"));

const debts = ref([]);
const siblings = ref([]);
const siblingSource = ref("none");
const loading = ref(false);
const reminding = ref(false);
const selectedDebts = ref([]);
const expandedHistory = ref(null);
const depurandoDebt = ref(null);
const accountSearchQuery = ref("");
const accountFilter = ref("all");
const accountViewMode = ref("classic");
const detailsExpanded = ref(false);
const detailTransitioning = ref(false);
const accountViewToggleLabel = computed(() =>
  accountViewMode.value === "classic"
    ? "Ver historial"
    : "Ver Estado de Cuenta",
);

const toggleAccountView = () => {
  accountViewMode.value =
    accountViewMode.value === "classic" ? "timeline" : "classic";
};

const photoUrl = ref(null);
const photoLoading = ref(false);

const showPaymentModal = ref(false);
const showDocModal = ref(false);
const showInvoiceModal = ref(false);
const showConceptModal = ref(false);
const showDirectConceptModal = ref(false);
const showIngresoCycleModal = ref(false);
const showNoAdeudoModal = ref(false);
const savingIngresoCycle = ref(false);
const selectedConceptDebt = ref(null);
const selectedDirectConceptDebt = ref(null);
const detailsShell = ref(null);
const detailsPlaceholder = ref(null);
const expandedShellBounds = ref(null);
const accountCard = ref(null);
const accountTableWrap = ref(null);
const hasRenderedAccountState = ref(false);
const visibleAccountContextKey = ref("");
const isAccountRefreshing = ref(false);
const ACCOUNT_REFRESH_MIN_VISIBLE_MS = 1200;
let accountRefreshStartedAt = 0;
let accountRefreshTimer = null;
let debtsRequestId = 0;

const format = (val) => Number(val || 0).toFixed(2);
const compactAccountText = (value) => String(value || "").trim();
const accountJoinedName = (...values) =>
  values.map(compactAccountText).filter(Boolean).join(" ");
const accountCentralOverlay = ref(null);
let accountOverlayRequestId = 0;
const normalizeAccountMatricula = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();
const extractAccountOverlayStudent = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  const candidate =
    payload.student && typeof payload.student === "object"
      ? payload.student
      : payload.centralMatricula?.student &&
          typeof payload.centralMatricula.student === "object"
        ? payload.centralMatricula.student
        : payload;
  return [
    candidate.matricula,
    candidate.curp,
    candidate.padre,
    candidate.madre,
    candidate.nombrePadre,
    candidate.nombreMadre,
    candidate.emailPadre,
    candidate.emailMadre,
    candidate.telefonoPadre,
    candidate.telefonoMadre,
  ].some((value) => compactAccountText(value))
    ? candidate
    : null;
};
const accountOverlaySource = computed(() => ({
  ...(props.student || {}),
  ...(extractAccountOverlayStudent(props.student?.centralMatricula) || {}),
  ...(extractAccountOverlayStudent(accountCentralOverlay.value) || {}),
}));
const loadAccountMatriculaOverlay = async ({ force = false } = {}) => {
  const matricula = normalizeAccountMatricula(props.student?.matricula);
  if (!matricula) return;
  if (!force && props.student?.centralMatricula) {
    accountCentralOverlay.value = extractAccountOverlayStudent(
      props.student.centralMatricula,
    );
    return;
  }

  const requestId = ++accountOverlayRequestId;
  try {
    const response = await $fetch("/api/students/matricula-overlays", {
      method: "POST",
      body: { matriculas: [matricula] },
    });
    if (requestId !== accountOverlayRequestId || !response?.ok) return;
    const overlay = (response.overlays || [])
      .map(extractAccountOverlayStudent)
      .find((item) => normalizeAccountMatricula(item?.matricula) === matricula);
    if (overlay)
      accountCentralOverlay.value = extractAccountOverlayStudent(overlay);
  } catch (error) {
    // Optional enrichment must never block Estado de Cuenta.
  }
};
const accountCurpLabel = computed(() =>
  compactAccountText(accountOverlaySource.value.curp),
);
const accountFatherLabel = computed(() =>
  compactAccountText(
    accountJoinedName(
      accountOverlaySource.value.nombrePadre,
      accountOverlaySource.value.apellidoPaternoPadre,
      accountOverlaySource.value.apellidoMaternoPadre,
    ) ||
      accountOverlaySource.value.nombrePadreCompleto ||
      accountOverlaySource.value.padre,
  ),
);
const accountMotherLabel = computed(() =>
  compactAccountText(
    accountJoinedName(
      accountOverlaySource.value.nombreMadre,
      accountOverlaySource.value.apellidoPaternoMadre,
      accountOverlaySource.value.apellidoMaternoMadre,
    ) ||
      accountOverlaySource.value.nombreMadreCompleto ||
      accountOverlaySource.value.madre,
  ),
);
const accountMetaItems = computed(() =>
  [
    { label: "CURP", value: accountCurpLabel.value },
    { label: "Padre", value: accountFatherLabel.value },
    { label: "Madre", value: accountMotherLabel.value },
  ].filter((item) => item.value),
);

const accountExpedienteProgress = computed(() =>
  resolveControlEscolarProgress(accountOverlaySource.value),
);
const accountExpedienteTitle = computed(() => {
  const summary = accountExpedienteProgress.value.summary || "Expediente";
  const missing = (accountExpedienteProgress.value.missingFields || [])
    .map(
      (field) =>
        ({ curp: "CURP", padre: "Padre", madre: "Madre" })[field] || field,
    )
    .join(", ");
  return missing ? `${summary}: ${missing}` : summary;
});
watch(
  () => props.student?.matricula,
  () => {
    accountCentralOverlay.value = extractAccountOverlayStudent(
      props.student?.centralMatricula,
    );
    void loadAccountMatriculaOverlay();
  },
  { immediate: true },
);

watch(
  () => props.student?.centralMatricula,
  (overlay) => {
    if (overlay)
      accountCentralOverlay.value = extractAccountOverlayStudent(overlay);
  },
);

const normalizePhotoMatricula = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();
const photoStorageKey = (matricula) =>
  `foto_${normalizePhotoMatricula(matricula)}`;
const validDebts = computed(() => debts.value.filter((d) => d.saldo > 0));
const accountDebtTotal = computed(() =>
  validDebts.value.reduce((acc, debt) => acc + Number(debt?.saldo || 0), 0),
);
const accountPaidTotal = computed(() =>
  debts.value.reduce((acc, debt) => acc + Number(debt?.pagos || 0), 0),
);
const accountOverdueTotal = computed(() =>
  debts.value.reduce(
    (acc, debt) =>
      debt?.isLate && Number(debt?.saldo || 0) > 0
        ? acc + Number(debt.saldo || 0)
        : acc,
    0,
  ),
);
const accountUpcomingTotal = computed(() =>
  Math.max(accountDebtTotal.value - accountOverdueTotal.value, 0),
);
const normalizeSearchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const filteredDebts = computed(() => {
  const query = normalizeSearchText(accountSearchQuery.value).trim();
  return debts.value.filter((debt) => {
    const matchesQuery =
      !query ||
      [debt?.conceptoNombre, debt?.mesLabel, debt?.mes, debt?.documento].some(
        (value) => normalizeSearchText(value).includes(query),
      );

    if (!matchesQuery) return false;
    if (accountFilter.value === "pending") return Number(debt?.saldo || 0) > 0;
    if (accountFilter.value === "paid") return Number(debt?.saldo || 0) <= 0;
    if (accountFilter.value === "overdue")
      return Boolean(debt?.isLate) && Number(debt?.saldo || 0) > 0;
    if (accountFilter.value === "recargo") return Boolean(debt?.hasRecargo);
    return true;
  });
});
const resolveDebtMonthNumber = (debt) => {
  const raw = String(debt?.mes || "").trim().toLowerCase();
  if (raw === "ev") return 1;
  const numeric = Number(debt?.mes || 1);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
};

const sortDebtsByMonth = (items) =>
  [...items].sort((a, b) => {
    const byMonth = resolveDebtMonthNumber(a) - resolveDebtMonthNumber(b);
    if (byMonth) return byMonth;
    return String(a?.conceptoNombre || "").localeCompare(
      String(b?.conceptoNombre || ""),
      "es",
    );
  });

const buildSegmentsFromDebts = (items) => {
  const segments = [];
  sortDebtsByMonth(items).forEach((debt) => {
    const mes = resolveDebtMonthNumber(debt);
    const conceptoNombre =
      compactAccountText(debt?.conceptoNombre) || "Concepto";
    const last = segments[segments.length - 1];
    const sameSegment =
      last &&
      last.conceptoNombre === conceptoNombre &&
      last.endMes + 1 === mes &&
      !last.cancelled;

    if (sameSegment) {
      last.endMes = mes;
      last.endLabel = debt?.mesLabel || `Mes ${mes}`;
      last.months.push(mes);
      last.debts.push(debt);
      last.subtotal += Number(debt?.subtotal || 0);
      last.pagos += Number(debt?.pagos || 0);
      last.saldo += Number(debt?.saldo || 0);
      last.hasRecargo = last.hasRecargo || Boolean(debt?.hasRecargo);
      return;
    }

    segments.push({
      conceptoNombre,
      accion:
        debt?.originalConceptoNombre &&
        debt.originalConceptoNombre !== conceptoNombre
          ? "cambio"
          : "original",
      periodoId: debt?.linkedChangePeriodoId || null,
      startMes: mes,
      endMes: mes,
      startLabel: debt?.mesLabel || `Mes ${mes}`,
      endLabel: debt?.mesLabel || `Mes ${mes}`,
      months: [mes],
      debts: [debt],
      subtotal: Number(debt?.subtotal || 0),
      pagos: Number(debt?.pagos || 0),
      saldo: Number(debt?.saldo || 0),
      hasRecargo: Boolean(debt?.hasRecargo),
      cancelled: false,
    });
  });
  return segments;
};

const buildDifferentialsFromDebts = (items) => {
  const byDocument = new Map();
  items.forEach((debt) => {
    const documento = Number(debt?.documento || 0);
    if (!documento) return;
    const current = byDocument.get(documento) || {
      documento,
      conceptoNombre: debt?.conceptoNombre || "Diferencia",
      monto: 0,
      pagos: 0,
      saldo: 0,
    };
    current.monto += Number(debt?.subtotal || 0);
    current.pagos += Number(debt?.pagos || 0);
    current.saldo += Number(debt?.saldo || 0);
    byDocument.set(documento, current);
  });
  return Array.from(byDocument.values());
};

const accountTimelineGroups = computed(() => {
  const grouped = new Map();

  filteredDebts.value.forEach((debt, index) => {
    const documentId = Number(debt?.documento || 0);
    const parentId = Number(debt?.parentDocumento || 0);
    const groupId = parentId || documentId || `row-${index}`;
    const group = grouped.get(groupId) || {
      documento: groupId,
      rows: [],
      differentialRows: [],
    };

    if (parentId) group.differentialRows.push(debt);
    else group.rows.push(debt);
    grouped.set(groupId, group);
  });

  return Array.from(grouped.values()).map((group) => {
    const documentId = Number(group.documento || 0);
    const sourceDebt =
      debts.value.find((debt) => Number(debt?.documento || 0) === documentId) ||
      group.rows[0] ||
      group.differentialRows[0];
    const timeline = sourceDebt?.documentTimeline || null;
    const visibleRows = group.rows.length ? group.rows : group.differentialRows;
    const segments = buildSegmentsFromDebts(visibleRows);
    const timelineDifferentials = Array.isArray(timeline?.linkedDifferentials)
      ? timeline.linkedDifferentials
      : [];
    const visibleDifferentials = buildDifferentialsFromDebts(
      group.differentialRows,
    );
    const differentialByDocument = new Map();
    timelineDifferentials.forEach((item) => {
      const key = Number(item?.documento || 0);
      if (!key) return;
      differentialByDocument.set(key, {
        documento: key,
        conceptoNombre: item?.conceptoNombre || "Diferencia",
        monto: Number(item?.monto || 0),
        pagos: Number(item?.pagos || 0),
        saldo: Number(item?.saldo || 0),
      });
    });
    visibleDifferentials.forEach((item) => {
      const key = Number(item?.documento || 0);
      if (!key) return;
      differentialByDocument.set(key, item);
    });

    const allDebts = [
      ...debts.value.filter((debt) => Number(debt?.documento || 0) === documentId),
      ...debts.value.filter(
        (debt) => Number(debt?.parentDocumento || 0) === documentId,
      ),
    ];
    const totalMonths =
      segments.reduce((max, segment) => Math.max(max, Number(segment.endMes || 1)), 1) ||
      Number(timeline?.totalMonths || 1) ||
      1;
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    const rangeLabel = firstSegment
      ? firstSegment.startMes === lastSegment.endMes
        ? timelineSegmentRange(firstSegment)
        : `Mes ${firstSegment.startMes}-${lastSegment.endMes}`
      : `${totalMonths} meses`;

    return {
      documento: group.documento,
      conceptoNombre:
        firstSegment?.conceptoNombre ||
        timeline?.conceptoNombre ||
        sourceDebt?.conceptoNombre ||
        "Concepto",
      totalMonths,
      rangeLabel,
      segments,
      linkedDifferentials: Array.from(differentialByDocument.values()),
      allDebts: allDebts.length ? allDebts : visibleRows,
      pendingDebts: (allDebts.length ? allDebts : visibleRows).filter(
        (debt) => Number(debt?.saldo || 0) > 0,
      ),
    };
  });
});

const visibleValidDebts = computed(() =>
  filteredDebts.value.filter((debt) => Number(debt.saldo || 0) > 0),
);
const allVisibleDebtsSelected = computed(() => {
  if (!visibleValidDebts.value.length) return false;
  const selectedKeys = new Set(selectedDebts.value.map(debtKey));
  return visibleValidDebts.value.every((debt) =>
    selectedKeys.has(debtKey(debt)),
  );
});
const accountFooterLabel = computed(() => {
  if (!debts.value.length) return "Sin conceptos en este ciclo";
  return `Mostrando ${filteredDebts.value.length} de ${debts.value.length} conceptos`;
});
const accountSummaryMetrics = computed(() => [
  {
    label: "Saldo actual",
    value: `$${format(accountDebtTotal.value)}`,
    tone: "success",
  },
  {
    label: "Pagos",
    value: `$${format(accountPaidTotal.value)}`,
    tone: "success",
  },
  {
    label: "Saldo vencido",
    value: `$${format(accountOverdueTotal.value)}`,
    tone: "danger",
  },
  {
    label: "Saldo por vencer",
    value: `$${format(accountUpcomingTotal.value)}`,
    tone: "info",
  },
]);
const selectedCicloKey = computed(() => normalizeCicloKey(state.value.ciclo));
const selectedCicloLabel = computed(() =>
  formatCicloLabel(selectedCicloKey.value),
);
const resolvedNivelLabel = computed(() => studentNivelLabel(props.student));
const studentMissingGroup = (student) => !studentGroupLabel(student);
const studentGroupInlineLabel = (student) => {
  const group = studentGroupLabel(student);
  return group ? group : "Sin grupo";
};
const accountCacheOptions = computed(() => ({
  matricula: props.student?.matricula || "",
  ciclo: selectedCicloKey.value,
  lateFeeActive: state.value.lateFeeActive,
}));
const currentAccountContextKey = computed(() =>
  getAccountStateCacheKey(accountCacheOptions.value),
);
const showBlockingAccountLoader = computed(
  () =>
    loading.value && !hasRenderedAccountState.value && debts.value.length === 0,
);
const accountSyncVisible = computed(
  () =>
    accountStateSyncState.value.status !== "idle" &&
    Boolean(accountStateSyncState.value.message),
);
const accountSyncLabel = computed(
  () =>
    ({
      cached: "Datos locales",
      syncing: "Actualizando",
      updated: "Actualizado",
      failed: "Sin actualizar",
      idle: "",
    })[accountStateSyncState.value.status] || "",
);
const resolvedTipoIngreso = computed(() =>
  resolveTipoIngreso(props.student, selectedCicloKey.value, {
    enrollmentConcepts: props.tipoIngresoConcepts.length ? props.tipoIngresoConcepts : props.externalConcepts,
  }),
);
const resolvedTipoIngresoLabel = computed(() =>
  formatTipoIngresoValue(resolvedTipoIngreso.value),
);
const tipoIngresoOverrideActive = computed(
  () => resolvedTipoIngreso.value?.source === "manual_override",
);
const progressPaidWidth = (debt) =>
  `${Math.min(100, Number(debt.porcentajePagoReal ?? debt.porcentajePagado) || 0)}%`;
const progressCleanupWidth = (debt) =>
  `${Math.min(100, Number(debt.porcentajeDepurado) || 0)}%`;
const progressColor = (debt) =>
  Number(debt.porcentajePagado) >= 100 && Number(debt.pagosDepurados) <= 0
    ? "#70b34f"
    : "#d8b449";
const progressStatusLabel = (debt) => {
  const paid = Math.round(Number(debt.porcentajePagado) || 0);
  if (Number(debt.pagosDepurados) > 0 && debt.saldo <= 0) return "100%";
  if (paid >= 100 || debt.saldo <= 0) return "100%";
  return `${Math.max(0, Math.min(100, paid))}%`;
};

const timelineSegmentRange = (segment) => {
  const start = Number(segment?.startMes || 1);
  const end = Number(segment?.endMes || start);
  return start === end ? `Mes ${start}` : `Mes ${start}-${end}`;
};
const timelineSegmentTone = (segment) => {
  if (segment?.cancelled || segment?.accion === "cancelacion")
    return "cancelled";
  if (segment?.accion === "cambio") return "changed";
  return "base";
};
const timelineSegmentStatus = (segment) => {
  if (segment?.cancelled || segment?.accion === "cancelacion")
    return "Cancelado";
  const saldo = Number(segment?.saldo || 0);
  if (saldo <= 0) return "Cubierto";
  return `$${format(saldo)}`;
};

const debtKey = (debt) => `${debt?.documento || ""}-${debt?.mes || ""}`;

const detailShellStyle = computed(() => {
  if (!detailsExpanded.value || !expandedShellBounds.value) return {};
  return {
    "--detail-expanded-left": `${expandedShellBounds.value.left}px`,
    "--detail-expanded-width": `${expandedShellBounds.value.width}px`,
  };
});
const detailShellRootStyle = computed(() => detailShellStyle.value);

const getExpandedBoundsReference = () => {
  if (detailsExpanded.value && detailsPlaceholder.value)
    return detailsPlaceholder.value;
  const element = detailsShell.value;
  return element?.closest?.(".student-detail-panel") || element;
};

const updateExpandedShellBounds = () => {
  if (typeof window === "undefined") return;

  const reference = getExpandedBoundsReference();
  const rect = reference?.getBoundingClientRect?.();
  if (!rect) return;

  const viewportWidth = Math.max(
    320,
    window.innerWidth ||
      document.documentElement?.clientWidth ||
      rect.right ||
      0,
  );
  const minimumUsefulWidth = Math.min(360, viewportWidth);
  const left = Math.max(
    0,
    Math.min(Math.round(rect.left), viewportWidth - minimumUsefulWidth),
  );
  const width = Math.max(minimumUsefulWidth, Math.ceil(viewportWidth - left));

  expandedShellBounds.value = { left, width };
};

let expandedBoundsFrame = null;
const scheduleExpandedShellBoundsUpdate = () => {
  if (typeof window === "undefined" || !detailsExpanded.value) return;
  if (expandedBoundsFrame) window.cancelAnimationFrame(expandedBoundsFrame);
  expandedBoundsFrame = window.requestAnimationFrame(() => {
    expandedBoundsFrame = null;
    updateExpandedShellBounds();
  });
};

const finishDetailLayoutTransition = (element) => {
  detailTransitioning.value = false;
  if (!element) return;

  element.style.transition = "";
  element.style.transformOrigin = "";
  element.style.transform = "";
};

const setDetailsExpanded = async (expanded) => {
  if (detailsExpanded.value === expanded || detailTransitioning.value) return;

  const element = detailsShell.value;
  if (!element || typeof window === "undefined") {
    detailsExpanded.value = expanded;
    return;
  }

  if (expanded) updateExpandedShellBounds();

  const first = element.getBoundingClientRect();
  detailTransitioning.value = true;
  detailsExpanded.value = expanded;
  closeMenu();
  await nextTick();
  if (expanded) updateExpandedShellBounds();

  const last = element.getBoundingClientRect();
  const deltaX = first.left - last.left;
  const deltaY = first.top - last.top;
  const scaleX = first.width / Math.max(last.width, 1);
  const scaleY = first.height / Math.max(last.height, 1);

  element.style.transformOrigin = "top right";
  element.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`;
  element.style.transition = "none";

  element.getBoundingClientRect();

  window.requestAnimationFrame(() => {
    element.style.transition =
      "transform 620ms cubic-bezier(0.16, 1, 0.3, 1), border-color 240ms ease, box-shadow 240ms ease";
    element.style.transform = "";

    window.setTimeout(() => finishDetailLayoutTransition(element), 660);
  });
};

const toggleDetailsExpanded = () => setDetailsExpanded(!detailsExpanded.value);

onMounted(() => {
  if (typeof window === "undefined") return;
  window.addEventListener("resize", scheduleExpandedShellBoundsUpdate, {
    passive: true,
  });
  window.visualViewport?.addEventListener?.(
    "resize",
    scheduleExpandedShellBoundsUpdate,
    { passive: true },
  );
});

const clearAccountRefreshTimer = () => {
  if (!accountRefreshTimer) return;
  clearTimeout(accountRefreshTimer);
  accountRefreshTimer = null;
};

const startAccountRefresh = () => {
  clearAccountRefreshTimer();
  accountRefreshStartedAt = Date.now();
  if (!isAccountRefreshing.value) isAccountRefreshing.value = true;
};

const stopAccountRefresh = () => {
  if (!isAccountRefreshing.value) return;

  clearAccountRefreshTimer();
  const elapsed = Date.now() - accountRefreshStartedAt;
  const remaining = Math.max(ACCOUNT_REFRESH_MIN_VISIBLE_MS - elapsed, 0);

  accountRefreshTimer = setTimeout(() => {
    isAccountRefreshing.value = false;
    accountRefreshTimer = null;
  }, remaining);
};

const resetAccountInteraction = () => {
  selectedDebts.value = [];
  expandedHistory.value = null;
  selectedConceptDebt.value = null;
  showPaymentModal.value = false;
  showDocModal.value = false;
  showInvoiceModal.value = false;
  showConceptModal.value = false;
  showNoAdeudoModal.value = false;
};

const applyAccountDebts = async (
  nextDebts,
  { preserveInteraction = true } = {},
) => {
  const scrollEl = accountTableWrap.value;
  const scrollTop = scrollEl?.scrollTop || 0;
  const selectedKeys = preserveInteraction
    ? new Set(selectedDebts.value.map(debtKey))
    : new Set();
  const expandedKey = preserveInteraction ? expandedHistory.value : null;
  const selectedConceptKey =
    preserveInteraction && selectedConceptDebt.value
      ? debtKey(selectedConceptDebt.value)
      : null;
  const freshDebts = Array.isArray(nextDebts) ? nextDebts : [];

  debts.value = freshDebts;
  hasRenderedAccountState.value = true;

  if (preserveInteraction) {
    const preserveInvoiceSelection = showInvoiceModal.value;
    const refreshedSelection = freshDebts.filter(
      (debt) =>
        selectedKeys.has(debtKey(debt)) &&
        (preserveInvoiceSelection || Number(debt.saldo || 0) > 0),
    );
    selectedDebts.value =
      preserveInvoiceSelection &&
      selectedDebts.value.length &&
      !refreshedSelection.length
        ? selectedDebts.value
        : refreshedSelection;
    expandedHistory.value =
      expandedKey && freshDebts.some((debt) => debtKey(debt) === expandedKey)
        ? expandedKey
        : null;
    if (selectedConceptKey) {
      selectedConceptDebt.value =
        freshDebts.find((debt) => debtKey(debt) === selectedConceptKey) ||
        selectedConceptDebt.value;
    }
  } else {
    resetAccountInteraction();
  }

  await nextTick();
  if (scrollEl && accountTableWrap.value === scrollEl) {
    accountTableWrap.value.scrollTop = scrollTop;
  }
};

const loadDebts = async (options = {}) => {
  if (!props.student?.matricula) return;

  const { useCache = true, preserveInteraction = true } = options || {};
  const requestId = ++debtsRequestId;
  const cicloKey = selectedCicloKey.value;
  const cacheOptions = accountCacheOptions.value;
  const contextKey = currentAccountContextKey.value;
  const contextChanged = visibleAccountContextKey.value !== contextKey;

  if (contextChanged) {
    visibleAccountContextKey.value = contextKey;
    hasRenderedAccountState.value = false;
    accountSearchQuery.value = "";
    accountFilter.value = "all";
    resetAccountInteraction();
  }

  const shouldPreserveInteraction = preserveInteraction && !contextChanged;
  if (Array.isArray(props.visualLabDebts)) {
    await applyAccountDebts(props.visualLabDebts, {
      preserveInteraction: shouldPreserveInteraction,
    });
    loading.value = false;
    setAccountStateSyncState({
      status: "updated",
      message: "Visual lab con datos sinteticos.",
      lastUpdatedAt: new Date().toISOString(),
      recordCount: props.visualLabDebts.length,
      hasCache: true,
      error: null,
    });
    return;
  }

  const cached = useCache ? readCachedAccountState(cacheOptions) : null;
  const hasCachedAccountState = Boolean(cached);
  if (contextChanged && !hasCachedAccountState) {
    debts.value = [];
  }
  const hadVisibleAccountState =
    hasRenderedAccountState.value || debts.value.length > 0;

  if (hasCachedAccountState) {
    await applyAccountDebts(cached.debts, {
      preserveInteraction: shouldPreserveInteraction,
    });
    loading.value = false;
    setAccountStateSyncState({
      status: "cached",
      message: "Mostrando estado de cuenta desde caché local.",
      lastUpdatedAt: cached.savedAt,
      recordCount: cached.count,
      hasCache: true,
      error: null,
    });
  } else if (!hadVisibleAccountState) {
    loading.value = true;
  } else {
    loading.value = false;
  }

  setAccountStateSyncState({
    status: "syncing",
    message: hasCachedAccountState
      ? "Estado de cuenta visible desde caché local mientras se actualiza."
      : "Actualizando estado de cuenta en segundo plano.",
    recordCount: hasCachedAccountState ? cached.count : debts.value.length,
    hasCache: hasCachedAccountState || hadVisibleAccountState,
    error: null,
  });

  try {
    const res = await $fetch(`/api/students/${props.student.matricula}/debts`, {
      params: { ciclo: cicloKey, lateFeeActive: state.value.lateFeeActive },
    });
    if (
      requestId !== debtsRequestId ||
      currentAccountContextKey.value !== contextKey
    )
      return;

    const freshDebts = Array.isArray(res) ? res : [];
    await applyAccountDebts(freshDebts, {
      preserveInteraction: shouldPreserveInteraction,
    });
    const cacheWritten = writeCachedAccountState(cacheOptions, freshDebts);
    const updatedAt = new Date().toISOString();

    setAccountStateSyncState({
      status: "updated",
      message: cacheWritten
        ? "Estado de cuenta actualizado y guardado en caché local."
        : "Estado de cuenta actualizado. No se pudo guardar la caché local.",
      lastUpdatedAt: updatedAt,
      recordCount: freshDebts.length,
      hasCache: cacheWritten || hasCachedAccountState,
      error: cacheWritten ? null : "account-cache-write-failed",
    });
  } catch (e) {
    if (
      requestId !== debtsRequestId ||
      currentAccountContextKey.value !== contextKey
    )
      return;

    const canKeepWorking =
      hasCachedAccountState ||
      hasRenderedAccountState.value ||
      debts.value.length > 0;
    setAccountStateSyncState({
      status: "failed",
      message: canKeepWorking
        ? "No se pudo actualizar. Se conserva el estado de cuenta disponible."
        : "No se pudo cargar el estado de cuenta.",
      recordCount: debts.value.length,
      hasCache: canKeepWorking,
      error: e?.data?.message || e?.message || "account-state-sync-failed",
    });

    if (!canKeepWorking)
      console.error("[EstadoCuentaDebug] Estado de Cuenta error", e);
  } finally {
    if (
      requestId === debtsRequestId &&
      currentAccountContextKey.value === contextKey
    )
      loading.value = false;
  }
};

const loadSiblings = async () => {
  try {
    const res = await $fetch(
      `/api/students/${props.student.matricula}/siblings`,
      {
        params: { ciclo: normalizeCicloKey(state.value.ciclo) },
      },
    );
    siblings.value = Array.isArray(res) ? res : res?.siblings || [];
    siblingSource.value = Array.isArray(res) ? "legacy" : res?.source || "none";
  } catch (e) {}
};

const clearSiblingLinks = async () => {
  if (!siblings.value.length || siblingSource.value !== "local") return;
  if (!confirm("Limpiar los vinculos familiares locales de este grupo?"))
    return;

  try {
    await $fetch(`/api/students/${props.student.matricula}/siblings`, {
      method: "DELETE",
    });
    siblings.value = [];
    siblingSource.value = "none";
    show("Vinculos familiares limpiados", "success");
    emit("refresh");
  } catch (e) {
    show("Error al limpiar vinculos familiares", "danger");
  }
};

const loadPhoto = async () => {
  const matricula = normalizePhotoMatricula(props.student?.matricula);
  if (!matricula) return;
  if (!process.client) return;
  const key = photoStorageKey(matricula);

  const cached = sessionStorage.getItem(key);
  if (cached) {
    photoUrl.value = cached === "none" ? null : cached;
    if (cached !== "none")
      emit("photo-loaded", { matricula, photoUrl: cached });
    return;
  }

  photoLoading.value = true;
  photoUrl.value = null;

  try {
    let request = studentPhotoRequests.get(matricula);
    if (!request) {
      request = $fetch(`/api/students/${encodeURIComponent(matricula)}/photo`, {
        params: { format: "json" },
      }).finally(() => {
        studentPhotoRequests.delete(matricula);
      });
      studentPhotoRequests.set(matricula, request);
    }

    const res = await request;
    if (normalizePhotoMatricula(props.student?.matricula) !== matricula) return;

    if (res && res.photoUrl) {
      photoUrl.value = res.photoUrl;
      sessionStorage.setItem(key, res.photoUrl);
      emit("photo-loaded", { matricula, photoUrl: res.photoUrl });
    } else {
      photoUrl.value = null;
      sessionStorage.setItem(key, "none");
    }
  } catch (e) {
    if (normalizePhotoMatricula(props.student?.matricula) === matricula) {
      photoUrl.value = null;
      if (e?.statusCode === 404 || e?.response?.status === 404) {
        sessionStorage.setItem(key, "none");
      }
    }
  } finally {
    if (normalizePhotoMatricula(props.student?.matricula) === matricula) {
      photoLoading.value = false;
    }
  }
};

watch(
  () => [
    props.student?.matricula,
    state.value.lateFeeActive,
    normalizeCicloKey(state.value.ciclo),
  ],
  () => {
    if (props.student) {
      loadDebts({ useCache: true });
      loadSiblings();
    }
  },
  { immediate: true },
);

watch(
  () => ({
    status: accountStateSyncState.value.status,
    hasCache: accountStateSyncState.value.hasCache,
    rendered: hasRenderedAccountState.value,
    count: debts.value.length,
  }),
  ({ status, hasCache, rendered, count }) => {
    if (status === "syncing" && (hasCache || rendered || count > 0)) {
      startAccountRefresh();
    } else {
      stopAccountRefresh();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", scheduleExpandedShellBoundsUpdate);
    window.visualViewport?.removeEventListener?.(
      "resize",
      scheduleExpandedShellBoundsUpdate,
    );
    if (expandedBoundsFrame) window.cancelAnimationFrame(expandedBoundsFrame);
  }
  clearAccountRefreshTimer();
  finishDetailLayoutTransition(detailsShell.value);
});

watch(
  () => props.student?.matricula,
  () => {
    accountSearchQuery.value = "";
    accountFilter.value = "all";
    photoUrl.value = null;
    photoLoading.value = false;
    if (props.student) loadPhoto();
  },
  { immediate: true },
);

watch(detailsExpanded, (expanded) => {
  if (expanded) {
    scheduleExpandedShellBoundsUpdate();
  } else {
    expandedShellBounds.value = null;
  }
});

watch(
  () => props.student?.matricula,
  () => {
    closeMenu();
    if (detailsExpanded.value) setDetailsExpanded(false);
  },
);

const toggleAll = (e) => {
  const visibleKeys = new Set(visibleValidDebts.value.map(debtKey));

  if (e.target.checked) {
    const hiddenSelectedDebts = selectedDebts.value.filter(
      (debt) => !visibleKeys.has(debtKey(debt)),
    );
    selectedDebts.value = [...hiddenSelectedDebts, ...visibleValidDebts.value];
    return;
  }

  selectedDebts.value = selectedDebts.value.filter(
    (debt) => !visibleKeys.has(debtKey(debt)),
  );
};
const toggleHistory = (debt) => {
  const id = `${debt.documento}-${debt.mes}`;
  expandedHistory.value = expandedHistory.value === id ? null : id;
};

const reprintPayment = (pago) => {
  window.open(
    `/print/recibo?folios=${pago.folio}`,
    "_blank",
    "width=850,height=800",
  );
};

const printBeca = () => {
  window.open(
    `/print/beca?matricula=${props.student.matricula}`,
    "_blank",
    "width=850,height=800",
  );
};

const showAccountFilterMenu = (event) => {
  openMenu(event, [
    {
      label: "Todos",
      icon: LucideSlidersHorizontal,
      action: () => {
        accountFilter.value = "all";
      },
    },
    {
      label: "Pendientes",
      icon: LucideCreditCard,
      action: () => {
        accountFilter.value = "pending";
      },
    },
    {
      label: "Pagados",
      icon: LucideShieldCheck,
      action: () => {
        accountFilter.value = "paid";
      },
    },
    {
      label: "Vencidos",
      icon: LucideBell,
      action: () => {
        accountFilter.value = "overdue";
      },
    },
    {
      label: "Con recargo",
      icon: LucideFilePlus,
      action: () => {
        accountFilter.value = "recargo";
      },
    },
  ]);
};

const showStudentActionsMenu = (event) => {
  const menuItems = [
    {
      label: "Editar",
      icon: LucideSettings,
      action: () => emit("edit", props.student),
    },
  ];

  menuItems.push(
    { label: "-" },
    {
      label: "Secciones",
      icon: LucideTags,
      action: () => emit("manage-sections", props.student),
    },
    { label: "Carta beca", icon: LucideAward, action: printBeca },
    {
      label: "Carta no adeudo",
      icon: LucideShieldCheck,
      action: () => {
        showNoAdeudoModal.value = true;
      },
    },
    {
      label: reminding.value ? "Enviando aviso..." : "Enviar aviso",
      icon: reminding.value ? LucideLoader2 : LucideBell,
      disabled:
        reminding.value || !validDebts.value.length || !props.student?.correo,
      action: sendReminder,
    },
  );

  openMenu(event, menuItems);
};

const cancelPayment = async (pago) => {
  if (pago.estatus === "Cancelada" || pago.estatus === "cancelado") {
    return show("Este folio ya estaba cancelado.", "danger");
  }

  if (
    !confirm(
      "Contacta a soporte y solicítales el código que les va a llegar por Telegram para confirmar la anulación.",
    )
  ) {
    return;
  }

  const motivo = prompt("Motivo de cancelación:");
  if (!motivo) return;

  const secret = Math.floor(Math.random() * 9000) + 1000;
  const userName = useCookie("auth_name").value || "Operador";
  const stringMsg = `*${userName}* solicita una cancelación del concepto _${pago.conceptoNombre}_ por el monto de _$${pago.monto}_ con motivo de _${motivo}_\nCódigo para cancelar: *${secret}*`;

  try {
    await fetch("https://tgbot.casitaapps.com/sendMessages", {
      method: "POST",
      body: JSON.stringify({ chatId: ["-4885991203"], message: stringMsg }),
      headers: { "Content-Type": "application/json" },
    });

    const input = prompt(
      "Ingresa el código de cancelación de 4 dígitos proporcionado:",
    );

    if (input === secret.toString()) {
      await executeOptimistic(
        () =>
          $fetch("/api/payments/cancel", {
            method: "POST",
            body: { folio: pago.folio, motivo, force_direct: true },
          }),
        () => {},
        () => {
          loadDebts({ useCache: false });
          emit("refresh");
        },
        {
          pending: "Procesando anulación...",
          success: "Anulación exitosa",
          error: "Error al anular",
        },
      ).then(async () => {
        await fetch("https://tgbot.casitaapps.com/sendMessages", {
          method: "POST",
          body: JSON.stringify({
            chatId: ["-4885991203"],
            message: `La solicitud de cancelación de *${userName}* con código *${secret}* ha sido procesada exitosamente.`,
          }),
          headers: { "Content-Type": "application/json" },
        });
        loadDebts({ useCache: false });
        emit("refresh");
      });
    } else {
      alert("Código incorrecto. Operación abortada.");
    }
  } catch (e) {
    show("Error al procesar la cancelación, contacte a soporte.", "danger");
  }
};

const sendReminder = async () => {
  if (!props.student.correo)
    return show("El alumno no cuenta con correo registrado", "danger");
  const total = validDebts.value.reduce((s, d) => s + d.saldo, 0);
  reminding.value = true;

  try {
    await executeOptimistic(
      () =>
        $fetch("/api/reminders/send", {
          method: "POST",
          body: {
            correo: props.student.correo,
            asunto: "Recordatorio de pago - Estado de Cuenta",
            mensaje: `Le recordamos amablemente que el alumno presenta un saldo pendiente de $${total.toFixed(2)} MXN.`,
          },
        }),
      () => {},
      () => {},
      {
        pending: "Enviando aviso...",
        success: "Aviso enviado",
        error: "Error al enviar",
      },
    );
  } finally {
    reminding.value = false;
  }
};

const canDepurarDebt = (debt) =>
  debt && Number(debt.saldo || 0) > 0 && Number(debt.pagos ?? 0) > 0;

const requestDepuracion = async (debt) => {
  if (!canDepurarDebt(debt)) {
    return show(
      "La depuración solo completa conceptos con avance previo y saldo pendiente.",
      "danger",
    );
  }

  if (depurandoDebt.value) return;

  const saldo = Number(debt.saldo || 0);
  const message = `La depuración completará el saldo restante de ${debt.conceptoNombre} (${debt.mesLabel}) por $${saldo.toFixed(2)}. No se registrará como pago ordinario y requiere código de autorización por Telegram.`;

  if (!confirm(message)) return;

  const motivo = prompt("Motivo de depuración:");
  if (!motivo) return;

  depurandoDebt.value = debtKey(debt);

  try {
    const request = await $fetch("/api/payments/audit", {
      method: "POST",
      body: {
        action: "request",
        matricula: props.student.matricula,
        documento: debt.documento,
        mes: debt.mes,
        ciclo: normalizeCicloKey(state.value.ciclo),
        conceptoNombre: debt.conceptoNombre,
        mesLabel: debt.mesLabel,
        subtotal: debt.subtotal,
        saldo: debt.saldo,
        pagos: debt.resuelto ?? debt.pagos,
        pagosRegistrados: debt.pagos,
        hasRecargo: debt.hasRecargo,
        motivo,
      },
    });

    const input = prompt(
      "Ingresa el código de depuración de 5 dígitos enviado por Telegram:",
    );
    if (!input) return show("Depuración cancelada", "danger");

    await $fetch("/api/payments/audit", {
      method: "POST",
      body: {
        action: "confirm",
        requestId: request.requestId,
        code: String(input).trim(),
      },
    });

    show("Saldo depurado y progreso completado", "success");
    await loadDebts({ useCache: false });
    emit("refresh");
  } catch (e) {
    show(e?.data?.message || "No se pudo aplicar la depuración", "danger");
  } finally {
    depurandoDebt.value = null;
  }
};

const setMontoFinal = async (debt) => {
  const suggested = Math.round(
    Number(debt.subtotal || debt.costoOriginal || debt.saldo || 0),
  );
  const value = prompt(
    "Este debe ser el monto final de tu proyección, sin decimales.",
    String(suggested),
  );
  if (value === null) return;
  const montoFinal = Number(value);
  if (
    !Number.isFinite(montoFinal) ||
    montoFinal < 0 ||
    Math.floor(montoFinal) !== montoFinal
  ) {
    return show("Ingresa un monto final sin decimales", "danger");
  }
  if (
    !confirm(
      `Confirmar monto final de $${montoFinal.toFixed(2)} para ${debt.conceptoNombre}?`,
    )
  )
    return;
  try {
    await $fetch("/api/documentos/monto-final", {
      method: "POST",
      body: {
        documento: debt.documento,
        mes: debt.mes,
        montoFinal,
        ciclo: normalizeCicloKey(state.value.ciclo),
      },
    });
    show("Monto final definido", "success");
    await loadDebts({ useCache: false });
    emit("refresh");
  } catch (e) {
    show(e?.data?.message || "No se pudo fijar el monto final", "danger");
  }
};

const openConceptChange = (debt) => {
  selectedConceptDebt.value = debt;
  showConceptModal.value = true;
};

const closeConceptModal = () => {
  showConceptModal.value = false;
  selectedConceptDebt.value = null;
};

const canDirectCorrectConcept = (debt) =>
  Boolean(
    isSuperAdmin.value &&
      debt?.documento &&
      !debt?.documentTimeline?.hasChanges,
  );

const openDirectConceptCorrection = (debt) => {
  if (!canDirectCorrectConcept(debt)) return;
  selectedDirectConceptDebt.value = debt;
  showDirectConceptModal.value = true;
};

const closeDirectConceptModal = () => {
  showDirectConceptModal.value = false;
  selectedDirectConceptDebt.value = null;
};

const payTimelineGroup = (group) => {
  const pending = group?.pendingDebts || [];
  if (!pending.length) return;
  selectedDebts.value = pending;
  showPaymentModal.value = true;
};

const invoiceTimelineGroup = (group) => {
  const items = group?.allDebts || [];
  if (!items.length) return;
  selectedDebts.value = items;
  showInvoiceModal.value = true;
};

const openTimelineSegmentChange = (group, segment) => {
  if (!group || !segment || segment.cancelled) return;
  const targetDebt =
    debts.value.find((debt) => {
      const debtMonth =
        String(debt?.mes || "").toLowerCase() === "ev"
          ? 1
          : Number(debt?.mes || 1);
      return (
        Number(debt?.documento) === Number(group.documento) &&
        debtMonth === Number(segment.startMes || 1)
      );
    }) ||
    debts.value.find(
      (debt) => Number(debt?.documento) === Number(group.documento),
    );

  if (targetDebt) openConceptChange(targetDebt);
};

const invoicePaymentReceipt = (debt, payment) => {
  selectedDebts.value = [
    {
      ...debt,
      ...payment,
      conceptoNombre: payment.conceptoNombre || debt.conceptoNombre,
      monto: Number(payment.monto || 0),
      pagos: Number(payment.monto || 0),
      saldo: Number(payment.monto || 0),
      saldoAntes: Number(payment.monto || 0),
      formaDePago: payment.formaDePago || debt.formaDePago || "Efectivo",
      folio_plantel: payment.folio_plantel || "",
      external_id: payment.folio_plantel || "",
      mesLabel: debt.mesLabel || payment.mesReal || payment.mes,
      plantel: debt.plantel || props.student?.plantel || "",
    },
  ];
  showInvoiceModal.value = true;
};

const showDebtContextMenu = (event, debt) => {
  const canPay = debt.saldo > 0;
  const menuItems = [
    {
      label: canPay ? "Pagar este concepto" : "Completado",
      icon: LucideCreditCard,
      disabled: !canPay,
      action: () => {
        selectedDebts.value = [debt];
        showPaymentModal.value = true;
      },
    },
    {
      label: "Facturar",
      icon: LucideFileText,
      action: () => {
        selectedDebts.value = [debt];
        showInvoiceModal.value = true;
      },
    },
    {
      label: "Historial",
      icon: LucideHistory,
      action: () => toggleHistory(debt),
    },
    { label: "-" },
  ];

  if (debt.montoFinalPendiente) {
    menuItems.push({
      label: "Fijar monto final",
      icon: LucideSettings,
      action: () => setMontoFinal(debt),
    });
    menuItems.push({ label: "-" });
  }

  if (canDepurarDebt(debt)) {
    menuItems.push({
      label:
        depurandoDebt.value === debtKey(debt)
          ? "Depurando saldo..."
          : "Depurar saldo restante",
      icon: LucideShieldCheck,
      disabled: Boolean(depurandoDebt.value),
      action: () => requestDepuracion(debt),
    });
    menuItems.push({ label: "-" });
  }

  if (canDirectCorrectConcept(debt)) {
    menuItems.push({
      label: "Cambiar concepto",
      icon: LucidePencilLine,
      action: () => openDirectConceptCorrection(debt),
    });
  }

  menuItems.push({
    label: "Ajustar concepto",
    icon: LucideSettings,
    action: () => openConceptChange(debt),
  });
  openMenu(event, menuItems);
};

const saveIngresoCycle = async (payload) => {
  if (!props.student?.matricula || savingIngresoCycle.value) return;
  const ciclo =
    typeof payload === "object" && payload !== null ? payload.ciclo : payload;
  savingIngresoCycle.value = true;

  try {
    const res = await $fetch(
      `/api/students/${props.student.matricula}/ingreso-cycle`,
      {
        method: "PUT",
        body: {
          ciclo,
          targetCiclo: payload?.targetCiclo || selectedCicloKey.value,
          targetNivel: payload?.targetNivel,
          targetGrado: payload?.targetGrado,
          tipoIngresoOverrideActivo: payload?.tipoIngresoOverrideActivo,
          tipoIngresoOverride: payload?.tipoIngresoOverride,
        },
      },
    );

    showIngresoCycleModal.value = false;
    show("Ciclo y posición actualizados", "success");
    emit(
      "ingreso-cycle-updated",
      res?.student || {
        matricula: props.student.matricula,
        ciclo,
        cicloBase: ciclo,
      },
    );
    emit("refresh");
  } catch (e) {
    show(
      e?.data?.message || "No se pudo actualizar el ciclo y la posición",
      "danger",
    );
  } finally {
    savingIngresoCycle.value = false;
  }
};

const handleNoAdeudoSent = (response) => {
  showNoAdeudoModal.value = false;
  const sent = Number(response?.sent || 0);
  const failed = Number(response?.failed || 0);
  show(
    `${sent} carta${sent === 1 ? "" : "s"} de no adeudo enviada${sent === 1 ? "" : "s"}${failed ? `; ${failed} fallida${failed === 1 ? "" : "s"}` : ""}.`,
    failed ? "warning" : "success",
  );
  emit("refresh");
};

const handleSuccess = () => {
  showPaymentModal.value = false;
  showDocModal.value = false;
  showInvoiceModal.value = false;
  closeConceptModal();
  closeDirectConceptModal();
  selectedDebts.value = [];
  loadDebts({ useCache: false, preserveInteraction: false });
  emit("refresh");
};

const handleInvoiceSuccess = () => {
  loadDebts({ useCache: false, preserveInteraction: true });
};
</script>

<style scoped>
.account-timeline-wrap {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--students-border-soft, #edf2f7);
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(21, 35, 60, 0.03);
}

.timeline-empty {
  min-height: 190px;
  border: 0;
  border-radius: 13px;
  background: #fbfcfe;
}

.timeline-list {
  display: grid;
}

.timeline-card {
  display: grid;
  overflow: hidden;
  border: 0;
  border-bottom: 1px solid #edf2f7;
  border-radius: 0;
  background: #ffffff;
}

.timeline-card:last-child {
  border-bottom: 0;
}

.timeline-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 7px;
  background: #fff;
}

.timeline-card-header strong {
  display: block;
  overflow: hidden;
  color: #17243c;
  font-size: 0.77rem;
  font-weight: 860;
  letter-spacing: -0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-card-header span {
  display: block;
  margin-top: 2px;
  color: #7b8798;
  font-size: 0.66rem;
  font-weight: 720;
}

.timeline-card-actions {
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 6px;
}

.timeline-action {
  height: 28px;
  border: 1px solid #d7e1ec;
  border-radius: 10px;
  background: #ffffff;
  color: #516174;
  cursor: pointer;
  padding: 0 9px;
  font-size: 0.66rem;
  font-weight: 820;
}

.timeline-action.primary {
  border-color: #cae3c3;
  background: #eff9ed;
  color: #2e7d32;
}

.timeline-track {
  position: relative;
  display: grid;
  gap: 7px;
  padding: 0 12px 11px 18px;
}

.timeline-track::before {
  position: absolute;
  top: 7px;
  bottom: 18px;
  left: 18px;
  width: 1px;
  background: #dce8d8;
  content: "";
}

.timeline-segment {
  position: relative;
  display: grid;
  grid-template-columns: minmax(72px, 0.58fr) minmax(0, 1.8fr) minmax(72px, 0.62fr);
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 42px;
  border: 1px solid #e2eaf3;
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff, #fbfcfe);
  color: inherit;
  cursor: pointer;
  padding: 8px 10px 8px 18px;
  text-align: left;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.timeline-segment::before {
  position: absolute;
  top: 50%;
  left: -6px;
  width: 9px;
  height: 9px;
  border: 2px solid #ffffff;
  border-radius: 999px;
  background: #45a341;
  box-shadow: 0 0 0 1px rgba(69, 163, 65, 0.22);
  content: "";
  transform: translateY(-50%);
}

.timeline-segment:hover:not(:disabled) {
  border-color: rgba(63, 145, 56, 0.25);
  background: #f9fcf8;
  box-shadow: 0 8px 18px rgba(21, 35, 60, 0.05);
  transform: translateY(-1px);
}

.timeline-segment.changed {
  background: linear-gradient(180deg, #ffffff, #fbfef9);
}

.timeline-segment.cancelled {
  background: #fff9f8;
  cursor: default;
  opacity: 0.9;
}

.timeline-segment.cancelled::before {
  background: #c86a61;
  box-shadow: 0 0 0 1px rgba(200, 106, 97, 0.22);
}

.timeline-segment strong {
  overflow: hidden;
  color: #17243c;
  font-size: 0.74rem;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-segment span,
.timeline-segment em {
  color: #6b778a;
  font-size: 0.66rem;
  font-style: normal;
  font-weight: 760;
}

.timeline-segment span {
  color: #8a96a8;
}

.timeline-segment em {
  justify-self: end;
  color: #2e7d32;
}

.timeline-segment.cancelled em {
  color: #b85a54;
}

.timeline-differentials {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 0 12px 11px 18px;
}

.timeline-differential {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #f0dfb8;
  border-radius: 10px;
  background: #fffaf0;
  color: #806018;
  padding: 6px 9px;
  font-size: 0.68rem;
  font-weight: 820;
}

.timeline-differential strong {
  color: #624808;
}

.student-details-shell:not(.student-details-shell--expanded) .account-timeline-wrap {
  border-radius: 10px;
}

.student-details-shell:not(.student-details-shell--expanded) .timeline-card-header {
  gap: 8px;
  padding: 8px 10px 5px;
}

.student-details-shell:not(.student-details-shell--expanded) .timeline-card-header strong {
  font-size: 0.7rem;
}

.student-details-shell:not(.student-details-shell--expanded) .timeline-card-header span {
  font-size: 0.6rem;
}

.student-details-shell:not(.student-details-shell--expanded) .timeline-action {
  height: 24px;
  padding-inline: 8px;
  border-radius: 8px;
  font-size: 0.61rem;
}

.student-details-shell:not(.student-details-shell--expanded) .timeline-track {
  gap: 5px;
  padding: 0 10px 9px 16px;
}

.student-details-shell:not(.student-details-shell--expanded) .timeline-track::before {
  left: 16px;
}

.student-details-shell:not(.student-details-shell--expanded) .timeline-segment {
  min-height: 34px;
  grid-template-columns: minmax(58px, 0.48fr) minmax(0, 1.7fr) minmax(58px, 0.5fr);
  gap: 7px;
  padding: 6px 8px 6px 16px;
  border-radius: 10px;
}

.student-details-shell:not(.student-details-shell--expanded) .timeline-segment strong {
  font-size: 0.66rem;
}

.student-details-shell:not(.student-details-shell--expanded) .timeline-segment span,
.student-details-shell:not(.student-details-shell--expanded) .timeline-segment em {
  font-size: 0.59rem;
}

@media (max-width: 760px) {
  .timeline-card-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .timeline-card-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .timeline-segment {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .timeline-segment em {
    justify-self: start;
  }
}
</style>
