<template>
  <section :class="['kpi-summary-system', { 'without-income': userRole !== 'global' }]" aria-label="Resumen de matrícula y finanzas">
    <div class="kpi-strip" aria-label="Matrícula y finanzas">
      <button
        @click="$emit('set-filter', 'inscritos')"
        :class="['kpi-card kpi-green', { active: activeFilter === 'inscritos' }]"
      >
        <span class="kpi-icon"><LucideUsers :size="24" /></span>
        <span class="kpi-text">
          <span>Inscritos</span>
          <strong>{{ kpiCounts.inscritos }}</strong>
          <em>Total de alumnos</em>
        </span>
      </button>

      <button
        @click="$emit('set-filter', 'internos')"
        :class="['kpi-card kpi-teal', { active: activeFilter === 'internos' }]"
      >
        <span class="kpi-icon"><LucideUserCheck :size="24" /></span>
        <span class="kpi-text">
          <span>Internos</span>
          <strong>{{ kpiCounts.internos }}</strong>
          <em>{{ percentage(kpiCounts.internos) }}% del total</em>
        </span>
      </button>

      <button
        @click="$emit('set-filter', 'externos')"
        :class="['kpi-card kpi-blue', { active: activeFilter === 'externos' }]"
      >
        <span class="kpi-icon"><LucideGlobe2 :size="24" /></span>
        <span class="kpi-text">
          <span>Externos</span>
          <strong>{{ kpiCounts.externos }}</strong>
          <em>{{ percentage(kpiCounts.externos) }}% del total</em>
        </span>
      </button>

      <button
        @click="$emit('set-filter', 'no_inscritos')"
        :class="['kpi-card kpi-red', { active: activeFilter === 'no_inscritos' }]"
      >
        <span class="kpi-icon"><LucideUserX :size="24" /></span>
        <span class="kpi-text">
          <span>No inscritos</span>
          <strong>{{ kpiCounts.no_inscritos }}</strong>
          <em>{{ percentage(kpiCounts.no_inscritos) }}% del total</em>
        </span>
      </button>

      <button
        @click="$emit('set-filter', 'bajas')"
        :class="['kpi-card kpi-gray', { active: activeFilter === 'bajas' }]"
      >
        <span class="kpi-icon"><LucideUserX :size="24" /></span>
        <span class="kpi-text">
          <span>Bajas</span>
          <strong>{{ kpiCounts.bajas }}</strong>
          <em>{{ percentage(kpiCounts.bajas) }}% del total</em>
        </span>
      </button>

      <div v-if="userRole === 'global'" class="kpi-card kpi-income-card" aria-label="Ingresos del mes">
        <span class="kpi-icon"><LucideCircleDollarSign :size="24" /></span>
        <span class="kpi-text">
          <span>Ingresos del mes</span>
          <strong>${{ Number(globalKpis.ingresosMes).toLocaleString('es-MX', { minimumFractionDigits: 2 }) }}</strong>
          <em>Total recaudado</em>
        </span>
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

const props = defineProps({
  userRole: { type: String, default: 'plantel' },
  kpiCounts: { type: Object, required: true },
  activeFilter: { type: String, default: '' },
  customSections: { type: Array, default: () => [] },
  customSectionCounts: { type: Object, default: () => ({}) },
  globalKpis: { type: Object, default: () => ({ ingresosMes: 0 }) }
})

defineEmits(['set-filter'])

const totalStudents = computed(() => Math.max(1, Number(props.kpiCounts.inscritos || 0)))
const percentage = (value) => (Number(value || 0) * 100 / totalStudents.value).toFixed(1)
const sectionFilterKey = (id) => `section:${Number(id)}`
</script>
