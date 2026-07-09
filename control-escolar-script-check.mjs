
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useCookie, useState } from "#app";
import { useHead } from "#imports";
import {
  LucideAlertTriangle,
  LucideBuilding2,
  LucideCake,
  LucideCheck,
  LucideChevronDown,
  LucideChevronLeft,
  LucideClock3,
  LucideCloudOff,
  LucideComputer,
  LucideChevronRight,
  LucideDatabase,
  LucideDownload,
  LucideFilter,
  LucideFileSpreadsheet,
  LucideFileUp,
  LucideGlobe2,
  LucideGraduationCap,
  LucideKeyRound,
  LucideLoader2,
  LucideMail,
  LucideMoreVertical,
  LucidePhone,
  LucideRefreshCw,
  LucideRotateCcw,
  LucideSave,
  LucideSearch,
  LucideSearchX,
  LucideSend,
  LucideShield,
  LucideShieldCheck,
  LucideUserCheck,
  LucideUserRound,
  LucideUsersRound,
  LucideUpload,
  LucideUserX,
  LucideWifiOff,
  LucideX,
} from "lucide-vue-next";
import UiButton from "~/components/ui/UiButton.vue";
import UiChip from "~/components/ui/UiChip.vue";
import UiGroupIcon from "~/components/ui/UiGroupIcon.vue";
import StudentGradePhotoCard from "~/components/students/StudentGradePhotoCard.vue";
import StudentsKpiValue from "~/components/students/StudentsKpiValue.vue";
import IngresoCycleModal from "~/components/IngresoCycleModal.vue";
import { useToast } from "~/composables/useToast";
import { normalizeCicloKey, formatCicloLabel } from "~/shared/utils/ciclo";
import {
  normalizeEnrollmentConceptIds,
  normalizeEnrollmentPlantelKey,
  normalizeStudentMatricula,
  parseEnrollmentConceptsForPlantelHistory,
  parseEnrollmentConceptsForScope,
  photoStorageKey,
  studentPresentationStyle,
  resolveControlEscolarCompleteness,
  inferMexicanCurpIdentity,
  CONTROL_ESCOLAR_BASIC_REQUIRED_FIELDS,
  CONTROL_ESCOLAR_COMPLETE_REQUIRED_FIELDS,
} from "~/shared/utils/studentPresentation";
import { NIVELES_ESCOLARES, displayGrado, gradeOptionsForNivel } from "~/shared/utils/grado";
import { STUDENT_GROUP_ICON_LABELS, studentGroupIconLabel } from "~/shared/utils/studentGroupIcons";
import { buildParentSiblingSignature } from "~/shared/utils/parentSiblingMatch";
import { isControlEscolarNameField, toNameDisplayCase } from "~/shared/utils/nameCase";
import { normalizeCicloOption } from "~/utils/constants";

useHead({ bodyAttrs: { class: "students-route-active" } });

const { show } = useToast();
const cicloCookie = useCookie("active_ciclo", { maxAge: 31536000 });
const state = useState("globalState", () => ({
  ciclo: normalizeCicloOption(cicloCookie.value),
}));
const activePlantelCookie = useCookie("auth_active_plantel");
const normalizeControlPlantel = (value) => String(value || "").trim().toUpperCase();
const controlSpecificPlantel = (value) => {
  const normalized = normalizeControlPlantel(value);
  return normalized && normalized !== "GLOBAL" ? normalized : "";
};
const readActiveControlPlantelCookie = () => {
  if (process.client && typeof document !== "undefined") {
    const cookie = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("auth_active_plantel="));
    if (cookie) {
      try {
        return controlSpecificPlantel(decodeURIComponent(cookie.split("=").slice(1).join("=")));
      } catch {
        return controlSpecificPlantel(cookie.split("=").slice(1).join("="));
      }
    }
  }

  return controlSpecificPlantel(activePlantelCookie.value);
};
const initialControlPlantel = readActiveControlPlantelCookie();
const externalConcepts = ref([]);
const tipoIngresoConcepts = ref([]);
const ENROLLMENT_CONCEPTS_CACHE_BASE_KEY = "control-escolar-enrollment-concepts:v3";
const CONTROL_STUDENTS_CACHE_VERSION = 2;
const CONTROL_STUDENTS_SCOPE_CACHE_VERSION = 3;
const CONTROL_STUDENTS_CACHE_READ_VERSIONS = [
  CONTROL_STUDENTS_CACHE_VERSION,
  1,
];
const CONTROL_STUDENTS_CACHE_NAMESPACE = "control-escolar:students-cache";
const CONTROL_STUDENTS_SCOPE_CACHE_NAMESPACE = "control-escolar:students-scope-cache";
const CONTROL_STUDENTS_SCOPE_CACHE_INDEX_KEY = `${CONTROL_STUDENTS_SCOPE_CACHE_NAMESPACE}:index:v1`;
const CONTROL_STUDENTS_SCOPE_CACHE_MAX_SCOPES = 8;
const CONTROL_STUDENTS_BROWSER_CACHE_ENABLED = false;
const currentCicloKey = computed(() =>
  normalizeCicloKey(
    normalizeCicloOption(state.value?.ciclo || cicloCookie.value),
  ),
);
const currentCicloLabel = computed(() =>
  formatCicloLabel(currentCicloKey.value),
);
const selectedAgentId = ref(
  initialControlPlantel && initialControlPlantel !== "GLOBAL"
    ? initialControlPlantel
    : "",
);
const controlEscolarTopbarState = useState("controlEscolarTopbarState", () => ({
  plantel: "",
  studentsCount: 0,
  loading: false,
  importing: false,
  syncStatus: "idle",
  syncMessage: "",
}));
const controlEscolarDetailOpen = useState("controlEscolarDetailOpen", () => false);
const currentEnrollmentPlantelKey = computed(() =>
  normalizeEnrollmentPlantelKey(selectedAgentId.value || activePlantelCookie.value || "GLOBAL") || "GLOBAL",
);
const enrollmentConceptsCacheKey = computed(
  () => `${ENROLLMENT_CONCEPTS_CACHE_BASE_KEY}:${currentCicloKey.value}:${currentEnrollmentPlantelKey.value}`,
);
const optionsLoading = ref(false);
const kpisLoading = ref(false);
const studentsLoading = ref(false);
const controlStudentMutationStates = reactive({});
const controlStudentMutationTimers = new Map();
let controlStudentMutationSequence = 0;
const CONTROL_STUDENT_SUCCESS_BADGE_MS = 1400;
const savingStudent = computed(() =>
  selectedStudent.value
    ? controlStudentMutationStatus(selectedStudent.value) === "saving"
    : false,
);
const massImporting = ref(false);
const sendingHuskyPass = ref(false);
const savingHuskyPass = ref(false);
const showManualHuskyPassForm = ref(false);
const manualHuskyPassPassword = ref("");
const activeParentLastNameSuggestion = ref("");
const dismissedParentLastNameSuggestions = ref({});
const loadError = ref("");
const saveError = ref("");
const students = ref([]);
const controlStudentsIndex = ref([]);
const selectedStudent = ref(null);
const kpis = ref(null);
const catalogs = reactive({
  niveles: [],
  grados: [],
  grupos: [],
  gruposPorGrado: {},
});
const DEFAULT_QUICK_FILTER = "inscritos";
const activeQuickFilter = ref(DEFAULT_QUICK_FILTER);
const showAdvancedFilters = ref(false);
const showMassImportModal = ref(false);
const massImportFile = ref(null);
const massImportResult = ref(null);
const massImportError = ref("");
const activeDetailTab = ref("summary");
const editSnapshot = ref("");
const showAcademicPositionModal = ref(false);
const savingAcademicPosition = ref(false);
const uploadingAdvancedField = ref("");
const advancedUploadErrors = reactive({});
const draftRestored = ref(false);
const draftSavedAt = ref("");
const pendingSelectedStudentRefresh = ref(null);
const pagination = reactive({ page: 1, limit: 8, total: 0, pages: 1 });
const filters = reactive({
  search: "",
  status: DEFAULT_QUICK_FILTER,
  quality: "",
  grado: "",
  group: "",
  recent: "",
});
const editForm = reactive({});
const photoCache = ref({});
const photoLoadingKeys = ref(new Set());
let searchTimer = null;
let controlStudentsRequestId = 0;
let controlScopeReloadId = 0;
let controlInitialScopeLoading = true;
let lastControlAuditSnapshotKey = "";
let lastControlAuditSnapshotAt = 0;
const controlStudentPhotoRequests = new Map();
const controlPhotoQueue = [];
const controlPhotoQueuedKeys = new Set();
const controlPhotoActiveKeys = new Set();
let activeControlPhotoLoads = 0;
const controlCacheStage = ref("idle");
const controlBaseStage = ref("idle");
const controlExternalDbStage = ref("idle");
const controlCompleteStage = ref("idle");
const controlDataFreshness = ref("empty");
const controlDataSavedAt = ref("");
const controlDataSource = ref(null);
const controlExternalDbRows = ref(0);
const showControlDiagnosticsModal = ref(false);
const lastControlLoadDiagnostics = ref(null);

const CONTROL_SCREEN_DESIGN_WIDTH = 1520;
const CONTROL_SCREEN_DESIGN_HEIGHT = 820;
const CONTROL_SCREEN_MIN_SCALE = 0.72;
const CONTROL_SCREEN_MOBILE_BREAKPOINT = 820;

const controlScreenRef = ref(null);
const controlScreenScale = ref(1);
const studentsScaleShell = ref(null);
const detailBodyRef = ref(null);
const mobileDetailScrolled = ref(false);
let controlScreenResizeObserver = null;
let controlScreenFrame = null;

const controlScreenStyle = computed(() => ({
  "--ce-screen-scale": controlScreenScale.value,
}));
const studentsScaleShellStyle = computed(() => ({}));
const studentsDesignCanvasStyle = computed(() => ({}));

const updateControlScreenScale = () => {
  if (!process.client) return;
  const viewportWidth = window.innerWidth || CONTROL_SCREEN_DESIGN_WIDTH;
  if (viewportWidth <= CONTROL_SCREEN_MOBILE_BREAKPOINT) {
    controlScreenScale.value = 1;
    return;
  }
  const host = controlScreenRef.value?.parentElement;
  const rect = host?.getBoundingClientRect?.();
  const availableWidth = Math.max(900, rect?.width || viewportWidth || CONTROL_SCREEN_DESIGN_WIDTH);
  const availableHeight = Math.max(560, rect?.height || window.innerHeight || CONTROL_SCREEN_DESIGN_HEIGHT);
  const widthScale = availableWidth / CONTROL_SCREEN_DESIGN_WIDTH;
  const heightScale = availableHeight / CONTROL_SCREEN_DESIGN_HEIGHT;
  const nextScale = Math.min(1, Math.max(CONTROL_SCREEN_MIN_SCALE, Math.min(widthScale, heightScale)));
  controlScreenScale.value = Number(nextScale.toFixed(4));
};

const scheduleControlScreenScaleUpdate = () =>
  nextTick(() => {
    if (!process.client) return;
    if (controlScreenFrame) window.cancelAnimationFrame(controlScreenFrame);
    controlScreenFrame = window.requestAnimationFrame(updateControlScreenScale);
  });

const scheduleWorkspaceScaleUpdate = scheduleControlScreenScaleUpdate;

const handleDetailBodyScroll = (event) => {
  if (!process.client) return;
  const target = event?.target || detailBodyRef.value;
  mobileDetailScrolled.value = Number(target?.scrollTop || 0) > 12;
};

const controlSyncBusy = computed(
  () =>
    controlBaseStage.value === "loading" ||
    controlExternalDbStage.value === "loading" ||
    controlCompleteStage.value === "loading",
);
const loadingAny = computed(
  () =>
    optionsLoading.value ||
    kpisLoading.value ||
    studentsLoading.value ||
    savingStudent.value ||
    controlSyncBusy.value,
);

const localHour = ref(12);
const isAfterOfficeHours = computed(() => localHour.value >= 17);
const studentsSourceUnavailable = computed(() =>
  Boolean(
    selectedAgentId.value &&
    loadError.value &&
    !studentsLoading.value &&
    !students.value.length,
  ),
);
const sourceUnavailableTitle = computed(() =>
  isAfterOfficeHours.value
    ? "El equipo del plantel ya cerró por hoy"
    : "La base del plantel no está disponible en este momento",
);
const sourceUnavailableMessage = computed(() =>
  isAfterOfficeHours.value
    ? "La información se consulta desde el equipo local del plantel. Si el administrador ya terminó su jornada, la lista volverá a estar disponible cuando ese equipo se encienda de nuevo."
    : "La lista se activa cuando el equipo del administrador del plantel está encendido y conectado. Solicita que lo mantengan disponible y vuelve a intentarlo.",
);
const sourceUnavailableHint = computed(() =>
  isAfterOfficeHours.value ? "Fuera de horario" : "Esperando conexión",
);

const formatControlSyncTime = (value) => {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch (_) {
    return "";
  }
};

const getControlExternalDbRowCount = (source = {}) =>
  Number(
    source.externalRows ??
      source.enrichedRows ??
      source.centralRows ??
      source.overlayRows ??
      source.matriculaRows ??
      0,
  ) || 0;

const controlNow = () =>
  typeof performance !== "undefined" && performance?.now
    ? performance.now()
    : Date.now();

