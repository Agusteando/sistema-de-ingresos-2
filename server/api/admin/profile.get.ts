import { getAdminProfilePhoto } from '../../utils/googleAdmin'

export default defineEventHandler(async () => {
  const photoUrl = await getAdminProfilePhoto()
  return { photoUrl }
})