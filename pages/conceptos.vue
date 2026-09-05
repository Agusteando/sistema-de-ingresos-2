<template>
  <div class="conceptos-shell">
    <nav class="conceptos-section-switch" aria-label="Sección de conceptos">
      <button type="button" :class="{ active: section === 'general' }" @click="section = 'general'">
        <LucidePackage :size="17" />
        Conceptos e inventario
      </button>
      <button type="button" :class="{ active: section === 'talleres' }" @click="section = 'talleres'">
        <LucideBlocks :size="17" />
        Talleres y servicios
      </button>
    </nav>

    <ConceptosTalleresGlobal v-if="section === 'talleres'" />
    <ConceptosLegacy v-else />
  </div>
</template>

<script setup>
import { LucideBlocks, LucidePackage } from 'lucide-vue-next'
import ConceptosLegacy from '~/components/ConceptosLegacy.vue'
import ConceptosTalleresGlobal from '~/components/ConceptosTalleresGlobal.vue'

const route = useRoute()
const router = useRouter()
const section = ref(route.query.section === 'talleres' ? 'talleres' : 'general')

watch(section, (value) => {
  const query = { ...route.query }
  if (value === 'talleres') query.section = 'talleres'
  else delete query.section
  router.replace({ query })
})
</script>

<style scoped>
.conceptos-shell { display: grid; gap: 14px; width: 100%; }
.conceptos-section-switch {
  width: fit-content;
  display: flex;
  gap: 5px;
  padding: 5px;
  background: #eef3f6;
  border: 1px solid #dfe7ed;
  border-radius: 14px;
}
.conceptos-section-switch button {
  min-height: 40px;
  padding: 0 15px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #69788b;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
}
.conceptos-section-switch button.active {
  background: white;
  color: #087fa8;
  box-shadow: 0 3px 10px rgba(32, 65, 86, .1);
}
@media (max-width: 560px) {
  .conceptos-section-switch { width: 100%; }
  .conceptos-section-switch button { flex: 1; justify-content: center; padding-inline: 8px; }
}
</style>