const formatControlDuration = (ms) => {
  const value = Number(ms || 0);
  if (!Number.isFinite(value)) return "0 ms";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} s`;
};

const normalizeControlDiagnostics = ({
  query = {},
  cached = null,
  response = null,
  clientSteps = [],
  startedAt = Date.now(),
  totalMs = 0,
  status = "ready",
} = {}) => {
  const source = response?.source || {};
  const server = source.diagnostics || {};
  const serverSteps = Array.isArray(server.steps) ? server.steps : [];
  return {
    capturedAt: new Date().toISOString(),
    status,
    agentId: selectedAgentId.value,
    ciclo: currentCicloKey.value,
    query: { ...query },
    localCacheUsed: Boolean(cached),
    localCacheRows: Array.isArray(cached?.data) ? cached.data.length : 0,
    totalMs: Math.max(0, Math.round(Number(totalMs || 0))),
    clientSteps,
    server: {
      flow: server.flow || source.phase || "unknown",
      phase: server.phase || source.phase || "enriched",
      totalMs: Number(server.totalMs || 0),
      steps: serverSteps,
    },
    source: {
      base: source.base || "",
      overlay: source.overlay || "",
      cacheFreshness: source.cacheFreshness || "",
      cacheRefreshedAt: source.cacheRefreshedAt || "",
      cacheExpiresAt: source.cacheExpiresAt || "",
      localRows: Number(source.localRows || 0),
      overlayRows: Number(source.overlayRows || 0),
      enrichedRows: Number(source.enrichedRows || 0),
      usersRows: Number(source.usersRows || 0),
      bridgeFallback: Boolean(source.bridgeFallback),
      bridgeError: source.bridgeError || "",
    },
  };
};

const controlStatusTone = (status = "") => {
  const normalized = String(status || "").toLowerCase();
  if (["ready", "updated", "cached", "complete"].includes(normalized))
    return "success";
  if (["partial", "syncing", "loading"].includes(normalized)) return "info";
  if (["skipped", "disabled", "idle", "empty", "missing"].includes(normalized))
    return "muted";
  if (["failed", "unavailable", "error"].includes(normalized)) return "danger";
  return "neutral";
};

const controlStatusLabel = (status = "") => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "ready") return "Listo";
  if (normalized === "updated") return "Actualizado";
  if (normalized === "cached") return "En caché";
  if (normalized === "syncing") return "Sincronizando";
  if (normalized === "partial") return "Parcial";
  if (normalized === "failed") return "Falló";
  if (normalized === "unavailable") return "No disponible";
  if (normalized === "disabled") return "Desactivado";
  if (normalized === "skipped") return "Omitido";
  if (normalized === "empty") return "Vacío";
  if (normalized === "missing") return "Sin coincidencias";
  if (normalized === "idle") return "En espera";
  return normalized || "Sin estado";
};

const describeControlWhy = (step = {}, lane = "client") => {
  const key = String(step.key || "");
  const status = String(step.status || "");
  const reason = String(step.reason || "");
  if (key === "browser-cache") {
    if (status === "disabled") return "La lista se actualiza desde la fuente principal para mostrar cambios recientes.";
    if (status === "ready") return "Se usaron datos locales válidos para esta vista.";
    return "Se revisaron datos locales y no aportaron una lista útil para esta carga.";
  }
  if (key === "verified-cache") {
    if (status === "skipped") return reason === "live_bridge_primary_snapshot_only_on_bridge_failure"
      ? "El respaldo quedó reservado porque la fuente principal respondió correctamente."
      : "El respaldo se omitió por la fase actual de carga.";
    if (status === "ready") return "Se usó un respaldo verificado porque la fuente principal no respondió.";
    if (status === "empty") return "Se intentó usar un respaldo, pero no había datos utilizables para este alcance.";
    if (status === "failed") return "La fuente principal no respondió y tampoco se pudo abrir el respaldo verificado.";
  }
  if (key === "bridge-schema") return status === "ready"
    ? "El servidor validó la fuente principal y los datos complementarios disponibles."
    : "La fuente principal respondió con disponibilidad parcial.";
  if (key === "live-base-selector") return status === "ready"
    ? "La lista base se resolvió desde la fuente principal de Control Escolar."
    : "La lectura principal falló y se usó una ruta de respaldo.";
  if (key === "cache-refresh") return status === "ready"
    ? "El respaldo se actualizó con datos recientes."
    : status === "skipped"
      ? "No se actualizó el respaldo porque la consulta no lo requería."
      : "Falló la actualización del respaldo, pero la carga principal continuó.";
  if (key === "matricula-overlay") return status === "ready"
    ? "Se agregaron datos complementarios del expediente escolar."
    : "La carga continuó, aunque algunos datos complementarios no respondieron completamente.";
  if (key === "husky-pass") return status === "ready"
    ? "Se consultó Husky Pass como enriquecimiento adicional de usuarios." 
    : "La consulta de Husky Pass no respondió o no tenía datos para esta carga.";
  if (key === "server-enriched") return status === "ready"
    ? "La pantalla recibió la respuesta final del servidor." 
    : "La solicitud principal al servidor falló antes de entregar una lista usable.";
  if (lane === "server") return "El servidor reportó esta etapa como parte del recorrido real de resolución.";
  return "La etapa se registró automáticamente durante la última carga para explicar la decisión tomada.";
};

const controlSourceModeLabel = (value = "") => {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (!normalized) return "n/a";
  if (normalized.includes("bridge") || normalized.includes("live") || normalized.includes("principal")) {
    return "Fuente principal";
  }
  if (normalized.includes("verified-cache") || normalized.includes("snapshot") || normalized.includes("cache") || normalized === "fresh" || normalized === "expired") {
    return "Datos guardados";
  }
  if (normalized.includes("overlay") || normalized.includes("matricula")) {
    return "Matrícula";
  }
  if (normalized.includes("server")) return "Servidor";
  return raw.replace(/[-_]/g, " ");
};

const controlStepTitleLabel = (step = {}) => {
  const key = String(step.key || "");
  const labels = {
    "browser-cache": "Datos locales",
    "verified-cache": "Respaldo verificado",
    "bridge-schema": "Validación de origen",
    "live-base-selector": "Fuente principal",
    "cache-refresh": "Actualización de respaldo",
    "matricula-overlay": "Matrícula",
    "husky-pass": "Husky Pass",
    "server-enriched": "Respuesta final",
  };
  return labels[key] || controlSourceModeLabel(step.label || key);
};

const controlDiagnosticsSummary = computed(() => {
  const diagnostics = lastControlLoadDiagnostics.value;
  if (!diagnostics) return [];
  return [
    {
      label: "Estado final",
      value: controlStatusLabel(diagnostics.status),
      tone: controlStatusTone(diagnostics.status),
    },
    {
      label: "Tiempo cliente",
      value: formatControlDuration(diagnostics.totalMs),
      tone: "neutral",
    },
    {
      label: "Ruta de carga",
      value: controlSourceModeLabel(diagnostics.server.flow),
      tone: controlStatusTone(diagnostics.status),
    },
    {
      label: "Datos complementarios",
      value: `${diagnostics.source.overlayRows}/${diagnostics.source.localRows || 0}`,
      tone: "neutral",
    },
  ];
});

const controlDiagnosticsTree = computed(() => {
  const diagnostics = lastControlLoadDiagnostics.value;
  if (!diagnostics) return [];
  const nodes = [
    ...((diagnostics.clientSteps || []).map((step) => ({
      id: `client-${step.key}`,
      lane: "client",
      laneLabel: "Cliente",
      title: controlStepTitleLabel(step),
      decision: controlStepTitleLabel(step),
      why: describeControlWhy(step, "client"),
      tone: controlStatusTone(step.status),
      status: step.status,
      statusLabel: controlStatusLabel(step.status),
      ms: Number(step.ms || 0),
      meta: [
        { label: "Filas", value: step.rows },
        { label: "Motivo", value: controlSourceModeLabel(step.reason || step.freshness || "") },
        { label: "Error", value: step.error || "" },
      ].filter((item) => item.value !== "" && item.value != null),
    }))),
    ...((diagnostics.server.steps || []).map((step) => ({
      id: `server-${step.key}`,
      lane: "server",
      laneLabel: "Servidor",
      title: controlStepTitleLabel(step),
      decision: controlStepTitleLabel(step),
      why: describeControlWhy(step, "server"),
      tone: controlStatusTone(step.status),
      status: step.status,
      statusLabel: controlStatusLabel(step.status),
      ms: Number(step.ms || 0),
      meta: [
        { label: "Filas", value: step.rows },
        { label: "Actualización", value: controlSourceModeLabel(step.freshness || "") },
        { label: "Alcance", value: step.scopeKey || "" },
        { label: "Motivo", value: controlSourceModeLabel(step.reason || "") },
        { label: "Error", value: step.error || "" },
      ].filter((item) => item.value !== "" && item.value != null),
    }))),
  ];

  nodes.push({
    id: "result-final",
    lane: "result",
    laneLabel: "Resultado",
    title: "Resultado final visible",
    decision: diagnostics.source.bridgeFallback
      ? "La vista se resolvió con datos de respaldo y datos complementarios."
      : "La vista se resolvió con la fuente principal y datos complementarios.",
    why: diagnostics.source.bridgeFallback
      ? "La fuente principal no respondió y el respaldo verificado sostuvo la carga."
      : "La ruta resolvió la fuente principal y mantuvo el respaldo disponible.",
    tone: controlStatusTone(diagnostics.status),
    status: diagnostics.status,
    statusLabel: controlStatusLabel(diagnostics.status),
    ms: diagnostics.totalMs,
    meta: [
      { label: "Origen", value: controlSourceModeLabel(diagnostics.source.base) },
      { label: "Complementarios", value: controlSourceModeLabel(diagnostics.source.overlay) },
      { label: "Filas", value: `${diagnostics.source.localRows}/${diagnostics.source.overlayRows}/${diagnostics.source.usersRows}` },
    ],
  });

  return nodes;
});

const openControlDiagnosticsModal = () => {
  showControlDiagnosticsModal.value = true;
};
const closeControlDiagnosticsModal = () => {
  showControlDiagnosticsModal.value = false;
};

useModalEscape(closeControlDiagnosticsModal, { enabled: showControlDiagnosticsModal });

const publishControlSyncIndicatorState = (override = {}) => {
  if (!process.client) return;
  const rows = controlStudentsIndex.value.length || students.value.length || 0;
  const source = controlDataSource.value || {};
  const isLoading = studentsLoading.value || kpisLoading.value || controlBaseStage.value === "loading" || controlExternalDbStage.value === "loading" || controlCompleteStage.value === "loading";
  const cacheFreshness = String(source.cacheFreshness || "");
  const isSnapshotFallback = Boolean(source.bridgeFallback) || String(source.base || "").startsWith("verified-cache:");
  const status =
    override.status ||
    (isLoading
      ? "syncing"
      : loadError.value
        ? "failed"
        : isSnapshotFallback || cacheFreshness === "expired"
          ? "cached"
          : controlDataFreshness.value === "synced" || cacheFreshness === "live-bridge"
            ? "updated"
            : controlDataFreshness.value === "cache"
              ? "cached"
              : rows > 0
                ? "cached"
                : "empty");
  const message =
    override.message ||
    (isSnapshotFallback
      ? "Actualización no disponible; mostrando datos guardados."
      : cacheFreshness === "expired"
        ? "Mostrando datos guardados; actualización automática en curso."
        : cacheFreshness === "live-bridge"
          ? "Control Escolar actualizado."
          : cacheFreshness === "fresh"
            ? "Control Escolar usando datos verificados guardados."
            : loadError.value || "Control Escolar");
  window.dispatchEvent(
    new CustomEvent("control-escolar:sync-state", {
      detail: {
        status,
        rows,
        message,
        freshness: source.cacheFreshness || controlDataFreshness.value || "",
      },
    }),
  );
};

const publishControlTopbarState = () => {
  controlEscolarTopbarState.value = {
    plantel: selectedAgentId.value || "",
    studentsCount: Number(pagination.total || students.value.length || 0),
    loading: Boolean(loadingAny.value),
    importing: Boolean(massImporting.value),
    syncStatus: String(controlDataFreshness.value || controlCacheStage.value || "idle"),
    syncMessage: controlSyncAriaLabel.value || loadError.value || "Control Escolar",
  };
};

const resetControlTopbarState = () => {
  controlEscolarTopbarState.value = {
    plantel: "",
    studentsCount: 0,
    loading: false,
    importing: false,
    syncStatus: "idle",
    syncMessage: "",
  };
};

const handleControlTopbarAction = async (event) => {
  const action = String(event?.detail?.action || "");
  if (action === "refresh") {
    await refreshAll();
    return;
  }
  if (action === "export-db") {
    exportMatriculaDb();
    return;
  }
  if (action === "import-db") openMassImportModal();
};

const showControlSyncVisual = computed(() =>
  Boolean(
    selectedAgentId.value &&
    !studentsSourceUnavailable.value &&
    (controlDataFreshness.value !== "empty" ||
      controlCacheStage.value !== "idle" ||
      controlBaseStage.value !== "idle" ||
      controlExternalDbStage.value !== "idle" ||
      controlCompleteStage.value !== "idle"),
  ),
);
const controlDataFreshnessLabel = computed(() => {
  const time = formatControlSyncTime(controlDataSavedAt.value);
  if (controlDataFreshness.value === "cache")
    return time ? `Caché · ${time}` : "Caché local";
  if (controlDataFreshness.value === "base") return "Base del administrador";
  if (controlDataFreshness.value === "synced")
    return time ? `Sync · ${time}` : "Sincronizado";
  if (controlCacheStage.value === "ready") return "Caché local";
  if (controlBaseStage.value === "loading") return "Conectando";
  if (controlExternalDbStage.value === "loading") return "Base externa";
  return "Sin datos";
});
const controlCacheStepTitle = computed(() =>
  controlCacheStage.value === "ready"
    ? controlDataSavedAt.value
      ? `Caché local cargada · ${formatControlSyncTime(controlDataSavedAt.value)}`
      : "Caché local cargada"
    : "Caché local pendiente para este plantel y ciclo",
);
const controlBaseStepTitle = computed(() =>
  controlBaseStage.value === "loading"
    ? "Conectando con base del administrador"
    : controlBaseStage.value === "ready"
      ? "Base del administrador lista"
      : controlBaseStage.value === "failed"
        ? "Base del administrador pendiente"
        : controlBaseStage.value === "partial"
          ? "Datos verificados guardados disponibles"
          : "Base del administrador pendiente",
);
const controlExternalDbStepTitle = computed(() =>
  controlExternalDbStage.value === "loading"
    ? "Consultando base externa de matrícula"
    : controlExternalDbStage.value === "ready"
      ? "Base externa de matrícula lista"
      : controlExternalDbStage.value === "empty"
        ? "Base externa consultada sin filas"
        : controlExternalDbStage.value === "failed"
          ? "Base externa pendiente"
          : "Base externa pendiente",
);
const controlCompleteStepTitle = computed(() =>
  controlCompleteStage.value === "loading"
    ? "Sincronización en proceso"
    : controlCompleteStage.value === "ready"
      ? "Proceso terminado"
      : controlCompleteStage.value === "failed"
        ? "Proceso terminado con pendientes"
        : "Proceso pendiente",
);
const controlSyncAriaLabel = computed(() =>
  [
    controlCacheStepTitle.value,
    controlBaseStepTitle.value,
    controlExternalDbStepTitle.value,
    controlCompleteStepTitle.value,
    controlDataFreshnessLabel.value,
  ]
    .filter(Boolean)
    .join(". "),
);
const hasActiveFilters = computed(() =>
  Boolean(
    filters.search ||
    filters.quality ||
    filters.grado ||
    filters.group ||
    filters.recent ||
    (filters.status && filters.status !== DEFAULT_QUICK_FILTER),
  ),
);
const activeFilterLabel = computed(() => {
  const active = [];
  if (filters.status && filters.status !== DEFAULT_QUICK_FILTER)
    active.push(statusLabel(filters.status));
  if (filters.quality) active.push(qualityLabel(filters.quality));
  if (filters.grado) active.push(filters.grado);
  if (filters.group) active.push(`Grupo ${filters.group}`);
  if (filters.search) active.push("Búsqueda");
  return active.slice(0, 2).join(" · ");
});
const availableGroups = computed(() => {
  if (!filters.grado) return [];
  const byGrade = catalogs.gruposPorGrado || {};
  return Array.isArray(byGrade[filters.grado])
    ? byGrade[filters.grado]
    : catalogs.grupos;
});

const mergeOptions = (...groups) =>
  Array.from(
    new Set(
      groups
        .flat()
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
const labelize = (value) => {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};
const normalizeDateInput = (value) => {
  if (!value) return "";
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString().slice(0, 10);
};
const nivelOptions = computed(() =>
  mergeOptions(NIVELES_ESCOLARES, catalogs.niveles, [editForm.nivel]),
);
const gradoOptions = computed(() =>
  mergeOptions(
    gradeOptionsForNivel(editForm.nivel || selectedStudent.value?.nivel).map(
      (grado) => grado.toLowerCase(),
    ),
    [editForm.grado],
  ),
);
const knownGroupOptions = computed(() => {
  const byGrade = catalogs.gruposPorGrado || {};
  const scopedGroups =
    editForm.grado && Array.isArray(byGrade[editForm.grado])
      ? byGrade[editForm.grado]
      : [];
  return mergeOptions(scopedGroups, catalogs.grupos, STUDENT_GROUP_ICON_LABELS);
});
const groupOptions = computed(() =>
  mergeOptions(knownGroupOptions.value, [editForm.grupo]),
);
const groupPickerOpen = ref(false);
const groupModalOpen = ref(false);
const groupModalDraft = ref("");
const openGroupModal = () => {
  groupModalDraft.value = normalizeGroupPickerText(editForm.grupo).slice(0, 40);
  groupModalOpen.value = true;
  groupPickerOpen.value = false;
  nextTick(() => {
    if (!process.client) return;
    document.querySelector('.ce-group-modal__search input')?.focus?.();
  });
};
const closeGroupModal = () => {
  groupModalOpen.value = false;
  groupPickerOpen.value = false;
};
const confirmGroupModal = () => {
  editForm.grupo = normalizeGroupPickerText(groupModalDraft.value).slice(0, 40);
  closeGroupModal();
};
const normalizeGroupPickerText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();
const groupLabelForUi = (value) => {
  const normalized = normalizeGroupPickerText(value);
  if (!normalized) return "Sin grupo asignado";
  return studentGroupIconLabel(normalized) || normalized;
};
const groupPickerInput = computed({
  get: () => String(editForm.grupo || ""),
  set: (value) => {
    editForm.grupo = normalizeGroupPickerText(value).slice(0, 40);
    groupPickerOpen.value = true;
  },
});
const normalizedGroupPickerSearch = computed(() =>
  normalizeClientText(groupPickerInput.value),
);
const groupModalPickerInput = computed({
  get: () => String(groupModalDraft.value || ""),
  set: (value) => {
    groupModalDraft.value = normalizeGroupPickerText(value).slice(0, 40);
  },
});
const normalizedGroupModalSearch = computed(() =>
  normalizeClientText(groupModalPickerInput.value),
);
const filteredGroupModalOptions = computed(() => {
  const query = normalizedGroupModalSearch.value;
  return knownGroupOptions.value
    .filter((value) => !query || normalizeClientText(value).includes(query))
    .map((value) => ({
      value,
      label: groupLabelForUi(value),
      selected:
        normalizeClientText(value) === normalizeClientText(groupModalDraft.value),
      sourceLabel: catalogs.grupos.includes(value)
        ? "Grupo del plantel"
        : "Sigil disponible",
    }));
});
const customGroupModalOption = computed(() => {
  const value = normalizeGroupPickerText(groupModalPickerInput.value).slice(0, 40);
  if (!value) return null;
  const exists = knownGroupOptions.value.some(
    (option) => normalizeClientText(option) === normalizeClientText(value),
  );
  if (exists) return null;
  return { value, label: `Usar “${value}”` };
});
const selectGroupModalOption = (value) => {
  groupModalDraft.value = normalizeGroupPickerText(value).slice(0, 40);
};
const clearGroupModalPicker = () => {
  groupModalDraft.value = "";
};
const filteredGroupOptions = computed(() => {
  const query = normalizedGroupPickerSearch.value;
  return knownGroupOptions.value
    .filter((value) => !query || normalizeClientText(value).includes(query))
    .slice(0, 12)
    .map((value) => ({
      value,
      label: value,
      selected:
        normalizeClientText(value) === normalizeClientText(editForm.grupo),
      sourceLabel: catalogs.grupos.includes(value)
        ? "Grupo del plantel"
        : "Opción con icono",
    }));
});
const customGroupOption = computed(() => {
  const value = normalizeGroupPickerText(groupPickerInput.value).slice(0, 40);
  if (!value) return null;
  const exists = knownGroupOptions.value.some(
    (option) => normalizeClientText(option) === normalizeClientText(value),
  );
  if (exists) return null;
  return { value, label: `Usar “${value}”` };
});
const openGroupPicker = () => {
  groupPickerOpen.value = true;
};
const closeGroupPickerSoon = () => {
  if (!process.client) return;
  window.setTimeout(() => {
    groupPickerOpen.value = false;
  }, 120);
};
const selectGroupOption = (value) => {
  editForm.grupo = normalizeGroupPickerText(value).slice(0, 40);
  groupPickerOpen.value = false;
};
const commitGroupPickerInput = () => {
  editForm.grupo = normalizeGroupPickerText(groupPickerInput.value).slice(0, 40);
  groupPickerOpen.value = false;
};
const clearGroupPicker = () => {
  editForm.grupo = "";
  groupPickerOpen.value = true;
};

watch(
  () => editForm.nivel,
  () => {
    const available = gradoOptions.value;
    if (editForm.grado && !available.includes(editForm.grado))
      editForm.grado = available[0] || "";
  },
);

const advancedFilterCount = computed(
  () =>
    [filters.quality, filters.grado, filters.group, filters.recent].filter(
      Boolean,
    ).length,
);

const paginationRangeLabel = computed(() => {
  const total = Number(pagination.total || 0);
  if (!total) return "0 a 0";
  const start =
    (Number(pagination.page || 1) - 1) *
      Number(pagination.limit || students.value.length || 1) +
    1;
  const end = Math.min(start + Math.max(students.value.length, 1) - 1, total);
  return `${formatNumber(start)} a ${formatNumber(end)}`;
});
const visiblePaginationPages = computed(() => {
  const totalPages = Math.max(1, Number(pagination.pages || 1));
  if (totalPages <= 4)
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (pagination.page <= 3) return [1, 2, 3, "ellipsis", totalPages];
  if (pagination.page >= totalPages - 2)
    return [1, "ellipsis", totalPages - 2, totalPages - 1, totalPages];
  return [1, "ellipsis", pagination.page, "ellipsis", totalPages];
});

const primaryFilters = [
  { key: "all", label: "Todos" },
  { key: "inscritos", label: "Inscritos" },
  { key: "internos", label: "Internos" },
  { key: "externos", label: "Externos" },
  { key: "no_inscritos", label: "No inscritos" },
  { key: "bajas", label: "Bajas" },
];

const detailTabs = [
  { key: "summary", label: "Resumen", icon: LucideCheck },
  { key: "identity", label: "Identidad", icon: LucideUserRound },
  { key: "school", label: "Escolar", icon: LucideGraduationCap },
  { key: "family", label: "Contacto familiar", icon: LucideUsersRound },
  { key: "advanced", label: "Expediente avanzado", icon: LucideFileUp },
  { key: "system", label: "Husky Pass", icon: LucideKeyRound },
  { key: "notes", label: "Observaciones", icon: LucideAlertTriangle },
];

const qualityFilters = computed(() => {
  const data = kpis.value || {};
  return [
    {
      key: "incomplete",
      label: "Expediente incompleto",
      count: data.expedientesIncompletos || 0,
    },
    { key: "curp", label: "Sin CURP", count: data.sinCurp || 0 },
    { key: "grupo", label: "Sin grupo", count: data.sinGrupo || 0 },
    { key: "padre", label: "Sin datos de padre", count: data.sinPadre || 0 },
    { key: "madre", label: "Sin datos de madre", count: data.sinMadre || 0 },
    { key: "contact", label: "Sin contacto válido", count: data.sinContacto || 0 },
  ];
});

const MASS_UNIT_COUNT = 10;
const buildMassUnits = (value, total) => {
  const safeValue = Math.max(0, Number(value || 0));
  const safeTotal = Math.max(0, Number(total || 0));
  const ratio = safeTotal > 0 ? Math.min(1, safeValue / safeTotal) : 0;
  const activeUnits =
    safeValue > 0 ? Math.max(1, Math.ceil(ratio * MASS_UNIT_COUNT)) : 0;
  return Array.from({ length: MASS_UNIT_COUNT }, (_, index) => ({
    index,
    active: index < activeUnits,
  }));
};
const volumePercent = (value, total) => {
  if (value === null || value === undefined || total === null || total === undefined) return 0;
  const safeValue = Math.max(0, Number(value || 0));
  const safeTotal = Math.max(0, Number(total || 0));
  if (!safeTotal) return 0;
  return Math.min(100, Math.round((safeValue / safeTotal) * 100));
};
const withVolume = (card, total) => {
  const hasValue = card.value !== null && card.value !== undefined;
  const hasTotal = total !== null && total !== undefined;
  const percent =
    hasValue && hasTotal && card.key === "inscritos" && Number(card.value || 0) > 0
      ? 100
      : volumePercent(card.value, total);
  return {
    ...card,
    massUnits: hasValue && hasTotal
      ? buildMassUnits(card.key === "inscritos" ? total : card.value, total)
      : buildMassUnits(0, 0),
    volumeAria: hasValue
      ? `${card.label}: ${formatNumber(card.value)}; ${card.key === "inscritos" ? "total de inscritos" : `${percent}% del total de inscritos`}`
      : `${card.label}: sin dato disponible`,
  };
};
const kpiCards = computed(() => {
  if (!kpis.value) {
    return [
      { key: "inscritos", label: "Inscritos", value: null, tone: "kpi-green", icon: LucideUsersRound },
      { key: "internos", label: "Internos", value: null, tone: "kpi-teal", icon: LucideUserCheck },
      { key: "externos", label: "Externos", value: null, tone: "kpi-blue", icon: LucideGlobe2 },
      { key: "no_inscritos", label: "No inscritos", value: null, tone: "kpi-red", icon: LucideUserX },
      { key: "bajas", label: "Bajas", value: null, tone: "kpi-gray", icon: LucideUserX },
    ].map((card) => withVolume(card, null));
  }
  const data = kpis.value;
  const total = Number(data.inscritos || data.totalInscritos || 0);
  return [
    {
      key: "inscritos",
      label: "Inscritos",
      value: total,
      tone: "kpi-green",
      icon: LucideUsersRound,
    },
    {
      key: "internos",
      label: "Internos",
      value: data.internos ?? 0,
      tone: "kpi-teal",
      icon: LucideUserCheck,
    },
    {
      key: "externos",
      label: "Externos",
      value: data.externos ?? 0,
      tone: "kpi-blue",
      icon: LucideGlobe2,
    },
    {
      key: "no_inscritos",
      label: "No inscritos",
      value: data.noInscritos ?? 0,
      tone: "kpi-red",
      icon: LucideUserX,
    },
    {
      key: "bajas",
      label: "Bajas",
      value: data.bajas ?? 0,
      tone: "kpi-gray",
      icon: LucideUserX,
    },
  ].map((card) => withVolume(card, total));
});

const iconForCompletenessField = (key = "") => {
  if (key === "curp") return LucideShieldCheck;
  if (key === "grupo" || key === "group") return LucideGraduationCap;
  if (key.toLowerCase().includes("email")) return LucideMail;
  if (key.toLowerCase().includes("telefono")) return LucidePhone;
  return LucideUsersRound;
};
const requiredDataFields = CONTROL_ESCOLAR_BASIC_REQUIRED_FIELDS.map((field) => ({
  ...field,
  icon: iconForCompletenessField(field.key),
}));
const completeDataFields = CONTROL_ESCOLAR_COMPLETE_REQUIRED_FIELDS.map((field) => ({
  ...field,
  icon: iconForCompletenessField(field.key),
}));

const formatNumber = (value) => Number(value || 0).toLocaleString("es-MX");
const statusLabel = (value) =>
  ({
    all: "Todos",
    inscritos: "Inscritos",
    activos: "Activos",
    active: "Activos",
    internos: "Internos",
    externos: "Externos",
    no_inscritos: "No inscritos",
    bajas: "Bajas",
    baja: "Bajas",
    sin_contacto: "Sin contacto",
  })[value] || value;
const qualityLabel = (value) =>
  ({
    complete: "Completo",
    incomplete: "Expediente incompleto",
    curp: "Sin CURP",
    grupo: "Sin grupo",
    sin_grupo: "Sin grupo",
    group: "Sin grupo",
    phone: "Sin datos familiares",
    email: "Sin datos familiares",
    guardian: "Sin datos familiares",
    tutor: "Sin datos familiares",
    padre: "Sin datos de padre",
    madre: "Sin datos de madre",
    contact: "Sin contacto válido",
  })[value] || value;
const controlGroupLabel = (student) => {
  const value = String(student?.group ?? student?.grupo ?? "")
    .replaceAll('"', "")
    .trim();
  return value && value.toLowerCase() !== "null" ? value : "";
};
const controlMissingGroup = (student) => !controlGroupLabel(student);
const controlGroupTitle = (student) => {
  const group = controlGroupLabel(student);
  return group ? `Grupo ${group}` : "Sin grupo";
};
const statusTone = (student) =>
  String(student?.status || "").toLowerCase() === "baja"
    ? "danger"
    : String(student?.status || "").toLowerCase() === "activo"
      ? "success"
      : "neutral";
const controlCompletenessFor = (student) => {
  if (student?.completenessTiers?.basic && student?.completenessTiers?.complete) {
    return student.completenessTiers;
  }
  return resolveControlEscolarCompleteness(student || {}, { honorEnrollmentState: true });
};
const normalizedMissingFields = (student, tier = "basic") => {
  const fields = tier === "complete"
    ? controlCompletenessFor(student)?.complete?.missingFields
    : controlCompletenessFor(student)?.basic?.missingFields || student?.missingFields;
  return Array.isArray(fields)
    ? fields
        .map((field) =>
          String(field || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : [];
};
const studentMissingField = (student, field, tier = "basic") => {
  const missing = normalizedMissingFields(student, tier);
  return (
    missing.includes(String(field?.key || "").toLowerCase()) ||
    missing.includes(String(field?.label || "").toLowerCase())
  );
};
const isInscritoForControlProgress = (student) =>
  String(student?.enrollmentState || "").toLowerCase() === "inscrito";
const studentMissingCount = (student) => controlCompletenessFor(student)?.basic?.pending ??
  requiredDataFields.filter((field) => studentMissingField(student, field)).length;
const studentCompleteMissingCount = (student) => controlCompletenessFor(student)?.complete?.pending ??
  completeDataFields.filter((field) => studentMissingField(student, field, "complete")).length;
const completionFor = (student) => {
  if (!isInscritoForControlProgress(student)) return 0;
  return controlCompletenessFor(student)?.basic?.progress ?? 0;
};
const completeCompletionFor = (student) => {
  if (!isInscritoForControlProgress(student)) return 0;
  return controlCompletenessFor(student)?.complete?.progress ?? 0;
};
const qualitySummary = (student) => {
  if (!isInscritoForControlProgress(student)) return "Fuera de inscritos";
  const missing = studentMissingCount(student);
  if (!missing) return "Expediente básico completo";
  return missing === 1 ? "1 pendiente básico" : `${missing} faltantes básicos`;
};
const qualityScoreTone = (student) => {
  const score = completionFor(student);
  if (score >= 100) return "complete";
  if (score >= 75) return "warning";
  return "danger";
};
const studentCurpIsInvalid = (student = {}) => {
  const curp = normalizeCurpInput(student?.curp || student?.CURP || "");
  return Boolean(curp && !inferMexicanCurpIdentity(curp).valid);
};
const selectedProfileCompletion = computed(() =>
  completionFor(selectedHealthStudent.value),
);
const selectedAdvancedProfileCompletion = computed(() => {
  const total = selectedAdvancedTotal.value || 1;
  return Math.round((selectedAdvancedCompletedCount.value / total) * 100);
});
const selectedMissingCount = computed(() =>
  studentMissingCount(selectedHealthStudent.value),
);
const selectedAdvancedMissingCount = computed(() => advancedMissingCount.value);
const selectedAdvancedTotal = computed(() => advancedExpedienteFields.length);
const selectedAdvancedCompletedCount = computed(() =>
  Math.max(0, selectedAdvancedTotal.value - selectedAdvancedMissingCount.value),
);
const visibleBasicMissingFieldsFor = (student) =>
  requiredDataFields.filter((field) => studentMissingField(student, field));
const visibleBasicMissingFields = computed(() =>
  visibleBasicMissingFieldsFor(selectedHealthStudent.value),
);
const missingFieldLabelsFor = (student, limit = 2) =>
  visibleBasicMissingFieldsFor(student)
    .slice(0, limit)
    .map((field) => field.label);
const hasMissingContactFor = (student) =>
  ["padreTelefono", "padreEmail", "madreTelefono", "madreEmail"].some((key) =>
    normalizedMissingFields(student, "basic").includes(key.toLowerCase()),
  );
const recordHealth = (student = {}) => {
  if (!isInscritoForControlProgress(student)) {
    return {
      percent: 0,
      tone: "neutral",
      label: "Fuera de alcance",
      summary: "No cuenta para este ciclo.",
      aria: "Alumno fuera del alcance de expediente del ciclo.",
    };
  }

  const percent = completionFor(student);
  const missing = studentMissingCount(student);
  const invalidCurp = studentCurpIsInvalid(student);
  const topMissing = missingFieldLabelsFor(student, 2);
  const missingText = topMissing.join(", ");
  const blocked = invalidCurp || missing >= 4 || hasMissingContactFor(student);
  const tone = missing === 0 && !invalidCurp ? "complete" : blocked ? "danger" : "warning";
  const label = invalidCurp ? "Validación" : missing === 0 ? "Listo" : blocked ? "Atención" : `Faltan ${missing}`;
  const summary = invalidCurp
    ? "CURP inválida"
    : missing === 0
    ? "Básico completo"
    : missingText
      ? missingText
      : "Revisar expediente";

  return {
    percent,
    tone,
    label,
    summary,
    aria: `Expediente básico ${percent}% completo. ${label}. ${summary}`,
  };
};
const rowHealthHeadline = (student = {}) => {
  if (studentCurpIsInvalid(student)) return "CURP inválida";
  const missing = studentMissingCount(student);
  if (!missing) return "Expediente básico completo";
  return missing === 1 ? "1 faltante básico" : `${missing} faltantes básicos`;
};
const compactMissingFieldLabels = {
  curp: "CURP",
  grupo: "Grupo",
  padreNombre: "Nombre padre",
  padreApellidoPaterno: "Ap. padre",
  padreTelefono: "Tel. padre",
  padreEmail: "Email padre",
  madreNombre: "Nombre madre",
  madreApellidoPaterno: "Ap. madre",
  madreTelefono: "Tel. madre",
  madreEmail: "Email madre",
};
const compactMissingField = (field = {}) => ({
  ...field,
  label: compactMissingFieldLabels[field.key] || field.label,
});
const rowHealthMetrics = (student = {}, limit = 8) => {
  if (studentCurpIsInvalid(student)) {
    return requiredDataFields
      .filter((field) => field.key === "curp")
      .map((field) => ({ ...compactMissingField(field), label: "CURP inválida", missing: true }));
  }
  const missingKeys = new Set(normalizedMissingFields(student, "basic"));
  const missing = requiredDataFields
    .filter((field) => missingKeys.has(String(field.key || "").toLowerCase()))
    .map((field) => ({ ...compactMissingField(field), missing: true }));
  return missing.slice(0, limit);
};
const selectedHealthStudent = computed(() => {
  if (!selectedStudent.value) return null;
  return {
    ...selectedStudent.value,
    ...editForm,
    group: editForm.grupo ?? selectedStudent.value.group ?? selectedStudent.value.grupo ?? "",
    direccion: editForm.direccion || selectedStudent.value.direccion || selectedStudent.value.address || "",
  };
});
const selectedRecordHealth = computed(() => recordHealth(selectedHealthStudent.value));

const gradoOrdinalByName = {
  primero: "1°",
  primer: "1°",
  "1": "1°",
  segundo: "2°",
  "2": "2°",
  tercero: "3°",
  tercer: "3°",
  "3": "3°",
  cuarto: "4°",
  "4": "4°",
  quinto: "5°",
  "5": "5°",
  sexto: "6°",
  "6": "6°",
};
const gradoHeaderOrdinal = (grado) => {
  const key = String(grado || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return gradoOrdinalByName[key] || displayGrado(grado);
};
const selectedWorkspaceGradeLabel = computed(() => {
  const grade = selectedHealthStudent.value?.grado || selectedStudent.value?.grado;
  const ordinal = gradoHeaderOrdinal(grade);
  return ordinal ? `${ordinal} grado` : "Sin grado";
});
const selectedHuskyPassPasswordLabel = computed(() => {
  if (!selectedStudent.value?.huskyPassAvailable) return "Pendiente";
  const credential =
    selectedStudent.value?.huskyPassPlaintext ||
    selectedStudent.value?.huskyPassUsername ||
    "";
  return credential || "Activo";
});
const selectedHuskyPassAriaLabel = computed(() =>
  selectedStudent.value?.huskyPassAvailable
    ? `Abrir Husky Pass ${selectedHuskyPassPasswordLabel.value}`
    : "Abrir Husky Pass pendiente",
);
const goToHuskyPassTab = () => {
  activeDetailTab.value = "system";
};
const selectedBasicHeaderStatusLabel = computed(() => {
  if (selectedRecordHealth.value?.tone === "complete") return "Completo";
  if (studentCurpIsInvalid(selectedHealthStudent.value)) return "CURP inválida";
  const missing = selectedMissingCount.value;
  if (!missing) return selectedRecordHealth.value?.label || "Revisar";
  return missing === 1 ? "1 faltante" : `${missing} faltantes`;
});

const selectedParentSiblingSignature = computed(() => {
  if (!selectedStudent.value) return buildParentSiblingSignature({});
  return buildParentSiblingSignature({
    ...selectedStudent.value,
    nombrePadre: editForm.nombrePadre,
    apellidoPaternoPadre: editForm.apellidoPaternoPadre,
    apellidoMaternoPadre: editForm.apellidoMaternoPadre,
    nombreMadre: editForm.nombreMadre,
    apellidoPaternoMadre: editForm.apellidoPaternoMadre,
    apellidoMaternoMadre: editForm.apellidoMaternoMadre,
  });
});

const selectedControlEscolarSiblings = computed(() => {
  if (!selectedStudent.value || !selectedParentSiblingSignature.value.complete) return [];
  const selectedKey = normalizeMatriculaKey(selectedStudent.value.matricula);
  return controlStudentsIndex.value
    .filter((student) => normalizeMatriculaKey(student.matricula) !== selectedKey)
    .filter((student) => {
      const signature = student.parentSiblingSignature || buildParentSiblingSignature(student);
      return signature.complete && signature.key === selectedParentSiblingSignature.value.key;
    })
    .sort((left, right) => `${left.grado || ''}|${left.group || left.grupo || ''}|${left.fullName || left.nombreCompleto || ''}`.localeCompare(`${right.grado || ''}|${right.group || right.grupo || ''}|${right.fullName || right.nombreCompleto || ''}`, 'es'));
});

const selectedSiblingMatchLabel = computed(() => {
  const signature = selectedParentSiblingSignature.value;
  if (!signature.complete) return "Captura padre y madre completos para detectar hermanos.";
  return "Mismo padre y misma madre registrados.";
});

const selectSiblingStudent = (student) => {
  if (!student?.matricula) return;
  const candidate = controlStudentsIndex.value.find(
    (item) => normalizeMatriculaKey(item.matricula) === normalizeMatriculaKey(student.matricula),
  ) || student;
  selectStudent(candidate);
  activeDetailTab.value = "family";
};
const selectedNextAction = computed(() => {
  const invalid = selectedInvalidActions.value;
  if (invalid.length) {
    const firstInvalid = invalid[0]?.label || "el dato inválido";
    return `Siguiente: revisar ${firstInvalid.toLowerCase()}.`;
  }
  const missing = visibleBasicMissingFields.value;
  if (!missing.length) return "Sin pendientes básicos.";
  const first = missing[0]?.label || "el primer dato pendiente";
  return `Siguiente: completar ${first.toLowerCase()}.`;
});
const selectedBasicCompletedCount = computed(() =>
  Math.max(0, requiredDataFields.length - selectedMissingCount.value),
);
const missingFieldTargets = {
  curp: { tab: "identity", formField: "curp", shortLabel: "CURP" },
  grupo: { tab: "school", formField: "grupo", shortLabel: "Grupo", label: "Grupo pendiente", icon: LucideGraduationCap },
  padreNombre: { tab: "family", formField: "nombrePadre", shortLabel: "Nombre padre" },
  padreApellidoPaterno: { tab: "family", formField: "apellidoPaternoPadre", shortLabel: "Apellido padre" },
  padreTelefono: { tab: "family", formField: "telefonoPadre", shortLabel: "Tel. padre" },
  padreEmail: { tab: "family", formField: "emailPadre", shortLabel: "Email padre" },
  madreNombre: { tab: "family", formField: "nombreMadre", shortLabel: "Nombre madre" },
  madreApellidoPaterno: { tab: "family", formField: "apellidoPaternoMadre", shortLabel: "Apellido madre" },
  madreTelefono: { tab: "family", formField: "telefonoMadre", shortLabel: "Tel. madre" },
  madreEmail: { tab: "family", formField: "emailMadre", shortLabel: "Email madre" },
};
const selectedMissingActions = computed(() =>
  visibleBasicMissingFields.value.map((field) => ({
    ...field,
    ...(missingFieldTargets[field.key] || {
      tab: "identity",
      formField: field.key,
      shortLabel: field.label,
    }),
  })),
);
const invalidFieldTargets = {
  curp: { key: "curp-invalid", tab: "identity", formField: "curp", shortLabel: "CURP inválida", label: "CURP inválida", icon: LucideShieldCheck },
  telefonoPadre: { key: "telefono-padre-invalid", tab: "family", formField: "telefonoPadre", shortLabel: "Tel. padre", label: "Teléfono padre inválido", icon: LucidePhone },
  telefonoMadre: { key: "telefono-madre-invalid", tab: "family", formField: "telefonoMadre", shortLabel: "Tel. madre", label: "Teléfono madre inválido", icon: LucidePhone },
  emailPadre: { key: "email-padre-invalid", tab: "family", formField: "emailPadre", shortLabel: "Email padre", label: "Email padre inválido", icon: LucideMail },
  emailMadre: { key: "email-madre-invalid", tab: "family", formField: "emailMadre", shortLabel: "Email madre", label: "Email madre inválido", icon: LucideMail },
};
const selectedInvalidActions = computed(() =>
  editableInvalidFields().map((field) => invalidFieldTargets[field]).filter(Boolean),
);
const selectedRecordActions = computed(() => {
  const seen = new Set();
  return [...selectedInvalidActions.value, ...selectedMissingActions.value].filter((field) => {
    const key = field.formField || field.key;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});
const selectedRecordIssueCount = computed(() => selectedRecordActions.value.length);
const selectedLastUpdateLabel = computed(() => {
  const value = selectedStudent.value?.updatedAt || selectedStudent.value?.lastUpdatedAt || draftSavedAt.value;
  if (!value) return "Última actualización no disponible";
  try {
    const formatted = new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
    return `Última actualización: ${formatted}`;
  } catch (_) {
    return "Última actualización no disponible";
  }
});
const selectedVerificationRecencyLabel = computed(() => {
  const value = selectedStudent.value?.updatedAt || selectedStudent.value?.lastUpdatedAt || draftSavedAt.value;
  if (!value) return "Sin verificación reciente";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin verificación reciente";
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86400000);
  if (days <= 0) return "Última verificación: hoy";
  if (days === 1) return "Última verificación: ayer";
  try {
    return `Última verificación: ${new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date)}`;
  } catch (_) {
    return "Última verificación reciente";
  }
});
const selectedVisibleActionChips = computed(() => selectedRecordActions.value);
const selectedHiddenActionCount = computed(() =>
  Math.max(0, selectedRecordActions.value.length - selectedVisibleActionChips.value.length),
);
const goToMissingField = (field = {}) => {
  if (field.formField === "grupo") {
    activeDetailTab.value = "school";
    openGroupModal();
    return;
  }
  if (field.tab) activeDetailTab.value = field.tab;
  nextTick(() => {
    if (!process.client || !field.formField) return;
    const selector = `[data-ce-field="${field.formField}"] input, [data-ce-field="${field.formField}"] select, [data-ce-field="${field.formField}"] textarea`;
    const target = document.querySelector(selector);
    target?.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "nearest" });
    window.requestAnimationFrame(() => target?.focus?.({ preventScroll: true }));
  });
};
const familyTargetFields = {
  padre: ["nombrePadre", "apellidoPaternoPadre", "telefonoPadre", "emailPadre"],
  madre: ["nombreMadre", "apellidoPaternoMadre", "telefonoMadre", "emailMadre"],
  contacto: ["telefonoPadre", "telefonoMadre", "emailPadre", "emailMadre"],
  grupo: ["grupo"],
  curp: ["curp"],
};
const targetForFamilyArea = (key = "") => {
  const normalizedKey = String(key || "").toLowerCase();
  if (normalizedKey === "grupo") return { tab: "school", formField: "grupo" };
  const fields = familyTargetFields[normalizedKey] || familyTargetFields.curp;
  const formField = fields.find((field) => fieldValidationState(field) !== "ok") || fields[0];
  return { tab: normalizedKey === "curp" ? "identity" : "family", formField };
};
const goToStatusSignal = (signal = {}) => {
  goToMissingField(targetForFamilyArea(signal.key));
};
const goToFamilySummary = (group = {}) => {
  goToMissingField(targetForFamilyArea(group.key));
};
const goToFirstPendingField = () => {
  goToMissingField(selectedRecordActions.value[0] || {});
};
const selectedBasicMetrics = computed(() => rowHealthMetrics(selectedHealthStudent.value, 8));
const selectedFamilySummaryCards = computed(() => {
  const father = familyPersonState("padre");
  const mother = familyPersonState("madre");
  const contact = familyCriticalContactState.value;
  return [
    {
      key: "padre",
      title: "Padre",
      tone: `is-${father.tone}`,
      label: father.status,
      count: `${father.completed}/${father.total}`,
      progress: father.progress,
      summary: father.summary,
      icon: LucideUserRound,
    },
    {
      key: "madre",
      title: "Madre",
      tone: `is-${mother.tone}`,
      label: mother.status,
      count: `${mother.completed}/${mother.total}`,
      progress: mother.progress,
      summary: mother.summary,
      icon: LucideUsersRound,
    },
    {
      key: "contacto",
      title: "Contacto crítico",
      tone: `is-${contact.tone}`,
      label: contact.status,
      count: `${contact.completed}/${contact.total}`,
      progress: contact.progress,
      summary: contact.summary,
      icon: LucidePhone,
    },
  ];
});
const derivedGenderMeta = computed(() => {
  if (!curpDerivedIdentity.value?.valid) {
    return {
      label: "Sin inferencia",
      symbol: "•",
      tone: "neutral",
    };
  }
  return curpDerivedIdentity.value?.sexoCorto === "H"
    ? { label: "Masculino", symbol: "♂", tone: "male" }
    : { label: "Femenino", symbol: "♀", tone: "female" };
});
const formValue = (field) => String(editForm[field] ?? "").trim();
const inferredParentLastNameSource = (field) =>
  field === "apellidoPaternoMadre"
    ? formValue("apellidoMaterno")
    : formValue("apellidoPaterno");
const parentLastNameSuggestion = (field) => inferredParentLastNameSource(field);
const parentLastNameSuggestionVisible = (field) => {
  const suggestion = parentLastNameSuggestion(field);
  if (!suggestion) return false;
  if (activeParentLastNameSuggestion.value !== field) return false;
  if (dismissedParentLastNameSuggestions.value[field] === suggestion) return false;
  const currentValue = formValue(field);
  return !currentValue || currentValue.toLowerCase() !== suggestion.toLowerCase();
};
const showParentLastNameSuggestion = (field) => {
  activeParentLastNameSuggestion.value = field;
};
const hideParentLastNameSuggestion = () => {
  window.setTimeout(() => {
    activeParentLastNameSuggestion.value = "";
  }, 120);
};
const dismissParentLastNameSuggestion = (field) => {
  const suggestion = parentLastNameSuggestion(field);
  dismissedParentLastNameSuggestions.value = {
    ...dismissedParentLastNameSuggestions.value,
    [field]: suggestion,
  };
  activeParentLastNameSuggestion.value = "";
};
const applyParentLastNameSuggestion = (field) => {
  const suggestion = parentLastNameSuggestion(field);
  if (!suggestion) return;
  editForm[field] = suggestion;
  activeParentLastNameSuggestion.value = "";
  nextTick(() => {
    if (!process.client) return;
    document
      .querySelector(`[data-ce-field="${field}"] input`)
      ?.focus?.();
  });
};
const formFieldIsOk = (field) => fieldValidationState(field) === "ok";
const familyPersonState = (type = "padre") => {
  const fields = type === "madre"
    ? ["nombreMadre", "apellidoPaternoMadre", "telefonoMadre", "emailMadre"]
    : ["nombrePadre", "apellidoPaternoPadre", "telefonoPadre", "emailPadre"];
  const labels = {
    nombrePadre: "nombre",
    apellidoPaternoPadre: "apellido paterno",
    telefonoPadre: "teléfono",
    emailPadre: "email",
    nombreMadre: "nombre",
    apellidoPaternoMadre: "apellido paterno",
    telefonoMadre: "teléfono",
    emailMadre: "email",
  };
  const missing = fields.filter((field) => !formFieldIsOk(field));
  const completed = fields.length - missing.length;
  const noun = type === "madre" ? "Madre" : "Padre";
  return {
    key: type,
    label: noun,
    total: fields.length,
    completed,
    missing,
    progress: Math.round((completed / Math.max(fields.length, 1)) * 100),
    tone: missing.length ? (missing.length >= 2 ? "danger" : "warning") : "complete",
    status: missing.length ? `${missing.length} pendiente${missing.length === 1 ? "" : "s"}` : "Listo",
    summary: missing.length
      ? `Falta ${missing.slice(0, 2).map((field) => labels[field]).join(", ")}`
      : "",
  };
};
const familyCriticalContactState = computed(() => {
  const hasPhone = phoneIsValid(formValue("telefonoPadre")) || phoneIsValid(formValue("telefonoMadre"));
  const hasEmail = emailIsValid(formValue("emailPadre")) || emailIsValid(formValue("emailMadre"));
  const missing = [
    !hasPhone ? "teléfono" : "",
    !hasEmail ? "email" : "",
  ].filter(Boolean);
  return {
    key: "critical-contact",
    label: "Contacto crítico",
    total: 2,
    completed: Number(hasPhone) + Number(hasEmail),
    missing,
    progress: Math.round(((Number(hasPhone) + Number(hasEmail)) / 2) * 100),
    tone: missing.length ? "danger" : "complete",
    status: missing.length ? "Incompleto" : "Listo",
    summary: missing.length ? `Falta ${missing.join(" y ")}` : "",
  };
});
const familySectionState = (type = "padre") => {
  const state = familyPersonState(type);
  return {
    tone: `is-${state.tone}`,
    label: state.status,
    progress: state.progress,
  };
};
const selectedFamilyReadiness = computed(() => {
  const father = familyPersonState("padre");
  const mother = familyPersonState("madre");
  const contact = familyCriticalContactState.value;
  const total = father.total + mother.total + contact.total;
  const completed = father.completed + mother.completed + contact.completed;
  const pending = total - completed;
  const severe = [father, mother, contact].some((item) => item.tone === "danger");
  return {
    total,
    completed,
    pending,
    tone: pending ? (severe ? "danger" : "warning") : "complete",
    label: pending ? `${pending} pendientes` : "Listo",
    summary: pending
      ? [father, mother, contact].filter((item) => item.missing.length).map((item) => item.label).join(" · ")
      : "",
  };
});
const familyReadinessGroups = computed(() => {
  const withIcon = (state, icon) => ({ ...state, icon, tone: `is-${state.tone}` });
  return [
    withIcon(familyPersonState("padre"), LucideUserRound),
    withIcon(familyPersonState("madre"), LucideUsersRound),
    withIcon(familyCriticalContactState.value, LucidePhone),
  ];
});
const normalizeCurpInput = (value) => String(value || "")
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "")
  .slice(0, 18);
const curpDerivedIdentity = computed(() => inferMexicanCurpIdentity(editForm.curp || selectedStudent.value?.curp || ""));
const computeAgeFromDate = (value) => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const birth = new Date(`${text}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
};
const derivedAgeLabel = computed(() => {
  const age = computeAgeFromDate(curpDerivedIdentity.value?.fechaNacimiento);
  return age === null ? 'Edad no disponible' : `${age} año${age === 1 ? '' : 's'}`;
});
const normalizeHeaderGender = (value) => {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return "";
  if (["1", "h", "hombre", "masculino", "male", "nino", "niño"].includes(raw)) return "male";
  if (["0", "m", "mujer", "f", "femenino", "female", "nina", "niña"].includes(raw)) return "female";
  return "";
};
const selectedHeaderGenderChip = computed(() => {
  const explicit =
    normalizeHeaderGender(selectedHealthStudent.value?.sexo) ||
    normalizeHeaderGender(selectedStudent.value?.genero) ||
    normalizeHeaderGender(selectedStudent.value?.gender) ||
    normalizeHeaderGender(curpDerivedIdentity.value?.sexoCorto);
  if (explicit === "male") return { label: "Niño", tone: "male", symbol: "♂" };
  if (explicit === "female") return { label: "Niña", tone: "female", symbol: "♀" };
  return null;
});
const selectedHeaderContextTone = computed(() => selectedHeaderGenderChip.value?.tone || "neutral");
const normalizeHeaderBirthDate = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slash) return `${slash[3]}-${String(slash[2]).padStart(2, "0")}-${String(slash[1]).padStart(2, "0")}`;
  return "";
};
const selectedHeaderBirthDate = computed(() =>
  normalizeHeaderBirthDate(curpDerivedIdentity.value?.fechaNacimiento) ||
  normalizeHeaderBirthDate(selectedStudent.value?.fechaNacimiento) ||
  normalizeHeaderBirthDate(selectedStudent.value?.birth) ||
  normalizeHeaderBirthDate(selectedStudent.value?.birthDate) ||
  normalizeHeaderBirthDate(selectedStudent.value?.nacimiento),
);
const selectedHeaderBirthDateLabel = computed(() => {
  if (!selectedHeaderBirthDate.value) return "";
  const [year, month, day] = selectedHeaderBirthDate.value.split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
});
const selectedHeaderAgeChip = computed(() => {
  const age = computeAgeFromDate(selectedHeaderBirthDate.value);
  return age === null ? "" : `${age} año${age === 1 ? "" : "s"}`;
});
const goToCurpField = () => {
  goToMissingField({ tab: "identity", formField: "curp" });
};
const groupSigilTransitionKey = ref(0);
const groupSigilSwapping = ref(false);
let groupSigilSwapTimer = null;
const selectedHeaderGroupSigil = computed(() => {
  const group = normalizeGroupPickerText(editForm.grupo);
  if (!group) return null;
  const displayLabel = groupLabelForUi(group);
  return {
    value: group,
    displayLabel,
    label: `Grupo ${displayLabel}`,
  };
});
watch(
  () => normalizeGroupPickerText(editForm.grupo),
  (nextGroup, previousGroup) => {
    if (nextGroup === previousGroup || !selectedStudent.value) return;
    groupSigilTransitionKey.value += 1;
    groupSigilSwapping.value = true;
    if (groupSigilSwapTimer) globalThis.clearTimeout(groupSigilSwapTimer);
    groupSigilSwapTimer = globalThis.setTimeout(() => {
      groupSigilSwapping.value = false;
      groupSigilSwapTimer = null;
    }, 720);
  },
);
const curpValidationMeta = (value) => {
  const normalized = normalizeCurpInput(value);
  if (!normalized) return { state: 'missing', message: 'Requerida' };
  if (normalized.length < 18) return { state: 'invalid', message: `Faltan ${18 - normalized.length} caracteres` };
  if (!/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(normalized)) {
    return { state: 'invalid', message: 'Formato oficial inválido' };
  }
  const inferred = inferMexicanCurpIdentity(normalized);
  if (!inferred.valid) return { state: 'invalid', message: 'Fecha o sexo no válidos en CURP' };
  return { state: 'ok', message: '' };
};
const emailIsValid = (value) => {
  const email = String(value || "").trim().toLowerCase();
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
};
const normalizePhoneForValidation = (value) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('521') && digits.length === 13) digits = digits.slice(3);
  else if (digits.startsWith('52') && digits.length === 12) digits = digits.slice(2);
  return digits;
};
const phoneIsValid = (value) => {
  const digits = normalizePhoneForValidation(value);
  return digits.length === 10;
};
const fieldValidationState = (field) => {
  const value = String(editForm[field] ?? "").trim();
  const fieldMap = {
    curp: { key: "curp", tier: "basic", kind: "curp" },
    apellidoPaterno: { key: "apellidoPaternoAlumno", tier: "complete", kind: "text" },
    apellidoMaterno: { key: "apellidoMaternoAlumno", tier: "complete", kind: "text" },
    nombres: { key: "nombresAlumno", tier: "complete", kind: "text" },
    nombrePadre: { key: "padreNombre", tier: "basic", kind: "text" },
    apellidoPaternoPadre: { key: "padreApellidoPaterno", tier: "basic", kind: "text" },
    telefonoPadre: { key: "padreTelefono", tier: "basic", kind: "phone" },
    emailPadre: { key: "padreEmail", tier: "basic", kind: "email" },
    nombreMadre: { key: "madreNombre", tier: "basic", kind: "text" },
    apellidoPaternoMadre: { key: "madreApellidoPaterno", tier: "basic", kind: "text" },
    telefonoMadre: { key: "madreTelefono", tier: "basic", kind: "phone" },
    emailMadre: { key: "madreEmail", tier: "basic", kind: "email" },
  };
  const config = fieldMap[field];
  if (!config) return "neutral";
  const selectedMissing = normalizedMissingFields(selectedHealthStudent.value, config.tier);
  const missingKey = String(config.key || field).toLowerCase();
  if (!value) return selectedMissing.includes(missingKey) ? "missing" : "neutral";
  if (config.kind === "curp") return curpValidationMeta(value).state === 'ok' ? 'ok' : 'invalid';
  if (config.kind === "phone") return phoneIsValid(value) ? "ok" : "invalid";
  if (config.kind === "email") return emailIsValid(value) ? "ok" : "invalid";
  return value.length >= 2 ? "ok" : "invalid";
};
const fieldShellClass = (field) => {
  const state = fieldValidationState(field);
  return ["ce-smart-field", `is-${state}`];
};
const fieldValidationMessage = (field) => {
  const state = fieldValidationState(field);
  if (state === "ok") return "";
  if (field === "curp") {
    return curpValidationMeta(editForm.curp).message;
  }
  if (field.toLowerCase().includes("telefono")) {
    if (state === "missing") return "Requerido";
    if (state === "invalid") return "Usa 10 dígitos válidos";
  }
  if (field.toLowerCase().includes("email")) {
    if (state === "missing") return "Requerido";
    if (state === "invalid") return "Correo familiar válido";
  }
  if (state === "missing") return "Requerido";
  if (state === "invalid") return "Revisa el dato";
  return "";
};
const validationCount = (fields = []) =>
  fields.filter((field) => ["missing", "invalid"].includes(fieldValidationState(field))).length;
