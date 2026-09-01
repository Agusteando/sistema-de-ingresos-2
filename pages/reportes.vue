<template>
  <div class="reports-page">
    <section class="reports-heading">
      <h2>Reportes</h2>

      <div class="report-switcher" v-if="hasFinancialAccess">
        <button type="button" :class="{ active: activeReport === 'concepto' }" @click="activeReport = 'concepto'">
          <LucideFileText :size="16" />
          Concepto
        </button>
        <button type="button" :class="{ active: activeReport === 'corte' }" @click="openCorte">
          <LucideReceipt :size="16" />
          Corte de caja
        </button>
        <button type="button" :class="{ active: activeReport === 'alumnos' }" @click="activeReport = 'alumnos'">
          <LucideUsers :size="16" />
          Alumnos
        </button>
        <button type="button" :class="{ active: activeReport === 'recibos' }" @click="activeReport = 'recibos'">
          <LucidePrinter :size="16" />
          Recibos
        </button>
      </div>
    </section>

    <section v-if="activeReport === 'concepto'" class="report-panel">
      <div class="panel-header concept-panel-header">
        <div class="concept-heading">
          <div>
            <h3>Reporte por concepto</h3>
            <p>{{ conceptReportDescription }}</p>
          </div>
          <div class="concept-mode-switch" role="group" aria-label="Tipo de reporte por concepto">
            <button
              type="button"
              :class="{ active: conceptReportMode === 'movements' }"
              :aria-pressed="conceptReportMode === 'movements'"
              @click="setConceptReportMode('movements')"
            >
              Con concepto
            </button>
            <button
              type="button"
              :class="{ active: conceptReportMode === 'missing' }"
              :aria-pressed="conceptReportMode === 'missing'"
              @click="setConceptReportMode('missing')"
            >
              Sin concepto
            </button>
            <button
              type="button"
              :class="{ active: conceptReportMode === 'debtors' }"
              :aria-pressed="conceptReportMode === 'debtors'"
              @click="setConceptReportMode('debtors')"
            >
              Deudores
            </button>
          </div>
        </div>
        <div class="panel-actions">
          <button class="btn btn-outline" type="button" @click="printConceptReport" :disabled="!conceptReportReady || loadingConceptReport">
            <LucidePrinter :size="16" />
            Imprimir
          </button>
          <button class="btn btn-outline" type="button" @click="exportConceptReport" :disabled="!conceptReportReady || loadingConceptReport || downloadingConceptExcel">
            <LucideLoader2 v-if="downloadingConceptExcel" class="animate-spin" :size="16" />
            <LucideDownload v-else :size="16" />
            Excel
          </button>
        </div>
      </div>

      <div class="filters-grid concept-filters" :class="{ 'is-missing-mode': conceptReportMode === 'missing' }">
        <div class="form-group m-0 concept-select-field">
          <label class="form-label">{{ conceptReportMode === 'missing' ? 'Conceptos a revisar' : 'Conceptos' }}</label>
          <ConceptMultiSearchSelect
            v-model="filtrosConcepto.conceptoIds"
            :concepts="conceptos"
            :loading="loadingConceptos"
            :disabled="loadingConceptReport"
            placeholder="Buscar y seleccionar conceptos..."
          />
        </div>
        <div v-if="conceptReportMode === 'movements'" class="form-group m-0">
          <label class="form-label">Desde</label>
          <input type="date" v-model="filtrosConcepto.inicio" class="input-field">
        </div>
        <div v-if="conceptReportMode === 'movements'" class="form-group m-0">
          <label class="form-label">Hasta</label>
          <input type="date" v-model="filtrosConcepto.fin" class="input-field">
        </div>
        <div v-else class="concept-cycle-context">
          <span>Ciclo escolar</span>
          <strong>{{ conceptCycleLabel }}</strong>
          <small>{{ conceptReportMode === 'debtors' ? 'Adeudo exigible del ciclo' : 'Solo alumnos inscritos' }}</small>
        </div>
        <div v-if="conceptReportMode === 'debtors'" class="form-group m-0 threshold-field">
          <label class="form-label">Umbral de adeudo</label>
          <input
            v-model.number="filtrosConcepto.threshold"
            type="number"
            min="0"
            step="0.01"
            class="input-field"
            inputmode="decimal"
          >
          <small class="field-help">Solo saldos mayores a este monto.</small>
        </div>
        <div class="form-group m-0" v-if="canFilterPlantel">
          <label class="form-label">Plantel</label>
          <select v-model="filtrosConcepto.plantel" class="input-field">
            <option value="">{{ conceptReportMode !== 'movements' ? 'Selecciona un plantel' : 'Todos' }}</option>
            <option v-for="p in PLANTELES_LIST" :key="p" :value="p">Plantel {{ p }}</option>
          </select>
        </div>
        <button class="btn btn-primary filter-button" type="button" @click="prepareConceptReport" :disabled="loadingConceptReport || loadingConceptos || !filtrosConcepto.conceptoIds.length || (conceptReportMode !== 'movements' && canFilterPlantel && !filtrosConcepto.plantel)">
          <LucideLoader2 v-if="loadingConceptReport" class="animate-spin" :size="16" />
          <LucideFilter v-else :size="16" />
          {{ conceptReportMode === 'missing' ? 'Buscar faltantes' : (conceptReportMode === 'debtors' ? 'Ver deudores' : 'Generar') }}
        </button>
      </div>

      <div v-if="conceptReportMode === 'movements'" class="summary-grid">
        <div class="metric-card">
          <span>Registrado</span>
          <strong>${{ Number(conceptSummary.totalRegistrado || 0).toFixed(2) }}</strong>
        </div>
        <div class="metric-card">
          <span>Aplicado</span>
          <strong>${{ Number(conceptSummary.total || 0).toFixed(2) }}</strong>
        </div>
        <div class="metric-card">
          <span>No aplicado</span>
          <strong>${{ Number(conceptSummary.totalNoAplicado || 0).toFixed(2) }}</strong>
        </div>
        <div class="metric-card">
          <span>Movimientos</span>
          <strong>{{ conceptSummary.transacciones || 0 }}</strong>
        </div>
        <div class="metric-card">
          <span>Alumnos</span>
          <strong>{{ conceptSummary.alumnos || 0 }}</strong>
        </div>
        <div class="metric-card muted">
          <span>Conceptos</span>
          <strong :title="selectedConceptName">{{ selectedConceptName }}</strong>
        </div>
      </div>

      <div v-else-if="conceptReport.modo === 'debtors'" class="summary-grid debtor-summary-grid">
        <div class="metric-card attention">
          <span>Deudores</span>
          <strong>{{ conceptSummary.alumnos || 0 }}</strong>
        </div>
        <div class="metric-card">
          <span>Saldo pendiente</span>
          <strong>${{ Number(conceptSummary.saldoPendiente || 0).toFixed(2) }}</strong>
        </div>
        <div class="metric-card">
          <span>Cargos exigibles</span>
          <strong>${{ Number(conceptSummary.totalCargos || 0).toFixed(2) }}</strong>
        </div>
        <div class="metric-card">
          <span>Pagado</span>
          <strong>${{ Number(conceptSummary.totalPagado || 0).toFixed(2) }}</strong>
        </div>
        <div class="metric-card muted">
          <span>Umbral</span>
          <strong>&gt; ${{ Number(conceptSummary.threshold ?? filtrosConcepto.threshold ?? 0).toFixed(2) }}</strong>
        </div>
      </div>

      <div v-else-if="conceptReport.modo === 'missing'" class="summary-grid missing-summary-grid">
        <div class="metric-card">
          <span>Inscritos revisados</span>
          <strong>{{ conceptSummary.inscritos || 0 }}</strong>
        </div>
        <div class="metric-card attention">
          <span>Sin ninguno</span>
          <strong>{{ conceptSummary.alumnos || 0 }}</strong>
        </div>
        <div class="metric-card">
          <span>Con al menos uno</span>
          <strong>{{ conceptSummary.conAlguno ?? conceptSummary.completos ?? 0 }}</strong>
        </div>
        <div class="metric-card">
          <span>Cobertura</span>
          <strong>{{ Number(conceptSummary.cobertura || 0).toFixed(1) }}%</strong>
        </div>
        <div class="metric-card muted">
          <span>Conceptos revisados</span>
          <strong>{{ selectedConcepts.length || 0 }}</strong>
        </div>
      </div>

      <div v-if="conceptReportMode === 'movements'" class="report-split">
        <div class="card table-wrapper report-table">
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Matrícula</th>
                <th>Alumno</th>
                <th>Nivel</th>
                <th>Grado</th>
                <th>Mes</th>
                <th>Concepto</th>
                <th>Forma de pago</th>
                <th>Estatus</th>
                <th class="text-right">Registrado</th>
                <th class="text-right">Aplicado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingConceptReport">
                <td colspan="12" class="text-center py-12 text-gray-500 font-medium">Generando reporte...</td>
              </tr>
              <tr v-else-if="!filtrosConcepto.conceptoIds.length">
                <td colspan="12" class="text-center py-12 text-gray-400">Selecciona uno o más conceptos para generar el reporte.</td>
              </tr>
              <tr v-else-if="!conceptRows.length">
                <td colspan="12" class="text-center py-12 text-gray-400">No se encontraron movimientos para los conceptos y filtros seleccionados.</td>
              </tr>
              <tr v-else v-for="row in conceptRows" :key="`${row.folio}-${row.concepto}`">
                <td class="font-mono text-gray-500">{{ row.folio }}</td>
                <td>{{ formatDate(row.fecha) }}</td>
                <td class="font-mono text-gray-600">{{ row.matricula }}</td>
                <td class="font-semibold text-gray-800">{{ row.nombreCompleto }}</td>
                <td>{{ row.nivel || '—' }}</td>
                <td>{{ row.grado || '—' }}</td>
                <td>{{ row.mesReal || row.mes }}</td>
                <td class="font-medium text-gray-700">{{ row.conceptoNombre || row.concepto }}</td>
                <td><span class="badge bg-blue-50 text-blue-700">{{ row.formaDePago }}</span></td>
                <td><span class="badge" :class="corteStatusClass(row.estatusReporte || row.estatus)">{{ row.estatusReporte || row.estatus || 'Vigente' }}</span></td>
                <td class="text-right font-semibold font-mono text-gray-700">${{ Number(row.montoRegistrado ?? row.monto ?? 0).toFixed(2) }}</td>
                <td class="text-right font-bold font-mono text-brand-campus">${{ Number(row.montoAplicado || 0).toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside class="breakdown-panel">
          <h4>Desglose</h4>
          <div v-if="conceptSummary.formasPago?.length" class="breakdown-list">
            <div v-for="item in conceptSummary.formasPago" :key="item.formaDePago">
              <span>{{ item.formaDePago }}</span>
              <strong>${{ Number(item.total || 0).toFixed(2) }}</strong>
            </div>
          </div>
          <p v-else>No hay movimientos para desglosar.</p>

          <template v-if="conceptSummary.estatus?.length">
            <h4 class="mt-5">Estatus</h4>
            <div class="breakdown-list">
              <div v-for="item in conceptSummary.estatus" :key="item.estatus">
                <span>{{ item.estatus }} · {{ item.movimientos }}</span>
                <strong>${{ Number(item.montoRegistrado || 0).toFixed(2) }}</strong>
              </div>
            </div>
          </template>

          <template v-if="conceptSummary.conceptos?.length > 1">
            <h4 class="mt-5">Conceptos</h4>
            <div class="breakdown-list">
              <div v-for="item in conceptSummary.conceptos" :key="item.concepto">
                <span>{{ item.concepto }}</span>
                <strong>${{ Number(item.total || 0).toFixed(2) }}</strong>
              </div>
            </div>
          </template>

          <template v-if="canFilterPlantel && conceptSummary.planteles?.length">
            <h4 class="mt-5">Planteles</h4>
            <div class="breakdown-list">
              <div v-for="item in conceptSummary.planteles" :key="item.plantel">
                <span>{{ item.plantel }}</span>
                <strong>${{ Number(item.total || 0).toFixed(2) }}</strong>
              </div>
            </div>
          </template>
        </aside>
      </div>

      <div v-else-if="conceptReportMode === 'debtors'" class="report-split debtor-report-split">
        <div class="card table-wrapper report-table debtor-concept-table">
          <table>
            <thead>
              <tr>
                <th>Matrícula</th>
                <th>Alumno</th>
                <th>Nivel</th>
                <th>Grado</th>
                <th>Grupo</th>
                <th v-if="canFilterPlantel">Plantel</th>
                <th>Conceptos con adeudo</th>
                <th class="text-right">Cargos</th>
                <th class="text-right">Pagado</th>
                <th class="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingConceptReport">
                <td :colspan="canFilterPlantel ? 10 : 9" class="text-center py-12 text-gray-500 font-medium">Calculando adeudos...</td>
              </tr>
              <tr v-else-if="!filtrosConcepto.conceptoIds.length">
                <td :colspan="canFilterPlantel ? 10 : 9" class="text-center py-12 text-gray-400">Selecciona uno o más conceptos para consultar deudores.</td>
              </tr>
              <tr v-else-if="canFilterPlantel && !filtrosConcepto.plantel">
                <td colspan="10" class="text-center py-12 text-gray-400">Selecciona un plantel para calcular la cartera con la misma lógica de cobranza.</td>
              </tr>
              <tr v-else-if="conceptReport.modo !== 'debtors'">
                <td :colspan="canFilterPlantel ? 10 : 9" class="text-center py-12 text-gray-400">Genera el reporte para consultar los adeudos de los conceptos seleccionados.</td>
              </tr>
              <tr v-else-if="!conceptRows.length">
                <td :colspan="canFilterPlantel ? 10 : 9" class="missing-empty-state">
                  <strong>Sin deudores para este filtro</strong>
                  <span>No hay alumnos con saldo exigible mayor a ${{ Number(conceptSummary.threshold ?? filtrosConcepto.threshold ?? 0).toFixed(2) }} en los conceptos seleccionados.</span>
                </td>
              </tr>
              <tr v-else v-for="row in conceptRows" :key="row.matricula">
                <td class="font-mono text-gray-600">{{ row.matricula }}</td>
                <td><span class="student-name-cell font-semibold text-gray-800">{{ row.nombreCompleto }}</span></td>
                <td>{{ row.nivel || '—' }}</td>
                <td>{{ row.grado || '—' }}</td>
                <td>{{ row.grupo || '—' }}</td>
                <td v-if="canFilterPlantel">{{ row.plantel || filtrosConcepto.plantel || '—' }}</td>
                <td>
                  <div class="missing-concept-chips debtor-concept-chips">
                    <span v-for="concept in row.conceptosPendientes" :key="concept.id">
                      {{ concept.concepto }} · ${{ Number(concept.saldo || 0).toFixed(2) }}
                    </span>
                  </div>
                </td>
                <td class="text-right font-mono text-gray-700">${{ Number(row.totalCargos || 0).toFixed(2) }}</td>
                <td class="text-right font-mono text-gray-700">${{ Number(row.totalPagado || 0).toFixed(2) }}</td>
                <td class="text-right font-bold font-mono text-brand-campus">${{ Number(row.saldoPendiente || 0).toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside class="breakdown-panel">
          <h4>Conceptos con adeudo</h4>
          <div v-if="conceptSummary.conceptos?.length" class="breakdown-list debtor-breakdown-list">
            <div v-for="item in conceptSummary.conceptos" :key="item.id">
              <span>{{ item.concepto }} · {{ item.alumnos }} alumno{{ item.alumnos === 1 ? '' : 's' }}</span>
              <strong>${{ Number(item.saldo || 0).toFixed(2) }}</strong>
            </div>
          </div>
          <p v-else>No hay saldos pendientes para desglosar.</p>

          <div class="missing-report-note">
            “Deudores” usa la misma lógica de la cartera Deudores de Aurora: solo incluye saldo exigible y conserva sus reglas de pagos registrados, conciliaciones pendientes y fechas límite especiales. El umbral se aplica al saldo total del alumno para los conceptos seleccionados.
          </div>
        </aside>
      </div>

      <div v-else class="report-split missing-report-split">
        <div class="card table-wrapper report-table missing-concept-table">
          <table>
            <thead>
              <tr>
                <th>Matrícula</th>
                <th>Alumno</th>
                <th>Nivel</th>
                <th>Grado</th>
                <th>CURP</th>
                <th>Nacimiento</th>
                <th v-if="canFilterPlantel">Plantel</th>
                <th>Conceptos seleccionados ausentes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingConceptReport">
                <td :colspan="canFilterPlantel ? 8 : 7" class="text-center py-12 text-gray-500 font-medium">Revisando alumnos inscritos...</td>
              </tr>
              <tr v-else-if="!filtrosConcepto.conceptoIds.length">
                <td :colspan="canFilterPlantel ? 8 : 7" class="text-center py-12 text-gray-400">Selecciona uno o más conceptos para revisar faltantes.</td>
              </tr>
              <tr v-else-if="canFilterPlantel && !filtrosConcepto.plantel">
                <td :colspan="8" class="text-center py-12 text-gray-400">Selecciona un plantel. La población inscrita se valida contra el agente de ese plantel.</td>
              </tr>
              <tr v-else-if="conceptReport.modo !== 'missing'">
                <td :colspan="canFilterPlantel ? 8 : 7" class="text-center py-12 text-gray-400">Genera el reporte para revisar la población inscrita del ciclo.</td>
              </tr>
              <tr v-else-if="Number(conceptSummary.inscritos || 0) === 0">
                <td :colspan="canFilterPlantel ? 8 : 7" class="missing-empty-state">
                  <strong>Sin alumnos inscritos</strong>
                  <span>No hay población con estado “inscrito” para {{ conceptCycleLabel }} en el plantel seleccionado.</span>
                </td>
              </tr>
              <tr v-else-if="!conceptRows.length">
                <td :colspan="canFilterPlantel ? 8 : 7" class="missing-empty-state">
                  <strong>Todos tienen al menos uno</strong>
                  <span>No hay alumnos inscritos sin ninguno de los conceptos seleccionados para {{ conceptCycleLabel }}.</span>
                </td>
              </tr>
              <tr v-else v-for="row in conceptRows" :key="`${row.matricula}-${row.conceptosFaltantesTexto}`">
                <td class="font-mono text-gray-600">{{ row.matricula }}</td>
                <td class="font-semibold text-gray-800">
                  <span class="student-name-cell">{{ row.nombreCompleto || '—' }}</span>
                </td>
                <td>{{ row.nivel || '—' }}</td>
                <td>{{ row.grado || '—' }}</td>
                <td class="font-mono text-gray-600">{{ row.curp || '—' }}</td>
                <td>{{ formatDate(row.fechaNacimiento) || '—' }}</td>
                <td v-if="canFilterPlantel">{{ row.plantel || '—' }}</td>
                <td>
                  <div class="missing-concept-chips">
                    <span v-for="concept in row.conceptosFaltantes" :key="concept.id">{{ concept.concepto }}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside class="breakdown-panel missing-breakdown-panel">
          <h4>Conceptos seleccionados</h4>
          <div v-if="conceptSummary.conceptos?.length" class="breakdown-list missing-breakdown-list">
            <div v-for="item in conceptSummary.conceptos" :key="item.id">
              <span>{{ item.concepto }}</span>
              <strong>{{ item.faltantes }}</strong>
            </div>
          </div>

          <template v-if="conceptSummary.grados?.length">
            <h4 class="mt-5">Alumnos por grado</h4>
            <div class="breakdown-list missing-breakdown-list">
              <div v-for="item in conceptSummary.grados" :key="item.grado">
                <span>{{ item.grado }}</span>
                <strong>{{ item.total }}</strong>
              </div>
            </div>
          </template>

          <div class="missing-report-note">
            “Sin concepto” muestra solo alumnos inscritos sin ninguno de los conceptos seleccionados. Tener al menos uno de ellos excluye al alumno del reporte.
          </div>
        </aside>
      </div>
    </section>

    <section v-else-if="activeReport === 'corte'" class="report-panel">
      <div class="panel-header">
        <h3>Corte de caja</h3>
        <div class="panel-actions">
          <button class="btn btn-outline" @click="prepareCorteExcel" :disabled="loadingCorte || downloadingCorteExcel">
            <LucideLoader2 v-if="downloadingCorteExcel" class="animate-spin" :size="16" />
            <LucideDownload v-else :size="16" />
            Excel
          </button>
          <button class="btn btn-outline" @click="printCorte" :disabled="loadingCorte || downloadingCorteExcel">
            <LucidePrinter :size="16" />
            Imprimir
          </button>
        </div>
      </div>

      <div class="filters-grid corte-filters">
        <div class="form-group m-0">
          <label class="form-label">Apertura</label>
          <input type="date" v-model="filtrosCorte.inicio" class="input-field">
        </div>
        <div class="form-group m-0">
          <label class="form-label">Cierre</label>
          <input type="date" v-model="filtrosCorte.fin" class="input-field">
        </div>
        <div class="form-group m-0" v-if="canFilterPlantel">
          <label class="form-label">Plantel</label>
          <select v-model="filtrosCorte.plantel" class="input-field">
            <option value="" disabled>Seleccione un plantel</option>
            <option v-for="p in PLANTELES_LIST" :key="p" :value="p">Plantel {{ p }}</option>
          </select>
        </div>
        <button class="btn btn-secondary filter-button" @click="loadCorte" :disabled="loadingCorte">
          <LucideLoader2 v-if="loadingCorte" class="animate-spin" :size="16" />
          <LucideFilter v-else :size="16" />
          Ejecutar
        </button>
      </div>

      <div class="card table-wrapper">
        <div class="corte-total">
          <h3>Bitácora de ingresos</h3>
          <div class="corte-total-values">
            <span>Registrado: ${{ totalRegistradoCorte.toFixed(2) }}</span>
            <strong>Cierre: ${{ totalCorte.toFixed(2) }}</strong>
          </div>
        </div>
        <table class="w-full">
          <thead>
            <tr>
              <th>Fecha efectiva del pago</th>
              <th>Concepto / Tarifa</th>
              <th>Vía de ingreso</th>
              <th>Estatus</th>
              <th class="text-right">Trx</th>
              <th class="text-right">Registrado (MXN)</th>
              <th class="text-right">Aplicado al corte (MXN)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingCorte">
              <td colspan="7" class="text-center font-medium text-gray-500 py-12">Procesando...</td>
            </tr>
            <tr v-else-if="!datosCorte.length">
              <td colspan="7" class="text-center text-gray-400 py-12">No hay movimientos registrados en el periodo.</td>
            </tr>
            <tr v-else v-for="(row, idx) in datosCorte" :key="idx" class="cursor-context-menu" @contextmenu.prevent="showCorteContextMenu($event, row)">
              <td class="text-gray-600">{{ formatDate(row.fecha) }}</td>
              <td class="font-semibold text-gray-800">{{ row.categoria }}</td>
              <td><span class="badge bg-blue-50 text-blue-700">{{ row.formaDePago }}</span></td>
              <td><span class="badge" :class="corteStatusClass(row.estatus)">{{ row.estatus }}</span></td>
              <td class="text-right font-semibold text-gray-600">{{ row.transacciones }}</td>
              <td class="text-right font-semibold text-gray-700 font-mono">${{ Number(row.montoRegistrado).toFixed(2) }}</td>
              <td class="text-right font-bold text-brand-campus font-mono">${{ Number(row.total).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-else-if="activeReport === 'alumnos'" class="report-panel student-report-panel">
      <div class="panel-header">
        <h3>Alumnos</h3>
        <div class="panel-actions">
          <button class="btn btn-outline" type="button" @click="downloadStudentsExcel" :disabled="downloadingStudentsExcel">
            <LucideLoader2 v-if="downloadingStudentsExcel" class="animate-spin" :size="16" />
            <LucideDownload v-else :size="16" />
            Excel
          </button>
        </div>
      </div>

      <div v-if="canFilterPlantel" class="filters-grid student-report-filters">
        <div class="form-group m-0">
          <label class="form-label">Plantel</label>
          <select v-model="filtrosAlumnos.plantel" class="input-field">
            <option value="" disabled>Seleccione un plantel</option>
            <option v-for="p in PLANTELES_LIST" :key="p" :value="p">Plantel {{ p }}</option>
          </select>
        </div>
      </div>
    </section>

    <section v-else class="report-panel receipts-report-panel">
      <div class="panel-header">
        <h3>Recibos del corte</h3>
      </div>

      <div class="filters-grid corte-filters">
        <div class="form-group m-0">
          <label class="form-label">Desde</label>
          <input type="date" v-model="filtrosCorte.inicio" class="input-field">
        </div>
        <div class="form-group m-0">
          <label class="form-label">Hasta</label>
          <input type="date" v-model="filtrosCorte.fin" class="input-field">
        </div>
        <div class="form-group m-0" v-if="canFilterPlantel">
          <label class="form-label">Plantel</label>
          <select v-model="filtrosCorte.plantel" class="input-field">
            <option value="" disabled>Seleccione un plantel</option>
            <option v-for="p in PLANTELES_LIST" :key="p" :value="p">Plantel {{ p }}</option>
          </select>
        </div>
        <button class="btn btn-primary filter-button" type="button" @click="openReceiptStripsPdf">
          <LucideDownload :size="16" />
          Generar PDF
        </button>
      </div>

      <div class="receipt-export-stage">
        <div class="receipt-export-icon" aria-hidden="true">
          <LucideReceipt :size="24" />
        </div>
        <div>
          <span>{{ receiptPeriodLabel }}</span>
          <strong>Plantel {{ receiptPlantelLabel }}</strong>
        </div>
        <span class="receipt-format-chip">2 recibos por hoja</span>
      </div>
    </section>

    <CorteUserSelectionModal
      v-if="conceptUserSelectorOpen"
      :users="conceptUserOptions"
      :plantel="conceptUserSelectionContext.plantel || 'Todos'"
      :period-label="conceptUserPeriodLabel"
      :loading="loadingConceptReport"
      description="Usuarios incluidos en el reporte. Se consideran todos los movimientos y estatus del periodo seleccionado."
      confirm-label="Generar reporte"
      confirm-icon="filter"
      @cancel="closeConceptUserSelector"
      @confirm="confirmConceptReportUsers"
    />

    <CorteUserSelectionModal
      v-if="corteUserSelectorOpen"
      :users="corteUserOptions"
      :plantel="corteUserSelectionContext.plantel"
      :period-label="corteUserPeriodLabel"
      :loading="downloadingCorteExcel"
      @cancel="closeCorteUserSelector"
      @confirm="confirmCorteExcelUsers"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie, useState } from '#app'
import {
  LucideDownload,
  LucideFileText,
  LucideFilter,
  LucideLoader2,
  LucidePrinter,
  LucideReceipt,
  LucideUsers
} from 'lucide-vue-next'
import { PLANTELES_LIST } from '~/utils/constants'
import { useContextMenu } from '~/composables/useContextMenu'
import { useToast } from '~/composables/useToast'
import { formatCicloLabel, normalizeCicloKey } from '~/shared/utils/ciclo'
import ConceptSearchSelect from '~/components/ConceptSearchSelect.vue'
import { resolveClientAuthAccess } from '~/utils/authAccess'

const state = useState('globalState')
const route = useRoute()
const { openMenu } = useContextMenu()
const { show } = useToast()

const userRole = ref(useCookie('auth_role').value || 'plantel')
const activePlantel = ref(useCookie('auth_active_plantel').value || '')
const homePlantel = ref(useCookie('auth_home_plantel').value || '')
const hasFinancialAccessCookie = useCookie('auth_has_financial_access')
const roleTokens = computed(() => String(userRole.value || '').split(',').map(role => role.trim().toLowerCase()).filter(Boolean))
const isSuperAdmin = computed(() => roleTokens.value.some(role => ['superadmin'].includes(role)))
const hasFinancialAccess = computed(() => resolveClientAuthAccess({
  role: userRole.value,
  hasFinancialAccess: hasFinancialAccessCookie.value
}).financialAccess)
const canFilterPlantel = computed(() => isSuperAdmin.value && activePlantel.value === 'GLOBAL')
const requestedReport = String(route.query.tipo || '').toLowerCase()
const activeReport = ref(hasFinancialAccess.value && ['corte', 'alumnos', 'recibos'].includes(requestedReport)
  ? requestedReport
  : 'concepto')

const conceptos = ref([])
const loadingConceptos = ref(false)
const loadingConceptReport = ref(false)
const downloadingConceptExcel = ref(false)
const conceptReportMode = ref('movements')
const selectedConceptUserKeys = ref([])
const conceptUserSelectorOpen = ref(false)
const conceptUserOptions = ref([])
const conceptUserSelectionContext = ref({
  inicio: '',
  fin: '',
  plantel: ''
})
const filtrosConcepto = ref({
  conceptoIds: route.query.conceptoId ? [String(route.query.conceptoId)] : [],
  inicio: '',
  fin: '',
  plantel: '',
  threshold: 0
})
const emptyConceptReport = () => ({
  concepto: null,
  conceptos: [],
  rows: [],
  resumen: {
    total: 0,
    totalRegistrado: 0,
    totalNoAplicado: 0,
    transacciones: 0,
    alumnos: 0,
    cancelados: 0,
    depuraciones: 0,
    formasPago: [],
    planteles: [],
    conceptos: [],
    estatus: [],
    inscritos: 0,
    completos: 0,
    sinNinguno: 0,
    conceptosEsperados: 0,
    conceptosPresentes: 0,
    conceptosFaltantes: 0,
    asignacionesEsperadas: 0,
    asignacionesPresentes: 0,
    asignacionesFaltantes: 0,
    cobertura: 0,
    grados: [],
    saldoPendiente: 0,
    totalCargos: 0,
    totalPagado: 0,
    threshold: 0
  }
})
const conceptReport = ref(emptyConceptReport())

const defaultCortePlantel = canFilterPlantel.value
  ? (PLANTELES_LIST.includes(String(homePlantel.value || '').toUpperCase())
      ? String(homePlantel.value).toUpperCase()
      : (PLANTELES_LIST[0] || ''))
  : ''
const currentMexicoDateKey = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
const todayCorteKey = currentMexicoDateKey()
const filtrosCorte = ref({ inicio: todayCorteKey, fin: todayCorteKey, plantel: defaultCortePlantel })
const filtrosAlumnos = ref({ plantel: defaultCortePlantel })
const downloadingStudentsExcel = ref(false)
const datosCorte = ref([])
const loadingCorte = ref(false)
const downloadingCorteExcel = ref(false)
const corteUserSelectorOpen = ref(false)
const corteUserOptions = ref([])
const corteUserSelectionContext = ref({
  inicio: null,
  fin: null,
  plantel: ''
})

const conceptRows = computed(() => conceptReport.value.rows || [])
const conceptReportReady = computed(() => conceptReportMode.value === 'movements'
  ? conceptRows.value.length > 0
  : conceptReport.value?.modo === conceptReportMode.value)
const conceptSummary = computed(() => conceptReport.value.resumen || emptyConceptReport().resumen)
const conceptReportDescription = computed(() => {
  if (conceptReportMode.value === 'missing') return 'Muestra únicamente inscritos que no tienen ninguno de los conceptos seleccionados.'
  if (conceptReportMode.value === 'debtors') return 'Muestra únicamente alumnos con saldo exigible pendiente en los conceptos seleccionados.'
  return 'Consulta los movimientos registrados para los conceptos seleccionados.'
})
const selectedConcepts = computed(() => {
  const selectedKeys = new Set((filtrosConcepto.value.conceptoIds || []).map(id => String(id)))
  const localMatches = conceptos.value.filter(concepto => selectedKeys.has(String(concepto.id)))
  if (localMatches.length) return localMatches
  return Array.isArray(conceptReport.value.conceptos) ? conceptReport.value.conceptos : []
})
const selectedConceptName = computed(() => {
  const names = selectedConcepts.value.map(concepto => concepto?.concepto).filter(Boolean)
  if (!names.length) return 'Sin selección'
  if (names.length <= 2) return names.join(', ')
  return `${names[0]}, ${names[1]} +${names.length - 2}`
})
const conceptCycleLabel = computed(() => formatCicloLabel(state.value.ciclo))
const conceptUserPeriodLabel = computed(() => {
  const { inicio, fin } = conceptUserSelectionContext.value
  if (!inicio && !fin) return 'Todos los movimientos'
  if (inicio && fin && inicio === fin) return formatFilterDate(inicio)
  return `${inicio ? formatFilterDate(inicio) : 'Inicio'} al ${fin ? formatFilterDate(fin) : 'Fin'}`
})
const totalCorte = computed(() => datosCorte.value.reduce((sum, row) => sum + Number(row.total), 0))
const totalRegistradoCorte = computed(() => datosCorte.value.reduce((sum, row) => sum + Number(row.montoRegistrado || 0), 0))
const corteUserPeriodLabel = computed(() => {
  const { inicio, fin } = corteUserSelectionContext.value
  if (!inicio || !fin) return 'Hoy'
  if (inicio === fin) return formatFilterDate(inicio)
  return `${formatFilterDate(inicio)} al ${formatFilterDate(fin)}`
})
const receiptPeriodLabel = computed(() => {
  const { inicio, fin } = filtrosCorte.value
  if (!inicio || !fin) return 'Hoy'
  if (inicio === fin) return formatFilterDate(inicio)
  return `${formatFilterDate(inicio)} al ${formatFilterDate(fin)}`
})
const receiptPlantelLabel = computed(() => canFilterPlantel.value
  ? (filtrosCorte.value.plantel || '—')
  : (activePlantel.value || homePlantel.value || '—'))

const formatDate = (value) => {
  if (!value) return ''
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value)
}

const formatFilterDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '')
}

const corteStatusClass = (status) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('cancel')) return 'bg-red-50 text-red-700'
  if (normalized.includes('depur')) return 'bg-amber-50 text-amber-700'
  if (normalized.includes('vigent')) return 'bg-emerald-50 text-emerald-700'
  return 'bg-gray-100 text-gray-700'
}

