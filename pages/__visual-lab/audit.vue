<template><ClientOnly><FieldChangeMatrix /></ClientOnly></template>
<script setup>
// Existing auth middleware blocks all visual-lab routes outside development.
// Browser harness supplies synthetic API responses; no production session or writes.
import FieldChangeMatrix from '~/components/control-escolar/FieldChangeMatrix.vue'
useCookie('auth_email').value = 'visual@example.invalid'
useCookie('auth_name').value = 'Visual fixture'
useCookie('auth_role').value = 'superadmin,role_ctrl'
useCookie('auth_planteles').value = 'PT,SM'
useCookie('auth_active_plantel').value = 'PT'
useCookie('auth_has_control_escolar').value = 'true'
</script>
