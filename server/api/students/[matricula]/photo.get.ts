## server/api/students/[matricula]/photo.get.ts

// Deprecated: Photo lookups are now handled directly by the client
// against the external endpoint to minimize serverless function overhead.
export default defineEventHandler(() => {
  return { photoUrl: null }
})