const buildParams = (source) => {
  const params = {
    ciclo: normalizeCicloKey(state.value.ciclo)
  }

  Object.entries(source).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) params[key] = String(value)
  })

  if (!canFilterPlantel.value) delete params.plantel
  return params
}

const buildCorteParams = (source) => {
  const params = {}

  Object.entries(source).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) params[key] = String(value)
  })

  if (!canFilterPlantel.value) delete params.plantel
  return params
}

const safeFileName = (value) => String(value || 'concepto')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')

const loadConceptos = async () => {
  loadingConceptos.value = true
  try {
    const [catalogConcepts, historicalConcepts] = await Promise.all([
      $fetch('/api/conceptos', {
        params: {
          ciclo: normalizeCicloKey(state.value.ciclo),
          ...(canFilterPlantel.value && filtrosConcepto.value.plantel ? { plantel: filtrosConcepto.value.plantel } : {})
        }
      }),
      $fetch('/api/reports/concepto_options', {
        params: {
          ...(canFilterPlantel.value && filtrosConcepto.value.plantel ? { plantel: filtrosConcepto.value.plantel } : {}),
          ...(conceptReportMode.value !== 'movements' ? { ciclo: normalizeCicloKey(state.value.ciclo) } : {})
        }
      })
    ])

    const merged = new Map()
    ;(historicalConcepts || []).forEach((concept) => merged.set(String(concept.id), concept))
    ;(catalogConcepts || []).forEach((concept) => {
      const historical = merged.get(String(concept.id)) || {}
      merged.set(String(concept.id), {
        ...historical,
        ...concept,
        historico: false,
        tieneHistorial: Boolean(historical.id)
      })
    })
    conceptos.value = Array.from(merged.values())
      .map(({ ciclo: _ciclo, ciclos: _ciclos, ...concept }) => concept)
      .sort((a, b) => String(a.concepto || '').localeCompare(String(b.concepto || ''), 'es', { sensitivity: 'base' }))
    if (conceptReportMode.value !== 'movements' && filtrosConcepto.value.conceptoIds.length) {
      const validIds = new Set(conceptos.value.map(concept => String(concept.id)))
      filtrosConcepto.value.conceptoIds = filtrosConcepto.value.conceptoIds.filter(id => validIds.has(String(id)))
    }
  } catch (e) {
    show('No se pudieron cargar los conceptos', 'danger')
  } finally {
    loadingConceptos.value = false
  }
}

