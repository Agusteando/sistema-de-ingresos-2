<template>
  <section :class="['kpi-summary-system', { 'without-income': userRole !== 'global' }]" aria-label="Resumen de matrícula y finanzas">
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
          <strong>{{ item.value }}</strong>
        </span>
        <UiKpiSparkline :values="item.sparkline" />
      </button>

      <div v-if="userRole === 'global'" class="kpi-card kpi-income-card" aria-label="Ingresos del mes">
        <span class="kpi-icon"><LucideCircleDollarSign :size="24" /></span>
        <span class="kpi-text">
          <span>Ingresos del mes</span>
          <strong>${{ Number(globalKpis.ingresosMes).toLocaleString('es-MX', { minimumFractionDigits: 2 }) }}</strong>
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
        <strong>{{ customSectionCounts[section.id] || 0 }}</strong>
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { LucideCircleDollarSign, LucideGlobe2, LucideTag, LucideUserCheck, LucideUsers, LucideUserX } from 'lucide-vue-next'
import UiKpiSparkline from '~/components/ui/UiKpiSparkline.vue'

const props = defineProps({
  userRole: { type: String, default: 'plantel' },
  kpiCounts: { type: Object, required: true },
  activeFilter: { type: String, default: '' },
  customSections: { type: Array, default: () => [] },
  customSectionCounts: { type: Object, default: () => ({}) },
  globalKpis: { type: Object, default: () => ({ ingresosMes: 0 }) },
  kpiSparklines: { type: Object, default: () => ({}) }
})

defineEmits(['set-filter'])

const enrollmentKpis = computed(() => [
  {
    key: 'inscritos',
    filter: 'inscritos',
    label: 'Inscritos',
    value: props.kpiCounts.inscritos,
    icon: LucideUsers,
    toneClass: 'kpi-green',
    sparkline: props.kpiSparklines.inscritos
  },
  {
    key: 'internos',
    filter: 'internos',
    label: 'Internos',
    value: props.kpiCounts.internos,
    icon: LucideUserCheck,
    toneClass: 'kpi-teal',
    sparkline: props.kpiSparklines.internos
  },
  {
    key: 'externos',
    filter: 'externos',
    label: 'Externos',
    value: props.kpiCounts.externos,
    icon: LucideGlobe2,
    toneClass: 'kpi-blue',
    sparkline: props.kpiSparklines.externos
  },
  {
    key: 'no_inscritos',
    filter: 'no_inscritos',
    label: 'No inscritos',
    value: props.kpiCounts.no_inscritos,
    icon: LucideUserX,
    toneClass: 'kpi-red',
    sparkline: props.kpiSparklines.no_inscritos
  },
  {
    key: 'bajas',
    filter: 'bajas',
    label: 'Bajas',
    value: props.kpiCounts.bajas,
    icon: LucideUserX,
    toneClass: 'kpi-gray',
    sparkline: props.kpiSparklines.bajas
  }
])

const sectionFilterKey = (id) => `section:${Number(id)}`
</script>
