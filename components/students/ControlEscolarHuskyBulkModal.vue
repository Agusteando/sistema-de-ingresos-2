<template>
  <Teleport to="body">
    <div class="husky-bulk-backdrop" role="presentation" @click.self="!running && $emit('close')">
      <section class="husky-bulk-modal" role="dialog" aria-modal="true" :aria-labelledby="titleId">
        <header class="husky-bulk-header">
          <div class="husky-bulk-brand" aria-hidden="true">
            <img src="/brand/husky-pass-header-gray.png" alt="" />
          </div>
          <div class="husky-bulk-title-copy">
            <span>Husky Pass</span>
            <h2 :id="titleId">{{ title }}</h2>
            <p>{{ selectedCount }} {{ selectedCount === 1 ? 'alumno seleccionado' : 'alumnos seleccionados' }}</p>
          </div>
          <button type="button" class="husky-bulk-close" :disabled="running" aria-label="Cerrar" @click="$emit('close')">
            <LucideX :size="18" />
          </button>
        </header>

        <div class="husky-bulk-body">
          <div v-if="!started" class="husky-bulk-intro">
            <div :class="['husky-bulk-callout', mode === 'generate_missing' ? 'is-safe' : 'is-send']">
              <component :is="mode === 'generate_missing' ? LucideShieldCheck : LucideMailCheck" :size="22" />
              <div>
                <strong>{{ introTitle }}</strong>
                <p>{{ introCopy }}</p>
              </div>
            </div>

            <div class="husky-bulk-facts">
              <article>
                <small>Selección</small>
                <strong>{{ selectedCount }}</strong>
                <span>Se valida nuevamente en la base externa.</span>
              </article>
              <article v-if="mode === 'generate_missing'">
                <small>Faltantes visibles</small>
                <strong>{{ estimatedMissing }}</strong>
                <span>Es solo una referencia; el servidor decide con datos actuales.</span>
              </article>
              <article v-else>
                <small>Con acceso visible</small>
                <strong>{{ estimatedWithAccess }}</strong>
                <span>Los que no tengan acceso se omiten, nunca se generan aquí.</span>
              </article>
            </div>
          </div>

          <div v-else class="husky-bulk-progress-area">
            <div class="husky-bulk-progress-heading">
              <div>
                <small>{{ done ? 'Resultado' : 'Procesando' }}</small>
                <strong>{{ progressLabel }}</strong>
              </div>
              <b>{{ progressPercent }}%</b>
            </div>
            <div class="husky-bulk-progress-track" aria-hidden="true">
              <i :style="{ width: `${progressPercent}%` }"></i>
            </div>

            <div class="husky-bulk-results-grid">
              <article v-if="mode === 'generate_missing'" class="is-success">
                <LucideKeyRound :size="18" />
                <div><strong>{{ counts.generated }}</strong><span>Generados</span></div>
              </article>
              <article v-if="mode === 'generate_missing'" class="is-neutral">
                <LucideShieldCheck :size="18" />
                <div><strong>{{ counts.existing }}</strong><span>Ya tenían acceso</span></div>
              </article>
              <article v-if="mode === 'send_existing'" class="is-success">
                <LucideSend :size="18" />
                <div><strong>{{ counts.sent }}</strong><span>Enviados</span></div>
              </article>
              <article v-if="mode === 'send_existing'" class="is-warning">
                <LucideKeyRound :size="18" />
                <div><strong>{{ counts.missingPass }}</strong><span>Sin Husky Pass</span></div>
              </article>
              <article v-if="mode === 'send_existing'" class="is-warning">
                <LucideMailX :size="18" />
                <div><strong>{{ counts.missingEmail }}</strong><span>Sin correo</span></div>
              </article>
              <article v-if="counts.failed" class="is-danger">
                <LucideTriangleAlert :size="18" />
                <div><strong>{{ counts.failed }}</strong><span>Fallidos</span></div>
              </article>
            </div>

            <div v-if="done && issueRows.length" class="husky-bulk-issues">
              <div class="husky-bulk-issues__heading">
                <strong>Requieren atención</strong>
                <span>{{ issueRows.length }}</span>
              </div>
              <div class="husky-bulk-issue-list">
                <div v-for="item in issueRows.slice(0, 8)" :key="`${item.matricula}-${item.status}`" class="husky-bulk-issue-row">
                  <div>
                    <strong>{{ studentName(item.matricula) }}</strong>
                    <small>{{ item.matricula }}</small>
                  </div>
                  <span>{{ issueLabel(item) }}</span>
                </div>
              </div>
              <p v-if="issueRows.length > 8" class="husky-bulk-more">+ {{ issueRows.length - 8 }} adicionales</p>
            </div>
          </div>
        </div>

        <footer class="husky-bulk-footer">
          <p v-if="!started">La selección permanecerá activa al terminar.</p>
          <p v-else-if="running">No cierres esta ventana mientras termina el lote actual.</p>
          <p v-else>La selección sigue intacta para continuar con otra acción.</p>

          <div class="husky-bulk-footer-actions">
            <button v-if="!started" type="button" class="husky-bulk-secondary" @click="$emit('close')">Cancelar</button>
            <button
              v-if="!started"
              type="button"
              :class="['husky-bulk-primary', mode === 'send_existing' ? 'is-send' : 'is-generate']"
              @click="$emit('start')"
            >
              <component :is="mode === 'generate_missing' ? LucideKeyRound : LucideSend" :size="17" />
              {{ confirmLabel }}
            </button>
            <button v-else-if="done" type="button" class="husky-bulk-primary is-done" @click="$emit('close')">
              <LucideCheck :size="17" />
              Listo
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import {
  LucideCheck,
  LucideKeyRound,
  LucideMailCheck,
  LucideMailX,
  LucideSend,
  LucideShieldCheck,
  LucideTriangleAlert,
  LucideX,
} from 'lucide-vue-next'

