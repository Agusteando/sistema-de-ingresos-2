import { proxyCfdiCompatEvent } from '../utils/cfdi-compat'

export default defineEventHandler(async (event) => proxyCfdiCompatEvent(event, 'getCompanyData'))
