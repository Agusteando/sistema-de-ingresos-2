import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

const WORKSPACE_LIST_DESIGN_WIDTH = 920
const WORKSPACE_DETAIL_DESIGN_WIDTH = 1380
const WORKSPACE_MIN_SCALE = 0.72
const WORKSPACE_MIN_DESIGN_HEIGHT = 420

export const useStudentsWorkspaceScale = (hasAccountWorkspace: Ref<boolean>) => {
  const studentsScaleShell = ref<HTMLElement | null>(null)
  const workspaceScale = ref(1)
  const workspaceCanvasWidth = ref(WORKSPACE_LIST_DESIGN_WIDTH)
  const workspaceCanvasHeight = ref(WORKSPACE_MIN_DESIGN_HEIGHT)

  const baseWorkspaceDesignWidth = computed(() => hasAccountWorkspace.value ? WORKSPACE_DETAIL_DESIGN_WIDTH : WORKSPACE_LIST_DESIGN_WIDTH)
  const workspaceDesignWidth = computed(() => Math.max(baseWorkspaceDesignWidth.value, workspaceCanvasWidth.value))

  const studentsScaleShellStyle = computed(() => ({
    '--workspace-scale': workspaceScale.value
  }))

  const studentsDesignCanvasStyle = computed(() => ({
    '--workspace-design-width': `${workspaceDesignWidth.value}px`,
    '--workspace-design-height': `${workspaceCanvasHeight.value}px`,
    '--workspace-scale': workspaceScale.value
  }))

  let resizeObserver: ResizeObserver | null = null
  let frame: number | null = null

  const updateWorkspaceScale = () => {
    if (typeof window === 'undefined') return

    const shell = studentsScaleShell.value
    const rect = shell?.getBoundingClientRect?.()
    const shellTop = rect?.top || 0
    const shellWidth = Math.max(320, rect?.width || shell?.clientWidth || baseWorkspaceDesignWidth.value)
    const shellHeight = Math.max(
      WORKSPACE_MIN_DESIGN_HEIGHT,
      rect?.height || shell?.clientHeight || window.innerHeight - shellTop - 10
    )

    const widthScale = shellWidth / baseWorkspaceDesignWidth.value
    const nextScale = Math.min(1, Math.max(WORKSPACE_MIN_SCALE, widthScale))

    workspaceScale.value = Number(nextScale.toFixed(4))
    workspaceCanvasWidth.value = Math.max(baseWorkspaceDesignWidth.value, Math.ceil(shellWidth / workspaceScale.value))
    workspaceCanvasHeight.value = Math.max(WORKSPACE_MIN_DESIGN_HEIGHT, Math.floor(shellHeight / workspaceScale.value))
  }

  const scheduleWorkspaceScaleUpdate = () => nextTick(() => {
    if (typeof window === 'undefined') return
    if (frame) window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(updateWorkspaceScale)
  })

  onMounted(() => {
    scheduleWorkspaceScaleUpdate()
    if (typeof window === 'undefined') return
    window.addEventListener('resize', scheduleWorkspaceScaleUpdate, { passive: true })
    if (typeof ResizeObserver !== 'undefined' && studentsScaleShell.value) {
      resizeObserver = new ResizeObserver(scheduleWorkspaceScaleUpdate)
      resizeObserver.observe(studentsScaleShell.value)
    }
  })

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', scheduleWorkspaceScaleUpdate)
      if (frame) window.cancelAnimationFrame(frame)
    }
    resizeObserver?.disconnect?.()
  })

  watch(hasAccountWorkspace, scheduleWorkspaceScaleUpdate)

  return {
    studentsScaleShell,
    studentsScaleShellStyle,
    studentsDesignCanvasStyle,
    scheduleWorkspaceScaleUpdate
  }
}
