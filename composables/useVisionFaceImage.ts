import { ref, watch } from 'vue'
import { processFaceImage } from '~/shared/utils/visionFaceProcessor'

type VisionFaceResult = Awaited<ReturnType<typeof processFaceImage>>

const memoryCache = new Map<string, VisionFaceResult>()
const pendingRequests = new Map<string, Promise<VisionFaceResult>>()

const hashUrl = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

const sessionKeyFor = (imageUrl: string) => `vision-face:${hashUrl(imageUrl)}`

const scheduleVisionWork = () => new Promise<void>((resolve) => {
  if (!process.client) {
    resolve()
    return
  }

  const callback = () => resolve()
  const requestIdle = (window as any).requestIdleCallback
  if (typeof requestIdle === 'function') {
    requestIdle(callback, { timeout: 450 })
    return
  }

  window.setTimeout(callback, 0)
})

const readSessionCache = (imageUrl: string): VisionFaceResult | null => {
  if (!process.client) return null
  try {
    const cached = sessionStorage.getItem(sessionKeyFor(imageUrl))
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

const writeSessionCache = (imageUrl: string, result: VisionFaceResult) => {
  if (!process.client) return
  try {
    sessionStorage.setItem(sessionKeyFor(imageUrl), JSON.stringify(result))
  } catch {}
}

const resolveVisionFace = async (imageUrl: string) => {
  const memoryResult = memoryCache.get(imageUrl)
  if (memoryResult) return memoryResult

  const sessionResult = readSessionCache(imageUrl)
  if (sessionResult?.src) {
    memoryCache.set(imageUrl, sessionResult)
    return sessionResult
  }

  let request = pendingRequests.get(imageUrl)
  if (!request) {
    request = scheduleVisionWork()
      .then(() => processFaceImage(imageUrl))
      .then((result) => {
        memoryCache.set(imageUrl, result)
        writeSessionCache(imageUrl, result)
        return result
      })
      .finally(() => pendingRequests.delete(imageUrl))
    pendingRequests.set(imageUrl, request)
  }

  return request
}

export const useVisionFaceImage = (imageUrlSource: () => string | null | undefined) => {
  const processedSrc = ref<string | null>(null)
  const rawVisionData = ref<Record<string, any> | null>(null)
  const isProcessing = ref(false)
  const error = ref<Error | null>(null)

  watch(imageUrlSource, async (nextUrl, _previousUrl, onCleanup) => {
    const imageUrl = String(nextUrl || '').trim()
    let cancelled = false
    onCleanup(() => { cancelled = true })

    processedSrc.value = null
    rawVisionData.value = null
    error.value = null

    if (!imageUrl || !process.client) {
      isProcessing.value = false
      return
    }

    const cached = memoryCache.get(imageUrl) || readSessionCache(imageUrl)
    if (cached?.src) {
      memoryCache.set(imageUrl, cached)
      processedSrc.value = cached.src
      rawVisionData.value = cached.rawVisionData || null
      isProcessing.value = false
      return
    }

    const currentUrl = imageUrl
    isProcessing.value = true

    try {
      const result = await resolveVisionFace(currentUrl)
      if (cancelled || String(imageUrlSource() || '').trim() !== currentUrl) return
      processedSrc.value = result.src
      rawVisionData.value = result.rawVisionData || null
    } catch (reason: any) {
      if (cancelled || String(imageUrlSource() || '').trim() !== currentUrl) return
      error.value = reason instanceof Error ? reason : new Error('Vision face processing failed')
      processedSrc.value = null
      rawVisionData.value = null
    } finally {
      if (!cancelled && String(imageUrlSource() || '').trim() === currentUrl) {
        isProcessing.value = false
      }
    }
  }, { immediate: true })

  return {
    processedSrc,
    rawVisionData,
    isProcessing,
    error
  }
}
