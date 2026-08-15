<template>
  <main class="bulk-delivery-progress" aria-live="polite">
    <div class="bulk-delivery-progress__hero">
      <span :class="['bulk-delivery-progress__icon', { success: completed && !failedCount, warning: failedCount }]">
        <LucideLoader2 v-if="running" class="bulk-delivery-progress__spin" :size="28" />
        <LucideCircleCheck v-else-if="completed && !failedCount" :size="30" />
        <LucideTriangleAlert v-else-if="failedCount" :size="30" />
        <LucideSend v-else :size="28" />
      </span>
      <div>
        <strong>{{ headline }}</strong>
        <span>{{ completedCount }} de {{ total }} procesados</span>
      </div>
    </div>

    <div class="bulk-delivery-progress__bar" role="progressbar" :aria-valuemin="0" :aria-valuemax="total" :aria-valuenow="completedCount">
      <i :style="{ width: `${progressPercent}%` }"></i>
    </div>

    <div class="bulk-delivery-progress__metrics">
      <span class="sent"><LucideCircleCheck :size="14" /> {{ sentCount }} enviados</span>
      <span v-if="failedCount" class="failed"><LucideCircleX :size="14" /> {{ failedCount }} fallidos</span>
      <span v-if="pendingCount" class="pending"><LucideClock3 :size="14" /> {{ pendingCount }} pendientes</span>
      <span v-if="skipped" class="skipped"><LucideMinusCircle :size="14" /> {{ skipped }} omitidos</span>
    </div>

    <div class="bulk-delivery-progress__list">
      <article v-for="item in items" :key="item.key" :class="['bulk-delivery-progress__item', item.status]">
        <span class="bulk-delivery-progress__state">
          <LucideLoader2 v-if="item.status === 'sending'" class="bulk-delivery-progress__spin" :size="15" />
          <LucideCircleCheck v-else-if="item.status === 'sent'" :size="15" />
          <LucideCircleX v-else-if="item.status === 'failed'" :size="15" />
          <LucideClock3 v-else :size="15" />
        </span>
        <div>
          <strong>{{ item.label }}</strong>
          <span v-if="item.detail">{{ item.detail }}</span>
          <small v-if="item.error">{{ item.error }}</small>
        </div>
      </article>
    </div>

    <footer class="bulk-delivery-progress__actions">
      <button v-if="failedCount" type="button" class="secondary" :disabled="running" @click="$emit('retry-failed')">
        <LucideRefreshCw :size="15" /> Reintentar fallidos
      </button>
      <button v-if="pendingCount && !running" type="button" class="secondary" @click="$emit('continue-pending')">
        <LucidePlay :size="15" /> Continuar pendientes
      </button>
      <button type="button" class="primary" :disabled="running" @click="$emit('done')">Listo</button>
    </footer>
  </main>
</template>

<script setup>
import { computed } from 'vue'
import {
  LucideCircleCheck,
  LucideCircleX,
  LucideClock3,
  LucideLoader2,
  LucideMinusCircle,
  LucidePlay,
  LucideRefreshCw,
  LucideSend,
  LucideTriangleAlert,
} from 'lucide-vue-next'

const props = defineProps({
  items: { type: Array, default: () => [] },
  running: { type: Boolean, default: false },
  skipped: { type: Number, default: 0 },
  channelLabel: { type: String, default: 'mensajes' },
})

defineEmits(['retry-failed', 'continue-pending', 'done'])

const total = computed(() => props.items.length)
const sentCount = computed(() => props.items.filter((item) => item.status === 'sent').length)
const failedCount = computed(() => props.items.filter((item) => item.status === 'failed').length)
const pendingCount = computed(() => props.items.filter((item) => item.status === 'pending' || item.status === 'sending').length)
const completedCount = computed(() => sentCount.value + failedCount.value)
const completed = computed(() => total.value > 0 && completedCount.value >= total.value)
const progressPercent = computed(() => total.value ? Math.round((completedCount.value / total.value) * 100) : 0)
const headline = computed(() => {
  if (props.running) return `Enviando ${props.channelLabel}…`
  if (failedCount.value && sentCount.value) return 'Envío parcial'
  if (failedCount.value) return 'Hay envíos por reintentar'
  if (completed.value) return 'Envío completado'
  return 'Envío pendiente'
})
</script>

