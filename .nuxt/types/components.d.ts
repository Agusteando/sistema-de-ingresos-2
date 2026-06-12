
import type { DefineComponent, SlotsType } from 'vue'
type IslandComponent<T> = DefineComponent<{}, {refresh: () => Promise<void>}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, SlotsType<{ fallback: { error: unknown } }>> & T

type HydrationStrategies = {
  hydrateOnVisible?: IntersectionObserverInit | true
  hydrateOnIdle?: number | true
  hydrateOnInteraction?: keyof HTMLElementEventMap | Array<keyof HTMLElementEventMap> | true
  hydrateOnMediaQuery?: string
  hydrateAfter?: number
  hydrateWhen?: boolean
  hydrateNever?: true
}
type LazyComponent<T> = DefineComponent<HydrationStrategies, {}, {}, {}, {}, {}, {}, { hydrated: () => void }> & T

interface _GlobalComponents {
  BajaReasonModal: typeof import("../../components/BajaReasonModal.vue")['default']
  BulkIngresoCycleModal: typeof import("../../components/BulkIngresoCycleModal.vue")['default']
  ConceptChangeModal: typeof import("../../components/ConceptChangeModal.vue")['default']
  ConceptDirectCorrectionModal: typeof import("../../components/ConceptDirectCorrectionModal.vue")['default']
  ConceptSearchSelect: typeof import("../../components/ConceptSearchSelect.vue")['default']
  ContextMenu: typeof import("../../components/ContextMenu.vue")['default']
  ControlSyncTrace: typeof import("../../components/ControlSyncTrace.vue")['default']
  DocumentModal: typeof import("../../components/DocumentModal.vue")['default']
  IngresoCycleModal: typeof import("../../components/IngresoCycleModal.vue")['default']
  InvoiceModal: typeof import("../../components/InvoiceModal.vue")['default']
  ModalDiscardDialog: typeof import("../../components/ModalDiscardDialog.vue")['default']
  ModalDraftStatus: typeof import("../../components/ModalDraftStatus.vue")['default']
  NoAdeudoModal: typeof import("../../components/NoAdeudoModal.vue")['default']
  PaymentModal: typeof import("../../components/PaymentModal.vue")['default']
  StudentDetails: typeof import("../../components/StudentDetails.vue")['default']
  StudentFormModal: typeof import("../../components/StudentFormModal.vue")['default']
  SyncBadge: typeof import("../../components/SyncBadge.vue")['default']
  WhatsappOnboarding: typeof import("../../components/WhatsappOnboarding.vue")['default']
  StudentsControlEscolarReadOnlyDetails: typeof import("../../components/students/ControlEscolarReadOnlyDetails.vue")['default']
  StudentsControlEscolarSyncIndicator: typeof import("../../components/students/ControlEscolarSyncIndicator.vue")['default']
  StudentsStudentAccountPhotoCard: typeof import("../../components/students/StudentAccountPhotoCard.vue")['default']
  StudentsStudentGradePhotoCard: typeof import("../../components/students/StudentGradePhotoCard.vue")['default']
  StudentsStudentOperatorInfoModal: typeof import("../../components/students/StudentOperatorInfoModal.vue")['default']
  StudentsStudentSectionModal: typeof import("../../components/students/StudentSectionModal.vue")['default']
  StudentsBulkOverview: typeof import("../../components/students/StudentsBulkOverview.vue")['default']
  StudentsBulkPaymentPanel: typeof import("../../components/students/StudentsBulkPaymentPanel.vue")['default']
  StudentsCacheSyncIndicator: typeof import("../../components/students/StudentsCacheSyncIndicator.vue")['default']
  StudentsFilterBar: typeof import("../../components/students/StudentsFilterBar.vue")['default']
  StudentsHero: typeof import("../../components/students/StudentsHero.vue")['default']
  StudentsKpiSummary: typeof import("../../components/students/StudentsKpiSummary.vue")['default']
  StudentsKpiValue: typeof import("../../components/students/StudentsKpiValue.vue")['default']
  StudentsListPanel: typeof import("../../components/students/StudentsListPanel.vue")['default']
  StudentsSelectionDock: typeof import("../../components/students/StudentsSelectionDock.vue")['default']
  StudentsWorkspacePanel: typeof import("../../components/students/StudentsWorkspacePanel.vue")['default']
  UiButton: typeof import("../../components/ui/UiButton.vue")['default']
  UiChip: typeof import("../../components/ui/UiChip.vue")['default']
  UiGroupIcon: typeof import("../../components/ui/UiGroupIcon.vue")['default']
  UiIconButton: typeof import("../../components/ui/UiIconButton.vue")['default']
  UiKpiSparkline: typeof import("../../components/ui/UiKpiSparkline.vue")['default']
  UiVisionFaceImage: typeof import("../../components/ui/UiVisionFaceImage.vue")['default']
  NuxtWelcome: typeof import("../../node_modules/nuxt/dist/app/components/welcome.vue")['default']
  NuxtLayout: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-layout")['default']
  NuxtErrorBoundary: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-error-boundary.vue")['default']
  ClientOnly: typeof import("../../node_modules/nuxt/dist/app/components/client-only")['default']
  DevOnly: typeof import("../../node_modules/nuxt/dist/app/components/dev-only")['default']
  ServerPlaceholder: typeof import("../../node_modules/nuxt/dist/app/components/server-placeholder")['default']
  NuxtLink: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-link")['default']
  NuxtLoadingIndicator: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-loading-indicator")['default']
  NuxtTime: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-time.vue")['default']
  NuxtRouteAnnouncer: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-route-announcer")['default']
  NuxtImg: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtImg']
  NuxtPicture: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtPicture']
  NuxtPage: typeof import("../../node_modules/nuxt/dist/pages/runtime/page")['default']
  NoScript: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['NoScript']
  Link: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Link']
  Base: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Base']
  Title: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Title']
  Meta: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Meta']
  Style: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Style']
  Head: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Head']
  Html: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Html']
  Body: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Body']
  NuxtIsland: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-island")['default']
  LazyBajaReasonModal: LazyComponent<typeof import("../../components/BajaReasonModal.vue")['default']>
  LazyBulkIngresoCycleModal: LazyComponent<typeof import("../../components/BulkIngresoCycleModal.vue")['default']>
  LazyConceptChangeModal: LazyComponent<typeof import("../../components/ConceptChangeModal.vue")['default']>
  LazyConceptDirectCorrectionModal: LazyComponent<typeof import("../../components/ConceptDirectCorrectionModal.vue")['default']>
  LazyConceptSearchSelect: LazyComponent<typeof import("../../components/ConceptSearchSelect.vue")['default']>
  LazyContextMenu: LazyComponent<typeof import("../../components/ContextMenu.vue")['default']>
  LazyControlSyncTrace: LazyComponent<typeof import("../../components/ControlSyncTrace.vue")['default']>
  LazyDocumentModal: LazyComponent<typeof import("../../components/DocumentModal.vue")['default']>
  LazyIngresoCycleModal: LazyComponent<typeof import("../../components/IngresoCycleModal.vue")['default']>
  LazyInvoiceModal: LazyComponent<typeof import("../../components/InvoiceModal.vue")['default']>
  LazyModalDiscardDialog: LazyComponent<typeof import("../../components/ModalDiscardDialog.vue")['default']>
  LazyModalDraftStatus: LazyComponent<typeof import("../../components/ModalDraftStatus.vue")['default']>
  LazyNoAdeudoModal: LazyComponent<typeof import("../../components/NoAdeudoModal.vue")['default']>
  LazyPaymentModal: LazyComponent<typeof import("../../components/PaymentModal.vue")['default']>
  LazyStudentDetails: LazyComponent<typeof import("../../components/StudentDetails.vue")['default']>
  LazyStudentFormModal: LazyComponent<typeof import("../../components/StudentFormModal.vue")['default']>
  LazySyncBadge: LazyComponent<typeof import("../../components/SyncBadge.vue")['default']>
  LazyWhatsappOnboarding: LazyComponent<typeof import("../../components/WhatsappOnboarding.vue")['default']>
  LazyStudentsControlEscolarReadOnlyDetails: LazyComponent<typeof import("../../components/students/ControlEscolarReadOnlyDetails.vue")['default']>
  LazyStudentsControlEscolarSyncIndicator: LazyComponent<typeof import("../../components/students/ControlEscolarSyncIndicator.vue")['default']>
  LazyStudentsStudentAccountPhotoCard: LazyComponent<typeof import("../../components/students/StudentAccountPhotoCard.vue")['default']>
  LazyStudentsStudentGradePhotoCard: LazyComponent<typeof import("../../components/students/StudentGradePhotoCard.vue")['default']>
  LazyStudentsStudentOperatorInfoModal: LazyComponent<typeof import("../../components/students/StudentOperatorInfoModal.vue")['default']>
  LazyStudentsStudentSectionModal: LazyComponent<typeof import("../../components/students/StudentSectionModal.vue")['default']>
  LazyStudentsBulkOverview: LazyComponent<typeof import("../../components/students/StudentsBulkOverview.vue")['default']>
  LazyStudentsBulkPaymentPanel: LazyComponent<typeof import("../../components/students/StudentsBulkPaymentPanel.vue")['default']>
  LazyStudentsCacheSyncIndicator: LazyComponent<typeof import("../../components/students/StudentsCacheSyncIndicator.vue")['default']>
  LazyStudentsFilterBar: LazyComponent<typeof import("../../components/students/StudentsFilterBar.vue")['default']>
  LazyStudentsHero: LazyComponent<typeof import("../../components/students/StudentsHero.vue")['default']>
  LazyStudentsKpiSummary: LazyComponent<typeof import("../../components/students/StudentsKpiSummary.vue")['default']>
  LazyStudentsKpiValue: LazyComponent<typeof import("../../components/students/StudentsKpiValue.vue")['default']>
  LazyStudentsListPanel: LazyComponent<typeof import("../../components/students/StudentsListPanel.vue")['default']>
  LazyStudentsSelectionDock: LazyComponent<typeof import("../../components/students/StudentsSelectionDock.vue")['default']>
  LazyStudentsWorkspacePanel: LazyComponent<typeof import("../../components/students/StudentsWorkspacePanel.vue")['default']>
  LazyUiButton: LazyComponent<typeof import("../../components/ui/UiButton.vue")['default']>
  LazyUiChip: LazyComponent<typeof import("../../components/ui/UiChip.vue")['default']>
  LazyUiGroupIcon: LazyComponent<typeof import("../../components/ui/UiGroupIcon.vue")['default']>
  LazyUiIconButton: LazyComponent<typeof import("../../components/ui/UiIconButton.vue")['default']>
  LazyUiKpiSparkline: LazyComponent<typeof import("../../components/ui/UiKpiSparkline.vue")['default']>
  LazyUiVisionFaceImage: LazyComponent<typeof import("../../components/ui/UiVisionFaceImage.vue")['default']>
  LazyNuxtWelcome: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/welcome.vue")['default']>
  LazyNuxtLayout: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-layout")['default']>
  LazyNuxtErrorBoundary: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-error-boundary.vue")['default']>
  LazyClientOnly: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/client-only")['default']>
  LazyDevOnly: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/dev-only")['default']>
  LazyServerPlaceholder: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/server-placeholder")['default']>
  LazyNuxtLink: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-link")['default']>
  LazyNuxtLoadingIndicator: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-loading-indicator")['default']>
  LazyNuxtTime: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-time.vue")['default']>
  LazyNuxtRouteAnnouncer: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-route-announcer")['default']>
  LazyNuxtImg: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtImg']>
  LazyNuxtPicture: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtPicture']>
  LazyNuxtPage: LazyComponent<typeof import("../../node_modules/nuxt/dist/pages/runtime/page")['default']>
  LazyNoScript: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['NoScript']>
  LazyLink: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Link']>
  LazyBase: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Base']>
  LazyTitle: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Title']>
  LazyMeta: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Meta']>
  LazyStyle: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Style']>
  LazyHead: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Head']>
  LazyHtml: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Html']>
  LazyBody: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Body']>
  LazyNuxtIsland: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-island")['default']>
}

declare module 'vue' {
  export interface GlobalComponents extends _GlobalComponents { }
}

export {}