const setConceptReportMode = (mode) => {
  const normalized = mode === 'missing' ? 'missing' : (mode === 'debtors' ? 'debtors' : 'movements')
  if (conceptReportMode.value === normalized) return

  conceptReportMode.value = normalized
  conceptReport.value = emptyConceptReport()
  selectedConceptUserKeys.value = []
  conceptUserSelectorOpen.value = false
  conceptUserOptions.value = []

  let plantelChanged = false
  if (normalized !== 'movements' && canFilterPlantel.value && !filtrosConcepto.value.plantel) {
    const preferredPlantel = String(homePlantel.value || '').toUpperCase()
    filtrosConcepto.value.plantel = PLANTELES_LIST.includes(preferredPlantel)
      ? preferredPlantel
      : (PLANTELES_LIST[0] || '')
    plantelChanged = true
  }

  if (!plantelChanged) loadConceptos()
}

const buildConceptBaseParams = () => {
  const { conceptoIds, ...sourceFilters } = filtrosConcepto.value
  const filters = { ...sourceFilters }
  if (conceptReportMode.value !== 'movements') {
    delete filters.inicio
    delete filters.fin
  }
  if (conceptReportMode.value !== 'debtors') delete filters.threshold

  const params = buildParams(filters)
  params.modo = conceptReportMode.value
  if (conceptoIds?.length) params.conceptoIds = JSON.stringify(conceptoIds)
  return params
}

