<template>
  <Teleport to="body">
    <div v-if="show" class="report-builder-backdrop" role="presentation" @click.self="$emit('close')">
      <section class="report-builder" role="dialog" aria-modal="true" aria-labelledby="control-report-title">
        <header class="report-builder__header">
          <div class="report-builder__icon" aria-hidden="true">
            <LucideFileSpreadsheet :size="20" />
          </div>
          <div>
            <span>Control Escolar</span>
            <h2 id="control-report-title">Personalizar Excel</h2>
            <p>{{ plantel }} · {{ cicloLabel }} · {{ totalLabel }}</p>
          </div>
          <button type="button" class="report-builder__close" aria-label="Cerrar" @click="$emit('close')">
            <LucideX :size="18" />
          </button>
        </header>

        <div class="report-builder__toolbar">
          <strong>{{ selected.size }} campos</strong>
          <div>
            <button type="button" @click="restoreDefaults">Predeterminados</button>
            <button type="button" @click="selectAll">Todos</button>
          </div>
        </div>

        <div class="report-builder__groups">
          <section v-for="group in fieldGroups" :key="group.key" class="report-builder__group">
            <div class="report-builder__group-head">
              <strong>{{ group.label }}</strong>
              <button type="button" @click="toggleGroup(group.key)">{{ groupSelectionLabel(group.key) }}</button>
            </div>
            <div class="report-builder__fields">
              <label v-for="field in fieldsForGroup(group.key)" :key="field.key" :class="{ selected: selected.has(field.key) }">
                <input
                  type="checkbox"
                  :checked="selected.has(field.key)"
                  @change="toggleField(field.key)"
                />
                <span>{{ field.label }}</span>
                <LucideKeyRound v-if="field.sensitive" :size="13" aria-hidden="true" />
              </label>
            </div>
          </section>
        </div>

        <footer class="report-builder__footer">
          <p><LucideShieldCheck :size="14" /> El archivo usa los datos calculados del ciclo seleccionado.</p>
          <div>
            <button type="button" class="report-builder__cancel" @click="$emit('close')">Cancelar</button>
            <button type="button" class="report-builder__confirm" :disabled="!selected.size" @click="confirm">
              <LucideDownload :size="16" />
              Generar Excel
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LucideDownload, LucideFileSpreadsheet, LucideKeyRound, LucideShieldCheck, LucideX } from 'lucide-vue-next'
import {
  CONTROL_ESCOLAR_REPORT_DEFAULT_FIELDS,
  CONTROL_ESCOLAR_REPORT_FIELDS,
  CONTROL_ESCOLAR_REPORT_GROUPS,
  type ControlEscolarReportFieldGroupKey,
} from '~/shared/constants/controlEscolarReport'

const props = defineProps<{
  show: boolean
  plantel?: string
  cicloLabel?: string
  total?: number
}>()

const emit = defineEmits<{
  close: []
  confirm: [fields: string[]]
}>()

const selected = ref(new Set<string>(CONTROL_ESCOLAR_REPORT_DEFAULT_FIELDS))
const fieldGroups = CONTROL_ESCOLAR_REPORT_GROUPS

const totalLabel = computed(() => `${Number(props.total || 0).toLocaleString('es-MX')} ${Number(props.total || 0) === 1 ? 'alumno' : 'alumnos'}`)

watch(() => props.show, (visible) => {
  if (visible && !selected.value.size) restoreDefaults()
})

const fieldsForGroup = (group: ControlEscolarReportFieldGroupKey) => CONTROL_ESCOLAR_REPORT_FIELDS.filter((field) => field.group === group)

const toggleField = (key: string) => {
  const next = new Set(selected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selected.value = next
}

const restoreDefaults = () => {
  selected.value = new Set(CONTROL_ESCOLAR_REPORT_DEFAULT_FIELDS)
}

const selectAll = () => {
  selected.value = new Set(CONTROL_ESCOLAR_REPORT_FIELDS.map((field) => field.key))
}

const groupSelectionLabel = (group: ControlEscolarReportFieldGroupKey) => {
  const fields = fieldsForGroup(group)
  return fields.every((field) => selected.value.has(field.key)) ? 'Quitar' : 'Todo'
}

const toggleGroup = (group: ControlEscolarReportFieldGroupKey) => {
  const fields = fieldsForGroup(group)
  const remove = fields.every((field) => selected.value.has(field.key))
  const next = new Set(selected.value)
  fields.forEach((field) => remove ? next.delete(field.key) : next.add(field.key))
  selected.value = next
}

const confirm = () => {
  const ordered = CONTROL_ESCOLAR_REPORT_FIELDS
    .filter((field) => selected.value.has(field.key))
    .map((field) => field.key)
  if (!ordered.length) return
  emit('confirm', ordered)
}
</script>

<style scoped>
.report-builder-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1950;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(20, 31, 38, .44);
  backdrop-filter: blur(7px);
}