const selectedIdentityStatus = computed(() => {
  const curpState = fieldValidationState("curp");
  const pending = validationCount(["curp", "apellidoPaterno", "apellidoMaterno", "nombres"]);
  if (curpState === "invalid")
    return { tone: "danger", label: "CURP inválida", count: pending };
  if (pending)
    return {
      tone: curpState === "missing" ? "danger" : "warning",
      label: `${pending} pendiente${pending === 1 ? "" : "s"}`,
      count: pending,
    };
  return { tone: "complete", label: "Listo", count: 0 };
});
const selectedSchoolStatus = computed(() => {
  const schoolKeys = ["nivel", "grado", "grupo"];
  const missing = schoolKeys.filter((key) =>
    normalizedMissingFields(selectedHealthStudent.value, "complete").includes(key),
  );
  if (!missing.length)
    return { tone: "complete", label: "Listo", count: 0, summary: "" };
  return {
    tone: missing.length >= 3 ? "warning" : "neutral",
    label: `${missing.length} pendiente${missing.length === 1 ? "" : "s"}`,
    count: missing.length,
    summary: `Falta ${missing.slice(0, 2).join(", ")}${missing.length > 2 ? "..." : ""}.`,
  };
});
const selectedGroupState = computed(() => {
  const group = controlGroupLabel(selectedHealthStudent.value || selectedStudent.value);
  const missing = !group;
  return {
    key: "grupo",
    title: "Grupo",
    total: 1,
    completed: missing ? 0 : 1,
    missing: missing ? ["grupo"] : [],
    tone: missing ? "warning" : "complete",
    status: missing ? "Sin grupo" : "Listo",
    summary: missing ? "Asigna un grupo para completar el expediente básico." : `Grupo ${group} asignado.`,
  };
});
const selectedStatusSignals = computed(() => {
  const curpState = fieldValidationState("curp");
  const father = familyPersonState("padre");
  const mother = familyPersonState("madre");
  const contact = familyCriticalContactState.value;
  const group = selectedGroupState.value;
  const curpLabel =
    curpState === "ok" ? "Listo" : curpState === "invalid" ? "Inválida" : "Pendiente";
  const curpSummary =
    curpState === "ok"
      ? `${curpDerivedIdentity.value.fechaNacimiento} · ${derivedGenderMeta.value.label} · ${derivedAgeLabel.value}`
      : curpState === "invalid"
        ? "No se puede inferir nacimiento ni sexo."
        : "Falta CURP para inferir identidad.";

  return [
    {
      key: "curp",
      title: "CURP",
      label: curpLabel,
      summary: curpSummary,
      count: curpState === "ok" ? "1/1" : "0/1",
      tone: curpState === "ok" ? "complete" : curpState === "invalid" ? "danger" : "warning",
      icon: LucideShieldCheck,
    },
    {
      key: "grupo",
      title: "Grupo",
      label: group.status,
      summary: group.summary,
      count: `${group.completed}/${group.total}`,
      tone: group.tone,
      icon: LucideGraduationCap,
    },
    {
      key: "padre",
      title: "Padre",
      label: father.status,
      summary: father.summary || "Información completa y verificada.",
      count: `${father.completed}/${father.total}`,
      tone: father.tone,
      icon: LucideUserRound,
    },
    {
      key: "madre",
      title: "Madre",
      label: mother.status,
      summary: mother.summary || "Información completa y verificada.",
      count: `${mother.completed}/${mother.total}`,
      tone: mother.tone,
      icon: LucideUsersRound,
    },
    {
      key: "contacto",
      title: "Contacto",
      label: contact.status,
      summary: contact.summary || "Información completa y verificada.",
      count: `${contact.completed}/${contact.total}`,
      tone: contact.tone,
      icon: LucidePhone,
    },
  ];
});
const selectedPendingSummary = computed(() => {
  const signals = selectedStatusSignals.value;
  const completeCount = signals.filter((signal) => signal.tone === "complete").length;
  const total = signals.length || 1;
  const allComplete = completeCount === total && selectedRecordIssueCount.value === 0;
  const tone = allComplete
    ? "complete"
    : selectedRecordHealth.value?.tone === "danger"
      ? "danger"
      : "warning";
  return {
    tone,
    icon: allComplete ? LucideCheck : LucideAlertTriangle,
    title: allComplete ? "Todo al día" : tone === "danger" ? "Requiere atención" : "Pendientes en revisión",
    summary: allComplete
      ? `Las ${completeCount} secciones requeridas están completas.`
      : `${selectedRecordIssueCount.value} pendiente${selectedRecordIssueCount.value === 1 ? "" : "s"} por resolver para completar el expediente.`,
    metrics: [
      {
        key: "sections",
        icon: LucideFileSpreadsheet,
        value: `${completeCount} de ${total}`,
        label: "Secciones completas",
      },
      {
        key: "expediente",
        icon: LucideShieldCheck,
        value: `${selectedProfileCompletion.value}%`,
        label: "Expediente básico",
      },
      allComplete
        ? {
            key: "updated",
            icon: LucideClock3,
            value: "Actualizado",
            label: selectedVerificationRecencyLabel.value,
          }
        : {
            key: "issues",
            icon: LucideAlertTriangle,
            value: `${selectedRecordIssueCount.value}`,
            label: "Pendientes activos",
            caption: selectedNextAction.value,
          },
    ],
  };
});
const detailTabState = (key) => {
  const father = familyPersonState("padre");
  const mother = familyPersonState("madre");
  const contact = familyCriticalContactState.value;
  const familyPending = father.missing.length + mother.missing.length + contact.missing.length;
  const states = {
    summary: {
      tone: selectedRecordIssueCount.value ? selectedRecordHealth.value.tone : "complete",
      count: selectedRecordIssueCount.value,
    },
    identity: selectedIdentityStatus.value,
    school: selectedSchoolStatus.value,
    family: {
      tone: familyPending ? (familyPending >= 3 ? "danger" : "warning") : "complete",
      count: familyPending,
    },
    advanced: {
      tone: advancedExpedienteStatus.value.tone,
      count: advancedMissingCount.value,
    },
    system: {
      tone: selectedStudent.value?.huskyPassAvailable ? "complete" : "warning",
      count: selectedStudent.value?.huskyPassAvailable ? 0 : 1,
    },
    notes: { tone: "neutral", count: 0 },
  };
  return states[key] || { tone: "neutral", count: 0 };
};
const EDIT_FORM_SAVE_VALIDATION_FIELDS = [
  "curp",
  "telefonoPadre",
  "telefonoMadre",
  "emailPadre",
  "emailMadre",
];