const buildConceptReportParams = (selectedUserKeys = selectedConceptUserKeys.value) => {
  const params = buildConceptBaseParams()
  if (conceptReportMode.value === 'movements' && selectedUserKeys?.length) {
    params.usuarios = JSON.stringify(selectedUserKeys)
  }
  return params
}

const loadConceptReport = async (selectedUserKeys = []) => {
  conceptReport.value = await $fetch('/api/reports/concepto', {
    params: buildConceptReportParams(selectedUserKeys)
  })
  selectedConceptUserKeys.value = conceptReportMode.value === 'movements' ? [...selectedUserKeys] : []
}

const prepareConceptReport = async () => {
  if (!filtrosConcepto.value.conceptoIds.length) return show('Seleccione al menos un concepto', 'danger')
  if (loadingConceptReport.value) return

  loadingConceptReport.value = true
  try {
    if (conceptReportMode.value !== 'movements') {
      if (canFilterPlantel.value && !filtrosConcepto.value.plantel) {
        return show(conceptReportMode.value === 'debtors'
          ? 'Seleccione un plantel para consultar deudores'
          : 'Seleccione un plantel para revisar alumnos inscritos', 'danger')
      }
      await loadConceptReport([])
      return
    }

    const response = await $fetch('/api/reports/concepto_users', {
      params: buildConceptBaseParams()
    })
    const users = Array.isArray(response?.usuarios) ? response.usuarios : []

    if (users.length <= 1) {
      await loadConceptReport(users.map(user => user.key))
      return
    }

    conceptUserOptions.value = users
    conceptUserSelectionContext.value = {
      inicio: response?.filtros?.inicio || '',
      fin: response?.filtros?.fin || '',
      plantel: response?.filtros?.plantel || ''
    }
    conceptUserSelectorOpen.value = true
  } catch (e) {
    show(e?.data?.message || e?.message || 'No se pudo generar el reporte por concepto', 'danger')
  } finally {
    loadingConceptReport.value = false
  }
}

