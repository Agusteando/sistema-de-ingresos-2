<template>
  <ClientOnly><ControlEscolarPage /></ClientOnly>
</template>

<script setup>
// Dev-only route protected by auth.global.ts. Browser fixtures provide synthetic API data.
import ControlEscolarPage from '~/pages/control-escolar.vue'
useCookie('auth_email').value = 'visual@example.invalid'
useCookie('auth_name').value = 'Visual fixture'
useCookie('auth_role').value = 'superadmin,role_ctrl'
useCookie('auth_planteles').value = 'PT,SM'
useCookie('auth_active_plantel').value = 'PT'
useCookie('auth_has_control_escolar').value = 'true'
useState('globalState', () => ({ ciclo: '2026' })).value = { ciclo: '2026' }
</script>
