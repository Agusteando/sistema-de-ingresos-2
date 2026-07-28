import { PLANTELES_LIST } from '../../../utils/constants'
import { authCookieOptions } from '../../utils/auth-cookie-options'
import { setAuthSessionToken } from '../../utils/auth-session-token'
import {
  CONTROL_ESCOLAR_ROLE,
  hasControlEscolarRole,
  hasFinancialAccessForPlantel,
  isSuperAdminRole,
  normalizeAuthRole,
  normalizePlantel,
  parsePlanteles
} from '../../utils/auth-session'
import { findExternalAuthUserByEmail } from '../../utils/external-users'
import { clearImpersonationCookies } from '../../utils/impersonation-session'
import { isLocalSystemRuntime, requestLocalSystemManager } from '../../utils/local-system-manager'

const SEEDED_SUPERADMIN_EMAILS = new Set([
  'desarrollo.tecnologico@casitaiedis.edu.mx',
  'coord.admon@casitaiedis.edu.mx'
])
const consumedNonces = new Map<string, number>()


type LocalManagerStatus = {
  current?: { sha?: string; version?: string } | null
  available?: { sha?: string; version?: string } | null
  updateAvailable?: boolean
  operation?: {
    running?: boolean
    phase?: string
    message?: string
    error?: string
  } | null
}

const safeScriptValue = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

