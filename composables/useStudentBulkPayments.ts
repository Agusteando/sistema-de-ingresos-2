import { computed, ref, type Ref } from 'vue'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import { normalizeStudentMatricula } from '~/shared/utils/studentPresentation'

type NotifyFn = (message: string, variant?: string) => void

type UseStudentBulkPaymentsOptions = {
  selectedStudents: Ref<any[]>
  state: Ref<any>
  notify: NotifyFn
  refreshStudents: () => Promise<void> | void
  clearSelection: () => void
}

export const useStudentBulkPayments = ({
  selectedStudents,
  state,
  notify,
  refreshStudents,
  clearSelection
}: UseStudentBulkPaymentsOptions) => {
  const bulkPaymentMethod = ref('Efectivo')
  const bulkPaymentLoading = ref(false)
  const bulkPaymentProcessing = ref(false)
  const bulkPaymentDebts = ref<Record<string, any[]>>({})
  const bulkPaymentSelections = ref<Record<string, any>>({})

  const bulkDebtKey = (student: any, debt: any) => `${normalizeStudentMatricula(student?.matricula)}|${debt?.documento}|${debt?.mes}`
  const defaultFinalAmountForDebt = (debt: any) => Math.round(Number(debt?.subtotal || debt?.costoOriginal || debt?.saldo || 0))

  const resetBulkPayments = () => {
    bulkPaymentSelections.value = {}
  }

  const resetBulkPaymentCache = () => {
    bulkPaymentDebts.value = {}
    resetBulkPayments()
  }

  const getBulkSelection = (student: any, debt: any) => {
    const key = bulkDebtKey(student, debt)
    if (!bulkPaymentSelections.value[key]) {
      bulkPaymentSelections.value[key] = {
        selected: false,
        montoPagado: Number(debt?.saldo || 0),
        montoFinal: defaultFinalAmountForDebt(debt)
      }
    }
    return bulkPaymentSelections.value[key]
  }

  const bulkPaymentRows = computed(() => selectedStudents.value.flatMap((student) => {
    const debts = bulkPaymentDebts.value[normalizeStudentMatricula(student.matricula)] || []
    return debts
      .filter(debt => Number(debt?.saldo || 0) > 0)
      .map(debt => ({
        student,
        debt,
        key: bulkDebtKey(student, debt),
        selection: getBulkSelection(student, debt)
      }))
  }))

  const selectedBulkPaymentRows = computed(() => bulkPaymentRows.value.filter(row => row.selection.selected && Number(row.selection.montoPagado || 0) > 0))
  const bulkPaymentDebtCount = computed(() => selectedBulkPaymentRows.value.length)
  const bulkPaymentTotal = computed(() => selectedBulkPaymentRows.value.reduce((sum, row) => sum + Number(row.selection.montoPagado || 0), 0))
  const bulkPaymentStudentCount = computed(() => new Set(selectedBulkPaymentRows.value.map(row => normalizeStudentMatricula(row.student.matricula))).size)

  const buildBulkPaymentRow = (row: any) => {
    const debt = row.debt
    const resuelto = Number(debt.resuelto ?? debt.pagos ?? 0)
    const subtotal = debt.montoFinalPendiente ? Number(row.selection.montoFinal || 0) : Number(debt.subtotal || 0)
    const saldoAntes = debt.montoFinalPendiente ? Math.max(0, subtotal - resuelto) : Number(debt.saldo || 0)
    return {
      ...debt,
      subtotal,
      saldoFinal: saldoAntes,
      montoPagado: Number(row.selection.montoPagado || 0),
      montoFinal: debt.montoFinalPendiente ? subtotal : debt.montoFinal,
      pagosPrevios: resuelto,
      saldoAntes
    }
  }

  const validateBulkPaymentRows = () => {
    let requiresFinalConfirmation = false
    if (!selectedBulkPaymentRows.value.length) {
      notify('Selecciona al menos un concepto', 'danger')
      return false
    }
    for (const row of selectedBulkPaymentRows.value) {
      const pago = Number(row.selection.montoPagado || 0)
      if (pago <= 0 || pago > Number(row.debt.saldo || 0) + 0.009) {
        notify('Revisa los montos seleccionados', 'danger')
        return false
      }
      if (row.debt.montoFinalPendiente) {
        requiresFinalConfirmation = true
        const montoFinal = Number(row.selection.montoFinal)
        if (!Number.isFinite(montoFinal) || montoFinal < 0 || Math.floor(montoFinal) !== montoFinal) {
          notify('Este debe ser el monto final de tu proyección, sin decimales.', 'danger')
          return false
        }
      }
    }
    if (requiresFinalConfirmation && !confirm('Confirmar montos finales sin decimales antes de registrar.')) return false
    return true
  }

  const loadBulkPaymentDebts = async () => {
    if (!selectedStudents.value.length) return
    bulkPaymentLoading.value = true
    const next = { ...bulkPaymentDebts.value }
    try {
      await Promise.all(selectedStudents.value.map(async (student) => {
        const key = normalizeStudentMatricula(student.matricula)
        if (next[key]) return
        const res: any = await $fetch(`/api/students/${student.matricula}/debts`, {
          params: { ciclo: normalizeCicloKey(state.value.ciclo), lateFeeActive: state.value.lateFeeActive }
        })
        next[key] = Array.isArray(res) ? res : []
        next[key].filter(debt => Number(debt?.saldo || 0) > 0).forEach((debt) => {
          const debtKey = bulkDebtKey(student, debt)
          if (!bulkPaymentSelections.value[debtKey]) {
            bulkPaymentSelections.value[debtKey] = {
              selected: false,
              montoPagado: Number(debt.saldo || 0),
              montoFinal: defaultFinalAmountForDebt(debt)
            }
          }
        })
      }))
      bulkPaymentDebts.value = next
    } catch (e: any) {
      notify(e?.data?.message || 'No se pudieron cargar los adeudos seleccionados', 'danger')
    } finally {
      bulkPaymentLoading.value = false
    }
  }

  const submitBulkPayments = async () => {
    if (bulkPaymentProcessing.value || !validateBulkPaymentRows()) return
    bulkPaymentProcessing.value = true
    const folios: any[] = []
    const failures: string[] = []
    const rowsByStudent = new Map<string, any[]>()
    selectedBulkPaymentRows.value.forEach((row) => {
      const key = normalizeStudentMatricula(row.student.matricula)
      const list = rowsByStudent.get(key) || []
      list.push(row)
      rowsByStudent.set(key, list)
    })

    try {
      for (const rows of rowsByStudent.values()) {
        const student = rows[0].student
        try {
          const res: any = await $fetch('/api/payments/pay', {
            method: 'POST',
            body: {
              matricula: student.matricula,
              formaDePago: bulkPaymentMethod.value,
              ciclo: normalizeCicloKey(state.value.ciclo),
              lateFeeActive: state.value.lateFeeActive,
              pagos: rows.map(buildBulkPaymentRow)
            }
          })
          if (Array.isArray(res?.folios)) folios.push(...res.folios)
        } catch (e) {
          failures.push(student.matricula)
        }
      }
      if (folios.length) window.open(`/print/recibo?folios=${folios.join(',')}`, '_blank', 'width=850,height=800')
      if (failures.length) notify(`Pagos registrados parcialmente. Fallaron: ${failures.join(', ')}`, 'danger')
      else notify('Pagos de la selección registrados', 'success')
      resetBulkPaymentCache()
      await refreshStudents()
      if (!failures.length) clearSelection()
    } finally {
      bulkPaymentProcessing.value = false
    }
  }

  return {
    bulkPaymentMethod,
    bulkPaymentLoading,
    bulkPaymentProcessing,
    bulkPaymentRows,
    bulkPaymentDebtCount,
    bulkPaymentTotal,
    bulkPaymentStudentCount,
    resetBulkPayments,
    resetBulkPaymentCache,
    loadBulkPaymentDebts,
    submitBulkPayments
  }
}
