import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { normalizeStudentMatricula } from '~/shared/utils/studentPresentation'

export const useStudentSelection = (students: Ref<any[]>, displayedStudents: ComputedRef<any[]>) => {
  const selectedMatriculas = ref(new Set<string>())
  const selectedStudentSnapshots = ref(new Map<string, any>())
  const lastSelectedMatricula = ref<string | null>(null)

  const studentByMatricula = computed(() => {
    const map = new Map<string, any>()
    students.value.forEach((student) => {
      const matricula = normalizeStudentMatricula(student?.matricula)
      if (matricula) map.set(matricula, student)
    })
    return map
  })

  const rememberStudent = (student: any) => {
    const matricula = normalizeStudentMatricula(student?.matricula)
    if (!matricula) return
    const next = new Map(selectedStudentSnapshots.value)
    next.set(matricula, { ...(next.get(matricula) || {}), ...(student || {}) })
    selectedStudentSnapshots.value = next
  }

  watch(students, (list) => {
    if (!Array.isArray(list) || !list.length) return
    const next = new Map(selectedStudentSnapshots.value)
    let changed = false
    list.forEach((student) => {
      const matricula = normalizeStudentMatricula(student?.matricula)
      if (!matricula || !selectedMatriculas.value.has(matricula)) return
      next.set(matricula, { ...(next.get(matricula) || {}), ...(student || {}) })
      changed = true
    })
    if (changed) selectedStudentSnapshots.value = next
  }, { deep: false })

  const selectedStudentKeys = computed(() => selectedMatriculas.value)
  const selectedCount = computed(() => selectedStudentKeys.value.size)
  const selectedStudents = computed(() => Array.from(selectedStudentKeys.value)
    .map((matricula) => studentByMatricula.value.get(matricula) || selectedStudentSnapshots.value.get(matricula))
    .filter(Boolean))
  const selectedBalanceTotal = computed(() => selectedStudents.value.reduce((sum, student) => sum + Number(student?.saldoNeto || 0), 0))
  const selectionPrimaryStudent = computed(() => selectedStudents.value[0] || null)
  const displayedMatriculas = computed(() => displayedStudents.value.map(student => normalizeStudentMatricula(student.matricula)).filter(Boolean))
  const allDisplayedSelected = computed(() => displayedMatriculas.value.length > 0 && displayedMatriculas.value.every(matricula => selectedStudentKeys.value.has(matricula)))
  const someDisplayedSelected = computed(() => displayedMatriculas.value.some(matricula => selectedStudentKeys.value.has(matricula)))

  const setSelectedMatriculas = (values: unknown[] = []) => {
    const normalizedValues = values.map(normalizeStudentMatricula).filter(Boolean)
    selectedMatriculas.value = new Set(normalizedValues)

    const nextSnapshots = new Map(selectedStudentSnapshots.value)
    Array.from(nextSnapshots.keys()).forEach((matricula) => {
      if (!selectedMatriculas.value.has(matricula)) nextSnapshots.delete(matricula)
    })
    selectedStudentSnapshots.value = nextSnapshots
  }

  const clearSelectedStudents = () => {
    setSelectedMatriculas([])
    selectedStudentSnapshots.value = new Map()
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
        visible.slice(Math.min(start, end), Math.max(start, end) + 1).forEach((value) => {
          next.add(value)
          const visibleStudent = displayedStudents.value.find(item => normalizeStudentMatricula(item?.matricula) === value)
          if (visibleStudent) rememberStudent(visibleStudent)
        })
      } else {
        next.add(matricula)
        rememberStudent(student)
      }
    } else if (force === true) {
      next.add(matricula)
      rememberStudent(student)
    } else if (force === false) {
      next.delete(matricula)
    } else if (next.has(matricula)) {
      next.delete(matricula)
    } else {
      next.add(matricula)
      rememberStudent(student)
    }

    const nextSnapshots = new Map(selectedStudentSnapshots.value)
    Array.from(nextSnapshots.keys()).forEach((value) => {
      if (!next.has(value)) nextSnapshots.delete(value)
    })

    selectedMatriculas.value = next
    selectedStudentSnapshots.value = nextSnapshots
    lastSelectedMatricula.value = matricula
  }

  const toggleDisplayedSelection = () => {
    const next = new Set(selectedMatriculas.value)
    if (allDisplayedSelected.value) {
      displayedMatriculas.value.forEach(matricula => next.delete(matricula))
    } else {
      displayedStudents.value.forEach((student) => {
        const matricula = normalizeStudentMatricula(student?.matricula)
        if (!matricula) return
        next.add(matricula)
        rememberStudent(student)
      })
    }

    const nextSnapshots = new Map(selectedStudentSnapshots.value)
    Array.from(nextSnapshots.keys()).forEach((matricula) => {
      if (!next.has(matricula)) nextSnapshots.delete(matricula)
    })

    selectedMatriculas.value = next
    selectedStudentSnapshots.value = nextSnapshots
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