.report-builder {
  width: min(620px, 100%);
  max-height: min(760px, calc(100dvh - 40px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(40, 67, 55, .12);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 28px 78px rgba(18, 36, 29, .22);
  color: #203047;
}

.report-builder__header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 36px;
  gap: 12px;
  align-items: center;
  padding: 18px 20px 15px;
  border-bottom: 1px solid #edf1ee;
}

.report-builder__icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 14px;
  background: #eaf4ec;
  color: #276a34;
}

.report-builder__header span {
  display: block;
  margin-bottom: 2px;
  color: #728078;
  font-size: .63rem;
  font-weight: 850;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.report-builder__header h2 {
  margin: 0;
  color: #173d24;
  font-size: 1.15rem;
  line-height: 1.18;
}

.report-builder__header p {
  margin: 4px 0 0;
  color: #7b8780;
  font-size: .71rem;
  font-weight: 650;
}

.report-builder__close {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #718078;
  cursor: pointer;
}

.report-builder__close:hover { background: #f3f6f4; color: #173d24; }

.report-builder__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px;
  background: #fafcfb;
  border-bottom: 1px solid #edf1ee;
}

.report-builder__toolbar strong { color: #53635a; font-size: .72rem; }
.report-builder__toolbar div { display: flex; gap: 5px; }
.report-builder__toolbar button,
.report-builder__group-head button {
  border: 0;
  background: transparent;
  color: #34713f;
  cursor: pointer;
  font-size: .66rem;
  font-weight: 800;
}

.report-builder__groups {
  overflow: auto;
  padding: 8px 20px 10px;
  scrollbar-width: thin;
}

.report-builder__group { padding: 11px 0 12px; border-bottom: 1px solid #eef2ef; }
.report-builder__group:last-child { border-bottom: 0; }
.report-builder__group-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.report-builder__group-head strong { color: #34473c; font-size: .72rem; font-weight: 900; }

.report-builder__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.report-builder__fields label {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  gap: 7px;
  align-items: center;
  min-height: 34px;
  padding: 7px 9px;
  border: 1px solid #edf1ee;
  border-radius: 10px;
  background: #fff;
  color: #617067;
  cursor: pointer;
  font-size: .69rem;
  font-weight: 720;
  transition: .14s ease;
}

.report-builder__fields label:hover { border-color: #cdddcf; background: #fbfdfb; }
.report-builder__fields label.selected { border-color: #bad4bf; background: #f0f7f1; color: #234d2c; }
.report-builder__fields input { width: 14px; height: 14px; margin: 0; accent-color: #276a34; }
.report-builder__fields svg { color: #967128; }

.report-builder__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 20px 16px;
  border-top: 1px solid #e8eeea;
  background: #fff;
}

.report-builder__footer p {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: #77847c;
  font-size: .64rem;
  font-weight: 650;
}
.report-builder__footer p svg { flex: 0 0 auto; color: #43814c; }
.report-builder__footer > div { display: flex; gap: 7px; }
.report-builder__cancel,
.report-builder__confirm {
  min-height: 36px;
  padding: 0 13px;
  border-radius: 10px;
  font-size: .7rem;
  font-weight: 850;
  cursor: pointer;
}
.report-builder__cancel { border: 1px solid #dfe7e1; background: #fff; color: #5d6c63; }
.report-builder__confirm { display: inline-flex; align-items: center; gap: 7px; border: 1px solid #276a34; background: #276a34; color: #fff; }
.report-builder__confirm:disabled { opacity: .45; cursor: not-allowed; }

@media (max-width: 620px) {
  .report-builder-backdrop { padding: 10px; }
  .report-builder { max-height: calc(100dvh - 20px); border-radius: 18px; }
  .report-builder__fields { grid-template-columns: 1fr; }
  .report-builder__footer { align-items: stretch; flex-direction: column; }
  .report-builder__footer > div { justify-content: flex-end; }
}
</style>
