import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { normalizeStudentMatricula } from '~/shared/utils/studentPresentation'

export const useStudentSelection = (students: Ref<any[]>, displayedStudents: ComputedRef<any[]>) => {
  const selectedMatriculas = ref(new Set<string>())
  const lastSelectedMatricula = ref<string | null>(null)

  const selectedStudentKeys = computed(() => selectedMatriculas.value)
  const selectedCount = computed(() => selectedStudentKeys.value.size)
  const selectedStudents = computed(() => {
    const selected = selectedStudentKeys.value
    return students.value.filter(student => selected.has(normalizeStudentMatricula(student.matricula)))
  })
  const selectedBalanceTotal = computed(() => selectedStudents.value.reduce((sum, student) => sum + Number(student?.saldoNeto || 0), 0))
  const selectionPrimaryStudent = computed(() => selectedStudents.value[0] || null)
  const displayedMatriculas = computed(() => displayedStudents.value.map(student => normalizeStudentMatricula(student.matricula)).filter(Boolean))
  const allDisplayedSelected = computed(() => displayedMatriculas.value.length > 0 && displayedMatriculas.value.every(matricula => selectedStudentKeys.value.has(matricula)))
  const someDisplayedSelected = computed(() => displayedMatriculas.value.some(matricula => selectedStudentKeys.value.has(matricula)))

  const setSelectedMatriculas = (values: unknown[] = []) => {
    selectedMatriculas.value = new Set(values.map(normalizeStudentMatricula).filter(Boolean))
  }

  const clearSelectedStudents = () => {
    setSelectedMatriculas([])
    lastSelectedMatricula.value = null
  }

  const isStudentSelected = (student: any) => selectedStudentKeys.value.has(normalizeStudentMatricula(student?.matricula))

  const toggleStudentSelection = (student: any, event: MouseEvent | KeyboardEvent | null = null, force: boolean | null = null) => {
    const matricula = normalizeStudentMatricula(student?.matricula)
    if (!matricula) return

    const next = new Set(selectedMatriculas.value)
    const rangeAnchor = lastSelectedMatricula.value
    if (event?.shiftKey && rangeAnchor) {
      const visible = displayedMatriculas.value
      const start = visible.indexOf(rangeAnchor)
      const end = visible.indexOf(matricula)
      if (start >= 0 && end >= 0) {
        visible.slice(Math.min(start, end), Math.max(start, end) + 1).forEach(value => next.add(value))
      } else {
        next.add(matricula)
      }
    } else if (force === true) {
      next.add(matricula)
    } else if (force === false) {
      next.delete(matricula)
    } else if (next.has(matricula)) {
      next.delete(matricula)
    } else {
      next.add(matricula)
    }

    selectedMatriculas.value = next
    lastSelectedMatricula.value = matricula
  }

  const toggleDisplayedSelection = () => {
    const next = new Set(selectedMatriculas.value)
    if (allDisplayedSelected.value) displayedMatriculas.value.forEach(matricula => next.delete(matricula))
    else displayedMatriculas.value.forEach(matricula => next.add(matricula))
    selectedMatriculas.value = next
    lastSelectedMatricula.value = displayedMatriculas.value[displayedMatriculas.value.length - 1] || null
  }

  return {
    selectedMatriculas,
    selectedStudentKeys,
    selectedCount,
    selectedStudents,
    selectedBalanceTotal,
    selectionPrimaryStudent,
    displayedMatriculas,
    allDisplayedSelected,
    someDisplayedSelected,
    setSelectedMatriculas,
    clearSelectedStudents,
    isStudentSelected,
    toggleStudentSelection,
    toggleDisplayedSelection
  }
}
