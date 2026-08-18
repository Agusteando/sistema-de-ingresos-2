<template>
  <article class="student-side" :class="{ selected }">
    <header class="student-side__header">
      <div class="student-side__identity">
        <span>{{ student.summary.matricula }}</span>
        <h2>{{ student.summary.nombre || 'Sin nombre' }}</h2>
        <div>
          <i v-if="student.summary.plantel">{{ student.summary.plantel }}</i>
          <i v-if="student.summary.grado">{{ student.summary.grado }}<template v-if="student.summary.grupo"> · {{ student.summary.grupo }}</template></i>
          <i v-if="student.summary.estatus">{{ student.summary.estatus }}</i>
        </div>
      </div>
      <button type="button" class="keep-button" :class="{ selected }" @click="$emit('keep')">
        <LucideCheck v-if="selected" :size="16" />
        <LucideCircle v-else :size="15" />
        {{ selected ? 'Se conserva' : 'Conservar esta matrícula' }}
      </button>
    </header>

    <section class="source-card local-card">
      <header>
        <span>Cuenta</span>
        <i class="available">{{ student.summary.estatus || 'Disponible' }}</i>
      </header>
      <dl>
        <div>
          <dt>CURP</dt>
          <dd>{{ student.summary.curpLocal || '—' }}</dd>
        </div>
        <div>
          <dt>Ciclo</dt>
          <dd>{{ student.summary.ciclo || '—' }}</dd>
        </div>
        <div v-if="student.summary.correo">
          <dt>Correo</dt>
          <dd>{{ student.summary.correo }}</dd>
        </div>
        <div v-if="student.summary.telefono">
          <dt>Teléfono</dt>
          <dd>{{ student.summary.telefono }}</dd>
        </div>
      </dl>
    </section>

    <section class="source-card">
      <header>
        <span>Ficha escolar</span>
        <i :class="{ available: student.central?.exists }">{{ student.central?.exists ? 'Disponible' : 'Sin registro' }}</i>
      </header>
      <dl>
        <div>
          <dt>CURP</dt>
          <dd>{{ student.central?.curp || '—' }}</dd>
        </div>
        <div v-if="student.central?.nombre">
          <dt>Nombre</dt>
          <dd>{{ student.central.nombre }}</dd>
        </div>
        <div>
          <dt>Plantel</dt>
          <dd>{{ student.central?.plantel || '—' }}</dd>
        </div>
        <div>
          <dt>Grado / grupo</dt>
          <dd>{{ joinValues(student.central?.grado, student.central?.grupo) }}</dd>
        </div>
        <div v-if="student.central?.fechaNacimiento">
          <dt>Nacimiento</dt>
          <dd>{{ formatDate(student.central.fechaNacimiento) }}</dd>
        </div>
        <div v-if="student.central?.padre || student.central?.madre">
          <dt>Familia</dt>
          <dd>{{ joinValues(student.central?.padre, student.central?.madre) }}</dd>
        </div>
      </dl>
    </section>

    <section class="financial-summary">
      <div>
        <span>Conceptos</span>
        <strong>{{ student.counts?.documents || 0 }}</strong>
      </div>
      <div>
        <span>Pagos</span>
        <strong>{{ student.counts?.payments || 0 }}</strong>
      </div>
      <div>
        <span>Pagado</span>
        <strong>{{ money(student.counts?.paid) }}</strong>
      </div>
    </section>

    <section class="ledger-block">
      <header>
        <span>Conceptos</span>
        <strong>{{ student.documents?.length || 0 }}</strong>
      </header>
      <div v-if="student.documents?.length" class="ledger-list documents-list">
        <div v-for="document in student.documents" :key="document.documento" class="ledger-row">
          <div>
            <strong>{{ document.conceptoNombre || `Concepto ${document.concepto || ''}` }}</strong>
            <span>{{ conceptMeta(document) }}</span>
          </div>
          <b>{{ money(document.montoFinal ?? document.costo) }}</b>
        </div>
      </div>
      <div v-else class="ledger-empty">Sin conceptos</div>
    </section>

    <section class="ledger-block payments-block">
      <header>
        <span>Pagos</span>
        <strong>{{ student.payments?.length || 0 }}</strong>
      </header>
      <div v-if="student.payments?.length" class="ledger-list payments-list">
        <div v-for="payment in student.payments" :key="`${payment.folio}-${payment.folio_plantel || ''}`" class="ledger-row payment-row">
          <div>
            <strong>{{ payment.conceptoNombre || `Concepto ${payment.concepto || ''}` }}</strong>
            <span>{{ paymentMeta(payment) }}</span>
          </div>
          <b>{{ money(payment.monto) }}</b>
        </div>
      </div>
      <div v-else class="ledger-empty">Sin pagos</div>
    </section>
  </article>
</template>

<script setup>
import { LucideCheck, LucideCircle } from 'lucide-vue-next'

defineProps({
  student: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  side: { type: String, default: '' },
})

defineEmits(['keep'])

const money = (value) => new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
}).format(Number(value || 0))

