import { proxyCfdiEvent } from './cfdi-proxy'

export const proxyCfdiCompatEvent = async (
  event: any,
  targetPath: string,
  options: { body?: unknown } = {},
) => {
  if (!targetPath) throw createError({ statusCode: 400, message: 'Ruta CFDI requerida' })
  return proxyCfdiEvent(event, targetPath, options)
}