const printConceptReport = () => {
  if (!filtrosConcepto.value.conceptoIds.length) return
  const q = new URLSearchParams(buildConceptReportParams()).toString()
  window.open(`/print/concepto?${q}`, '_blank', 'width=920,height=820')
}

const executeConceptExcelDownload = async (selectedUserKeys = []) => {
  const query = new URLSearchParams(buildConceptBaseParams())
  if (conceptReportMode.value === 'movements' && selectedUserKeys.length) {
    query.set('usuarios', JSON.stringify(selectedUserKeys))
  }

  const response = await fetch(`/api/reports/concepto_excel?${query.toString()}`, {
    credentials: 'same-origin'
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.message || payload?.statusMessage || 'No se pudo generar el Excel')
  }

  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plainName = disposition.match(/filename="([^"]+)"/i)?.[1]
  const filename = encodedName
    ? decodeURIComponent(encodedName)
    : (plainName || `${conceptReportMode.value === 'missing' ? 'Alumnos_sin_concepto' : (conceptReportMode.value === 'debtors' ? 'Deudores_por_concepto' : 'Reporte_conceptos')}_${safeFileName(selectedConceptName.value)}.xlsx`)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const exportConceptReport = async () => {
  if (!conceptReportReady.value || downloadingConceptExcel.value) return

  downloadingConceptExcel.value = true
  try {
    await executeConceptExcelDownload(selectedConceptUserKeys.value)
  } catch (error) {
    show(error?.data?.message || error?.message || 'No se pudo generar el Excel', 'danger')
  } finally {
    downloadingConceptExcel.value = false
  }
}

