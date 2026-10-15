import { controlEscolarCentralQuery } from './control-escolar-central'
import { buildWorkspacePhotoUrl, isCasitaWorkspaceEmail } from './google-workspace-directory'

// Reuse the stored Google login portrait used by Usuarios; Directory is the fallback.
export const cleanAuditAvatar = (value: unknown) => {
  const raw = String(value || '').trim()
  if (/^\/api\/directory\/photo\?/.test(raw)) return raw
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && !url.username && !url.password
      && /(^|\.)(googleusercontent\.com|ggpht\.com|casitaapps\.com|casitaiedis\.edu\.mx|casitaiedis\.edu)$/.test(url.hostname.toLowerCase()) ? raw : ''
  } catch { return '' }
}

export const loadAuditStaffProfiles = async (emails: string[]) => {
  const profiles = new Map<string, {name: string; avatar: string}>()
  const accounts = [...new Set(emails.map(email=>String(email||'').trim().toLowerCase()).filter(isCasitaWorkspaceEmail))]
  if (!accounts.length) return profiles
  try {
    const columns = await controlEscolarCentralQuery<any[]>('SHOW COLUMNS FROM users')
    const actual = columns.map(row=>String(row.Field || ''))
    const field = (names:string[])=>actual.find(value=>names.includes(value.toLowerCase()))
    const emailCol = field(['email'])
    if (!emailCol) return profiles
    const nameCol = field(['displayname','fullname','full_name','nombre'])
    const photoCols = actual.filter(value=>['picture','avatar','avatar_url','photo_url','foto'].includes(value.toLowerCase()))
    const quote = (value:string)=>'`'+value.replace(/`/g,'``')+'`'
    const select = [quote(emailCol)+' AS email', ...(nameCol?[quote(nameCol)+' AS person_name']:[]),
      ...photoCols.map((column,i)=>quote(column)+' AS photo_'+i)]
    for (let start=0;start<accounts.length;start+=200) {
      const batch=accounts.slice(start,start+200)
      const rows = await controlEscolarCentralQuery<any[]>(
        'SELECT '+select.join(', ')+' FROM users WHERE LOWER(TRIM('+quote(emailCol)+')) IN ('+batch.map(()=>'?').join(',')+')', batch)
      for (const row of rows) {
        const email=String(row.email||'').trim().toLowerCase()
        const name=String(row.person_name||'').trim()
        const avatar=photoCols.map((_,i)=>cleanAuditAvatar(row['photo_'+i])).find(Boolean)||''
        const previous=profiles.get(email)
        profiles.set(email,{name:previous?.name||name,avatar:previous?.avatar||avatar})
      }
    }
  } catch(error:any) {
    console.info('[student-change-audit] Actor profile unavailable', {code:String(error?.code||'')})
  }
  for (const email of accounts) {
    const profile=profiles.get(email)||{name:'',avatar:''}
    if (!profile.avatar) profile.avatar=buildWorkspacePhotoUrl(email,profile.name)
    profiles.set(email,profile)
  }
  return profiles
}
