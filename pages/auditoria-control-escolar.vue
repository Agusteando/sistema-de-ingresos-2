<template>
  <div class="control-audit-page"><FieldChangeMatrix /></div>
</template>

<script setup>
import FieldChangeMatrix from '~/components/control-escolar/FieldChangeMatrix.vue'
</script>

<style scoped>
.control-audit-page{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0}
.control-audit-page>.change-workspace{flex:1;min-height:0}
</style>
