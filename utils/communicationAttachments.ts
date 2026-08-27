export const COMMUNICATION_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

export const COMMUNICATION_ATTACHMENT_ACCEPT = [
  'image/*',
  '.pdf',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.txt', '.csv', '.rtf',
  '.odt', '.ods', '.odp',
].join(',')

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'heif'])

const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc', 'docx',
  'xls', 'xlsx',
  'ppt', 'pptx',
  'txt', 'csv', 'rtf',
  'odt', 'ods', 'odp',
])


const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
}

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'text/plain',
  'text/csv',
  'text/rtf',
])

export type CommunicationAttachmentLike = {
  name?: string | null
  filename?: string | null
  type?: string | null
}

const extensionOf = (value: unknown) => {
  const name = String(value || '').trim().toLowerCase()
  const match = name.match(/\.([a-z0-9]+)$/i)
  return match?.[1] || ''
}

export const isCommunicationAttachmentImage = (file: CommunicationAttachmentLike | null | undefined) => {
  const type = String(file?.type || '').trim().toLowerCase()
  if (type.startsWith('image/')) return true
  return IMAGE_EXTENSIONS.has(extensionOf(file?.name || file?.filename))
}

export const isSupportedCommunicationAttachment = (file: CommunicationAttachmentLike | null | undefined) => {
  if (!file) return false
  const type = String(file.type || '').trim().toLowerCase()
  if (type.startsWith('image/')) return true
  if (DOCUMENT_MIME_TYPES.has(type)) return true

  const extension = extensionOf(file.name || file.filename)
  return IMAGE_EXTENSIONS.has(extension) || DOCUMENT_EXTENSIONS.has(extension)
}

export const communicationAttachmentKind = (file: CommunicationAttachmentLike | null | undefined) => (
  isCommunicationAttachmentImage(file) ? 'image' : 'document'
)

export const resolveCommunicationAttachmentContentType = (file: CommunicationAttachmentLike | null | undefined) => {
  const type = String(file?.type || '').trim().toLowerCase()
  const extension = extensionOf(file?.name || file?.filename)
  if (type && type !== 'application/octet-stream') return type
  return MIME_BY_EXTENSION[extension] || type || 'application/octet-stream'
}
