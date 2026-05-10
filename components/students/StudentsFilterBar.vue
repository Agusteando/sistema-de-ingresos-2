<template>
  <div class="filter-bar">
    <div class="search-control">
      <LucideSearch :size="19" />
      <input
        :value="searchQuery"
        @input="$emit('update-search-query', $event.target.value)"
        @keyup.enter="$emit('search')"
        placeholder="Matrícula o nombre del alumno..."
      />
    </div>

    <div class="grade-filter">
      <div class="grade-tabs" aria-label="Filtrar por grado">
        <UiChip :active="activeGrado === '' && activeSaldoFilter === 'all'" @click="clearGradeFilters">Todos</UiChip>
        <UiChip debt :active="activeSaldoFilter === 'debt'" @click="$emit('toggle-debt')">
          <span>Con adeudo</span><i aria-hidden="true"></i>
        </UiChip>
        <UiChip v-for="g in availableGrados" :key="g" :active="activeGrado === g" @click="selectGrade(g)">{{ g }}</UiChip>
      </div>

      <Transition name="filter-groups">
        <div v-if="activeGrado && availableGrupos.length" class="group-tabs" aria-label="Filtrar por grupo">
          <UiChip :active-group="activeGrupo === ''" @click="$emit('update-active-grupo', '')">Todos los grupos</UiChip>
          <UiChip v-for="grp in availableGrupos" :key="grp" :active-group="activeGrupo === grp" @click="$emit('update-active-grupo', grp)">Grupo {{ grp }}</UiChip>
        </div>
      </Transition>
    </div>

    <UiButton variant="secondary" class="export-button" @click="$emit('export')">
      <LucideDownload :size="18" /> Exportar
    </UiButton>
  </div>
</template>

<script setup>
import { LucideDownload, LucideSearch } from 'lucide-vue-next'
import UiButton from '~/components/ui/UiButton.vue'
import UiChip from '~/components/ui/UiChip.vue'

const emit = defineEmits([
  'update-search-query',
  'update-active-grado',
  'update-active-grupo',
  'update-active-saldo-filter',
  'toggle-debt',
  'search',
  'export'
])

defineProps({
  searchQuery: { type: String, default: '' },
  activeGrado: { type: String, default: '' },
  activeGrupo: { type: String, default: '' },
  activeSaldoFilter: { type: String, default: 'all' },
  availableGrados: { type: Array, default: () => [] },
  availableGrupos: { type: Array, default: () => [] }
})

const clearGradeFilters = () => {
  emit('update-active-grado', '')
  emit('update-active-grupo', '')
  emit('update-active-saldo-filter', 'all')
}

const selectGrade = (grade) => {
  emit('update-active-grado', grade)
  emit('update-active-grupo', '')
}
</script>