const renderUpdateProgressPage = (event: any, options: {
  destination: string
  initialSha: string
  targetSha: string
  initialState: 'started' | 'running' | 'failed'
  initialError?: string
}) => {
  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Expires', '0')

  const config = {
    destination: options.destination,
    initialSha: options.initialSha,
    targetSha: options.targetSha,
    initialState: options.initialState,
    initialError: options.initialError || ''
  }

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Actualizando Aurora</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f6f8; color: #172033; }
    * { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; margin: 0; }
    body { display: grid; min-height: 100vh; place-items: center; padding: 24px; background: #f5f6f8; }
    main { width: min(420px, 100%); text-align: center; }
    .mark { display: grid; width: 52px; height: 52px; margin: 0 auto 22px; place-items: center; border: 1px solid #d8dde7; border-radius: 16px; background: #fff; }
    .spinner { width: 22px; height: 22px; border: 2px solid #d7dce6; border-top-color: #3157d5; border-radius: 999px; animation: spin .8s linear infinite; }
    .mark.is-ready .spinner { animation: none; border: 0; }
    .mark.is-ready .spinner::before { content: "✓"; display: block; color: #18794e; font-size: 24px; line-height: 22px; }
    .mark.is-error .spinner { animation: none; border: 0; }
    .mark.is-error .spinner::before { content: "!"; display: block; color: #b42318; font-size: 24px; font-weight: 700; line-height: 22px; }
    h1 { margin: 0; font-size: clamp(24px, 5vw, 31px); line-height: 1.15; letter-spacing: -.035em; font-weight: 700; }
    p { margin: 11px 0 0; color: #657086; font-size: 15px; line-height: 1.5; }
    .actions { display: none; justify-content: center; gap: 10px; margin-top: 24px; }
    .actions.is-visible { display: flex; }
    button, a { appearance: none; min-height: 40px; padding: 0 15px; border: 1px solid #cfd5df; border-radius: 10px; background: #fff; color: #172033; font: inherit; font-size: 14px; font-weight: 650; text-decoration: none; cursor: pointer; }
    button.primary { border-color: #3157d5; background: #3157d5; color: #fff; }
    button:disabled { cursor: wait; opacity: .6; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-color-scheme: dark) {
      :root { color-scheme: dark; background: #10131a; color: #f2f4f8; }
      body { background: #10131a; }
      .mark, button, a { border-color: #343b48; background: #171b24; color: #f2f4f8; }
      p { color: #9ba5b7; }
      .spinner { border-color: #3b4350; border-top-color: #8fa7ff; }
      button.primary { border-color: #7891ee; background: #7891ee; color: #10131a; }
    }
  </style>
</head>
<body>
  <main aria-live="polite">
    <div id="mark" class="mark"><span class="spinner" aria-hidden="true"></span></div>
    <h1 id="title">Preparando actualización…</h1>
    <p id="message">Aurora se abrirá cuando la versión más reciente esté lista.</p>
    <div id="actions" class="actions">
      <button id="retry" class="primary" type="button">Reintentar</button>
      <a id="continue" href="${options.destination}">Abrir versión actual</a>
    </div>
  </main>
  <script>
    (() => {
      const config = ${safeScriptValue(config)};
      const mark = document.getElementById('mark');
      const title = document.getElementById('title');
      const message = document.getElementById('message');
      const actions = document.getElementById('actions');
      const retry = document.getElementById('retry');
      const continueLink = document.getElementById('continue');
      let stopped = false;
      let startedAt = Date.now();
      let failures = 0;

      const notifyOpener = (status, detail = {}) => {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: 'aurora-local-update', status, ...detail }, '*');
          }
        } catch {}
      };

      const setPreparing = () => {
        mark.className = 'mark';
        title.textContent = 'Preparando actualización…';
        message.textContent = 'Aurora se abrirá cuando la versión más reciente esté lista.';
        actions.classList.remove('is-visible');
        notifyOpener('started');
      };

      const openUpdatedVersion = (sha) => {
        if (stopped) return;
        stopped = true;
        mark.className = 'mark is-ready';
        title.textContent = 'Actualización lista';
        message.textContent = 'Abriendo Aurora…';
        notifyOpener('ready', { sha: sha || '' });
        const url = new URL(config.destination, window.location.origin);
        url.searchParams.set('_release', sha || String(Date.now()));
        window.setTimeout(() => window.location.replace(url.toString()), 550);
      };

      const showFailure = (detail) => {
        if (stopped) return;
        stopped = true;
        mark.className = 'mark is-error';
        title.textContent = 'No se pudo actualizar';
        message.textContent = detail || 'La versión anterior continúa disponible.';
        actions.classList.add('is-visible');
        notifyOpener('failed', { message: message.textContent });
      };

      const operationFailed = (operation) => String(operation?.phase || '').toLowerCase() === 'failed';

      const poll = async () => {
        if (stopped) return;
        try {
          const response = await fetch('/api/system/local-status?_=' + Date.now(), {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
          });
          if (!response.ok) throw new Error('status-' + response.status);
          const status = await response.json();
          failures = 0;
          const operation = status?.operation || {};
          const currentSha = String(status?.current?.sha || '');
          const availableSha = String(status?.available?.sha || '');
          const targetSha = String(config.targetSha || availableSha || '');
          const changedRelease = Boolean(currentSha && config.initialSha && currentSha !== config.initialSha);
          const reachedTarget = Boolean(currentSha && targetSha && currentSha === targetSha);
          const completedWithoutChange = Boolean(
            !operation.running
            && !status?.updateAvailable
            && ['success', 'current'].includes(String(operation.phase || '').toLowerCase())
          );

          if (changedRelease || reachedTarget || completedWithoutChange) {
            openUpdatedVersion(currentSha || targetSha);
            return;
          }

          if (!operation.running && operationFailed(operation)) {
            showFailure(String(operation.error || operation.message || 'La actualización no pudo completarse.'));
            return;
          }

          if (Date.now() - startedAt > 25 * 60 * 1000) {
            showFailure('La actualización está tardando más de lo esperado.');
            return;
          }
        } catch (error) {
          // A short connection interruption is expected while the local runner is
          // replaced. Keep polling until the new release answers.
          failures += 1;
          if (failures > 120 && Date.now() - startedAt > 10 * 60 * 1000) {
            showFailure('No fue posible confirmar la nueva versión.');
            return;
          }
        }
        window.setTimeout(poll, 1800);
      };

      retry.addEventListener('click', async () => {
        retry.disabled = true;
        stopped = false;
        failures = 0;
        startedAt = Date.now();
        setPreparing();
        try {
          const response = await fetch('/api/system/local-update', {
            method: 'POST',
            headers: { Accept: 'application/json' }
          });
          if (!response.ok && response.status !== 409) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload?.message || 'No se pudo iniciar la actualización.');
          }
          window.setTimeout(poll, 500);
        } catch (error) {
          showFailure(error?.message || 'No se pudo iniciar la actualización.');
        } finally {
          retry.disabled = false;
        }
      });

      continueLink.addEventListener('click', () => { stopped = true; });

      if (config.initialState === 'failed') {
        showFailure(config.initialError || 'No se pudo iniciar la actualización.');
      } else {
        setPreparing();
        window.setTimeout(poll, 450);
      }
    })();
  </script>
</body>
</html>`
}

const consumeNonce = (nonce: string, expiresAt: number) => {
  const now = Math.floor(Date.now() / 1000)
  for (const [key, expiry] of consumedNonces.entries()) {
    if (expiry < now) consumedNonces.delete(key)
  }
  if (consumedNonces.has(nonce)) {
    throw createError({ statusCode: 401, message: 'Este acceso a Sistema Rápido ya fue utilizado.' })
  }
  consumedNonces.set(nonce, expiresAt)
}

export default defineEventHandler(async (event) => {
  if (!isLocalSystemRuntime()) {
    throw createError({ statusCode: 404, message: 'Esta ruta solo está disponible en Sistema Rápido.' })
  }

  const query = getQuery(event)
  const ticket = String(query.ticket || '').trim()
  const intent = String(query.intent || '').trim().toLowerCase()
  if (!ticket) throw createError({ statusCode: 401, message: 'El acceso a Sistema Rápido no es válido.' })
  const payload = await requestLocalSystemManager<{ email: string; plantel: string; nonce: string; exp: number }>(`/handoff/consume?ticket=${encodeURIComponent(ticket)}`)

  const config = useRuntimeConfig()
  const localPlantel = normalizePlantel(process.env.LOCAL_SYSTEM_PLANTEL || process.env.AGENT_ID || config.localSystemPlantel)
  if (!localPlantel || localPlantel !== normalizePlantel(payload.plantel)) {
    throw createError({ statusCode: 403, message: 'El acceso fue emitido para otro plantel.' })
  }

  const email = String(payload.email || '').trim().toLowerCase()
  const seededSuperAdmin = SEEDED_SUPERADMIN_EMAILS.has(email)
  const centralUser = await findExternalAuthUserByEmail(email)

  if (!centralUser && !seededSuperAdmin) {
    throw createError({ statusCode: 403, message: 'La cuenta ya no tiene acceso al sistema.' })
  }
  if (!seededSuperAdmin && (centralUser?.ingresosBlocked || Number(centralUser?.ingresos_blocked || 0) === 1)) {
    throw createError({ statusCode: 403, message: 'La cuenta está bloqueada.' })
  }

  const role = seededSuperAdmin ? 'superadmin' : normalizeAuthRole(centralUser?.role || CONTROL_ESCOLAR_ROLE)
  const superAdmin = isSuperAdminRole(role)
  const assignedPlanteles = superAdmin ? [...PLANTELES_LIST] : parsePlanteles(centralUser?.plantel)
  if (!superAdmin && !assignedPlanteles.includes(localPlantel)) {
    throw createError({ statusCode: 403, message: 'La cuenta no tiene acceso a este plantel.' })
  }

  const controlAccess = superAdmin || hasControlEscolarRole(role)
  const financialAccess = hasFinancialAccessForPlantel(role, assignedPlanteles, localPlantel)
  const financialPlanteles = superAdmin
    ? [...PLANTELES_LIST]
    : assignedPlanteles.filter((plantel) => hasFinancialAccessForPlantel(role, assignedPlanteles, plantel))
  const name = String(centralUser?.displayName || centralUser?.username || email)
  const opts = authCookieOptions()

  consumeNonce(payload.nonce, payload.exp)
  clearImpersonationCookies(event)
  setCookie(event, 'auth_email', email, opts)
  setCookie(event, 'auth_name', name, opts)
  setCookie(event, 'auth_role', role, opts)
  setCookie(event, 'auth_planteles', assignedPlanteles.join(','), opts)
  setCookie(event, 'auth_active_plantel', localPlantel, opts)
  setCookie(event, 'auth_home_plantel', localPlantel, opts)
  setCookie(event, 'auth_financial_planteles', financialPlanteles.join(','), opts)
  setCookie(event, 'auth_nav_mode', financialAccess ? 'financial' : 'control-escolar', opts)
  setCookie(event, 'auth_has_control_escolar', controlAccess ? 'true' : 'false', opts)
  setCookie(event, 'auth_has_financial_access', financialAccess ? 'true' : 'false', opts)
  setCookie(event, 'db_bridge_agent_id', localPlantel, opts)
  setAuthSessionToken(event, {
    email,
    name,
    role,
    planteles: assignedPlanteles.join(','),
    activePlantel: localPlantel,
    homePlantel: localPlantel
  })
  deleteCookie(event, 'auth_is_super_admin', { path: '/' })

  const destination = financialAccess ? '/' : '/control-escolar'
  if (intent !== 'update') {
    return sendRedirect(event, destination, 302)
  }

  let managerStatus: LocalManagerStatus | null = null
  try {
    managerStatus = await requestLocalSystemManager<LocalManagerStatus>('/status', { refresh: true })
  } catch {
    // The update request below is authoritative. The progress page can recover
    // its status after the manager or local runner becomes reachable again.
  }

  let updateState: 'started' | 'running' | 'failed' = 'started'
  let updateError = ''
  try {
    await requestLocalSystemManager('/update', { method: 'POST' })
  } catch (error: any) {
    // A second click while an update is already running is a valid continuation.
    updateState = Number(error?.statusCode || error?.status || 0) === 409
      ? 'running'
      : 'failed'
    updateError = String(error?.message || 'No se pudo iniciar la actualización local.')
    console.error(`[LocalUpdateHandoff] ${JSON.stringify({
      email,
      plantel: localPlantel,
      state: updateState,
      message: updateError
    })}`)
  }

  // Do not redirect into the currently active (and therefore old) Aurora
  // release. Keep this lightweight document alive across the runner restart and
  // enter the application only after the manager reports the new SHA as active.
  return renderUpdateProgressPage(event, {
    destination,
    initialSha: String(managerStatus?.current?.sha || ''),
    targetSha: String(managerStatus?.available?.sha || ''),
    initialState: updateState,
    initialError: updateError
  })
})