const joinValues = (...values) => values.map((value) => String(value || '').trim()).filter(Boolean).join(' · ') || '—'

const formatDate = (value) => {
  if (!value) return '—'
  const raw = String(value).trim()
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw.replace(' ', 'T')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

const conceptMeta = (document) => joinValues(
  document.ciclo,
  document.meses ? `${document.meses} mes${Number(document.meses) === 1 ? '' : 'es'}` : '',
  document.estatus,
)

const paymentMeta = (payment) => joinValues(
  formatDate(payment.fecha),
  payment.formaDePago,
  payment.folio_plantel || payment.folio ? `Folio ${payment.folio_plantel || payment.folio}` : '',
)
</script>

<style scoped>
.student-side {
  min-width: 0;
  padding: 17px;
  background: #fff;
  transition: background 140ms ease, box-shadow 140ms ease;
}

.student-side.selected { background: linear-gradient(180deg, rgba(246, 250, 247, .9), #fff 170px); box-shadow: inset 0 3px 0 #70a77e; }
.student-side__header { min-height: 78px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.student-side__identity { min-width: 0; }
.student-side__identity > span { color: #8c9690; font-size: 10px; font-weight: 850; letter-spacing: .045em; }
.student-side__identity h2 { margin: 3px 0 6px; overflow: hidden; color: #2d3a32; font-size: clamp(15px, 1.2vw, 18px); line-height: 1.15; letter-spacing: -.02em; text-overflow: ellipsis; }
.student-side__identity > div { display: flex; flex-wrap: wrap; gap: 5px; }
.student-side__identity i { display: inline-flex; min-height: 20px; align-items: center; padding: 0 7px; border-radius: 7px; background: #f3f5f4; color: #7b877f; font-size: 9px; font-style: normal; font-weight: 750; }
.keep-button { min-height: 33px; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; padding: 0 9px; border: 1px solid #d9e2dc; border-radius: 9px; background: #fff; color: #66746b; font: inherit; font-size: 10px; font-weight: 800; cursor: pointer; }
.keep-button:hover { border-color: #b9cdbf; color: #3f714d; }
.keep-button.selected { border-color: #91b89b; background: #eff7f1; color: #3d754b; }

.source-card { margin: 12px 0; overflow: hidden; border: 1px solid #e5ebe6; border-radius: 12px; background: #fafcfa; }
.source-card > header, .ledger-block > header { min-height: 35px; display: flex; align-items: center; justify-content: space-between; padding: 0 11px; border-bottom: 1px solid #e9eeea; }
.source-card > header span, .ledger-block > header span { color: #68756d; font-size: 10px; font-weight: 850; letter-spacing: .045em; text-transform: uppercase; }
.source-card > header i { color: #9a7d5c; font-size: 9px; font-style: normal; font-weight: 750; }
.source-card > header i.available { color: #578264; }
.source-card dl { margin: 0; padding: 7px 11px 9px; }
.source-card dl > div { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 8px; padding: 5px 0; border-bottom: 1px dashed #e8ece9; }
.source-card dl > div:last-child { border-bottom: 0; }
.source-card dt { color: #99a29c; font-size: 9px; font-weight: 750; }
.source-card dd { margin: 0; overflow: hidden; color: #56635b; font-size: 10px; font-weight: 700; text-overflow: ellipsis; }

.financial-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-bottom: 12px; }
.financial-summary > div { min-width: 0; padding: 9px 10px; border: 1px solid #e8ede9; border-radius: 10px; background: #fff; }
.financial-summary span { display: block; color: #939d97; font-size: 8px; font-weight: 850; letter-spacing: .04em; text-transform: uppercase; }
.financial-summary strong { display: block; margin-top: 2px; overflow: hidden; color: #45534a; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }

.ledger-block { margin-top: 9px; overflow: hidden; border: 1px solid #e6ebe7; border-radius: 11px; }
.ledger-block > header strong { min-width: 20px; height: 20px; display: grid; place-items: center; border-radius: 8px; background: #f1f5f2; color: #698073; font-size: 9px; }
.ledger-list { max-height: 160px; overflow: auto; }
.payments-list { max-height: 210px; }
.ledger-row { min-height: 44px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 9px; align-items: center; padding: 6px 10px; border-bottom: 1px solid #eef1ef; }
.ledger-row:last-child { border-bottom: 0; }
.ledger-row > div { min-width: 0; }
.ledger-row strong { display: block; overflow: hidden; color: #48564d; font-size: 9.5px; font-weight: 780; text-overflow: ellipsis; white-space: nowrap; }
.ledger-row span { display: block; margin-top: 2px; overflow: hidden; color: #9aa39d; font-size: 8.5px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.ledger-row b { color: #5c6b61; font-size: 10px; white-space: nowrap; }
.payment-row b { color: #4f805c; }
.ledger-empty { min-height: 54px; display: grid; place-items: center; color: #a0a9a3; font-size: 9px; font-weight: 700; }

@media (max-width: 1180px) {
  .student-side__header { align-items: stretch; flex-direction: column; }
  .keep-button { align-self: flex-start; }
}
</style>