const closeConceptUserSelector = () => {
  if (loadingConceptReport.value) return
  conceptUserSelectorOpen.value = false
  conceptUserOptions.value = []
}

const confirmConceptReportUsers = async (selectedUserKeys) => {
  if (loadingConceptReport.value || !selectedUserKeys?.length) return

  loadingConceptReport.value = true
  try {
    await loadConceptReport(selectedUserKeys)
    conceptUserSelectorOpen.value = false
    conceptUserOptions.value = []
  } catch (error) {
    show(error?.data?.message || error?.message || 'No se pudo generar el reporte por concepto', 'danger')
  } finally {
    loadingConceptReport.value = false
  }
}


const downloadStudentsExcel = async () => {
  if (!hasFinancialAccess.value || downloadingStudentsExcel.value) return
  if (canFilterPlantel.value && !filtrosAlumnos.value.plantel) {
    return show('Seleccione un plantel', 'danger')
  }

  downloadingStudentsExcel.value = true
  try {
    const params = { ciclo: normalizeCicloKey(state.value.ciclo) }
    if (canFilterPlantel.value) params.plantel = filtrosAlumnos.value.plantel
    const query = new URLSearchParams(params)
    const response = await fetch(`/api/reports/alumnos_excel?${query.toString()}`, {
      credentials: 'same-origin'
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.message || payload?.statusMessage || 'No se pudo generar el Excel')
    }

    const blob = await response.blob()
    const disposition = response.headers.get('content-disposition') || ''
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
    const plainName = disposition.match(/filename="([^"]+)"/i)?.[1]
    const filename = encodedName
      ? decodeURIComponent(encodedName)
      : (plainName || `Alumnos_${normalizeCicloKey(state.value.ciclo)}.xlsx`)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (error) {
    show(error?.data?.message || error?.message || 'No se pudo generar el Excel', 'danger')
  } finally {
    downloadingStudentsExcel.value = false
  }
}