<style scoped>
.bulk-delivery-progress {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: 24px;
  overflow: hidden;
}

.bulk-delivery-progress__hero {
  display: flex;
  align-items: center;
  gap: 13px;
}

.bulk-delivery-progress__hero > div { min-width: 0; }
.bulk-delivery-progress__hero strong,
.bulk-delivery-progress__hero span { display: block; }
.bulk-delivery-progress__hero strong { color: #18283d; font-size: 18px; font-weight: 880; }
.bulk-delivery-progress__hero span { margin-top: 2px; color: #7b8797; font-size: 11px; font-weight: 690; }
.bulk-delivery-progress__icon {
  width: 48px;
  height: 48px;
  display: grid;
  flex: 0 0 48px;
  place-items: center;
  border-radius: 16px;
  background: #edf4fb;
  color: #4d79a7;
}
.bulk-delivery-progress__icon.success { background: #edf8f0; color: #258646; }
.bulk-delivery-progress__icon.warning { background: #fff4e9; color: #b36b28; }
.bulk-delivery-progress__spin { animation: bulk-delivery-spin .8s linear infinite; }
@keyframes bulk-delivery-spin { to { transform: rotate(360deg); } }

.bulk-delivery-progress__bar {
  height: 7px;
  margin-top: 18px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf0f4;
}
.bulk-delivery-progress__bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #4e9f58, #65b66f);
  transition: width .25s ease;
}

.bulk-delivery-progress__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 11px;
}
.bulk-delivery-progress__metrics span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border-radius: 999px;
  background: #f4f6f8;
  color: #667487;
  font-size: 10px;
  font-weight: 760;
}
.bulk-delivery-progress__metrics .sent { background: #edf8f0; color: #287b3f; }
.bulk-delivery-progress__metrics .failed { background: #fff0ed; color: #a34f43; }
.bulk-delivery-progress__metrics .pending { background: #f2f5f8; color: #667487; }

.bulk-delivery-progress__list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 7px;
  margin-top: 18px;
  padding-right: 3px;
  overflow: auto;
}
.bulk-delivery-progress__item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 10px 11px;
  border: 1px solid #e8edf2;
  border-radius: 12px;
  background: #fff;
}
.bulk-delivery-progress__item.sent { border-color: #dcebdd; background: #fbfefb; }
.bulk-delivery-progress__item.failed { border-color: #f1dcd8; background: #fffafa; }
.bulk-delivery-progress__state {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: #f1f4f7;
  color: #718093;
}
.bulk-delivery-progress__item.sent .bulk-delivery-progress__state { background: #eaf7ed; color: #288348; }
.bulk-delivery-progress__item.failed .bulk-delivery-progress__state { background: #fff0ed; color: #aa584c; }
.bulk-delivery-progress__item strong,
.bulk-delivery-progress__item span,
.bulk-delivery-progress__item small { display: block; overflow-wrap: anywhere; }
.bulk-delivery-progress__item strong { color: #253449; font-size: 11px; font-weight: 820; }
.bulk-delivery-progress__item span { margin-top: 2px; color: #788596; font-size: 9.5px; }
.bulk-delivery-progress__item small { margin-top: 4px; color: #a34f43; font-size: 9.5px; line-height: 1.35; }

.bulk-delivery-progress__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 16px;
}
.bulk-delivery-progress__actions button {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  border-radius: 11px;
  font-size: 11px;
  font-weight: 820;
  cursor: pointer;
}
.bulk-delivery-progress__actions button:disabled { opacity: .5; cursor: default; }
.bulk-delivery-progress__actions .secondary { border: 1px solid #dbe2e9; background: #fff; color: #536277; }
.bulk-delivery-progress__actions .primary { border: 1px solid #348f47; background: #348f47; color: #fff; }

@media (max-width: 720px) {
  .bulk-delivery-progress { padding: 18px 15px; }
  .bulk-delivery-progress__actions { flex-wrap: wrap; }
  .bulk-delivery-progress__actions button { flex: 1; }
}
</style>