const editableInvalidFields = (fields = EDIT_FORM_SAVE_VALIDATION_FIELDS) =>
  fields.filter(
    (field) =>
      EDIT_FORM_SAVE_VALIDATION_FIELDS.includes(field) &&
      fieldValidationState(field) === "invalid",
  );
const huskyPassEmailTarget = computed(
  () =>
    selectedStudent.value?.emailPadre ||
    selectedStudent.value?.emailMadre ||
    selectedStudent.value?.email ||
    selectedStudent.value?.huskyPassEmail ||
    "",
);
const huskyPassManualPasswordValid = computed(() => {
  const value = String(manualHuskyPassPassword.value || "").trim();
  return value.length >= 6 && value.length <= 64;
});
const huskyPassGenerateLabel = computed(() => {
  if (savingHuskyPass.value) return "Guardando...";
  return selectedStudent.value?.huskyPassAvailable ? "Regenerar contraseña" : "Generar acceso";
});
const bloodTypeOptions = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const advancedTextFields = [
  { key: "lugarNacimiento", label: "Lugar nacimiento" },
  { key: "talla", label: "Talla" },
  { key: "peso", label: "Peso" },
  { key: "tipoSangre", label: "Tipo de sangre" },
  { key: "alergias", label: "Alergias" },
  { key: "estadoCivilPadre", label: "Estado civil padre" },
  { key: "fechaNacimientoPadre", label: "Fecha nacimiento padre" },
  { key: "inePadre", label: "INE padre" },
  { key: "curpPadre", label: "CURP padre" },
  { key: "estadoCivilMadre", label: "Estado civil madre" },
  { key: "fechaNacimientoMadre", label: "Fecha nacimiento madre" },
  { key: "ineMadre", label: "INE madre" },
  { key: "curpMadre", label: "CURP madre" },
  { key: "domicilioCalle", label: "Calle" },
  { key: "domicilioNumero", label: "Número" },
  { key: "domicilioColonia", label: "Colonia" },
  { key: "domicilioCp", label: "Código postal" },
  { key: "domicilioMunicipio", label: "Municipio" },
];
const advancedFileFields = [
  { key: "certificadoMedicoAdjunto", label: "Certificado médico" },
  { key: "certificadoVacunacionCovid19Adjunto", label: "Certificado vacunación COVID-19" },
  { key: "actaNacimientoAdjunta", label: "Acta nacimiento" },
  { key: "curpAlumnoAdjunto", label: "CURP alumno" },
  { key: "certificadoPrimariaAdjunto", label: "Certificado primaria" },
  { key: "boletaSextoPrimariaAdjunta", label: "Boleta sexto primaria" },
  { key: "boletaPrimeroSecundariaAdjunta", label: "Boleta primero secundaria" },
  { key: "boletaSegundoSecundariaAdjunta", label: "Boleta segundo secundaria" },
];
const advancedExpedienteFields = [...advancedTextFields, ...advancedFileFields];
const fieldValueIsPresent = (value) => String(value ?? "").trim().length > 0;
const advancedMissingCount = computed(() =>
  advancedExpedienteFields.filter((field) => !fieldValueIsPresent(editForm[field.key])).length,
);
const advancedExpedienteStatus = computed(() => {
  const missing = advancedMissingCount.value;
  if (!missing) return { tone: "complete", label: "Completo" };
  return {
    tone: missing >= 8 ? "danger" : "warning",
    label: missing === 1 ? "1 pendiente" : `${missing} pendientes`,
  };
});
const advancedFileValueLabel = (fieldKey) => {
  if (uploadingAdvancedField.value === fieldKey) return "Subiendo archivo...";
  const value = String(editForm[fieldKey] || "").trim();
  if (!value) return "Seleccionar archivo";
  try {
    const parsed = JSON.parse(value);
    return parsed?.fileName || parsed?.path || parsed?.url || "Archivo cargado";
  } catch {
    return value.split("/").filter(Boolean).pop() || "Archivo cargado";
  }
};

