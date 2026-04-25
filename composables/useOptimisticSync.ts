import { ref } from 'vue'

export const globalSyncState = ref<'idle'|'pending'|'synced'|'failed'>('idle')
export const globalSyncMessage = ref('')

export function useOptimisticSync() {
  const executeOptimistic = async <T>(
    action: () => Promise<T>,
    optimisticCommit: () => void,
    rollback: () => void,
    messages: { pending?: string, success?: string, error?: string } = {}
  ): Promise<T> => {
    optimisticCommit()
    globalSyncState.value = 'pending'
    globalSyncMessage.value = messages.pending || 'Procesando...'
    
    try {
      const result = await action()
      globalSyncState.value = 'synced'
      globalSyncMessage.value = messages.success || 'Guardado exitosamente'
      setTimeout(() => { if (globalSyncState.value === 'synced') globalSyncState.value = 'idle' }, 2500)
      return result
    } catch (e) {
      rollback()
      globalSyncState.value = 'failed'
      globalSyncMessage.value = messages.error || 'Error en la operación'
      setTimeout(() => { if (globalSyncState.value === 'failed') globalSyncState.value = 'idle' }, 4000)
      throw e
    }
  }

  return { executeOptimistic }
}