const openCorte = () => {
  activeReport.value = 'corte'
  if (!datosCorte.value.length) loadCorte()
}

const loadCorte = async () => {
  if (!hasFinancialAccess.value) return

  loadingCorte.value = true
  try {
    datosCorte.value = await $fetch('/api/reports/corte', {
      params: buildCorteParams(filtrosCorte.value)
    })
  } catch (e) {
    show(e?.data?.message || 'No se pudo cargar el corte de caja', 'danger')
  } finally {
    loadingCorte.value = false
  }
}

const printCorte = () => {
  const q = new URLSearchParams(buildCorteParams(filtrosCorte.value)).toString()
  window.open(`/print/corte?${q}`, '_blank', 'width=850,height=800')
}

const openReceiptStripsPdf = () => {
  if (!hasFinancialAccess.value) return
  const q = new URLSearchParams(buildCorteParams(filtrosCorte.value)).toString()
  window.open(`/print/recibos-corte?${q}`, '_blank', 'width=920,height=900')
}

const executeCorteExcelDownload = async (selectedUserKeys = []) => {
  const query = new URLSearchParams(buildCorteParams(filtrosCorte.value))
  if (selectedUserKeys.length) query.set('usuarios', JSON.stringify(selectedUserKeys))

  const response = await fetch(`/api/reports/corte_excel?${query.toString()}`, {
    credentials: 'same-origin'
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.message || payload?.statusMessage || 'No se pudo generar el Excel')
  }

  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plainName = disposition.match(/filename="([^"]+)"/i)?.[1]
  const filename = encodedName
    ? decodeURIComponent(encodedName)
    : (plainName || `Corte_de_Caja_${new Date().toISOString().slice(0, 10)}.xlsx`)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const prepareCorteExcel = async () => {
  if (!hasFinancialAccess.value || downloadingCorteExcel.value) return

  downloadingCorteExcel.value = true
  try {
    const response = await $fetch('/api/reports/corte_users', {
      params: buildCorteParams(filtrosCorte.value)
    })
    const users = Array.isArray(response?.usuarios) ? response.usuarios : []

    if (users.length <= 1) {
      await executeCorteExcelDownload(users.map(user => user.key))
      return
    }

    corteUserOptions.value = users
    corteUserSelectionContext.value = {
      inicio: response?.filtros?.inicio || null,
      fin: response?.filtros?.fin || null,
      plantel: response?.filtros?.plantel || ''
    }
    corteUserSelectorOpen.value = true
  } catch (e) {
    show(e?.data?.message || e?.message || 'No se pudo preparar el Excel', 'danger')
  } finally {
    downloadingCorteExcel.value = false
  }
}

const closeCorteUserSelector = () => {
  if (downloadingCorteExcel.value) return
  corteUserSelectorOpen.value = false
  corteUserOptions.value = []
}

const confirmCorteExcelUsers = async (selectedUserKeys) => {
  if (downloadingCorteExcel.value || !selectedUserKeys?.length) return

  downloadingCorteExcel.value = true
  try {
    await executeCorteExcelDownload(selectedUserKeys)
    corteUserSelectorOpen.value = false
    corteUserOptions.value = []
  } catch (e) {
    corteUserSelectorOpen.value = false
    corteUserOptions.value = []
    show(e?.data?.message || e?.message || 'No se pudo generar el Excel', 'danger')
  } finally {
    downloadingCorteExcel.value = false
  }
}

const showCorteContextMenu = (event, row) => {
  openMenu(event, [
    { label: `Fila: $${Number(row.total).toFixed(2)}`, disabled: true },
    { label: '-' },
    { label: 'Descargar Excel', icon: LucideDownload, action: prepareCorteExcel },
    { label: 'Imprimir corte', icon: LucidePrinter, action: printCorte }
  ])
}

onMounted(async () => {
  await loadConceptos()
  if (activeReport.value === 'corte') {
    loadCorte()
  } else if (activeReport.value === 'concepto' && filtrosConcepto.value.conceptoIds.length) {
    prepareConceptReport()
  }
})

watch(() => normalizeCicloKey(state.value.ciclo), async () => {
  conceptReport.value = emptyConceptReport()
  selectedConceptUserKeys.value = []
  await loadConceptos()
})

watch(
  () => [
    filtrosConcepto.value.conceptoIds.join(','),
    filtrosConcepto.value.inicio,
    filtrosConcepto.value.fin,
    filtrosConcepto.value.plantel,
    filtrosConcepto.value.threshold
  ],
  () => {
    conceptReport.value = emptyConceptReport()
    selectedConceptUserKeys.value = []
    conceptUserSelectorOpen.value = false
    conceptUserOptions.value = []
  }
)

watch(() => filtrosConcepto.value.plantel, async (plantel, previousPlantel) => {
  if (!canFilterPlantel.value || plantel === previousPlantel) return
  await loadConceptos()
})

watch(() => route.query.conceptoId, async (conceptoId) => {
  if (!conceptoId) return
  activeReport.value = 'concepto'
  filtrosConcepto.value.conceptoIds = [String(conceptoId)]
  if (!conceptos.value.length) await loadConceptos()
  prepareConceptReport()
})
</script>

<style scoped>
.reports-page {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
}

.reports-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 2px 4px;
}

.reports-heading h2,
.panel-header h3,
.corte-total h3 {
  margin: 0;
  color: #182235;
  font-weight: 780;
  letter-spacing: -0.015em;
}

.reports-heading h2 {
  font-size: 1.12rem;
}

.report-switcher {
  display: inline-flex;
  max-width: 100%;
  gap: 2px;
  overflow-x: auto;
  border-radius: 12px;
  background: #eef2f6;
  padding: 3px;
  scrollbar-width: none;
}

.report-switcher::-webkit-scrollbar {
  display: none;
}

.report-switcher button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #667085;
  padding: 0 12px;
  font-size: 0.75rem;
  font-weight: 720;
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}

.report-switcher button:hover {
  color: #344054;
}

.report-switcher button.active {
  background: #fff;
  color: #255f32;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
}

.report-panel {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e4e9ef;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}

.student-report-panel {
  flex: 0 0 auto;
}

.student-report-filters {
  grid-template-columns: minmax(220px, 320px);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 58px;
  border-bottom: 1px solid #edf0f4;
  padding: 12px 16px;
}

.panel-header h3,
.corte-total h3 {
  font-size: 0.95rem;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.concept-panel-header {
  align-items: center;
}

.concept-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 16px;
}

.concept-heading > div:first-child {
  min-width: 0;
}