const EDIT_FORM_FIELDS = [
  "nombres",
  "apellidoPaterno",
  "apellidoMaterno",
  "curp",
  "nombreVerificado",
  "nombreCompletoAlumno",
  "lugarNacimiento",
  "sexo",
  "talla",
  "peso",
  "tipoSangre",
  "alergias",
  "foto",
  "grupo",
  "baja",
  "motivoBaja",
  "categoriaBaja",
  "seguimientoBaja",
  "nombrePadre",
  "apellidoPaternoPadre",
  "apellidoMaternoPadre",
  "estadoCivilPadre",
  "fechaNacimientoPadre",
  "inePadre",
  "curpPadre",
  "nombreMadre",
  "apellidoPaternoMadre",
  "apellidoMaternoMadre",
  "estadoCivilMadre",
  "fechaNacimientoMadre",
  "ineMadre",
  "curpMadre",
  "telefonoPadre",
  "telefonoMadre",
  "emailPadre",
  "emailMadre",
  "direccion",
  "domicilioCalle",
  "domicilioNumero",
  "domicilioColonia",
  "domicilioCp",
  "domicilioMunicipio",
  "certificadoMedicoAdjunto",
  "certificadoVacunacionCovid19Adjunto",
  "actaNacimientoAdjunta",
  "curpAlumnoAdjunto",
  "certificadoPrimariaAdjunto",
  "boletaSextoPrimariaAdjunta",
  "boletaPrimeroSecundariaAdjunta",
  "boletaSegundoSecundariaAdjunta",
];
const CONTROL_ESCOLAR_EDIT_NAME_FIELDS = EDIT_FORM_FIELDS.filter((field) => isControlEscolarNameField(field));

const formatNameValue = (value) => toNameDisplayCase(value);

const formatNameField = (field) => {
  if (!isControlEscolarNameField(field)) return;
  editForm[field] = formatNameValue(editForm[field]);
};

const formatEditNameFields = () => {
  CONTROL_ESCOLAR_EDIT_NAME_FIELDS.forEach(formatNameField);
};

const onParentLastNameBlur = (field) => {
  hideParentLastNameSuggestion();
  formatNameField(field);
};

const readEditForm = ({ normalizeNames = false } = {}) =>
  EDIT_FORM_FIELDS.reduce((draft, field) => {
    const value = editForm[field] ?? "";
    draft[field] = normalizeNames && isControlEscolarNameField(field)
      ? formatNameValue(value)
      : value;
    return draft;
  }, {});