const props = defineProps({
  mode: { type: String, required: true },
  selectedCount: { type: Number, default: 0 },
  estimatedMissing: { type: Number, default: 0 },
  estimatedWithAccess: { type: Number, default: 0 },
  running: { type: Boolean, default: false },
  done: { type: Boolean, default: false },
  processed: { type: Number, default: 0 },
  counts: {
    type: Object,
    default: () => ({ generated: 0, existing: 0, sent: 0, missingPass: 0, missingEmail: 0, failed: 0 }),
  },
  results: { type: Array, default: () => [] },
  selectedStudents: { type: Array, default: () => [] },
})

defineEmits(['start', 'close'])

const titleId = 'control-husky-bulk-title'
const started = computed(() => props.running || props.done || props.processed > 0)
const title = computed(() => props.mode === 'generate_missing' ? 'Generar accesos faltantes' : 'Enviar accesos')
const introTitle = computed(() => props.mode === 'generate_missing'
  ? 'Los accesos existentes están protegidos.'
  : 'Solo se envían credenciales que ya existen.')
const introCopy = computed(() => props.mode === 'generate_missing'
  ? 'Aurora consulta la base externa alumno por alumno. Si ya existe usuario y contraseña, lo omite sin modificar nada.'
  : 'Aurora usa el mismo envío individual de Husky Pass. No crea ni cambia contraseñas; quienes no tengan acceso o correo se reportan por separado.')
const confirmLabel = computed(() => props.mode === 'generate_missing' ? 'Generar faltantes' : 'Enviar accesos')
const progressPercent = computed(() => {
  if (!props.selectedCount) return 0
  return Math.min(100, Math.round((props.processed / props.selectedCount) * 100))
})
const progressLabel = computed(() => props.done
  ? `${props.processed} de ${props.selectedCount} procesados`
  : `${props.processed} de ${props.selectedCount}`)
const issueRows = computed(() => props.results.filter((item) => ['missing_pass', 'missing_email', 'failed'].includes(item?.status)))
const names = computed(() => new Map(props.selectedStudents.map((student) => [String(student?.matricula || '').trim().toUpperCase(), student?.fullName || student?.nombreCompletoAlumno || student?.matricula])))

const studentName = (matricula) => names.value.get(String(matricula || '').trim().toUpperCase()) || matricula || 'Alumno'
const issueLabel = (item) => {
  if (item?.status === 'missing_pass') return 'Sin acceso'
  if (item?.status === 'missing_email') return 'Sin correo'
  return item?.message || 'No procesado'
}
</script>

<style scoped>
.husky-bulk-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1900;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(17, 28, 46, .46);
  backdrop-filter: blur(8px);
}

.husky-bulk-modal {
  width: min(680px, 100%);
  max-height: min(760px, calc(100dvh - 48px));
  overflow: auto;
  border: 1px solid rgba(50, 72, 63, .13);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 30px 80px rgba(17, 35, 28, .22);
}

.husky-bulk-header {
  display: grid;
  grid-template-columns: 54px 1fr 38px;
  gap: 14px;
  align-items: center;
  padding: 20px 22px 17px;
  border-bottom: 1px solid #edf1ee;
}

.husky-bulk-brand {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  border-radius: 16px;
  background: #f4f7f5;
}

.husky-bulk-brand img {
  width: 44px;
  height: 44px;
  object-fit: contain;
  opacity: .82;
}

.husky-bulk-title-copy span,
.husky-bulk-progress-heading small {
  display: block;
  color: #72907f;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.husky-bulk-title-copy h2 {
  margin: 2px 0 2px;
  color: #1d3028;
  font-family: 'Fredoka', sans-serif;
  font-size: 23px;
  font-weight: 650;
}

.husky-bulk-title-copy p {
  margin: 0;
  color: #77857e;
  font-size: 12px;
  font-weight: 600;
}

.husky-bulk-close {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: #718079;
  cursor: pointer;
}

