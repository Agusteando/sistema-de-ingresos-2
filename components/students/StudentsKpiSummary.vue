<template>
  <section :class="['kpi-summary-system', { 'without-income': !isSuperAdmin, 'is-refreshing': isRefreshing }]" aria-label="Resumen de matrícula y finanzas">
    <div class="kpi-strip" aria-label="Matrícula y finanzas">
      <button
        v-for="item in enrollmentKpis"
        :key="item.key"
        type="button"
        @click="$emit('set-filter', item.filter)"
        :class="['kpi-card', item.toneClass, { active: activeFilter === item.filter }]"
      >
        <span class="kpi-icon"><component :is="item.icon" :size="24" /></span>
        <span class="kpi-text">
          <span>{{ item.label }}</span>
          <StudentsKpiValue :value="item.value" />
        </span>
        <UiKpiSparkline :values="item.sparkline" />
      </button>

      <div v-if="isSuperAdmin" class="kpi-card kpi-income-card" aria-label="Ingresos del mes">
        <span class="kpi-icon"><LucideCircleDollarSign :size="24" /></span>
        <span class="kpi-text">
          <span>Ingresos del mes</span>
          <StudentsKpiValue :value="formattedIncome" />
        </span>
        <UiKpiSparkline :values="kpiSparklines.ingresos" />
      </div>
    </div>

    <div v-if="customSections.length" class="section-kpi-rail" aria-label="Secciones personalizadas">
      <button
        v-for="section in customSections"
        :key="`section-kpi-${section.id}`"
        @click="$emit('set-filter', sectionFilterKey(section.id))"
        :class="['section-kpi-card', { active: activeFilter === sectionFilterKey(section.id) }]"
      >
        <span class="section-kpi-icon"><LucideTag :size="14" /></span>
        <span class="section-kpi-name">{{ section.name }}</span>
        <StudentsKpiValue as="strong" :value="dataAvailable ? (customSectionCounts[section.id] ?? 0) : null" />
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import StudentsKpiValue from '~/components/students/StudentsKpiValue.vue'
import { LucideCircleDollarSign, LucideGlobe2, LucideTag, LucideUserCheck, LucideUsers, LucideUserX } from 'lucide-vue-next'
import UiKpiSparkline from '~/components/ui/UiKpiSparkline.vue'

const props = defineProps({
  userRole: { type: String, default: 'plantel' },
  kpiCounts: { type: Object, required: true },
  dataAvailable: { type: Boolean, default: true },
  activeFilter: { type: String, default: '' },
  customSections: { type: Array, default: () => [] },
  customSectionCounts: { type: Object, default: () => ({}) },
  globalKpis: { type: Object, default: () => ({ ingresosMes: 0 }) },
  kpiSparklines: { type: Object, default: () => ({}) },
  isRefreshing: { type: Boolean, default: false }
})

defineEmits(['set-filter'])

const roleTokens = computed(() => String(props.userRole || '').split(',').map(role => role.trim().toLowerCase()).filter(Boolean))
const isSuperAdmin = computed(() => roleTokens.value.some(role => ['superadmin'].includes(role)))
const formattedIncome = computed(() => {
  if (!props.dataAvailable || props.globalKpis?.ingresosMes === null || props.globalKpis?.ingresosMes === undefined) return null
  return `$${Number(props.globalKpis.ingresosMes).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
})

const kpiValue = (key) => props.dataAvailable ? (props.kpiCounts?.[key] ?? 0) : null

const enrollmentKpis = computed(() => [
  {
    key: 'inscritos',
    filter: 'inscritos',
    label: 'Inscritos',
    value: kpiValue('inscritos'),
    icon: LucideUsers,
    toneClass: 'kpi-green',
    sparkline: props.kpiSparklines.inscritos
  },
  {
    key: 'internos',
    filter: 'internos',
    label: 'Internos',
    value: kpiValue('internos'),
    icon: LucideUserCheck,
    toneClass: 'kpi-teal',
    sparkline: props.kpiSparklines.internos
  },
  {
    key: 'externos',
    filter: 'externos',
    label: 'Externos',
    value: kpiValue('externos'),
    icon: LucideGlobe2,
    toneClass: 'kpi-blue',
    sparkline: props.kpiSparklines.externos
  },
  {
    key: 'no_inscritos',
    filter: 'no_inscritos',
    label: 'No inscritos',
    value: kpiValue('no_inscritos'),
    icon: LucideUserX,
    toneClass: 'kpi-red',
    sparkline: props.kpiSparklines.no_inscritos
  },
  {
    key: 'bajas',
    filter: 'bajas',
    label: 'Bajas',
    value: kpiValue('bajas'),
    icon: LucideUserX,
    toneClass: 'kpi-gray',
    sparkline: props.kpiSparklines.bajas
  }
])

const sectionFilterKey = (id) => `section:${Number(id)}`
</script>