const parseEditSnapshot = () => {
  try {
    const parsed = JSON.parse(editSnapshot.value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const editFieldValuesEqual = (field, currentValue, snapshotValue) => {
  if (field === "baja") return Number(currentValue || 0) === Number(snapshotValue || 0);
  return String(currentValue ?? "") === String(snapshotValue ?? "");
};

const readDirtyEditForm = ({ normalizeNames = false } = {}) => {
  const current = readEditForm({ normalizeNames });
  const snapshot = parseEditSnapshot();
  return EDIT_FORM_FIELDS.reduce((draft, field) => {
    if (!editFieldValuesEqual(field, current[field], snapshot[field])) {
      draft[field] = current[field];
    }
    return draft;
  }, {});
};

const formSnapshot = () => JSON.stringify(readEditForm());
const hasUnsavedChanges = computed(() =>
  Boolean(
    selectedStudent.value &&
    editSnapshot.value &&
    formSnapshot() !== editSnapshot.value,
  ),
);
const saveStateTone = computed(() =>
  saveError.value
    ? "error"
    : hasUnsavedChanges.value
      ? "dirty"
      : "clean",
);
const saveStatusText = computed(() => {
  if (saveError.value) return "Error al guardar";
  if (hasUnsavedChanges.value)
    return draftSavedAt.value
      ? `Borrador local ${draftSavedAt.value}`
      : "Cambios sin guardar";
  return selectedStudent.value?.overlayExists ? "Al día" : "Guardar";
});
const draftKey = computed(() =>
  draftStorageKeyFor(selectedAgentId.value, selectedStudent.value?.matricula),
);

const buildScopeQuery = () => ({
  agentId: selectedAgentId.value || undefined,
  ciclo: currentCicloKey.value,
  concepts: externalConcepts.value.join(",") || undefined,
  tipoConcepts: tipoIngresoConcepts.value.join(",") || undefined,
});

const buildQuery = (extra = {}) => ({
  ...buildScopeQuery(),
  search: filters.search || undefined,
  status: filters.status || undefined,
  quality: filters.quality || undefined,
  grado: filters.grado || undefined,
  group: filters.group || undefined,
  recent: filters.recent || undefined,
  page: pagination.page,
  limit: pagination.limit,
  ...extra,
});

const buildIndexQuery = () => ({
  ...buildScopeQuery(),
  page: 1,
  limit: 500,
  all: "1",
});

const normalizeControlScopeConcepts = (value = "") =>
  String(value || "")
    .split(",")
    .map((concept) => concept.trim())
    .filter(Boolean)
    .join(",");

const controlScopeSignatureFromQuery = (query = buildScopeQuery()) =>
  JSON.stringify({
    agentId: String(query?.agentId || "").trim(),
    ciclo: normalizeCicloKey(query?.ciclo || ""),
    concepts: normalizeControlScopeConcepts(query?.concepts),
    tipoConcepts: normalizeControlScopeConcepts(query?.tipoConcepts),
  });

const currentControlScopeSignature = () =>
  controlScopeSignatureFromQuery(buildScopeQuery());

const isCurrentControlScopeSignature = (scopeSignature = "") =>
  scopeSignature === currentControlScopeSignature();

const loadOptions = async () => {
  optionsLoading.value = true;
  try {
    const activeCookiePlantel = readActiveControlPlantelCookie();
    const response = await $fetch("/api/control-escolar/options", {
      cache: "no-store",
      query: { _scope: Date.now() },
    });
    const responsePlantel = controlSpecificPlantel(response?.activePlantel);
    loadError.value = "";

    if (activeCookiePlantel && responsePlantel && responsePlantel !== activeCookiePlantel) {
      console.warn("[Control Escolar] Ignorando opciones con plantel activo obsoleto.", {
        cookiePlantel: activeCookiePlantel,
        responsePlantel,
      });
      selectedAgentId.value = activeCookiePlantel;
      return;
    }

    selectedAgentId.value = responsePlantel || activeCookiePlantel || "";
  } catch (error) {
    selectedAgentId.value = readActiveControlPlantelCookie();
    loadError.value =
      error?.data?.message ||
      error?.message ||
      "No se pudo resolver el plantel activo.";
  } finally {
    optionsLoading.value = false;
  }
};

const loadKpis = async () => {
  if (!selectedAgentId.value) return;
  kpisLoading.value = true;
  try {
    const response = await $fetch("/api/control-escolar/kpis", {
      cache: "no-store",
      query: buildScopeQuery(),
    });
    kpis.value = response.kpis;
  } catch (error) {
    kpis.value = null;
    loadError.value =
      error?.data?.message ||
      error?.message ||
      "No se pudieron cargar los indicadores.";
  } finally {
    kpisLoading.value = false;
  }
};

const normalizeControlCacheParams = (query = buildQuery()) =>
  Object.keys(query || {})
    .sort()
    .reduce((normalized, key) => {
      const value = query[key];
      if (value === undefined || value === null || value === "")
        return normalized;
      normalized[key] = String(value);
      return normalized;
    }, {});

const controlCacheScopeFromQuery = (query = buildQuery()) => ({
  agentId: String(query?.agentId || selectedAgentId.value || "").trim(),
  ciclo: normalizeCicloKey(query?.ciclo || currentCicloKey.value || ""),
});

const controlStudentsCacheSignature = (query = buildQuery()) =>
  encodeURIComponent(JSON.stringify(normalizeControlCacheParams(query)));

const controlStudentsLegacyCacheKey = (
  query = buildQuery(),
  version = CONTROL_STUDENTS_CACHE_VERSION,
) =>
  `${CONTROL_STUDENTS_CACHE_NAMESPACE}:v${version}:${controlStudentsCacheSignature(query)}`;

const controlStudentsScopeCacheKey = (
  query = buildQuery(),
  version = CONTROL_STUDENTS_SCOPE_CACHE_VERSION,
) => {
  const scope = controlCacheScopeFromQuery(query);
  return `${CONTROL_STUDENTS_SCOPE_CACHE_NAMESPACE}:v${version}:${encodeURIComponent(scope.agentId)}:${encodeURIComponent(scope.ciclo)}`;
};

const controlStudentsCacheKey = (
  query = buildQuery(),
  version = CONTROL_STUDENTS_CACHE_VERSION,
) => {
  const scope = controlCacheScopeFromQuery(query);
  return `${CONTROL_STUDENTS_CACHE_NAMESPACE}:v${version}:${encodeURIComponent(scope.agentId)}:${encodeURIComponent(scope.ciclo)}:${controlStudentsCacheSignature(query)}`;
};

const controlStudentsCacheLookupKeys = (query = buildQuery()) => [
  controlStudentsScopeCacheKey(query),
  ...CONTROL_STUDENTS_CACHE_READ_VERSIONS.flatMap((version) => [
    controlStudentsCacheKey(query, version),
    controlStudentsLegacyCacheKey(query, version),
  ]),
];

const clearControlStudentsBrowserCache = () => {
  if (!process.client) return;
  try {
    const keysToRemove = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || "";
      if (
        key.startsWith(CONTROL_STUDENTS_CACHE_NAMESPACE) ||
        key.startsWith(CONTROL_STUDENTS_SCOPE_CACHE_NAMESPACE)
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn("[Control Escolar] No se pudo limpiar la caché local de alumnos.", error);
  }
};

const readControlScopeCacheIndex = () => {
  if (!process.client) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTROL_STUDENTS_SCOPE_CACHE_INDEX_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (_) {
    return [];
  }
};

const writeControlScopeCacheIndex = (keys = []) => {
  if (!process.client) return;
  try {
    localStorage.setItem(
      CONTROL_STUDENTS_SCOPE_CACHE_INDEX_KEY,
      JSON.stringify(keys.slice(0, CONTROL_STUDENTS_SCOPE_CACHE_MAX_SCOPES)),
    );
  } catch (_) {}
};

const touchControlScopeCacheKey = (key) => {
  if (!process.client || !key) return;
  const nextKeys = [key, ...readControlScopeCacheIndex().filter((candidate) => candidate !== key)];
  const staleKeys = nextKeys.slice(CONTROL_STUDENTS_SCOPE_CACHE_MAX_SCOPES);
  staleKeys.forEach((staleKey) => {
    try {
      localStorage.removeItem(staleKey);
    } catch (_) {}
  });
  writeControlScopeCacheIndex(nextKeys);
};

const removeLegacyControlStudentsCacheForScope = (query = buildQuery()) => {
  if (!process.client) return;
  const scope = controlCacheScopeFromQuery(query);
  const scopePrefix = `${CONTROL_STUDENTS_CACHE_NAMESPACE}:v`;
  const encodedAgent = encodeURIComponent(scope.agentId);
  const encodedCiclo = encodeURIComponent(scope.ciclo);

  try {
    const keysToRemove = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || "";
      if (
        key.startsWith(scopePrefix) &&
        key.includes(`:${encodedAgent}:${encodedCiclo}:`)
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (_) {}
};

const isCachedControlStudentsForScope = (cached, query = buildQuery()) => {
  const scope = controlCacheScopeFromQuery(query);
  const cachedScope = cached?.scope || cached?.query || {};
  return (
    String(cachedScope.agentId || "").trim() === scope.agentId &&
    normalizeCicloKey(cachedScope.ciclo || "") === scope.ciclo
  );
};

const isControlPhotoCacheKey = (key = "") => {
  const normalized = String(key).toLowerCase();
  return (
    normalized === "foto" ||
    normalized.includes("photo") ||
    normalized.includes("foto") ||
    normalized.includes("image") ||
    normalized.includes("avatar") ||
    normalized.includes("picture") ||
    normalized.includes("thumbnail") ||
    normalized.includes("portrait")
  );
};

const sanitizeControlStudentForCache = (student = {}) => {
  if (!student || typeof student !== "object") return student;

  return Object.entries(student).reduce((sanitized, [key, value]) => {
    if (isControlPhotoCacheKey(key)) return sanitized;
    sanitized[key] = value;
    return sanitized;
  }, {});
};

const sanitizeControlStudentsForCache = (data = []) =>
  Array.isArray(data) ? data.map(sanitizeControlStudentForCache) : [];

const normalizeCachedControlStudentsRecord = (cached = {}, query = buildQuery()) => {
  const sanitizedData = sanitizeControlStudentsForCache(cached.data);

  return {
    ...cached,
    version: CONTROL_STUDENTS_SCOPE_CACHE_VERSION,
    scope: cached.scope || controlCacheScopeFromQuery(query),
    query: cached.query || normalizeControlCacheParams(query),
    data: sanitizedData,
  };
};

const isReadableCachedControlStudentsVersion = (value) => {
  const version = Number(value);
  return (
    version === CONTROL_STUDENTS_SCOPE_CACHE_VERSION ||
    CONTROL_STUDENTS_CACHE_READ_VERSIONS.includes(version)
  );
};

const readCachedControlStudents = (_query = buildQuery()) => {
  clearControlStudentsBrowserCache();
  return null;
};

const buildControlCacheMetadata = (metadata = {}, response = {}) => {
  const savedAt = metadata.savedAt || new Date().toISOString();
  const source = response?.source || {};
  return {
    savedAt,
    stage: metadata.stage || source.phase || "unknown",
    freshness: metadata.freshness || "base",
    steps: {
      cache: metadata.cacheStage || controlCacheStage.value,
      base: metadata.baseStage || controlBaseStage.value,
      external: metadata.externalStage || controlExternalDbStage.value,
      complete: metadata.completeStage || controlCompleteStage.value,
    },
    externalRows: Number(
      metadata.externalRows ??
        getControlExternalDbRowCount(source) ??
        controlExternalDbRows.value ??
        0,
    ),
  };
};

const writeCachedControlStudents = () => {
  clearControlStudentsBrowserCache();
  return false;
};

const normalizeMatriculaKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const draftStorageKeyFor = (agentId, matricula) => {
  const key = normalizeMatriculaKey(matricula);
  if (!agentId || !key) return "";
  return `control-escolar:draft:${agentId}:${key}`;
};

const mutationKeyFor = (studentOrMatricula) =>
  normalizeMatriculaKey(
    typeof studentOrMatricula === "object"
      ? studentOrMatricula?.matricula
      : studentOrMatricula,
  );

const clearControlStudentMutationTimer = (key) => {
  const timer = controlStudentMutationTimers.get(key);
  if (timer) globalThis.clearTimeout(timer);
  controlStudentMutationTimers.delete(key);
};

const setControlStudentMutationState = (studentOrMatricula, state = null) => {
  const key = mutationKeyFor(studentOrMatricula);
  if (!key) return;
  clearControlStudentMutationTimer(key);
  if (!state) {
    delete controlStudentMutationStates[key];
    return;
  }
  controlStudentMutationStates[key] = {
    status: "saving",
    message: "",
    operationId: 0,
    updatedAt: Date.now(),
    ...state,
  };
};

const scheduleControlStudentMutationClear = (studentOrMatricula, operationId, delay = CONTROL_STUDENT_SUCCESS_BADGE_MS) => {
  const key = mutationKeyFor(studentOrMatricula);
  if (!key) return;
  clearControlStudentMutationTimer(key);
  const timer = globalThis.setTimeout(() => {
    if (controlStudentMutationStates[key]?.operationId === operationId) {
      delete controlStudentMutationStates[key];
    }
    controlStudentMutationTimers.delete(key);
  }, delay);
  controlStudentMutationTimers.set(key, timer);
};

const clearControlStudentMutationStates = () => {
  controlStudentMutationTimers.forEach((timer) => globalThis.clearTimeout(timer));
  controlStudentMutationTimers.clear();
  Object.keys(controlStudentMutationStates).forEach((key) => {
    delete controlStudentMutationStates[key];
  });
};

const controlStudentMutationState = (studentOrMatricula) =>
  controlStudentMutationStates[mutationKeyFor(studentOrMatricula)] || null;

const controlStudentMutationStatus = (studentOrMatricula) =>
  controlStudentMutationState(studentOrMatricula)?.status || "";

const controlStudentMutationClass = (studentOrMatricula) => {
  const status = controlStudentMutationStatus(studentOrMatricula);
  return status ? `is-mutation-${status}` : "";
};

const controlStudentMutationTitle = (studentOrMatricula) => {
  const state = controlStudentMutationState(studentOrMatricula);
  if (!state) return "";
  if (state.status === "saving") return "Guardando cambios";
  if (state.status === "failed") return state.message || "No se pudo guardar";
  return "Cambios guardados";
};

const isDetailFieldFocused = () => {
  if (!process.client) return false;
  const activeElement = document.activeElement;
  if (!activeElement?.closest?.(".ce-detail-panel")) return false;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(activeElement.tagName);
};

const applySelectedStudentRefresh = (student) => {
  if (!student) return;
  const currentTab = activeDetailTab.value;
  selectedStudent.value = student;
  pendingSelectedStudentRefresh.value = null;
  resetEditForm(student, { restoreDraft: false });
  activeDetailTab.value = currentTab;
};

const applyPendingSelectedStudentRefresh = () => {
  if (
    !pendingSelectedStudentRefresh.value ||
    hasUnsavedChanges.value ||
    isDetailFieldFocused()
  )
    return;
  applySelectedStudentRefresh(pendingSelectedStudentRefresh.value);
};

const reconcileSelectedStudentAfterSync = (nextStudents = []) => {
  if (!selectedStudent.value) return;

  const selectedKey = normalizeMatriculaKey(selectedStudent.value.matricula);
  const refreshed = nextStudents.find(
    (student) => normalizeMatriculaKey(student.matricula) === selectedKey,
  );
  if (!refreshed) return;

  if (hasUnsavedChanges.value || isDetailFieldFocused()) {
    pendingSelectedStudentRefresh.value = refreshed;
    if (process.client)
      window.setTimeout(applyPendingSelectedStudentRefresh, 900);
    return;
  }

  applySelectedStudentRefresh(refreshed);
};

const normalizeClientText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const controlStudentSearchHaystack = (student = {}) =>
  normalizeClientText(
    [
      student.matricula,
      student.fullName,
      student.nombres,
      student.apellidoPaterno,
      student.apellidoMaterno,
      student.curp,
      student.phone,
      student.telefono,
      student.telefonoPadre,
      student.telefonoMadre,
      student.email,
      student.emailPadre,
      student.emailMadre,
      student.guardianName,
      student.nombrePadre,
      student.nombreMadre,
      student.nivel,
      student.grado,
      student.group,
      student.grupo,
    ]
      .filter(Boolean)
      .join(" "),
  );

const phoneDigits = (value) => String(value || "").replace(/\D/g, "");
const isValidPhone = (value) => phoneDigits(value).length >= 10;
const normalizeEmailValue = (value) => String(value || "").trim().toLowerCase();
const isValidFamilyEmail = (value) => {
  const email = normalizeEmailValue(value);
  if (!email || email.includes("@casita")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
const parentDisplayName = (student = {}, type = "padre") => {
  if (type === "madre") {
    return [student.nombreMadre, student.apellidoPaternoMadre, student.apellidoMaternoMadre]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ") || String(student.motherName || student.nombreMadreCompleto || "").trim();
  }
  return [student.nombrePadre, student.apellidoPaternoPadre, student.apellidoMaternoPadre]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ") || String(student.fatherName || student.nombrePadreCompleto || "").trim();
};
const isParentComplete = (student = {}, type = "padre") => {
  const name = parentDisplayName(student, type);
  const phone = type === "madre" ? student.telefonoMadre : (student.telefonoPadre || student.phone || student.telefono);
  const email = type === "madre" ? student.emailMadre : (student.emailPadre || student.email || student.correo);
  return Boolean(name && isValidPhone(phone) && isValidFamilyEmail(email));
};
const hasNoPrimaryContactClient = (student = {}) =>
  !isParentComplete(student, "padre") && !isParentComplete(student, "madre");

const localStudentMatchesStatus = (student, status) => {
  const normalized = normalizeClientText(status);
  if (!normalized || normalized === "all" || normalized === "todos")
    return true;
  if (normalized === "activos" || normalized === "active")
    return student.status === "Activo";
  if (normalized === "inscritos") return student.enrollmentState === "inscrito";
  if (normalized === "internos")
    return (
      student.enrollmentState === "inscrito" &&
      student.tipoIngresoValue === "interno"
    );
  if (normalized === "externos")
    return (
      student.enrollmentState === "inscrito" &&
      student.tipoIngresoValue !== "interno"
    );
  if (normalized === "no_inscritos")
    return student.enrollmentState === "no_inscrito";
  if (normalized === "bajas" || normalized === "baja")
    return (
      student.status === "Baja" ||
      student.enrollmentState === "baja_inscrita" ||
      student.enrollmentState === "baja"
    );
  if (normalized === "sin_ficha" || normalized === "sin_ficha_matricula")
    return !student.overlayExists;
  if (normalized === "sin_contacto") return hasNoPrimaryContactClient(student);
  return true;
};

const localStudentMatchesQuality = (student, quality) => {
  const normalized = normalizeClientText(quality);
  if (!normalized || normalized === "all") return true;
  if (!isInscritoForControlProgress(student)) return false;
  const missing = normalizedMissingFields(student);
  if (normalized === "complete" || normalized === "completo")
    return missing.length === 0;
  if (normalized === "incomplete" || normalized === "incompleto")
    return missing.length > 0;
  if (normalized === "curp") return missing.includes("curp");
  if (normalized === "grupo" || normalized === "group" || normalized === "sin_grupo")
    return controlMissingGroup(student);
  if (normalized === "padre" || normalized === "father") return missing.includes("padre");
  if (normalized === "madre" || normalized === "mother") return missing.includes("madre");
  if (normalized === "phone" || normalized === "telefono" || normalized === "email" || normalized === "guardian" || normalized === "tutor")
    return missing.includes("padre") || missing.includes("madre");
  if (normalized === "contact" || normalized === "contacto")
    return hasNoPrimaryContactClient(student);
  if (
    normalized === "overlay" ||
    normalized === "sin_ficha" ||
    normalized === "sin_ficha_matricula"
  )
    return !student.overlayExists;
  return true;
};

const localStudentMatchesRecent = (student, recent) => {
  const normalized = normalizeClientText(recent);
  if (!normalized || normalized === "all") return true;
  const days =
    normalized === "7d"
      ? 7
      : normalized === "30d"
        ? 30
        : normalized === "90d"
          ? 90
          : 0;
  if (!days) return true;
  const time = student.updatedAt ? new Date(student.updatedAt).getTime() : 0;
  return (
    Number.isFinite(time) && time >= Date.now() - days * 24 * 60 * 60 * 1000
  );
};

const CONTROL_PHOTO_CONCURRENCY = 3;
const normalizePhotoKey = (studentOrMatricula) =>
  normalizeStudentMatricula(
    typeof studentOrMatricula === "object"
      ? studentOrMatricula?.matricula
      : studentOrMatricula,
  );

const setControlPhotoLoading = (matricula, loading) => {
  const key = normalizePhotoKey(matricula);
  if (!key) return;
  const next = new Set(photoLoadingKeys.value);
  if (loading) next.add(key);
  else next.delete(key);
  photoLoadingKeys.value = next;
};

const readStoredControlPhoto = (matricula) => {
  if (!process.client) return "";
  const key = normalizePhotoKey(matricula);
  if (!key) return "";
  try {
    return sessionStorage.getItem(photoStorageKey(key)) || "";
  } catch (error) {
    return "";
  }
};

const writeStoredControlPhoto = (matricula, photoUrl) => {
  if (!process.client) return;
  const key = normalizePhotoKey(matricula);
  if (!key) return;
  try {
    sessionStorage.setItem(photoStorageKey(key), photoUrl || "none");
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo guardar la foto del alumno en sesión.",
      error,
    );
  }
};

const cacheControlPhoto = (matricula, photoUrl) => {
  const key = normalizePhotoKey(matricula);
  if (!key || !photoUrl || photoUrl === "none") return;
  photoCache.value = { ...photoCache.value, [key]: photoUrl };
};

const hydrateControlPhotoFromSession = (matricula) => {
  const key = normalizePhotoKey(matricula);
  if (!key || photoCache.value[key]) return Boolean(photoCache.value[key]);
  const stored = readStoredControlPhoto(key);
  if (stored && stored !== "none") {
    cacheControlPhoto(key, stored);
    return true;
  }
  return Boolean(stored === "none");
};

const controlStudentPhotoUrl = (student) => {
  const key = normalizePhotoKey(student);
  if (!key) return student?.photoUrl || "";
  const cached = photoCache.value[key];
  if (cached && cached !== "none") return cached;
  if (student?.photoUrl && student.photoUrl !== "none") return student.photoUrl;
  return "";
};

const isControlStudentPhotoLoading = (student) =>
  photoLoadingKeys.value.has(normalizePhotoKey(student));

const loadControlStudentPhoto = async (matricula) => {
  const key = normalizePhotoKey(matricula);
  if (!key || !process.client) return;
  if (hydrateControlPhotoFromSession(key)) return;

  setControlPhotoLoading(key, true);
  try {
    let request = controlStudentPhotoRequests.get(key);
    if (!request) {
      request = $fetch(`/api/students/${encodeURIComponent(key)}/photo`, {
        params: { format: "json" },
      }).finally(() => controlStudentPhotoRequests.delete(key));
      controlStudentPhotoRequests.set(key, request);
    }

    const response = await request;
    const photoUrl = response?.photoUrl || "";
    if (photoUrl) {
      cacheControlPhoto(key, photoUrl);
      writeStoredControlPhoto(key, photoUrl);
    } else {
      writeStoredControlPhoto(key, "none");
    }
  } catch (error) {
    if (error?.statusCode === 404 || error?.response?.status === 404)
      writeStoredControlPhoto(key, "none");
  } finally {
    setControlPhotoLoading(key, false);
  }
};

const pumpControlPhotoQueue = () => {
  if (!process.client) return;
  while (
    activeControlPhotoLoads < CONTROL_PHOTO_CONCURRENCY &&
    controlPhotoQueue.length
  ) {
    const key = controlPhotoQueue.shift();
    controlPhotoQueuedKeys.delete(key);
    if (
      !key ||
      controlPhotoActiveKeys.has(key) ||
      hydrateControlPhotoFromSession(key)
    )
      continue;

    activeControlPhotoLoads += 1;
    controlPhotoActiveKeys.add(key);
    loadControlStudentPhoto(key).finally(() => {
      activeControlPhotoLoads = Math.max(0, activeControlPhotoLoads - 1);
      controlPhotoActiveKeys.delete(key);
      pumpControlPhotoQueue();
    });
  }
};

const queueControlStudentPhotos = (sourceStudents = [], options = {}) => {
  if (!process.client) return;
  const entries = Array.isArray(sourceStudents)
    ? sourceStudents
    : [sourceStudents];
  const keys = entries.map(normalizePhotoKey).filter(Boolean);

  keys.forEach((key) => {
    if (
      photoCache.value[key] ||
      controlPhotoQueuedKeys.has(key) ||
      controlPhotoActiveKeys.has(key)
    )
      return;
    if (hydrateControlPhotoFromSession(key)) return;
    controlPhotoQueuedKeys.add(key);
    if (options.priority) controlPhotoQueue.unshift(key);
    else controlPhotoQueue.push(key);
  });

  pumpControlPhotoQueue();
};

const filteredControlStudents = () => {
  const search = normalizeClientText(filters.search);
  const grado = normalizeClientText(filters.grado);
  const grupo = String(filters.group || "").trim();

  return controlStudentsIndex.value.filter((student) => {
    if (search && !controlStudentSearchHaystack(student).includes(search))
      return false;
    if (!localStudentMatchesStatus(student, filters.status)) return false;
    if (grado && normalizeClientText(student.grado) !== grado) return false;
    if (
      grupo &&
      grupo !== "all" &&
      String(student.group || student.grupo || "").trim() !== grupo
    )
      return false;
    if (!localStudentMatchesQuality(student, filters.quality)) return false;
    if (!localStudentMatchesRecent(student, filters.recent)) return false;
    return true;
  });
};

const applyInstantStudentFilters = ({ reconcileSelection = false } = {}) => {
  const filtered = filteredControlStudents();
  const safeLimit = Math.max(1, Number(pagination.limit || 8));
  const pages = Math.max(1, Math.ceil(filtered.length / safeLimit));
  const safePage = Math.min(Math.max(1, Number(pagination.page || 1)), pages);
  if (pagination.page !== safePage) pagination.page = safePage;

  const offset = (safePage - 1) * safeLimit;
  students.value = filtered.slice(offset, offset + safeLimit);
  Object.assign(pagination, {
    page: safePage,
    limit: safeLimit,
    total: filtered.length,
    pages,
  });
  if (reconcileSelection) reconcileSelectedStudentAfterSync(filtered);
  queueControlStudentPhotos(students.value);
  nextTick(scheduleWorkspaceScaleUpdate);
};

const resetControlStudentsView = () => {
  clearControlStudentMutationStates();
  controlStudentsIndex.value = [];
  students.value = [];
  selectedStudent.value = null;
  pendingSelectedStudentRefresh.value = null;
  kpis.value = null;
  controlCacheStage.value = "idle";
  controlBaseStage.value = "idle";
  controlExternalDbStage.value = "idle";
  controlCompleteStage.value = "idle";
  controlDataFreshness.value = "empty";
  controlDataSavedAt.value = "";
  controlDataSource.value = null;
  controlExternalDbRows.value = 0;
  Object.assign(catalogs, {
    niveles: [],
    grados: [],
    grupos: [],
    gruposPorGrado: {},
  });
  Object.assign(pagination, { page: 1, total: 0, pages: 1 });
};

const buildClientKpisFromStudents = (sourceStudents = []) => {
  const rows = Array.isArray(sourceStudents) ? sourceStudents : [];
  const progressRows = rows.filter(isInscritoForControlProgress);
  const missing = (field) =>
    progressRows.filter((student) => normalizedMissingFields(student).includes(field))
      .length;
  const inscritos = progressRows.length;
  const internos = rows.filter(
    (student) =>
      student.enrollmentState === "inscrito" &&
      student.tipoIngresoValue === "interno",
  ).length;
  const externos = rows.filter(
    (student) =>
      student.enrollmentState === "inscrito" &&
      student.tipoIngresoValue !== "interno",
  ).length;
  const noInscritos = rows.filter(
    (student) => student.enrollmentState === "no_inscrito",
  ).length;
  const bajas = rows.filter(
    (student) =>
      student.status === "Baja" ||
      student.enrollmentState === "baja_inscrita" ||
      student.enrollmentState === "baja",
  ).length;
  const sinContacto = progressRows.filter(hasNoPrimaryContactClient).length;

  return {
    totalInscritos: inscritos,
    totalVisible: rows.length,
    totalExpedientesEvaluados: progressRows.length,
    expedientesCompletos: progressRows.filter(
      (student) => normalizedMissingFields(student).length === 0,
    ).length,
    inscritos,
    internos,
    externos,
    noInscritos,
    activos: rows.filter((student) => student.status === "Activo").length,
    bajas,
    sinFichaMatricula: rows.filter((student) => !student.overlayExists).length,
    expedientesIncompletos: progressRows.filter(
      (student) => normalizedMissingFields(student).length > 0,
    ).length,
    sinContacto,
    sinCurp: missing("curp"),
    sinGrupo: progressRows.filter(controlMissingGroup).length,
    sinPadre: progressRows.filter((student) => ["padrenombre", "padreapellidopaterno", "padretelefono", "padreemail"].some((field) => normalizedMissingFields(student).includes(field))).length,
    sinMadre: progressRows.filter((student) => ["madrenombre", "madreapellidopaterno", "madretelefono", "madreemail"].some((field) => normalizedMissingFields(student).includes(field))).length,
    sinTelefono: progressRows.filter((student) => ["padretelefono", "madretelefono"].some((field) => normalizedMissingFields(student).includes(field))).length,
    sinTutor: progressRows.filter((student) => ["padrenombre", "padreapellidopaterno", "madrenombre", "madreapellidopaterno"].some((field) => normalizedMissingFields(student).includes(field))).length,
    sinEmail: progressRows.filter((student) => ["padreemail", "madreemail"].some((field) => normalizedMissingFields(student).includes(field))).length,
  };
};

const buildControlAuditProgress = () => {
  const rows = Array.isArray(controlStudentsIndex.value)
    ? controlStudentsIndex.value
    : [];
  const progressRows = rows.filter(isInscritoForControlProgress);
  const total = progressRows.length;
  const completed = progressRows.filter(
    (student) => normalizedMissingFields(student).length === 0,
  ).length;
  const pending = Math.max(0, total - completed);
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return { percent, total, completed, pending };
};

const postControlAuditSnapshot = (reason = "control_escolar_page_loaded") => {
  if (!selectedAgentId.value || typeof window === "undefined") return;
  const progress = buildControlAuditProgress();
  const source = controlDataSource.value || {};
  const flow = source?.diagnostics?.flow || source?.phase || source?.cacheFreshness || "";
  const snapshotKey = [
    selectedAgentId.value,
    currentCicloKey.value,
    progress.percent,
    progress.total,
    progress.completed,
    progress.pending,
    source?.base || "",
    flow,
  ].join("|");
  const now = Date.now();

  if (snapshotKey === lastControlAuditSnapshotKey && now - lastControlAuditSnapshotAt < 5 * 60 * 1000) {
    return;
  }

  lastControlAuditSnapshotKey = snapshotKey;
  lastControlAuditSnapshotAt = now;

  $fetch("/api/control-escolar/audit/snapshot", {
    method: "POST",
    body: {
      plantel: selectedAgentId.value,
      ciclo: currentCicloKey.value,
      progress,
      visibleRows: students.value.length,
      totalRows: controlStudentsIndex.value.length,
      counters: kpis.value || buildClientKpisFromStudents(controlStudentsIndex.value),
      source: {
        base: source?.base || "",
        flow,
        cacheFreshness: source?.cacheFreshness || "",
        bridgeFallback: Boolean(source?.bridgeFallback),
      },
      reason,
    },
  }).catch((error) => {
    console.warn("[Control Escolar Audit] Snapshot skipped", error?.message || error);
  });
};

const applyControlStudentsPayload = (
  response = {},
  { reconcileSelection = true } = {},
) => {
  if (response?.error) {
    throw new Error(
      response?.message ||
        response?.statusMessage ||
        "No se pudieron cargar alumnos de Control Escolar.",
    );
  }

  controlStudentsIndex.value = Array.isArray(response?.data)
    ? response.data
    : [];
  controlDataSource.value = response?.source || controlDataSource.value;
  Object.assign(
    catalogs,
    response?.catalogs || {
      niveles: [],
      grados: [],
      grupos: [],
      gruposPorGrado: {},
    },
  );
  kpis.value =
    response?.kpis || buildClientKpisFromStudents(controlStudentsIndex.value);
  applyInstantStudentFilters({ reconcileSelection });
};

const replaceControlStudentInIndex = (student) => {
  if (!student?.matricula) return;
  const selectedKey = normalizeMatriculaKey(student.matricula);
  const index = controlStudentsIndex.value.findIndex(
    (candidate) => normalizeMatriculaKey(candidate.matricula) === selectedKey,
  );
  if (index >= 0) controlStudentsIndex.value.splice(index, 1, student);
  else controlStudentsIndex.value.unshift(student);
  applyInstantStudentFilters({ reconcileSelection: false });
};

const persistCurrentControlStudentsCache = (metadata = {}) =>
  writeCachedControlStudents(
    buildIndexQuery(),
    {
      data: controlStudentsIndex.value,
      pagination: {
        page: 1,
        limit: Math.max(controlStudentsIndex.value.length, 1),
        total: controlStudentsIndex.value.length,
        pages: 1,
      },
      catalogs: {
        ...catalogs,
        gruposPorGrado: { ...(catalogs.gruposPorGrado || {}) },
      },
      source: controlDataSource.value,
    },
    metadata,
  );

const isDomEventPayload = (value) =>
  Boolean(
    value &&
    typeof value === "object" &&
    ("isTrusted" in value || "target" in value || "currentTarget" in value),
  );

const loadStudents = async (options = {}) => {
  if (!selectedAgentId.value) return;

  const safeOptions = isDomEventPayload(options) ? {} : options || {};
  const {
    useCache = false,
    clearExisting = false,
    forceLoading = false,
  } = safeOptions;
  const requestId = ++controlStudentsRequestId;
  const query = buildIndexQuery();
  const requestScopeSignature = controlScopeSignatureFromQuery(query);
  const hadVisibleStudents =
    controlStudentsIndex.value.length > 0 || students.value.length > 0;
  if (clearExisting) resetControlStudentsView();
  const hasVisibleStudents =
    controlStudentsIndex.value.length > 0 || students.value.length > 0;
  const startedAt = controlNow();
  const clientSteps = [];
  const markClientStep = (key, label, stepStartedAt, status = "ready", details = {}) => {
    clientSteps.push({
      key,
      label,
      status,
      ms: Math.max(0, Math.round(controlNow() - stepStartedAt)),
      ...details,
    });
  };

  controlCacheStage.value = "empty";
  controlBaseStage.value = "idle";
  controlExternalDbStage.value = "idle";
  controlCompleteStage.value = "idle";
  controlExternalDbRows.value = 0;
  publishControlSyncIndicatorState({ status: "syncing", message: "Cargando Control Escolar" });

  const cacheStartedAt = controlNow();
  const cached = null;
  if (useCache || CONTROL_STUDENTS_BROWSER_CACHE_ENABLED) clearControlStudentsBrowserCache();
  markClientStep(
    "browser-cache",
    "Datos locales",
    cacheStartedAt,
    "disabled",
    { rows: Array.isArray(cached?.data) ? cached.data.length : 0 },
  );

  if (cached) {
    pagination.page = 1;
    applyControlStudentsPayload(cached);
    loadError.value = "";
    studentsLoading.value = false;
    controlDataFreshness.value = "cache";
    controlDataSavedAt.value = cached.savedAt || "";
    controlDataSource.value = cached.source || null;
    controlCacheStage.value = "ready";
    publishControlSyncIndicatorState({ status: "cached", message: "Datos visibles mientras se actualiza." });
    controlExternalDbRows.value = getControlExternalDbRowCount(cached.source || {});
  } else {
    controlCacheStage.value = "empty";
    studentsLoading.value = forceLoading || clearExisting || !hasVisibleStudents;
    controlDataFreshness.value =
      hasVisibleStudents ? controlDataFreshness.value : "empty";
    controlDataSavedAt.value = "";
    if (!hasVisibleStudents) controlExternalDbRows.value = 0;
  }

  const canKeepVisibleData = () =>
    Boolean(cached) ||
    (!clearExisting &&
      isCurrentControlScopeSignature(requestScopeSignature) &&
      (hadVisibleStudents ||
        controlStudentsIndex.value.length > 0 ||
        students.value.length > 0));

  try {
    controlBaseStage.value = "loading";
    controlExternalDbStage.value = "loading";
    controlCompleteStage.value = "loading";
    const requestStartedAt = controlNow();
    const response = await $fetch("/api/control-escolar/students", {
      cache: "no-store",
      query: { ...query, phase: "enriched" },
    });
    markClientStep(
      "server-enriched",
      "Base como selector + matricula enriquecida",
      requestStartedAt,
      "ready",
      { rows: Array.isArray(response?.data) ? response.data.length : 0 },
    );
    if (
      requestId !== controlStudentsRequestId ||
      !isCurrentControlScopeSignature(requestScopeSignature)
    )
      return;

    pagination.page = 1;
    applyControlStudentsPayload(response);
    loadError.value = "";
    const responseSource = response?.source || {};
    const isSnapshotFallback = Boolean(responseSource.bridgeFallback) || String(responseSource.base || "").startsWith("verified-cache:");
    controlBaseStage.value = isSnapshotFallback ? "partial" : "ready";
    const externalDbRows = getControlExternalDbRowCount(responseSource);
    controlExternalDbRows.value = externalDbRows;
    controlExternalDbStage.value = externalDbRows > 0 ? "ready" : "empty";
    controlDataFreshness.value = isSnapshotFallback ? "cache" : externalDbRows > 0 ? "synced" : "base";
    controlDataSavedAt.value = new Date().toISOString();
    controlDataSource.value = responseSource || controlDataSource.value;
    controlCompleteStage.value = "ready";
    persistCurrentControlStudentsCache({
      stage: "complete",
      freshness: controlDataFreshness.value,
      cacheStage: controlCacheStage.value,
      baseStage: "ready",
      externalStage: controlExternalDbStage.value,
      completeStage: "ready",
      externalRows: externalDbRows,
      savedAt: controlDataSavedAt.value,
    });
    lastControlLoadDiagnostics.value = normalizeControlDiagnostics({
      query,
      cached,
      response,
      clientSteps,
      startedAt,
      totalMs: controlNow() - startedAt,
      status: "ready",
    });
    publishControlSyncIndicatorState();
    postControlAuditSnapshot(isSnapshotFallback ? "snapshot_fallback_visible" : "live_bridge_visible");
  } catch (error) {
    markClientStep(
      "server-enriched",
      "Base como selector + matricula enriquecida",
      startedAt,
      "failed",
      { error: error?.data?.message || error?.message || String(error || "") },
    );
    if (
      requestId !== controlStudentsRequestId ||
      !isCurrentControlScopeSignature(requestScopeSignature)
    )
      return;
    controlBaseStage.value = canKeepVisibleData() ? "partial" : "failed";
    controlExternalDbStage.value = "failed";
    controlCompleteStage.value = "failed";
    lastControlLoadDiagnostics.value = normalizeControlDiagnostics({
      query,
      cached,
      response: null,
      clientSteps,
      startedAt,
      totalMs: controlNow() - startedAt,
      status: "failed",
    });

    if (!canKeepVisibleData()) {
      resetControlStudentsView();
      controlCacheStage.value = cached ? "ready" : "empty";
      loadError.value =
        error?.data?.message ||
        error?.message ||
        "Plantel fuera de línea o sin respuesta.";
    } else {
      loadError.value = "";
      applyInstantStudentFilters();
    }
    publishControlSyncIndicatorState({ status: "failed" });
  } finally {
    if (requestId === controlStudentsRequestId) {
      studentsLoading.value = false;
      nextTick(scheduleWorkspaceScaleUpdate);
    }
  }
};

const refreshAll = async (options = {}) => {
  const safeOptions = isDomEventPayload(options) ? {} : options || {};
  const { forceNetwork = false, ...studentOptions } = safeOptions;
  kpisLoading.value = true;
  try {
    await loadStudents({ useCache: !forceNetwork, ...studentOptions });
  } finally {
    kpisLoading.value = false;
  }
};

const reloadControlStudentsForCurrentScope = async ({
  clearExisting = true,
  refreshEnrollmentConfig = true,
} = {}) => {
  if (!selectedAgentId.value) return;

  const reloadId = ++controlScopeReloadId;
  pagination.page = 1;

  if (clearExisting) resetControlStudentsView();
  loadError.value = "";
  studentsLoading.value = true;
  kpisLoading.value = true;
  publishControlSyncIndicatorState({
    status: "syncing",
    message: "Cargando Control Escolar",
  });

  try {
    if (refreshEnrollmentConfig) {
      hydrateCachedEnrollmentConcepts({ replaceExisting: true });
      await loadEnrollmentConfig({ refreshStudents: false });
      if (reloadId !== controlScopeReloadId) return;
    }

    await refreshAll({
      clearExisting,
      forceLoading: true,
      forceNetwork: true,
    });
  } finally {
    if (reloadId === controlScopeReloadId) {
      studentsLoading.value = false;
      kpisLoading.value = false;
    }
  }
};

const clearQuickFilters = () => {
  filters.status = DEFAULT_QUICK_FILTER;
  filters.quality = "";
  activeQuickFilter.value = DEFAULT_QUICK_FILTER;
};

const toggleFilter = (key, value) => {
  filters[key] = filters[key] === value ? "" : value;
  pagination.page = 1;
};

const clearAcademicFilters = () => {
  filters.grado = "";
  filters.group = "";
  pagination.page = 1;
};

const selectGrade = (grado) => {
  filters.grado = filters.grado === grado ? "" : grado;
  filters.group = "";
  pagination.page = 1;
};

const clearFilters = () => {
  Object.assign(filters, {
    search: "",
    status: DEFAULT_QUICK_FILTER,
    quality: "",
    grado: "",
    group: "",
    recent: "",
  });
  activeQuickFilter.value = DEFAULT_QUICK_FILTER;
  pagination.page = 1;
};

const applyPrimaryFilter = (key) => {
  filters.status = key;
  filters.quality = "";
  activeQuickFilter.value = key;
  pagination.page = 1;
};

const toggleQualityFilter = (key) => {
  filters.quality = filters.quality === key ? "" : key;
  if (filters.quality) activeQuickFilter.value = "quality";
  else activeQuickFilter.value = filters.status || DEFAULT_QUICK_FILTER;
  pagination.page = 1;
};

const applyKpiFilter = (key) => {
  if (key === "incomplete") {
    filters.status = DEFAULT_QUICK_FILTER;
    filters.quality = filters.quality === "incomplete" ? "" : "incomplete";
    activeQuickFilter.value = filters.quality ? key : DEFAULT_QUICK_FILTER;
  } else {
    const next =
      activeQuickFilter.value === key && key !== DEFAULT_QUICK_FILTER
        ? DEFAULT_QUICK_FILTER
        : key;
    filters.status = next;
    filters.quality = "";
    activeQuickFilter.value = next;
  }
  pagination.page = 1;
};

const goToPage = (page) => {
  pagination.page = Math.min(Math.max(1, page), pagination.pages || 1);
};

const readStoredDraft = () => {
  if (!process.client || !draftKey.value) return null;
  try {
    return JSON.parse(localStorage.getItem(draftKey.value) || "null");
  } catch (error) {
    console.warn("[Control Escolar] No se pudo leer el borrador local.", error);
    return null;
  }
};

const clearEditDraftForStudent = (matricula, agentId = selectedAgentId.value) => {
  const key = draftStorageKeyFor(agentId, matricula);
  if (!process.client || !key) return;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo limpiar el borrador local.",
      error,
    );
  }
};

const clearEditDraft = () => {
  if (selectedStudent.value?.matricula) {
    clearEditDraftForStudent(selectedStudent.value.matricula);
  }
  draftRestored.value = false;
  draftSavedAt.value = "";
};

const persistEditDraft = () => {
  if (!process.client || !draftKey.value || !hasUnsavedChanges.value) return;
  const savedAt = new Date().toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
  try {
    localStorage.setItem(
      draftKey.value,
      JSON.stringify({ savedAt, values: readEditForm() }),
    );
    draftSavedAt.value = savedAt;
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo guardar el borrador local.",
      error,
    );
  }
};

const restoreEditDraft = () => {
  const stored = readStoredDraft();
  if (!stored?.values || typeof stored.values !== "object") return;
  Object.assign(editForm, stored.values);
  draftRestored.value = true;
  draftSavedAt.value = stored.savedAt || "";
};

const selectStudent = (student, copy = true) => {
  selectedStudent.value = student;
  activeDetailTab.value = "summary";
  closeManualHuskyPassForm();
  activeParentLastNameSuggestion.value = "";
  dismissedParentLastNameSuggestions.value = {};
  if (copy) resetEditForm(student, { restoreDraft: true });
  queueControlStudentPhotos([student], { priority: true });
  nextTick(scheduleWorkspaceScaleUpdate);
};

const resetEditForm = (student = selectedStudent.value, options = {}) => {
  if (!student) return;
  Object.assign(editForm, {
    nombres: toNameDisplayCase(student.nombres || ""),
    apellidoPaterno: toNameDisplayCase(student.apellidoPaterno || ""),
    apellidoMaterno: toNameDisplayCase(student.apellidoMaterno || ""),
    curp: student.curp || "",
    nombreVerificado: toNameDisplayCase(student.nombreVerificado || ""),
    nombreCompletoAlumno: toNameDisplayCase(student.nombreCompletoAlumno || student.fullName || ""),
    lastGrade: student.lastGrade || "",
    lastCiclo: student.lastCiclo || "",
    lugarNacimiento: student.lugarNacimiento || "",
    sexo: student.sexo || "",
    talla: student.talla || "",
    peso: student.peso || "",
    tipoSangre: student.tipoSangre || "",
    alergias: student.alergias || "",
    foto: student.foto || "",
    nivel: student.nivel || "",
    grado: student.grado || "",
    grupo: student.group || student.grupo || "",
    ciclo: student.ciclo || currentCicloKey.value || "",
    servicio: student.servicio || "",
    interno: Number(student.interno || 0),
    eventual: Number(student.eventual || 0),
    verified: Number(student.verified || 0),
    baja: Number(student.baja || 0),
    motivoBaja: student.motivoBaja || "",
    categoriaBaja: student.categoriaBaja || "",
    seguimientoBaja: student.seguimientoBaja || "",
    servicioNotas: student.servicioNotas || "",
    nombrePadre: toNameDisplayCase(student.nombrePadre || ""),
    apellidoPaternoPadre: toNameDisplayCase(student.apellidoPaternoPadre || ""),
    apellidoMaternoPadre: toNameDisplayCase(student.apellidoMaternoPadre || ""),
    lugarTrabajoPadre: student.lugarTrabajoPadre || "",
    puestoPadre: student.puestoPadre || "",
    estadoCivilPadre: student.estadoCivilPadre || "",
    fechaNacimientoPadre: normalizeDateInput(student.fechaNacimientoPadre),
    inePadre: student.inePadre || "",
    curpPadre: student.curpPadre || "",
    nombreMadre: toNameDisplayCase(student.nombreMadre || ""),
    apellidoPaternoMadre: toNameDisplayCase(student.apellidoPaternoMadre || ""),
    apellidoMaternoMadre: toNameDisplayCase(student.apellidoMaternoMadre || ""),
    lugarTrabajoMadre: student.lugarTrabajoMadre || "",
    puestoMadre: student.puestoMadre || "",
    estadoCivilMadre: student.estadoCivilMadre || "",
    fechaNacimientoMadre: normalizeDateInput(student.fechaNacimientoMadre),
    ineMadre: student.ineMadre || "",
    curpMadre: student.curpMadre || "",
    telefonoPadre: student.telefonoPadre || "",
    telefonoMadre: student.telefonoMadre || "",
    emailPadre: student.emailPadre || "",
    emailMadre: student.emailMadre || "",
    direccion: student.address || student.direccion || "",
    domicilioCalle: student.domicilioCalle || "",
    domicilioNumero: student.domicilioNumero || student.domicioNum || "",
    domicilioColonia: student.domicilioColonia || "",
    domicilioCp: student.domicilioCp || "",
    domicilioMunicipio: student.domicilioMunicipio || "",
    certificadoMedicoAdjunto: student.certificadoMedicoAdjunto || "",
    certificadoVacunacionCovid19Adjunto: student.certificadoVacunacionCovid19Adjunto || "",
    actaNacimientoAdjunta: student.actaNacimientoAdjunta || "",
    curpAlumnoAdjunto: student.curpAlumnoAdjunto || "",
    certificadoPrimariaAdjunto: student.certificadoPrimariaAdjunto || "",
    boletaSextoPrimariaAdjunta: student.boletaSextoPrimariaAdjunta || "",
    boletaPrimeroSecundariaAdjunta: student.boletaPrimeroSecundariaAdjunta || "",
    boletaSegundoSecundariaAdjunta: student.boletaSegundoSecundariaAdjunta || "",
  });
  saveError.value = "";
  draftRestored.value = false;
  draftSavedAt.value = "";
  editSnapshot.value = formSnapshot();
  if (options.restoreDraft) restoreEditDraft();
};

const discardChanges = () => {
  clearEditDraft();
  resetEditForm(selectedStudent.value, { restoreDraft: false });
};

const readEditFormFromStudent = (student = {}) => ({
  nombres: toNameDisplayCase(student.nombres || ""),
  apellidoPaterno: toNameDisplayCase(student.apellidoPaterno || ""),
  apellidoMaterno: toNameDisplayCase(student.apellidoMaterno || ""),
  curp: student.curp || "",
  nombreVerificado: toNameDisplayCase(student.nombreVerificado || ""),
  nombreCompletoAlumno: toNameDisplayCase(student.nombreCompletoAlumno || student.fullName || ""),
  lugarNacimiento: student.lugarNacimiento || "",
  sexo: student.sexo || "",
  talla: student.talla || "",
  peso: student.peso || "",
  tipoSangre: student.tipoSangre || "",
  alergias: student.alergias || "",
  foto: student.foto || "",
  grupo: student.group || student.grupo || "",
  baja: Number(student.baja || 0),
  motivoBaja: student.motivoBaja || "",
  categoriaBaja: student.categoriaBaja || "",
  seguimientoBaja: student.seguimientoBaja || "",
  nombrePadre: toNameDisplayCase(student.nombrePadre || ""),
  apellidoPaternoPadre: toNameDisplayCase(student.apellidoPaternoPadre || ""),
  apellidoMaternoPadre: toNameDisplayCase(student.apellidoMaternoPadre || ""),
  estadoCivilPadre: student.estadoCivilPadre || "",
  fechaNacimientoPadre: normalizeDateInput(student.fechaNacimientoPadre),
  inePadre: student.inePadre || "",
  curpPadre: student.curpPadre || "",
  nombreMadre: toNameDisplayCase(student.nombreMadre || ""),
  apellidoPaternoMadre: toNameDisplayCase(student.apellidoPaternoMadre || ""),
  apellidoMaternoMadre: toNameDisplayCase(student.apellidoMaternoMadre || ""),
  estadoCivilMadre: student.estadoCivilMadre || "",
  fechaNacimientoMadre: normalizeDateInput(student.fechaNacimientoMadre),
  ineMadre: student.ineMadre || "",
  curpMadre: student.curpMadre || "",
  telefonoPadre: student.telefonoPadre || "",
  telefonoMadre: student.telefonoMadre || "",
  emailPadre: student.emailPadre || "",
  emailMadre: student.emailMadre || "",
  direccion: student.address || student.direccion || "",
  domicilioCalle: student.domicilioCalle || "",
  domicilioNumero: student.domicilioNumero || student.domicioNum || "",
  domicilioColonia: student.domicilioColonia || "",
  domicilioCp: student.domicilioCp || "",
  domicilioMunicipio: student.domicilioMunicipio || "",
  certificadoMedicoAdjunto: student.certificadoMedicoAdjunto || "",
  certificadoVacunacionCovid19Adjunto: student.certificadoVacunacionCovid19Adjunto || "",
  actaNacimientoAdjunta: student.actaNacimientoAdjunta || "",
  curpAlumnoAdjunto: student.curpAlumnoAdjunto || "",
  certificadoPrimariaAdjunto: student.certificadoPrimariaAdjunto || "",
  boletaSextoPrimariaAdjunta: student.boletaSextoPrimariaAdjunta || "",
  boletaPrimeroSecundariaAdjunta: student.boletaPrimeroSecundariaAdjunta || "",
  boletaSegundoSecundariaAdjunta: student.boletaSegundoSecundariaAdjunta || "",
});

const buildOptimisticControlStudent = (baseStudent = {}, payload = {}) => {
  const hasPayloadField = (field) => Object.prototype.hasOwnProperty.call(payload, field);
  const next = {
    ...baseStudent,
    ...payload,
  };
  const fullName = [next.nombres, next.apellidoPaterno, next.apellidoMaterno]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  next.fullName = fullName || next.nombreCompletoAlumno || baseStudent.fullName || "";
  next.nombreCompletoAlumno = next.fullName;
  next.address = hasPayloadField("direccion")
    ? payload.direccion
    : baseStudent.address ?? baseStudent.direccion ?? "";
  next.direccion = next.address;
  next.group = hasPayloadField("grupo")
    ? payload.grupo
    : baseStudent.group ?? baseStudent.grupo ?? "";
  next.grupo = next.group;
  next.baja = Number(hasPayloadField("baja") ? payload.baja : baseStudent.baja || 0);
  next.status = next.baja
    ? "Baja"
    : hasPayloadField("baja")
      ? "Activo"
      : baseStudent.status || "Activo";
  const completenessTiers = resolveControlEscolarCompleteness(next, { honorEnrollmentState: true });
  next.completenessTiers = completenessTiers;
  next.completion = completenessTiers?.basic?.progress ?? next.completion ?? 0;
  next.completeness = next.completion;
  next.missingFields = completenessTiers?.basic?.missingFields || [];
  return next;
};

const persistEditDraftForStudent = (matricula, values) => {
  const key = draftStorageKeyFor(selectedAgentId.value, matricula);
  if (!process.client || !key || !values || typeof values !== "object") return;
  const savedAt = new Date().toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt, values }));
    if (normalizeMatriculaKey(selectedStudent.value?.matricula) === normalizeMatriculaKey(matricula)) {
      draftSavedAt.value = savedAt;
      draftRestored.value = true;
    }
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo conservar el borrador fallido.",
      error,
    );
  }
};