.husky-bulk-close:hover:not(:disabled) { background: #f2f5f3; }
.husky-bulk-close:disabled { opacity: .38; cursor: wait; }

.husky-bulk-body { padding: 20px 22px; }

.husky-bulk-callout {
  display: flex;
  gap: 13px;
  align-items: flex-start;
  padding: 16px;
  border-radius: 16px;
}

.husky-bulk-callout.is-safe { background: #f0f8f3; color: #2f7350; }
.husky-bulk-callout.is-send { background: #f1f6fb; color: #3d6e9b; }
.husky-bulk-callout strong { display: block; margin-bottom: 4px; font-size: 14px; }
.husky-bulk-callout p { margin: 0; color: #61726a; font-size: 12.5px; line-height: 1.55; }

.husky-bulk-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.husky-bulk-facts article {
  min-width: 0;
  padding: 14px;
  border: 1px solid #e7ece9;
  border-radius: 15px;
  background: #fff;
}

.husky-bulk-facts small { display: block; color: #8a9790; font-size: 10px; font-weight: 750; text-transform: uppercase; letter-spacing: .08em; }
.husky-bulk-facts strong { display: block; margin: 4px 0 3px; color: #20372d; font-size: 22px; }
.husky-bulk-facts span { display: block; color: #7b8982; font-size: 11px; line-height: 1.4; }

.husky-bulk-progress-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: end;
}
.husky-bulk-progress-heading strong { display: block; margin-top: 3px; color: #21332b; font-size: 15px; }
.husky-bulk-progress-heading b { color: #3a7554; font-size: 20px; }
.husky-bulk-progress-track { height: 8px; margin: 10px 0 16px; overflow: hidden; border-radius: 999px; background: #edf2ef; }
.husky-bulk-progress-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #5b9672, #2f7a4d); transition: width .2s ease; }

.husky-bulk-results-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
}
.husky-bulk-results-grid article {
  display: flex;
  min-width: 0;
  gap: 9px;
  align-items: center;
  padding: 12px;
  border-radius: 14px;
  background: #f6f8f7;
  color: #66766e;
}
.husky-bulk-results-grid article.is-success { background: #eff8f2; color: #397352; }
.husky-bulk-results-grid article.is-warning { background: #fff7e9; color: #a36b21; }
.husky-bulk-results-grid article.is-danger { background: #fff0ef; color: #a44f48; }
.husky-bulk-results-grid strong { display: block; font-size: 18px; line-height: 1; }
.husky-bulk-results-grid span { display: block; margin-top: 3px; font-size: 10px; font-weight: 700; }

.husky-bulk-issues { margin-top: 16px; overflow: hidden; border: 1px solid #ece6df; border-radius: 15px; }
.husky-bulk-issues__heading { display: flex; justify-content: space-between; padding: 11px 13px; background: #fbf8f4; color: #705f50; font-size: 12px; }
.husky-bulk-issues__heading span { display: inline-grid; min-width: 22px; height: 22px; place-items: center; border-radius: 999px; background: #eee5da; font-size: 10px; font-weight: 800; }
.husky-bulk-issue-list { display: grid; }
.husky-bulk-issue-row { display: flex; justify-content: space-between; gap: 14px; align-items: center; padding: 10px 13px; border-top: 1px solid #f0ece8; }
.husky-bulk-issue-row:first-child { border-top: 0; }
.husky-bulk-issue-row strong { display: block; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #34453d; font-size: 11.5px; }
.husky-bulk-issue-row small { color: #8e9993; font-size: 10px; }
.husky-bulk-issue-row > span { color: #9b6852; font-size: 10.5px; font-weight: 700; text-align: right; }
.husky-bulk-more { margin: 0; padding: 9px 13px; border-top: 1px solid #f0ece8; color: #8b7768; font-size: 10px; }

.husky-bulk-footer {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  padding: 14px 22px 18px;
  border-top: 1px solid #edf1ee;
}
.husky-bulk-footer > p { margin: 0; color: #8a9690; font-size: 10.5px; line-height: 1.4; }
.husky-bulk-footer-actions { display: flex; gap: 8px; flex: 0 0 auto; }
.husky-bulk-secondary,
.husky-bulk-primary {
  display: inline-flex;
  height: 40px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 15px;
  border-radius: 12px;
  font: inherit;
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
}
.husky-bulk-secondary { border: 1px solid #dde4e0; background: #fff; color: #66756d; }
.husky-bulk-primary { border: 0; color: #fff; }
.husky-bulk-primary.is-generate { background: #397755; }
.husky-bulk-primary.is-send { background: #3e719f; }
.husky-bulk-primary.is-done { background: #314f40; }

@media (max-width: 620px) {
  .husky-bulk-backdrop { padding: 10px; align-items: end; }
  .husky-bulk-modal { max-height: calc(100dvh - 20px); border-radius: 20px 20px 14px 14px; }
  .husky-bulk-header { grid-template-columns: 46px 1fr 36px; padding: 16px; }
  .husky-bulk-brand { width: 46px; height: 46px; border-radius: 14px; }
  .husky-bulk-brand img { width: 38px; height: 38px; }
  .husky-bulk-title-copy h2 { font-size: 20px; }
  .husky-bulk-body { padding: 16px; }
  .husky-bulk-facts { grid-template-columns: 1fr; }
  .husky-bulk-results-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .husky-bulk-footer { align-items: stretch; flex-direction: column; padding: 12px 16px 16px; }
  .husky-bulk-footer-actions { width: 100%; }
  .husky-bulk-secondary,
  .husky-bulk-primary { flex: 1; }
}
</style>
