<template>
  <div class="dashboard-wrapper">
    <h2>Análisis y Reportes</h2>
    <p style="color: var(--text-muted); margin-bottom: 2rem;">Migrado de la pestaña de Análisis del sistema Legacy.</p>
    
    <div class="card" style="padding: 2rem; text-align: center;">
      <LucidePieChart size="48" style="color: var(--primary); margin-bottom: 1rem;" />
      <h3>Módulo de Reportes en desarrollo</h3>
      <p>La estructura base MySQL permite conexión directa con herramientas BI, o la adición del visor de tabla dinámica como en la versión anterior.</p>
      <NuxtLink to="/">
        <button class="btn btn-primary" style="margin-top: 1rem;">Volver a Control de Pagos</button>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup>
import { LucidePieChart } from 'lucide-vue-next'
</script>