.concept-heading p {
  margin: 3px 0 0;
  color: #7a8497;
  font-size: 0.72rem;
  line-height: 1.35;
}

.concept-mode-switch {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 2px;
  border-radius: 10px;
  background: #eef2f6;
  padding: 3px;
}

.concept-mode-switch button {
  min-height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #667085;
  padding: 0 10px;
  font: inherit;
  font-size: 0.7rem;
  font-weight: 760;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}

.concept-mode-switch button:hover {
  color: #344054;
}

.concept-mode-switch button.active {
  background: #fff;
  color: #255f32;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  align-items: end;
  border-bottom: 1px solid #edf0f4;
  background: #fbfcfd;
  padding: 12px 16px;
}

.concept-select-field {
  min-width: 0;
  grid-column: span 2;
}

.filter-button {
  width: max-content;
  min-width: 116px;
  justify-self: start;
}

.concept-cycle-context {
  display: grid;
  min-height: 58px;
  align-content: center;
  border: 1px solid #e4e9ef;
  border-radius: 10px;
  background: #fff;
  padding: 7px 11px;
}

.concept-cycle-context span,
.concept-cycle-context small {
  color: #7a8497;
  font-size: 0.62rem;
  font-weight: 700;
}

.concept-cycle-context span {
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.concept-cycle-context strong {
  color: #182235;
  font-size: 0.84rem;
  line-height: 1.25;
}

.threshold-field {
  min-width: 150px;
}

.field-help {
  display: block;
  margin-top: 4px;
  color: #8a94a6;
  font-size: 0.62rem;
  line-height: 1.25;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
  gap: 8px;
  padding: 12px 16px;
}

.metric-card {
  min-width: 0;
  border: 1px solid #e7ebf0;
  border-radius: 11px;
  background: #f8fafb;
  padding: 11px 12px;
}

.metric-card.muted {
  background: #fbfcfd;
}

.metric-card.attention {
  border-color: #eadfc7;
  background: #fffaf0;
}

.metric-card.attention strong {
  color: #8a5a17;
}

.metric-card span {
  display: block;
  color: #7a8497;
  font-size: 0.64rem;
  font-weight: 720;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.metric-card strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #182235;
  font-size: 1rem;
  font-weight: 780;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.missing-summary-grid {
  grid-template-columns: repeat(5, minmax(120px, 1fr));
}

.debtor-summary-grid {
  grid-template-columns: repeat(5, minmax(120px, 1fr));
}

.report-split {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 250px;
  gap: 12px;
  overflow: hidden;
  padding: 0 16px 16px;
}

.report-table {
  overflow: auto;
  border-color: #e7ebf0;
  box-shadow: none;
}

.missing-concept-table table {
  min-width: 980px;
}

.debtor-concept-table table {
  min-width: 1120px;
}

.student-name-cell {
  display: block;
  min-width: 190px;
}

.missing-concept-chips {
  display: flex;
  min-width: 210px;
  flex-wrap: wrap;
  gap: 5px;
}

.missing-concept-chips span {
  display: inline-flex;
  max-width: 260px;
  align-items: center;
  border: 1px solid #eadfc7;
  border-radius: 999px;
  background: #fffaf0;
  color: #7a5118;
  padding: 3px 7px;
  font-size: 0.68rem;
  font-weight: 720;
  line-height: 1.25;
}

.debtor-concept-chips span {
  border-color: #e7dbc5;
  background: #fff9ef;
  color: #7a5118;
}

.debtor-breakdown-list div {
  align-items: flex-start;
}

.debtor-breakdown-list span {
  line-height: 1.3;
}

.missing-empty-state {
  padding: 40px 16px;
  text-align: center;
}

.missing-empty-state strong,
.missing-empty-state span {
  display: block;
}

.missing-empty-state strong {
  color: #255f32;
  font-size: 0.86rem;
}

.missing-empty-state span {
  margin-top: 4px;
  color: #7a8497;
  font-size: 0.75rem;
}

.breakdown-panel {
  align-self: start;
  border: 1px solid #e7ebf0;
  border-radius: 12px;
  background: #fff;
  padding: 13px;
}

.breakdown-panel h4 {
  margin: 0 0 9px;
  color: #344054;
  font-size: 0.72rem;
  font-weight: 760;
  text-transform: uppercase;
}

.breakdown-panel p {
  margin: 0;
  color: #7a8497;
  font-size: 0.76rem;
}

.breakdown-list {
  display: grid;
  gap: 7px;
}

.breakdown-list div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #edf0f4;
  padding-bottom: 7px;
}

.breakdown-list div:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.breakdown-list span {
  color: #667085;
  font-size: 0.76rem;
  font-weight: 650;
}

.breakdown-list strong {
  color: #182235;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
}

.missing-breakdown-list div {
  align-items: flex-start;
}

.missing-breakdown-list span {
  line-height: 1.3;
}

.missing-report-note {
  margin-top: 14px;
  border-top: 1px solid #edf0f4;
  padding-top: 11px;
  color: #7a8497;
  font-size: 0.68rem;
  line-height: 1.45;
}

.report-panel > .card {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.corte-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #edf0f4;
  padding: 12px 16px;
}

.corte-total-values {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 10px;
  background: #f1f7f1;
  color: #4d7350;
  padding: 6px 10px;
  font-size: 0.78rem;
  font-weight: 680;
}

.corte-total-values strong {
  color: #255f32;
  font-size: 0.88rem;
  font-weight: 800;
}

.receipts-report-panel {
  min-height: 360px;
}

.receipt-export-stage {
  display: flex;
  align-items: center;
  gap: 14px;
  width: min(540px, calc(100% - 32px));
  margin: auto;
  border: 1px solid #e7ebf0;
  border-radius: 14px;
  background: #fbfcfd;
  padding: 18px;
}

.receipt-export-icon {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border-radius: 12px;
  background: #eaf4ec;
  color: #2f6a39;
}

.receipt-export-stage > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}

.receipt-export-stage span,
.receipt-export-stage strong {
  display: block;
}

.receipt-export-stage > div:nth-child(2) span {
  color: #7a8497;
  font-size: 0.74rem;
}

.receipt-export-stage > div:nth-child(2) strong {
  color: #182235;
  font-size: 0.9rem;
  font-weight: 760;
}

.receipt-format-chip {
  border-radius: 999px;
  background: #eef2f6;
  color: #667085;
  padding: 5px 9px;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
}

@media (max-width: 920px) {
  .summary-grid,
  .report-split {
    grid-template-columns: 1fr;
  }

  .reports-heading,
  .panel-header,
  .corte-total {
    align-items: flex-start;
    flex-direction: column;
  }

  .concept-heading {
    width: 100%;
    align-items: flex-start;
    flex-direction: column;
    gap: 9px;
  }

  .concept-mode-switch {
    width: 100%;
  }

  .concept-mode-switch button {
    flex: 1;
  }

  .report-switcher {
    max-width: 100%;
    overflow-x: auto;
  }

  .breakdown-panel {
    width: 100%;
  }
}

@media (max-width: 620px) {
  .report-switcher button {
    padding: 0 9px;
  }

  .concept-select {
    grid-column: auto;
  }

  .receipt-export-stage {
    align-items: flex-start;
  }

  .receipt-format-chip {
    display: none;
  }
}
</style>
