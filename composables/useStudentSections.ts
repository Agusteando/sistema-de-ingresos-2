import { computed, ref, type Ref } from 'vue'
import { useToast } from '~/composables/useToast'
import {
  normalizeSectionIds,
  normalizeStudentMatricula,
  sectionFilterKey,
  studentHasSection
} from '~/shared/utils/studentPresentation'

export const useStudentSections = ({
  students,
  selectedStudent,
  selectedMatriculas,
  selectedCount,
  activeFilter
}: {
  students: Ref<any[]>
  selectedStudent: Ref<any | null>
  selectedMatriculas: Ref<Set<string>>
  selectedCount: Ref<number>
  activeFilter: Ref<string>
}) => {
  const { show } = useToast()
  const customSections = ref<any[]>([])
  const showSectionModal = ref(false)
  const sectionModalStudent = ref<any | null>(null)
  const sectionModalMatriculas = ref<string[]>([])
  const newSectionName = ref('')
  const creatingSection = ref(false)
  const assigningSections = ref(false)

  const sectionModalStudents = computed(() => {
    const selected = new Set(sectionModalMatriculas.value.map(normalizeStudentMatricula))
    return students.value.filter(student => selected.has(normalizeStudentMatricula(student.matricula)))
  })

  const customSectionCounts = computed(() => {
    const counts: Record<number, number> = {}
    students.value.forEach((student) => {
      ;(student.customSections || []).forEach((section: any) => {
        const id = Number(section.id)
        if (!id) return
        counts[id] = (counts[id] || 0) + 1
      })
    })
    return counts
  })

  const loadCustomSections = async () => {
    try {
      const res = await $fetch('/api/student-sections')
      customSections.value = Array.isArray(res) ? res : []
    } catch (e) {
      customSections.value = []
    }
  }

  const updateStudentSections = (matricula: unknown, sections: any[] = []) => {
    const normalized = normalizeStudentMatricula(matricula)
    const patch = (student: any) => normalizeStudentMatricula(student?.matricula) === normalized
      ? { ...student, customSections: sections || [] }
      : student

    students.value = students.value.map(patch)
    if (selectedStudent.value) selectedStudent.value = patch(selectedStudent.value)
    if (sectionModalStudent.value) sectionModalStudent.value = patch(sectionModalStudent.value)
  }

  const applySectionChangeToStudents = (matriculas: unknown[] = [], section: any, shouldAdd: boolean) => {
    const targets = new Set(matriculas.map(normalizeStudentMatricula).filter(Boolean))
    const sectionId = Number(section?.id)
    if (!targets.size || !sectionId) return

    const patch = (student: any) => {
      if (!targets.has(normalizeStudentMatricula(student?.matricula))) return student
      const current = student.customSections || []
      const withoutSection = current.filter((existing: any) => Number(existing.id) !== sectionId)
      return {
        ...student,
        customSections: shouldAdd ? [...withoutSection, section] : withoutSection
      }
    }

    students.value = students.value.map(patch)
    if (selectedStudent.value) selectedStudent.value = patch(selectedStudent.value)
    if (sectionModalStudent.value) sectionModalStudent.value = patch(sectionModalStudent.value)
  }

  const openSectionModal = (student: any = null) => {
    sectionModalStudent.value = student
    sectionModalMatriculas.value = []
    newSectionName.value = ''
    showSectionModal.value = true
  }

  const openSectionModalForSelection = () => {
    if (!selectedCount.value) return
    sectionModalStudent.value = null
    sectionModalMatriculas.value = Array.from(selectedMatriculas.value)
    newSectionName.value = ''
    showSectionModal.value = true
  }

  const closeSectionModal = () => {
    showSectionModal.value = false
    sectionModalStudent.value = null
    sectionModalMatriculas.value = []
    newSectionName.value = ''
  }

  const createCustomSection = async () => {
    const name = newSectionName.value.trim()
    if (!name || creatingSection.value) return
    creatingSection.value = true
    try {
      const section: any = await $fetch('/api/student-sections', { method: 'POST', body: { name } })
      if (section?.id && !customSections.value.some(existing => Number(existing.id) === Number(section.id))) {
        customSections.value = [...customSections.value, section]
      }
      newSectionName.value = ''
      show('Seccion creada', 'success')
    } catch (e: any) {
      show(e?.data?.message || 'No se pudo crear la seccion', 'danger')
    } finally {
      creatingSection.value = false
    }
  }

  const toggleStudentSection = async (student: any, sectionId: unknown, checked: boolean) => {
    if (!student || assigningSections.value) return
    assigningSections.value = true
    const currentIds = new Set(normalizeSectionIds(student.customSections || []))
    if (checked) currentIds.add(Number(sectionId))
    else currentIds.delete(Number(sectionId))

    try {
      const res: any = await $fetch(`/api/students/${student.matricula}/sections`, {
        method: 'PUT',
        body: { sectionIds: Array.from(currentIds) }
      })
      updateStudentSections(student.matricula, res?.sections || [])
      show('Secciones actualizadas', 'success')
    } catch (e: any) {
      show(e?.data?.message || 'No se pudo actualizar la seccion del alumno', 'danger')
    } finally {
      assigningSections.value = false
    }
  }

  const bulkSectionState = (sectionId: unknown) => {
    const sectionStudents = sectionModalStudents.value
    if (!sectionStudents.length) return 'none'
    const assignedCount = sectionStudents.filter(student => studentHasSection(student, sectionId)).length
    if (assignedCount === 0) return 'none'
    if (assignedCount === sectionStudents.length) return 'all'
    return 'some'
  }

  const toggleBulkSection = async (section: any) => {
    if (!section?.id || assigningSections.value || !sectionModalStudents.value.length) return
    const shouldAdd = bulkSectionState(section.id) !== 'all'
    const matriculas = sectionModalStudents.value.map(student => student.matricula)
    assigningSections.value = true

    try {
      const res: any = await $fetch('/api/students/sections/bulk', {
        method: 'PUT',
        body: {
          matriculas,
          sectionId: section.id,
          action: shouldAdd ? 'add' : 'remove'
        }
      })
      const appliedSection = res?.section || section
      applySectionChangeToStudents(res?.matriculas || matriculas, appliedSection, shouldAdd)
      show('Secciones actualizadas', 'success')
    } catch (e: any) {
      show(e?.data?.message || 'No se pudo actualizar la selección', 'danger')
    } finally {
      assigningSections.value = false
    }
  }

  const deleteCustomSection = async (section: any) => {
    if (!section?.id) return
    if (!confirm(`Eliminar la seccion "${section.name}"?`)) return

    try {
      await $fetch(`/api/student-sections/${section.id}`, { method: 'DELETE' })
      customSections.value = customSections.value.filter(existing => Number(existing.id) !== Number(section.id))
      students.value = students.value.map(student => ({
        ...student,
        customSections: (student.customSections || []).filter((current: any) => Number(current.id) !== Number(section.id))
      }))
      if (selectedStudent.value) {
        selectedStudent.value = {
          ...selectedStudent.value,
          customSections: (selectedStudent.value.customSections || []).filter((current: any) => Number(current.id) !== Number(section.id))
        }
      }
      if (activeFilter.value === sectionFilterKey(section.id)) activeFilter.value = ''
      show('Seccion eliminada', 'success')
    } catch (e: any) {
      show(e?.data?.message || 'No se pudo eliminar la seccion', 'danger')
    }
  }

  return {
    customSections,
    customSectionCounts,
    showSectionModal,
    sectionModalStudent,
    sectionModalStudents,
    newSectionName,
    creatingSection,
    assigningSections,
    loadCustomSections,
    openSectionModal,
    openSectionModalForSelection,
    closeSectionModal,
    createCustomSection,
    toggleStudentSection,
    bulkSectionState,
    toggleBulkSection,
    deleteCustomSection
  }
}
