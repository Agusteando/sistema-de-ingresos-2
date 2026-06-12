
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


export const BajaReasonModal: typeof import("../components/BajaReasonModal.vue")['default']
export const BulkIngresoCycleModal: typeof import("../components/BulkIngresoCycleModal.vue")['default']
export const ConceptChangeModal: typeof import("../components/ConceptChangeModal.vue")['default']
export const ConceptDirectCorrectionModal: typeof import("../components/ConceptDirectCorrectionModal.vue")['default']
export const ConceptSearchSelect: typeof import("../components/ConceptSearchSelect.vue")['default']
export const ContextMenu: typeof import("../components/ContextMenu.vue")['default']
export const ControlSyncTrace: typeof import("../components/ControlSyncTrace.vue")['default']
export const DocumentModal: typeof import("../components/DocumentModal.vue")['default']
export const IngresoCycleModal: typeof import("../components/IngresoCycleModal.vue")['default']
export const InvoiceModal: typeof import("../components/InvoiceModal.vue")['default']
export const ModalDiscardDialog: typeof import("../components/ModalDiscardDialog.vue")['default']
export const ModalDraftStatus: typeof import("../components/ModalDraftStatus.vue")['default']
export const NoAdeudoModal: typeof import("../components/NoAdeudoModal.vue")['default']
export const PaymentModal: typeof import("../components/PaymentModal.vue")['default']
export const StudentDetails: typeof import("../components/StudentDetails.vue")['default']
export const StudentFormModal: typeof import("../components/StudentFormModal.vue")['default']
export const SyncBadge: typeof import("../components/SyncBadge.vue")['default']
export const WhatsappOnboarding: typeof import("../components/WhatsappOnboarding.vue")['default']
export const StudentsControlEscolarReadOnlyDetails: typeof import("../components/students/ControlEscolarReadOnlyDetails.vue")['default']
export const StudentsControlEscolarSyncIndicator: typeof import("../components/students/ControlEscolarSyncIndicator.vue")['default']
export const StudentsStudentAccountPhotoCard: typeof import("../components/students/StudentAccountPhotoCard.vue")['default']
export const StudentsStudentGradePhotoCard: typeof import("../components/students/StudentGradePhotoCard.vue")['default']
export const StudentsStudentOperatorInfoModal: typeof import("../components/students/StudentOperatorInfoModal.vue")['default']
export const StudentsStudentSectionModal: typeof import("../components/students/StudentSectionModal.vue")['default']
export const StudentsBulkOverview: typeof import("../components/students/StudentsBulkOverview.vue")['default']
export const StudentsBulkPaymentPanel: typeof import("../components/students/StudentsBulkPaymentPanel.vue")['default']
export const StudentsCacheSyncIndicator: typeof import("../components/students/StudentsCacheSyncIndicator.vue")['default']
export const StudentsFilterBar: typeof import("../components/students/StudentsFilterBar.vue")['default']
export const StudentsHero: typeof import("../components/students/StudentsHero.vue")['default']
export const StudentsKpiSummary: typeof import("../components/students/StudentsKpiSummary.vue")['default']
export const StudentsKpiValue: typeof import("../components/students/StudentsKpiValue.vue")['default']
export const StudentsListPanel: typeof import("../components/students/StudentsListPanel.vue")['default']
export const StudentsSelectionDock: typeof import("../components/students/StudentsSelectionDock.vue")['default']
export const StudentsWorkspacePanel: typeof import("../components/students/StudentsWorkspacePanel.vue")['default']
export const UiButton: typeof import("../components/ui/UiButton.vue")['default']
export const UiChip: typeof import("../components/ui/UiChip.vue")['default']
export const UiGroupIcon: typeof import("../components/ui/UiGroupIcon.vue")['default']
export const UiIconButton: typeof import("../components/ui/UiIconButton.vue")['default']
export const UiKpiSparkline: typeof import("../components/ui/UiKpiSparkline.vue")['default']
export const UiVisionFaceImage: typeof import("../components/ui/UiVisionFaceImage.vue")['default']
export const NuxtWelcome: typeof import("../node_modules/nuxt/dist/app/components/welcome.vue")['default']
export const NuxtLayout: typeof import("../node_modules/nuxt/dist/app/components/nuxt-layout")['default']
export const NuxtErrorBoundary: typeof import("../node_modules/nuxt/dist/app/components/nuxt-error-boundary.vue")['default']
export const ClientOnly: typeof import("../node_modules/nuxt/dist/app/components/client-only")['default']
export const DevOnly: typeof import("../node_modules/nuxt/dist/app/components/dev-only")['default']
export const ServerPlaceholder: typeof import("../node_modules/nuxt/dist/app/components/server-placeholder")['default']
export const NuxtLink: typeof import("../node_modules/nuxt/dist/app/components/nuxt-link")['default']
export const NuxtLoadingIndicator: typeof import("../node_modules/nuxt/dist/app/components/nuxt-loading-indicator")['default']
export const NuxtTime: typeof import("../node_modules/nuxt/dist/app/components/nuxt-time.vue")['default']
export const NuxtRouteAnnouncer: typeof import("../node_modules/nuxt/dist/app/components/nuxt-route-announcer")['default']
export const NuxtImg: typeof import("../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtImg']
export const NuxtPicture: typeof import("../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtPicture']
export const NuxtPage: typeof import("../node_modules/nuxt/dist/pages/runtime/page")['default']
export const NoScript: typeof import("../node_modules/nuxt/dist/head/runtime/components")['NoScript']
export const Link: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Link']
export const Base: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Base']
export const Title: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Title']
export const Meta: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Meta']
export const Style: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Style']
export const Head: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Head']
export const Html: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Html']
export const Body: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Body']
export const NuxtIsland: typeof import("../node_modules/nuxt/dist/app/components/nuxt-island")['default']
export const LazyBajaReasonModal: LazyComponent<typeof import("../components/BajaReasonModal.vue")['default']>
export const LazyBulkIngresoCycleModal: LazyComponent<typeof import("../components/BulkIngresoCycleModal.vue")['default']>
export const LazyConceptChangeModal: LazyComponent<typeof import("../components/ConceptChangeModal.vue")['default']>
export const LazyConceptDirectCorrectionModal: LazyComponent<typeof import("../components/ConceptDirectCorrectionModal.vue")['default']>
export const LazyConceptSearchSelect: LazyComponent<typeof import("../components/ConceptSearchSelect.vue")['default']>
export const LazyContextMenu: LazyComponent<typeof import("../components/ContextMenu.vue")['default']>
export const LazyControlSyncTrace: LazyComponent<typeof import("../components/ControlSyncTrace.vue")['default']>
export const LazyDocumentModal: LazyComponent<typeof import("../components/DocumentModal.vue")['default']>
export const LazyIngresoCycleModal: LazyComponent<typeof import("../components/IngresoCycleModal.vue")['default']>
export const LazyInvoiceModal: LazyComponent<typeof import("../components/InvoiceModal.vue")['default']>
export const LazyModalDiscardDialog: LazyComponent<typeof import("../components/ModalDiscardDialog.vue")['default']>
export const LazyModalDraftStatus: LazyComponent<typeof import("../components/ModalDraftStatus.vue")['default']>
export const LazyNoAdeudoModal: LazyComponent<typeof import("../components/NoAdeudoModal.vue")['default']>
export const LazyPaymentModal: LazyComponent<typeof import("../components/PaymentModal.vue")['default']>
export const LazyStudentDetails: LazyComponent<typeof import("../components/StudentDetails.vue")['default']>
export const LazyStudentFormModal: LazyComponent<typeof import("../components/StudentFormModal.vue")['default']>
export const LazySyncBadge: LazyComponent<typeof import("../components/SyncBadge.vue")['default']>
export const LazyWhatsappOnboarding: LazyComponent<typeof import("../components/WhatsappOnboarding.vue")['default']>
export const LazyStudentsControlEscolarReadOnlyDetails: LazyComponent<typeof import("../components/students/ControlEscolarReadOnlyDetails.vue")['default']>
export const LazyStudentsControlEscolarSyncIndicator: LazyComponent<typeof import("../components/students/ControlEscolarSyncIndicator.vue")['default']>
export const LazyStudentsStudentAccountPhotoCard: LazyComponent<typeof import("../components/students/StudentAccountPhotoCard.vue")['default']>
export const LazyStudentsStudentGradePhotoCard: LazyComponent<typeof import("../components/students/StudentGradePhotoCard.vue")['default']>
export const LazyStudentsStudentOperatorInfoModal: LazyComponent<typeof import("../components/students/StudentOperatorInfoModal.vue")['default']>
export const LazyStudentsStudentSectionModal: LazyComponent<typeof import("../components/students/StudentSectionModal.vue")['default']>
export const LazyStudentsBulkOverview: LazyComponent<typeof import("../components/students/StudentsBulkOverview.vue")['default']>
export const LazyStudentsBulkPaymentPanel: LazyComponent<typeof import("../components/students/StudentsBulkPaymentPanel.vue")['default']>
export const LazyStudentsCacheSyncIndicator: LazyComponent<typeof import("../components/students/StudentsCacheSyncIndicator.vue")['default']>
export const LazyStudentsFilterBar: LazyComponent<typeof import("../components/students/StudentsFilterBar.vue")['default']>
export const LazyStudentsHero: LazyComponent<typeof import("../components/students/StudentsHero.vue")['default']>
export const LazyStudentsKpiSummary: LazyComponent<typeof import("../components/students/StudentsKpiSummary.vue")['default']>
export const LazyStudentsKpiValue: LazyComponent<typeof import("../components/students/StudentsKpiValue.vue")['default']>
export const LazyStudentsListPanel: LazyComponent<typeof import("../components/students/StudentsListPanel.vue")['default']>
export const LazyStudentsSelectionDock: LazyComponent<typeof import("../components/students/StudentsSelectionDock.vue")['default']>
export const LazyStudentsWorkspacePanel: LazyComponent<typeof import("../components/students/StudentsWorkspacePanel.vue")['default']>
export const LazyUiButton: LazyComponent<typeof import("../components/ui/UiButton.vue")['default']>
export const LazyUiChip: LazyComponent<typeof import("../components/ui/UiChip.vue")['default']>
export const LazyUiGroupIcon: LazyComponent<typeof import("../components/ui/UiGroupIcon.vue")['default']>
export const LazyUiIconButton: LazyComponent<typeof import("../components/ui/UiIconButton.vue")['default']>
export const LazyUiKpiSparkline: LazyComponent<typeof import("../components/ui/UiKpiSparkline.vue")['default']>
export const LazyUiVisionFaceImage: LazyComponent<typeof import("../components/ui/UiVisionFaceImage.vue")['default']>
export const LazyNuxtWelcome: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/welcome.vue")['default']>
export const LazyNuxtLayout: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-layout")['default']>
export const LazyNuxtErrorBoundary: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-error-boundary.vue")['default']>
export const LazyClientOnly: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/client-only")['default']>
export const LazyDevOnly: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/dev-only")['default']>
export const LazyServerPlaceholder: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/server-placeholder")['default']>
export const LazyNuxtLink: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-link")['default']>
export const LazyNuxtLoadingIndicator: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-loading-indicator")['default']>
export const LazyNuxtTime: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-time.vue")['default']>
export const LazyNuxtRouteAnnouncer: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-route-announcer")['default']>
export const LazyNuxtImg: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtImg']>
export const LazyNuxtPicture: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtPicture']>
export const LazyNuxtPage: LazyComponent<typeof import("../node_modules/nuxt/dist/pages/runtime/page")['default']>
export const LazyNoScript: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['NoScript']>
export const LazyLink: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Link']>
export const LazyBase: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Base']>
export const LazyTitle: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Title']>
export const LazyMeta: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Meta']>
export const LazyStyle: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Style']>
export const LazyHead: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Head']>
export const LazyHtml: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Html']>
export const LazyBody: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Body']>
export const LazyNuxtIsland: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-island")['default']>

export const componentNames: string[]
