<template>
  <img :src="resolvedSrc" :alt="altText" class="user-avatar" loading="lazy">
</template>

<script setup>
const props = defineProps({
  user: { type: Object, required: true },
  size: { type: String, default: 'md' }
})

const displayName = computed(() => props.user?.workspaceName || props.user?.displayName || props.user?.username || props.user?.email || 'Usuario')
const resolvedSrc = computed(() => {
  if (props.user?.workspaceAvatar || props.user?.avatar || props.user?.picture) return props.user.workspaceAvatar || props.user.avatar || props.user.picture
  const params = new URLSearchParams({ email: props.user?.email || '', name: displayName.value })
  return `/api/directory/photo?${params.toString()}`
})
const altText = computed(() => displayName.value)
</script>

<style scoped>
.user-avatar {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  object-fit: cover;
  background: #e5eef4;
  border: 1px solid rgba(15, 23, 42, 0.08);
  flex: none;
}
</style>
