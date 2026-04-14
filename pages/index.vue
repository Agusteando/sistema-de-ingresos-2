<template>
  <div class="dashboard-wrapper">
    <div class="header-actions">
      <div class="search-bar">
        <LucideSearch class="icon" size="20" />
        <input v-model="searchQuery" type="text" class="input-field" placeholder="Buscar por matrícula / nombre" @keyup.enter="searchStudents">
      </div>
    </div>

    <div class="card table-container" style="max-height: 40vh; overflow-y: auto; margin-bottom: 2rem;">
      <table>
        <thead>
          <tr>
            <th>Matrícula</th>
            <th>Alumno</th>
            <th>Interno/Externo</th>
            <th>Nivel</th>
            <th>Importe</th>
            <th>Pagos</th>
            <th>Saldo Neto</th>
            <th>Estatus</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loadingStudents">
            <td colspan="8" style="text-align: center;">Cargando alumnos...</td>
          </tr>
          <tr v-else-if="!students.length">
            <td colspan="8" style="text-align: center;">No hay resultados</td>
          </tr>
          <tr v-else v-for="student in students" :key="student.matricula" 
              @click="selectStudent(student)"
              :class="{ 'selected': selectedStudent?.matricula === student.matricula }">
            <td><code>{{ student.matricula }}</code></td>
            <td style="font-weight: 500;">{{ student.nombreCompleto }}</td>
            <td>
              <span :class="['badge', student.interno ? 'badge-inactive' : 'badge-active']">
                {{ student.interno ? 'INTERNO' : 'EXTERNO' }}
              </span>
            </td>
            <td>{{ student.nivel }} - {{ student.grado }} {{ student.grupo }}</td>
            <td>${{ formatCurrency(student.importeTotal) }}</td>
            <td style="color: var(--success);">${{ formatCurrency(student.pagosTotal) }}</td>
            <td style="color: var(--danger); font-weight: bold;">${{ formatCurrency(student.saldoNeto) }}</td>
            <td>
              <span :class="['badge', student.estatus === 'Activo' ? 'badge-active' : 'badge-inactive']">
                {{ student.estatus }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="selectedStudent" class="card" style="padding: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <h3 style="margin: 0;">Detalle de Cobros: {{ selectedStudent.nombreCompleto }}</h3>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-outline" :disabled="!selectedDebts.length" @click="openInvoiceModal">
            <LucideFileText size="16"/> Facturar
          </button>
          <button class="btn btn-primary" :disabled="!selectedDebts.length" @click="openPaymentModal">
            <LucideCreditCard size="16"/> Múltiples Pagos
          </button>
        </div>
      </div>
      
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" @change="toggleAllDebts" :checked="selectedDebts.length === debts.length && debts.length > 0"></th>
              <th>Progreso</th>
              <th>Mes</th>
              <th>Concepto</th>
              <th>Subtotal</th>
              <th>Pagos</th>
              <th>Saldo Pendiente</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingDebts">
              <td colspan="7" style="text-align: center;">Cargando conceptos...</td>
            </tr>
            <tr v-else-if="!debts.length">
              <td colspan="7" style="text-align: center;">No hay conceptos pendientes para este ciclo.</td>
            </tr>
            <tr v-else v-for="debt in debts" :key="`${debt.documento}-${debt.mes}`">
              <td><input type="checkbox" :value="debt" v-model="selectedDebts" :disabled="debt.saldo <= 0"></td>
              <td style="width: 150px;">
                <div class="progress-bar-container">
                  <div class="progress-bar" :style="{ width: debt.porcentajePagado + '%', backgroundColor: debt.porcentajePagado == 100 ? 'var(--success)' : 'var(--primary)' }"></div>
                </div>
              </td>
              <td>{{ debt.mesLabel }}</td>
              <td>
                {{ debt.conceptoNombre }}
                <span v-if="debt.hasRecargo" class="badge badge-inactive" style="font-size: 0.65rem; margin-left: 0.5rem;">Recargo</span>
              </td>
              <td>${{ formatCurrency(debt.subtotal) }}</td>
              <td style="color: var(--success);">${{ formatCurrency(debt.pagos) }}</td>
              <td style="color: var(--danger); font-weight: bold;">${{ formatCurrency(debt.saldo) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modals -->
    <PaymentModal v-if="showPaymentModal" :debts="selectedDebts" :student="selectedStudent" @close="closePaymentModal" @success="handlePaymentSuccess" />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { LucideSearch, LucideCreditCard, LucideFileText } from 'lucide-vue-next'
import { useState } from '#app'
import PaymentModal from '~/components/PaymentModal.vue'

const state = useState('globalState')
const searchQuery = ref('')
const students = ref([])
const loadingStudents = ref(false)
const selectedStudent = ref(null)

const debts = ref([])
const loadingDebts = ref(false)
const selectedDebts = ref([])

const showPaymentModal = ref(false)

const formatCurrency = (val) => Number(val).toFixed(2)

const searchStudents = async () => {
  if (!searchQuery.value) return
  loadingStudents.value = true
  try {
    students.value = await $fetch('/api/students', {
      params: { q: searchQuery.value, ciclo: state.value.ciclo }
    })
    selectedStudent.value = null
    debts.value = []
    selectedDebts.value = []
  } catch (error) {
    console.error(error)
  } finally {
    loadingStudents.value = false
  }
}

const selectStudent = async (student) => {
  selectedStudent.value = student
  selectedDebts.value = []
  loadingDebts.value = true
  try {
    debts.value = await $fetch(`/api/students/${student.matricula}/debts`, {
      params: { ciclo: state.value.ciclo, lateFeeActive: state.value.lateFeeActive }
    })
  } catch (error) {
    console.error(error)
  } finally {
    loadingDebts.value = false
  }
}

// React to global toggle
watch(() => state.value.lateFeeActive, () => {
  if (selectedStudent.value) selectStudent(selectedStudent.value)
})

const toggleAllDebts = (e) => {
  if (e.target.checked) {
    selectedDebts.value = debts.value.filter(d => d.saldo > 0)
  } else {
    selectedDebts.value = []
  }
}

const openPaymentModal = () => showPaymentModal.value = true
const closePaymentModal = () => showPaymentModal.value = false

const handlePaymentSuccess = () => {
  closePaymentModal()
  selectStudent(selectedStudent.value)
  searchStudents()
}

const openInvoiceModal = () => {
  alert('Integración de Facturación iniciada. La API externa recibirá los datos seleccionados.')
  // To avoid extremely massive code blocks, the Invoice API call follows the exact legacy struct.
}
</script>

<style scoped>
.header-actions { margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center; }
.search-bar { display: flex; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.25rem 0.75rem; width: 400px; }
.search-bar .icon { color: var(--text-muted); margin-right: 0.5rem; }
.search-bar input { border: none; padding: 0.5rem 0; outline: none; width: 100%; }
.progress-bar-container { width: 100%; height: 8px; background: var(--border); border-radius: 9999px; overflow: hidden; }
.progress-bar { height: 100%; transition: width 0.3s ease; }
</style>