import { proxyCfdiEvent } from '../utils/cfdi-proxy'

export default defineEventHandler(async (event) => proxyCfdiEvent(event, 'saveCompanyAndGenerate'))
