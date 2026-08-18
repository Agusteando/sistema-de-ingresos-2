<template>
  <section class="duplicate-entry" aria-label="Resolución de alumnos duplicados">
    <button type="button" class="duplicate-entry__button" @click="openResolver">
      <span class="duplicate-entry__icon" aria-hidden="true">
        <LucideGitMerge :size="18" stroke-width="1.8" />
      </span>
      <span>Resolver posibles duplicados<span v-if="count !== null"> ({{ count }})</span></span>
      <LucideChevronRight class="duplicate-entry__arrow" :size="17" stroke-width="1.8" aria-hidden="true" />
    </button>
  </section>
</template>

<script setup>
import { LucideChevronRight, LucideGitMerge } from 'lucide-vue-next'

const count = ref(null)

const loadCount = async () => {
  try {
    const response = await $fetch('/api/student-duplicates/candidates', {
      query: { countOnly: 'true' },
    })
    count.value = Number(response?.count || 0)
  } catch {
    count.value = null
  }
}

const openResolver = () => navigateTo('/duplicados')

onMounted(loadCount)
</script>

<style scoped>
.duplicate-entry {
  width: 100%;
  padding: 0 0 8px;
}

.duplicate-entry__button {
  width: 100%;
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 4px 10px;
  border: 1px solid #e1e7e3;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.9);
  color: #47534c;
  box-shadow: 0 5px 18px rgba(45, 61, 51, 0.035);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
}

.duplicate-entry__button:hover {
  border-color: #cdd9d1;
  box-shadow: 0 7px 22px rgba(45, 61, 51, 0.07);
  transform: translateY(-1px);
}

.duplicate-entry__button:focus-visible {
  outline: 3px solid rgba(63, 134, 89, 0.14);
  outline-offset: 2px;
}

.duplicate-entry__icon {
  width: 25px;
  height: 25px;
  flex: 0 0 25px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #f2f7f3;
  color: #4d7e5d;
}

.duplicate-entry__arrow {
  margin-left: auto;
  color: #95a39a;
}
</style>
