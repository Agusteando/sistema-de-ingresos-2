<template>
  <div class="bg-white min-h-screen p-10 font-sans text-neutral-ink print:p-0 relative">
    <div class="max-w-[850px] mx-auto mb-6 print:hidden flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
      <button class="btn btn-ghost" @click="closeWindow">Volver</button>
      <button class="btn btn-primary" @click="triggerPrint"><LucidePrinter :size="16" /> Imprimir carta</button>
    </div>

    <div class="max-w-[850px] mx-auto border border-gray-200 p-10 rounded-2xl print:border-none print:p-5 relative bg-white min-h-[900px] flex flex-col">
      <div class="text-center mb-10">
        <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="Logo Institucional" class="h-[80px] object-contain inline-block" />
        <h2 class="mt-4 text-[14px] font-bold tracking-widest uppercase text-gray-900">Instituto Educativo para el Desarrollo Integral del Saber SC</h2>
      </div>

      <div class="text-right text-[14px] mb-12 font-medium text-gray-800">
        {{ student?.plantel || 'Plantel' }}, Méx., a {{ day }} de {{ month }} de {{ year }}
      </div>

      <div class="text-[14px] mb-8 font-bold text-gray-900">
        Estimado Señor Padre de: {{ student?.nombreCompleto || '___________________________' }}
      </div>

      <div class="text-[14px] text-justify leading-relaxed mb-16 flex-1 text-gray-800">
        Por medio de la presente, el Comité de Becas del Instituto le informa que, habiendo analizado su solicitud de beca y el desempeño académico del alumno(a), se ha determinado otorgar una Beca Institucional consistente en un descuento aplicable a las colegiaturas del ciclo escolar en curso. Le recordamos que para conservar este beneficio, el alumno deberá mantener el promedio mínimo requerido, observar buena conducta y no presentar adeudos.
      </div>

      <div class="text-center text-[14px] mt-auto text-gray-900">
        <div class="mb-10 font-bold uppercase tracking-wider">Atentamente</div>
        <div class="mb-10 italic font-medium">“Compartimos contigo la formación integral de tus hijos”</div>
        <div class="font-bold uppercase tracking-wider">- Comité de Becas</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { LucidePrinter } from 'lucide-vue-next'

definePageMeta({ layout: false })

const route = useRoute()
const student = ref(null)
const day = ref('')
const month = ref('')
const year = ref('')

onMounted(async () => {
  const m = route.query.matricula
  if (m) {
    try {
      student.value = await $fetch(`/api/students/${m}/info`)
    } catch(e) {}
  }
  const d = new Date()
  day.value = d.getDate()
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  month.value = months[d.getMonth()]
  year.value = d.getFullYear()
  
  setTimeout(() => window.print(), 800)
})

const closeWindow = () => window.close()
const triggerPrint = () => window.print()
</script>

<style scoped>
@media print {
  @page { margin: 1cm; size: letter portrait; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white; }
}
</style>