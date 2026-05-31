import { decodeNoAdeudoToken } from '../../../utils/noAdeudo'
import { escapeHtml } from '../../../utils/cobranzaEmail'

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })
}

export default defineEventHandler(async (event) => {
  const token = String(event.context.params?.token || '')
  const { payload, verificationHash } = decodeNoAdeudoToken(token)
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Validación Carta de No Adeudo</title><style>
    body{margin:0;background:#f8fbf8;color:#15233c;font-family:Inter,Arial,sans-serif;}
    main{max-width:760px;margin:0 auto;padding:32px 18px;}
    .card{border:1px solid #dfe8df;border-radius:24px;background:#fff;box-shadow:0 22px 55px rgba(21,35,60,.08);overflow:hidden;}
    header{background:linear-gradient(135deg,#2f7d38,#5cad4d);color:#fff;padding:24px 28px;}
    header small{display:block;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.85;}
    header h1{margin:8px 0 0;font-size:25px;line-height:1.1;}
    section{padding:24px 28px;}
    .status{display:inline-flex;align-items:center;border-radius:999px;background:#eaf8e7;color:#2f7d38;padding:8px 12px;font-size:13px;font-weight:850;}
    .status.preview{background:#fff3df;color:#9a5b12;}
    dl{display:grid;grid-template-columns:170px minmax(0,1fr);gap:12px 18px;margin:24px 0 0;}
    dt{color:#64748b;font-size:12px;font-weight:850;text-transform:uppercase;letter-spacing:.05em;}
    dd{margin:0;font-weight:760;word-break:break-word;}
    footer{border-top:1px solid #e5ece5;padding:18px 28px;color:#64748b;font-size:12px;line-height:1.5;}
    @media(max-width:640px){dl{grid-template-columns:1fr;}section,header,footer{padding-inline:20px;}}
  </style></head><body><main><article class="card"><header><small>Aurora · IECS / IEDIS</small><h1>Validación de Carta de No Adeudo</h1></header><section>
    <span class="status${payload.pv ? ' preview' : ''}">${payload.pv ? 'Previsualización firmada' : 'Documento firmado válido'}</span>
    <dl>
      <dt>Alumno(a)</dt><dd>${escapeHtml(payload.n)}</dd>
      <dt>Matrícula</dt><dd>${escapeHtml(payload.m)}</dd>
      <dt>Ciclo escolar</dt><dd>${escapeHtml(payload.c)}</dd>
      <dt>Plantel</dt><dd>${escapeHtml(payload.p || 'No registrado')}</dd>
      <dt>Nivel / grado / grupo</dt><dd>${escapeHtml(payload.gg || 'No registrado')}</dd>
      <dt>Generado por</dt><dd>${escapeHtml(payload.by || 'Sistema Aurora')}</dd>
      <dt>Correo generador</dt><dd>${escapeHtml(payload.be || 'No disponible')}</dd>
      <dt>Fecha de emisión</dt><dd>${escapeHtml(formatDate(payload.at))}</dd>
      <dt>Folio criptográfico</dt><dd>${escapeHtml(payload.f)}</dd>
      <dt>Hash de verificación</dt><dd>${escapeHtml(verificationHash.toUpperCase())}</dd>
    </dl>
  </section><footer>La validación confirma que el QR fue firmado por Aurora. Compare estos datos contra el PDF impreso o digital; si no coinciden, no acepte el documento.</footer></article></main></body></html>`
})