const reconcileControlKpisInBackground = () => {
  kpis.value = buildClientKpisFromStudents(controlStudentsIndex.value);
  const query = buildScopeQuery();
  const scopeSignature = controlScopeSignatureFromQuery(query);
  $fetch("/api/control-escolar/kpis", { cache: "no-store", query })
    .then((response) => {
      if (isCurrentControlScopeSignature(scopeSignature) && response?.kpis) {
        kpis.value = response.kpis;
      }
    })
    .catch((error) => {
      console.warn(
        "[Control Escolar] No se pudo reconciliar KPIs después de guardar.",
        error?.message || error,
      );
    });
};

const saveStudent = async () => {
  if (!selectedStudent.value || !selectedAgentId.value) return;
  const selectedKey = normalizeMatriculaKey(selectedStudent.value.matricula);
  if (!selectedKey || controlStudentMutationStatus(selectedStudent.value) === "saving") return;
  if (uploadingAdvancedField.value) {
    saveError.value = "Espera a que termine la carga del archivo.";
    return;
  }
  formatEditNameFields();
  const payload = readDirtyEditForm({ normalizeNames: true });
  const dirtyFields = Object.keys(payload);
  if (!dirtyFields.length) {
    clearEditDraft();
    saveError.value = "";
    editSnapshot.value = formSnapshot();
    return;
  }

  const invalidFields = editableInvalidFields(dirtyFields);
  if (invalidFields.length) {
    const fieldLabels = invalidFields
      .map((field) => invalidFieldTargets[field]?.shortLabel || field)
      .join(", ");
    saveError.value = `Revisa ${fieldLabels} antes de guardar.`;
    return;
  }
  const rollbackStudent = { ...selectedStudent.value };
  const optimisticStudent = buildOptimisticControlStudent(rollbackStudent, payload);
  const operationId = ++controlStudentMutationSequence;

  saveError.value = "";
  setControlStudentMutationState(selectedKey, { status: "saving", operationId });
  replaceControlStudentInIndex(optimisticStudent);
  selectedStudent.value = optimisticStudent;
  pendingSelectedStudentRefresh.value = null;
  resetEditForm(optimisticStudent, { restoreDraft: false });
  kpis.value = buildClientKpisFromStudents(controlStudentsIndex.value);
  persistCurrentControlStudentsCache({ optimistic: true });

  try {
    const response = await $fetch(
      `/api/control-escolar/students/${encodeURIComponent(rollbackStudent.matricula)}`,
      {
        method: "PATCH",
        query: buildScopeQuery(),
        body: payload,
      },
    );
    if (controlStudentMutationState(selectedKey)?.operationId !== operationId) return;

    if (response.student) {
      replaceControlStudentInIndex(response.student);
      clearEditDraftForStudent(rollbackStudent.matricula);
      if (normalizeMatriculaKey(selectedStudent.value?.matricula) === selectedKey) {
        selectedStudent.value = response.student;
        pendingSelectedStudentRefresh.value = null;
        clearEditDraft();
        resetEditForm(response.student, { restoreDraft: false });
      }
      persistCurrentControlStudentsCache();
      kpis.value = buildClientKpisFromStudents(controlStudentsIndex.value);
    }
    setControlStudentMutationState(selectedKey, { status: "saved", operationId });
    scheduleControlStudentMutationClear(selectedKey, operationId);
    show("Ficha de Control Escolar guardada.", "success");
    reconcileControlKpisInBackground();
  } catch (error) {
    if (controlStudentMutationState(selectedKey)?.operationId !== operationId) return;
    const message =
      error?.data?.message || error?.message || "No se pudo guardar la ficha.";
    replaceControlStudentInIndex(rollbackStudent);
    kpis.value = buildClientKpisFromStudents(controlStudentsIndex.value);
    persistCurrentControlStudentsCache({ rollback: true });
    persistEditDraftForStudent(rollbackStudent.matricula, payload);
    setControlStudentMutationState(selectedKey, {
      status: "failed",
      operationId,
      message,
    });
    if (normalizeMatriculaKey(selectedStudent.value?.matricula) === selectedKey) {
      selectedStudent.value = rollbackStudent;
      Object.assign(editForm, payload);
      editSnapshot.value = JSON.stringify(readEditFormFromStudent(rollbackStudent));
      saveError.value = message;
    }
    show(message, "error");
  }
};

