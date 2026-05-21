<template>
  <Teleport to="body">
    <div class="operator-info-backdrop" role="dialog" aria-modal="true" @click.self="$emit('close')">
      <section class="operator-info-modal">
        <header class="operator-info-header">
          <div>
            <span>Vista de operador</span>
            <h2>Ver información de alumno</h2>
            <p>Consulta read-only del expediente ampliado desde base del plantel y matrícula centralizada.</p>
          </div>
          <button type="button" class="operator-info-close" aria-label="Cerrar información de alumno" @click="$emit('close')">
            <LucideX :size="18" />
          </button>
        </header>

        <div v-if="student" class="operator-info-summary">
          <div>
            <strong>{{ student.nombre || student.nombreCompleto || student.fullName || 'Alumno' }}</strong>
            <span>{{ student.matricula }}</span>
          </div>
          <small>{{ student.nivel || 'Nivel sin dato' }} · {{ student.grado || 'Grado sin dato' }} · {{ student.grupo || student.group || 'Grupo sin dato' }}</small>
        </div>

        <div class="operator-info-content">
          <ControlEscolarReadOnlyDetails
            :matricula="student?.matricula || ''"
            :fallback-student="student"
            endpoint-suffix="operator-info"
            eyebrow="Información extendida"
            title="Expediente Control Escolar"
            description="Solo lectura. Datos consolidados desde base local y tabla centralizada matricula."
          />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { LucideX } from 'lucide-vue-next'
import ControlEscolarReadOnlyDetails from '~/components/students/ControlEscolarReadOnlyDetails.vue'

defineProps({
  student: { type: Object, required: true }
})

defineEmits(['close'])
</script>

<style scoped>
.operator-info-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: rgba(19, 35, 28, .48);
  backdrop-filter: blur(10px);
}

.operator-info-modal {
  width: min(1120px, 96vw);
  max-height: min(880px, 92vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(205, 221, 210, .88);
  border-radius: 28px;
  background: linear-gradient(180deg, #ffffff, #f8fbf8);
  box-shadow: 0 28px 80px rgba(22, 41, 31, .24);
}

.operator-info-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.15rem .7rem;
  border-bottom: 1px solid rgba(214, 225, 217, .86);
}

.operator-info-header span {
  display: block;
  font-size: .66rem;
  font-weight: 900;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: #6f8678;
}

.operator-info-header h2 {
  margin: .12rem 0;
  font-size: 1.18rem;
  color: #1f3a2b;
}

.operator-info-header p {
  margin: 0;
  max-width: 680px;
  font-size: .78rem;
  color: #667769;
}

.operator-info-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid rgba(116, 145, 124, .24);
  border-radius: 999px;
  background: #fff;
  color: #35533e;
}

.operator-info-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: .72rem 1.15rem;
  border-bottom: 1px solid rgba(214, 225, 217, .72);
  background: rgba(246, 250, 246, .86);
}

.operator-info-summary div {
  display: flex;
  align-items: baseline;
  gap: .7rem;
  min-width: 0;
}

.operator-info-summary strong {
  color: #21382b;
  font-size: .92rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.operator-info-summary span,
.operator-info-summary small {
  color: #667769;
  font-size: .76rem;
  font-weight: 700;
}

.operator-info-content {
  overflow: auto;
  padding: 1rem;
}

@media (max-width: 720px) {
  .operator-info-backdrop { padding: .6rem; }
  .operator-info-modal { width: 100%; max-height: 94vh; border-radius: 22px; }
  .operator-info-header, .operator-info-summary { padding-inline: .85rem; }
  .operator-info-summary, .operator-info-summary div { align-items: flex-start; flex-direction: column; gap: .25rem; }
  .operator-info-content { padding: .75rem; }
}
</style>
