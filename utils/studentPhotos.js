import { $fetch } from 'ofetch'
import { normalizeStudentMatricula, photoStorageKey } from '~/shared/utils/studentPresentation'

// Row and detail consumers share requests. Only visible rows ask for photos.
const requests = new Map()
const queue = []
let active = 0
const MISSING_PHOTO_TTL = 5 * 60 * 1000

export function readStudentPhoto(matricula) {
  if (!import.meta.client) return undefined
  try {
    const key = photoStorageKey(normalizeStudentMatricula(matricula))
    const value = sessionStorage.getItem(key)
    if (!value) return undefined
    if (value !== 'none') return value
    const checked = Number(sessionStorage.getItem(`${key}_checked`))
    return checked && Date.now() - checked < MISSING_PHOTO_TTL ? null : undefined
  } catch { return undefined }
}

function rememberPhoto(matricula, photo) {
  try {
    const key = photoStorageKey(matricula)
    sessionStorage.setItem(key, photo || 'none')
    sessionStorage.setItem(`${key}_checked`, String(Date.now()))
  } catch { /* Private mode or full storage must not prevent rendering. */ }
}

function drain() {
  while (active < 3 && queue.length) {
    active++
    const job = queue.shift()
    job().finally(() => { active--; drain() })
  }
}

export function loadStudentPhoto(value) {
  const matricula = normalizeStudentMatricula(value)
  if (!import.meta.client || !matricula) return Promise.resolve(null)
  const cached = readStudentPhoto(matricula)
  if (cached !== undefined) return Promise.resolve(cached)
  if (requests.has(matricula)) return requests.get(matricula)
  const request = new Promise((resolve, reject) => {
    queue.push(async () => {
      try {
        const cached = readStudentPhoto(matricula)
        if (cached !== undefined) { resolve(cached); return }
        const result = await $fetch(`/api/students/${encodeURIComponent(matricula)}/photo`, {
          params: { format: 'json' }, timeout: 12000, retry: 0
        })
        const photo = result?.photoUrl && result.photoUrl !== 'none' ? result.photoUrl : null
        rememberPhoto(matricula, photo)
        resolve(photo)
      } catch (error) {
        if (error?.statusCode === 404 || error?.response?.status === 404) {
          rememberPhoto(matricula, null)
          resolve(null)
        } else reject(error)
      }
    })
  }).finally(() => requests.delete(matricula))
  requests.set(matricula, request)
  drain()
  return request
}