const exportCurrentView = () => {
  if (!selectedAgentId.value) return;
  const params = new URLSearchParams();
  Object.entries(buildQuery({ page: undefined, limit: undefined })).forEach(
    ([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, value);
    },
  );
  params.set("_scope", String(Date.now()));
  window.open(`/api/control-escolar/export?${params.toString()}`, "_blank");
};

const exportMatriculaDb = () => {
  if (!selectedAgentId.value) return;
  const params = new URLSearchParams();
  Object.entries(buildQuery({ page: undefined, limit: undefined })).forEach(
    ([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, value);
    },
  );
  params.set("_scope", String(Date.now()));
  window.open(
    `/api/control-escolar/matricula-db/export?${params.toString()}`,
    "_blank",
  );
};

const openMassImportModal = () => {
  massImportError.value = "";
  massImportResult.value = null;
  showMassImportModal.value = true;
};

const closeMassImportModal = () => {
  if (massImporting.value) return;
  showMassImportModal.value = false;
  massImportFile.value = null;
  massImportError.value = "";
};

useModalEscape(closeMassImportModal, { enabled: showMassImportModal });

const onMassImportFileChange = (event) => {
  massImportFile.value = event?.target?.files?.[0] || null;
  massImportResult.value = null;
  massImportError.value = "";
};

const importMatriculaDb = async () => {
  const file = massImportFile.value;
  if (!file || !selectedAgentId.value) return;
  massImporting.value = true;
  massImportError.value = "";
  try {
    const form = new FormData();
    form.append("file", file);
    const response = await $fetch("/api/control-escolar/matricula-db/import", {
      method: "POST",
      query: buildScopeQuery(),
      body: form,
    });
    const summary = response?.summary || {};
    massImportResult.value = summary;
    const skipped = Number(summary.skipped || 0);
    show(
      `Importación aplicada: ${summary.updated || 0} actualizados${skipped ? `, ${skipped} omitidos` : ""}.`,
      skipped ? "warning" : "success",
    );
    await refreshAll();
  } catch (error) {
    massImportError.value =
      error?.data?.message ||
      error?.message ||
      "No se pudo importar el archivo.";
    show(massImportError.value, "danger");
  } finally {
    massImporting.value = false;
  }
};

const openAcademicPositionModal = () => {
  if (!selectedStudent.value || savingAcademicPosition.value) return;
  showAcademicPositionModal.value = true;
};

const saveAcademicPosition = async (payload) => {
  if (!selectedStudent.value?.matricula || savingAcademicPosition.value) return;
  savingAcademicPosition.value = true;
  try {
    const ciclo = typeof payload === "object" && payload !== null ? payload.ciclo : payload;
    const response = await $fetch(
      `/api/students/${encodeURIComponent(selectedStudent.value.matricula)}/ingreso-cycle`,
      {
        method: "PUT",
        body: {
          ciclo,
          targetCiclo: payload?.targetCiclo || currentCicloKey.value,
          targetNivel: payload?.targetNivel,
          targetGrado: payload?.targetGrado,
        },
      },
    );
    showAcademicPositionModal.value = false;
    const updated = response?.student;
    const current = selectedStudent.value;
    if (updated && current && normalizeMatriculaKey(updated.matricula) === normalizeMatriculaKey(current.matricula)) {
      const mergedStudent = {
        ...current,
        ...updated,
        group: current.group || current.grupo || updated.group || updated.grupo || "",
        grupo: current.grupo || current.group || updated.grupo || updated.group || "",
      };
      replaceControlStudentInIndex(mergedStudent);
      selectedStudent.value = mergedStudent;
      pendingSelectedStudentRefresh.value = null;
      resetEditForm(mergedStudent, { restoreDraft: false });
      persistCurrentControlStudentsCache();
    }
    show("Grado y ciclo actualizados.", "success");
    await loadStudents({ useCache: false, clearExisting: false, forceLoading: false });
    await loadKpis();
  } catch (error) {
    show(error?.data?.message || error?.message || "No se pudo actualizar el ciclo y la posición.", "danger");
  } finally {
    savingAcademicPosition.value = false;
  }
};

const uploadAdvancedFile = async (field, event) => {
  const file = event?.target?.files?.[0];
  if (event?.target) event.target.value = "";
  if (!file || !field?.key || uploadingAdvancedField.value) return;
  uploadingAdvancedField.value = field.key;
  advancedUploadErrors[field.key] = "";
  try {
    const form = new FormData();
    form.append("file", file);
    form.append("folder", `control-escolar/${selectedStudent.value?.matricula || "sin-matricula"}/${field.key}`);
    form.append("includeUrl", "true");
    const response = await $fetch("https://expediente.casitaapps.com", {
      method: "POST",
      body: form,
    });
    if (!response?.success) throw new Error("El servicio de carga no confirmó la operación.");
    editForm[field.key] = response.url || response.path || response.fileName || JSON.stringify(response);
    show("Archivo cargado. Guarda la ficha para conservar el cambio.", "success");
  } catch (error) {
    advancedUploadErrors[field.key] = error?.data?.message || error?.message || "No se pudo cargar el archivo.";
    show(advancedUploadErrors[field.key], "danger");
  } finally {
    uploadingAdvancedField.value = "";
  }
};

const applyHuskyPassStudentUpdate = (student) => {
  if (!student?.matricula) return;
  replaceControlStudentInIndex(student);
  selectedStudent.value = student;
  pendingSelectedStudentRefresh.value = null;
  persistCurrentControlStudentsCache();
};

const closeManualHuskyPassForm = () => {
  showManualHuskyPassForm.value = false;
  manualHuskyPassPassword.value = "";
};

const toggleManualHuskyPassForm = () => {
  showManualHuskyPassForm.value = !showManualHuskyPassForm.value;
  manualHuskyPassPassword.value = selectedStudent.value?.huskyPassPlaintext || "";
};

const saveHuskyPassPassword = async (body) => {
  if (!selectedStudent.value || !selectedAgentId.value || savingHuskyPass.value)
    return;
  savingHuskyPass.value = true;
  try {
    const response = await $fetch(
      `/api/control-escolar/students/${encodeURIComponent(selectedStudent.value.matricula)}/husky-pass`,
      {
        method: "POST",
        query: buildScopeQuery(),
        body,
      },
    );
    if (response.student) applyHuskyPassStudentUpdate(response.student);
    closeManualHuskyPassForm();
    show("Husky Pass actualizado.", "success");
    await loadKpis();
  } catch (error) {
    show(
      error?.data?.message || error?.message || "No se pudo actualizar Husky Pass.",
      "danger",
    );
  } finally {
    savingHuskyPass.value = false;
  }
};

const generateOrRegenerateHuskyPass = async () => {
  await saveHuskyPassPassword({
    action: selectedStudent.value?.huskyPassAvailable ? "regenerate" : "generate",
  });
};

const saveManualHuskyPassPassword = async () => {
  if (!huskyPassManualPasswordValid.value) {
    show("La contraseña debe tener entre 6 y 64 caracteres.", "danger");
    return;
  }
  await saveHuskyPassPassword({
    action: "manual",
    plaintext: manualHuskyPassPassword.value,
  });
};

const sendHuskyPassEmail = async () => {
  if (!selectedStudent.value || !selectedAgentId.value) return;
  sendingHuskyPass.value = true;
  try {
    const response = await $fetch(
      `/api/control-escolar/students/${encodeURIComponent(selectedStudent.value.matricula)}/husky-pass-email`,
      {
        method: "POST",
        query: buildScopeQuery(),
        body: { to: huskyPassEmailTarget.value },
      },
    );
    show(`Husky Pass enviado a ${response.sentTo}.`, "success");
  } catch (error) {
    show(
      error?.data?.message || error?.message || "No se pudo enviar Husky Pass.",
      "danger",
    );
  } finally {
    sendingHuskyPass.value = false;
  }
};

const cacheEnrollmentConcepts = ({ current = [], tipoIngreso = [] } = {}) => {
  const currentConceptIds = normalizeEnrollmentConceptIds(current);
  const tipoIngresoConceptIds = normalizeEnrollmentConceptIds(tipoIngreso);
  if (!process.client) return;
  try {
    if (!currentConceptIds.length && !tipoIngresoConceptIds.length) {
      localStorage.removeItem(enrollmentConceptsCacheKey.value);
      return;
    }
    localStorage.setItem(
      enrollmentConceptsCacheKey.value,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        currentConcepts: currentConceptIds,
        tipoIngresoConcepts: tipoIngresoConceptIds,
      }),
    );
  } catch (error) {
    console.warn(
      "[Control Escolar] No se pudo guardar la configuración de inscripción.",
      error,
    );
  }
};

const hydrateCachedEnrollmentConcepts = ({ replaceExisting = false } = {}) => {
  if (!process.client) return;
  if (!replaceExisting && externalConcepts.value.length) return;

  try {
    const parsed = JSON.parse(
      localStorage.getItem(enrollmentConceptsCacheKey.value) || "null",
    );
    const currentConceptIds = normalizeEnrollmentConceptIds(parsed?.currentConcepts || parsed?.concepts);
    const tipoIngresoConceptIds = normalizeEnrollmentConceptIds(parsed?.tipoIngresoConcepts || currentConceptIds);
    externalConcepts.value = currentConceptIds;
    tipoIngresoConcepts.value = tipoIngresoConceptIds.length
      ? tipoIngresoConceptIds
      : currentConceptIds;
  } catch (error) {
    if (replaceExisting) {
      externalConcepts.value = [];
      tipoIngresoConcepts.value = [];
    }
    console.warn(
      "[Control Escolar] No se pudo leer la configuración de inscripción.",
      error,
    );
  }
};

const parseEnrollmentConfig = (obj) => {
  const currentConceptIds = parseEnrollmentConceptsForScope(obj, {
    ciclo: currentCicloKey.value,
    plantel: currentEnrollmentPlantelKey.value,
  });
  const tipoIngresoConceptIds = parseEnrollmentConceptsForPlantelHistory(obj, {
    plantel: currentEnrollmentPlantelKey.value,
  });
  externalConcepts.value = currentConceptIds;
  tipoIngresoConcepts.value = tipoIngresoConceptIds.length
    ? tipoIngresoConceptIds
    : currentConceptIds;
  cacheEnrollmentConcepts({ current: externalConcepts.value, tipoIngreso: tipoIngresoConcepts.value });
};

const loadEnrollmentConfig = async ({ refreshStudents = false } = {}) => {
  const previousConcepts = externalConcepts.value.join("|");
  const previousTipoConcepts = tipoIngresoConcepts.value.join("|");

  try {
    const configData = await $fetch("/api/control-escolar/enrollment-config", { cache: "no-store" });
    parseEnrollmentConfig(configData);
  } catch (serverError) {
    console.warn(
      "[Control Escolar] Usando configuración de inscripción local o por defecto.",
      serverError,
    );
  }

  if (
    refreshStudents &&
    (externalConcepts.value.join("|") !== previousConcepts ||
      tipoIngresoConcepts.value.join("|") !== previousTipoConcepts)
  ) {
    await refreshAll({
      clearExisting: true,
      forceLoading: true,
      forceNetwork: true,
    });
  }
};

watch(
  editForm,
  () => {
    if (!selectedStudent.value || !editSnapshot.value) return;
    if (hasUnsavedChanges.value) persistEditDraft();
    else clearEditDraft();
  },
  { deep: true },
);

watch(hasUnsavedChanges, (isDirty) => {
  if (!isDirty) nextTick(applyPendingSelectedStudentRefresh);
});

watch(
  () => ({ ...filters }),
  () => {
    pagination.page = 1;
    if (process.client) window.clearTimeout(searchTimer);
    applyInstantStudentFilters();
  },
  { deep: true },
);

watch(
  () => pagination.page,
  () => applyInstantStudentFilters(),
);
watch(
  () => [selectedAgentId.value, currentCicloKey.value],
  ([nextAgent], [previousAgent]) => {
    if (!nextAgent || controlInitialScopeLoading) return;
    if (
      !previousAgent &&
      controlStudentsIndex.value.length === 0 &&
      studentsLoading.value
    )
      return;
    reloadControlStudentsForCurrentScope({
      clearExisting: true,
      refreshEnrollmentConfig: true,
    });
  },
  { flush: "post" },
);
watch(selectedAgentId, () => nextTick(scheduleWorkspaceScaleUpdate));
watch(
  () => [
    studentsLoading.value,
    kpisLoading.value,
    loadError.value,
    controlDataFreshness.value,
    controlExternalDbRows.value,
    controlStudentsIndex.value.length,
    students.value.length,
    controlDataSource.value?.cacheFreshness || "",
  ],
  () => publishControlSyncIndicatorState(),
  { flush: "post" },
);

watch(
  students,
  (visibleStudents) => queueControlStudentPhotos(visibleStudents),
  { deep: false },
);
watch(
  selectedStudent,
  (student) => {
    controlEscolarDetailOpen.value = Boolean(student);
    mobileDetailScrolled.value = false;
    nextTick(() => {
      if (detailBodyRef.value) detailBodyRef.value.scrollTop = 0;
    });
    queueControlStudentPhotos(student ? [student] : [], { priority: true });
  },
  { immediate: true },
);
watch(
  [
    selectedAgentId,
    () => pagination.total,
    () => students.value.length,
    loadingAny,
    massImporting,
    controlDataFreshness,
    controlCacheStage,
    controlBaseStage,
    controlExternalDbStage,
    controlCompleteStage,
    loadError,
  ],
  publishControlTopbarState,
  { immediate: true },
);

const handleCicloChanged = (event) => {
  const previousCiclo = currentCicloKey.value;
  const cicloKey = normalizeCicloOption(
    event?.detail?.ciclo || cicloCookie.value || state.value?.ciclo,
  );
  if (state.value.ciclo !== cicloKey) state.value.ciclo = cicloKey;
  cicloCookie.value = cicloKey;
  if (normalizeCicloKey(cicloKey) === previousCiclo)
    reloadControlStudentsForCurrentScope({
      clearExisting: true,
      refreshEnrollmentConfig: true,
    });
};

onMounted(async () => {
  scheduleControlScreenScaleUpdate();
  if (process.client) {
    clearControlStudentsBrowserCache();
    localHour.value = new Date().getHours();
    window.addEventListener("ingresos:ciclo-changed", handleCicloChanged);
    window.addEventListener("control-escolar:open-sync-diagnostics", openControlDiagnosticsModal);
    window.addEventListener("control-escolar:topbar-action", handleControlTopbarAction);
    window.addEventListener("resize", scheduleControlScreenScaleUpdate, { passive: true });
    publishControlSyncIndicatorState();
    const controlScreenHost = controlScreenRef.value?.parentElement;
    if (typeof ResizeObserver !== "undefined" && controlScreenHost) {
      controlScreenResizeObserver = new ResizeObserver(scheduleControlScreenScaleUpdate);
      controlScreenResizeObserver.observe(controlScreenHost);
    }
  }

  state.value.ciclo = normalizeCicloOption(
    state.value?.ciclo || cicloCookie.value,
  );
  hydrateCachedEnrollmentConcepts({ replaceExisting: true });

  try {
    await loadOptions();

    if (selectedAgentId.value) {
      await reloadControlStudentsForCurrentScope({
        clearExisting: true,
        refreshEnrollmentConfig: true,
      });
    }
  } finally {
    controlInitialScopeLoading = false;
  }
});

onBeforeUnmount(() => {
  if (process.client) {
    window.removeEventListener("ingresos:ciclo-changed", handleCicloChanged);
    window.removeEventListener("control-escolar:open-sync-diagnostics", openControlDiagnosticsModal);
    window.removeEventListener("control-escolar:topbar-action", handleControlTopbarAction);
    window.removeEventListener("resize", scheduleControlScreenScaleUpdate);
    if (controlScreenFrame) window.cancelAnimationFrame(controlScreenFrame);
  }
  controlScreenResizeObserver?.disconnect?.();
  if (groupSigilSwapTimer) {
    globalThis.clearTimeout(groupSigilSwapTimer);
    groupSigilSwapTimer = null;
  }
  clearControlStudentMutationStates();
  controlEscolarDetailOpen.value = false;
  resetControlTopbarState();
});
