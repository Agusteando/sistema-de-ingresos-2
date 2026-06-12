<template>
  <div class="usuarios-page" :class="{ 'has-drawer': activeUser, 'has-selection': selectedEmails.length }">
    <div class="usuarios-main">
      <header class="usuarios-hero">
        <div>
          <p class="eyebrow">Usuarios institucionales</p>
          <h2>Usuarios</h2>
          <p>Directorio operativo y configuración de usuarios institucionales.</p>
        </div>
        <div class="hero-actions">
          <button type="button" class="soft-button action-button action-refresh" :disabled="loadingTable" @click="loadUsers">
            <LucideRefreshCw :size="16" :class="{ 'animate-spin': loadingTable }" />
            Actualizar
          </button>
          <button type="button" class="soft-button action-button action-export" :disabled="!filteredUsuarios.length" @click="exportUsers">
            <LucideDownload :size="16" />
            Exportar
          </button>
          <button type="button" class="primary-button action-button action-create" @click="openModal()">
            <LucidePlus :size="16" />
            Nuevo usuario
          </button>
        </div>
      </header>

      <section class="metric-grid" aria-label="Filtros rápidos de usuarios">
        <button
          v-for="metric in metricChips"
          :key="metric.key"
          type="button"
          class="metric-card metric-chip"
          :class="[{ active: metric.active }, metric.tone]"
          :aria-pressed="metric.active"
          @click="applyMetricChip(metric.key)"
        >
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.caption }}</small>
        </button>
      </section>

      <section class="filters-card">
        <div class="search-control">
          <LucideSearch :size="18" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Buscar por nombre o correo..."
            autocomplete="off"
          >
          <button v-if="searchQuery" type="button" @click="searchQuery = ''"><LucideX :size="15" /></button>
        </div>

        <label class="select-control">
          <span>Plantel</span>
          <select v-model="plantelFilter">
            <option value="all">Todos</option>
            <option value="__sin_plantel__">Sin plantel</option>
            <option v-for="p in plantelOptions" :key="p" :value="p">{{ p }}</option>
          </select>
        </label>

        <label class="select-control">
          <span>Estado</span>
          <select v-model="statusFilter">
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="blocked">Bloqueados</option>
            <option value="protected">Protegidos</option>
          </select>
        </label>

        <label class="select-control">
          <span>Acceso</span>
          <select v-model="accessFilter">
            <option value="all">Todos</option>
            <option value="admin">Financiero</option>
            <option value="control">Control Escolar</option>
            <option value="admin_control">Ambos</option>
            <option value="superadmin">Superadmin</option>
          </select>
        </label>

        <label class="select-control">
          <span>Actividad</span>
          <select v-model="activityFilter">
            <option value="all">Todas</option>
            <option value="today">Últimas 24 horas</option>
            <option value="week">Últimos 7 días</option>
            <option value="never">Nunca</option>
          </select>
        </label>

        <label class="select-control sort-control">
          <span>Ordenar por</span>
          <select v-model="sortBy">
            <option value="last_login_desc">Último ingreso</option>
            <option value="name_asc">Nombre</option>
            <option value="access_asc">Acceso</option>
            <option value="status_asc">Estado</option>
          </select>
        </label>
      </section>

      <section v-if="undoNotice" class="undo-card">
        <div>
          <strong>{{ undoNotice.title }}</strong>
          <span>{{ undoNotice.body }}</span>
        </div>
        <div class="undo-actions">
          <button type="button" class="soft-button action-button" :disabled="bulkSaving" @click="undoLastChange">
            <LucideRotateCcw :size="15" /> Deshacer
          </button>
          <button type="button" class="icon-button" aria-label="Cerrar aviso" @click="clearUndoNotice"><LucideX :size="15" /></button>
        </div>
      </section>

      <section v-if="selectedEmails.length" class="bulk-card">
        <div class="bulk-summary">
          <strong>{{ selectedEmails.length }} seleccionados</strong>
          <span v-if="missingFilteredEmails.length">
            <button type="button" class="bulk-link" @click="selectAllFiltered">Seleccionar los {{ missingFilteredEmails.length }} filtrados restantes</button>
          </span>
        </div>
        <div class="bulk-actions">
          <button type="button" class="bulk-button blue" :disabled="bulkSaving" @click="requestBulkUpdate({ accessMode: 'control' }, 'Asignar acceso Control Escolar', 'Se actualizará el acceso de los usuarios seleccionados.')">
            <LucideGraduationCap :size="15" /> Control Escolar
          </button>
          <button type="button" class="bulk-button purple" :disabled="bulkSaving" @click="requestBulkUpdate({ accessMode: 'admin_control' }, 'Asignar acceso combinado', 'Se actualizará el acceso de los usuarios seleccionados a Financiero + Control Escolar.')">
            <LucideShieldCheck :size="15" /> Ambos
          </button>
          <button type="button" class="bulk-button green" :disabled="bulkSaving" @click="requestBulkUpdate({ accessMode: 'admin' }, 'Restaurar Financiero', 'Se actualizará el acceso de los usuarios seleccionados.')">
            <LucideShieldCheck :size="15" /> Financiero
          </button>
          <button type="button" class="bulk-button purple" :disabled="bulkSaving" @click="requestBulkUpdate({ accessMode: 'superadmin' }, 'Asignar superadmin', 'Se actualizará el acceso de los usuarios seleccionados a superadmin.', 'danger')">
            <LucideShield :size="15" /> Superadmin
          </button>
          <button type="button" class="bulk-button red" :disabled="bulkSaving" @click="requestBulkUpdate({ ingresosBlocked: true }, `¿Bloquear ${selectedEmails.length} usuarios?`, 'Se actualizará el estado de los usuarios seleccionados.', 'danger')">
            <LucideBan :size="15" /> Bloquear
          </button>
          <button type="button" class="bulk-button green" :disabled="bulkSaving" @click="requestBulkUpdate({ ingresosBlocked: false }, 'Reactivar usuarios', 'Se actualizará el estado de los usuarios seleccionados.')">
            <LucideUnlock :size="15" /> Reactivar
          </button>
          <button type="button" class="bulk-button inverse" :disabled="bulkSaving" @click="openInverseBulk">
            <LucideRotateCcw :size="15" /> Inversa avanzada
          </button>
        </div>
        <div class="bulk-plantel-actions">
          <select v-model="bulkPlantelAction" :disabled="bulkSaving">
            <option value="add">Agregar plantel</option>
            <option value="remove">Quitar plantel</option>
            <option value="replace">Reemplazar planteles</option>
          </select>
          <select v-model="bulkPlantelValue" :disabled="bulkSaving">
            <option value="">Plantel...</option>
            <option v-for="p in PLANTELES_LIST" :key="`bulk-${p}`" :value="p">{{ p }}</option>
          </select>
          <button type="button" class="bulk-button" :disabled="bulkSaving || !bulkPlantelValue" @click="requestBulkPlantelUpdate">
            Aplicar plantel
          </button>
        </div>
        <button type="button" class="bulk-close" @click="selectedEmails = []"><LucideX :size="16" /></button>
      </section>

      <section class="users-table-card">
        <table class="users-table">
          <thead>
            <tr>
              <th class="check-col"><input type="checkbox" :checked="allVisibleSelected" :indeterminate.prop="someVisibleSelected" @change="toggleAllVisible"></th>
              <th>Usuario</th>
              <th>Planteles</th>
              <th>Acceso rápido</th>
              <th>Estado</th>
              <th>Último ingreso</th>
              <th class="actions-col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingTable">
              <td colspan="7" class="table-empty"><div class="empty-state compact"><LucideLoader2 :size="22" class="animate-spin" /><strong>Cargando usuarios</strong><span>Consultando el directorio.</span></div></td>
            </tr>
            <tr v-else-if="fetchError">
              <td colspan="7" class="table-empty">
                <div class="empty-state error-state">
                  <LucideBan :size="30" />
                  <strong>No se pudo cargar Usuarios</strong>
                  <span>{{ fetchError.message }}</span>
                  <div class="empty-actions">
                    <button type="button" class="soft-button action-button" @click="loadUsers">Reintentar</button>
                    <button type="button" class="primary-button action-button" @click="openDebugDialog">Ver error exacto</button>
                  </div>
                </div>
              </td>
            </tr>
            <tr v-else-if="!pagedUsuarios.length">
              <td colspan="7" class="table-empty">
                <div class="empty-state">
                  <LucideUsers :size="28" />
                  <strong>Sin registros visibles</strong>
                  <span>El servidor respondió sin usuarios para los filtros actuales.</span>
                  <div class="empty-actions">
                    <button type="button" class="soft-button action-button" @click="clearFiltersAndReload">Limpiar filtros</button>
                    <button type="button" class="primary-button action-button" @click="openDebugDialog">Ver diagnóstico</button>
                  </div>
                </div>
              </td>
            </tr>
            <tr
              v-else
              v-for="u in pagedUsuarios"
              :key="u.email || u.id"
              class="user-row"
              :class="{ active: activeUserKey === userKey(u), blocked: isBlocked(u) }"
              @click="selectUser(u)"
              @contextmenu.prevent="showContextMenu($event, u)"
            >
              <td class="check-col" @click.stop>
                <input type="checkbox" :checked="isSelected(u)" :disabled="isProtectedUser(u)" @change="toggleSelection(u)">
              </td>
              <td>
                <div class="user-cell">
                  <img :src="avatarFor(u)" :alt="displayNameFor(u)" class="user-avatar">
                  <div>
                    <strong>{{ displayNameFor(u) }}</strong>
                    <span>{{ u.email }}</span>
                  </div>
                </div>
              </td>
              <td>
                <div class="plantel-chip-row compact" v-if="plantelesFor(u).length">
                  <span v-for="p in plantelesFor(u)" :key="`${userKey(u)}-${p}`" class="plantel-chip">{{ p }}</span>
                </div>
                <span v-else class="muted-pill">Sin plantel</span>
              </td>
              <td @click.stop>
                <div class="access-stack">
                  <span :class="['access-badge', accessBadgeClass(u)]">
                    <component :is="accessIcon(u)" :size="14" />
                    {{ accessLabel(u) }}
                  </span>
                  <div class="access-switch">
                    <button type="button" :class="{ active: accessMode(u) === 'admin' }" :disabled="bulkSaving" @click="requestAccessChange(u, 'admin')">Fin</button>
                    <button type="button" :class="{ active: accessMode(u) === 'control' }" :disabled="bulkSaving" @click="requestAccessChange(u, 'control')">CTRL</button>
                    <button type="button" :class="{ active: accessMode(u) === 'admin_control' }" :disabled="bulkSaving" @click="requestAccessChange(u, 'admin_control')">Ambos</button>
                    <button type="button" :class="{ active: accessMode(u) === 'superadmin' }" :disabled="bulkSaving" @click="requestAccessChange(u, 'superadmin')">SA</button>
                  </div>
                </div>
              </td>
              <td>
                <span :class="['status-badge', statusClass(u)]">
                  <component :is="statusIcon(u)" :size="14" />
                  {{ statusLabel(u) }}
                </span>
              </td>
              <td class="last-login-cell">
                <LucideCalendarDays :size="15" />
                <span>{{ formatLastLogin(u.last_login_at || u.lastLoginAt) }}</span>
                <small>{{ relativeLastLogin(u.last_login_at || u.lastLoginAt) }}</small>
              </td>
              <td class="actions-col" @click.stop>
                <button type="button" class="icon-button edit-action" aria-label="Editar acceso" @click="openModal(u)">
                  <LucidePencil :size="15" />
                </button>
                <button type="button" class="icon-button lock-action" :class="{ unblock: isBlocked(u) }" :disabled="isProtectedUser(u)" :aria-label="isBlocked(u) ? 'Reactivar acceso' : 'Bloquear acceso'" @click="requestToggleBlocked(u)">
                  <component :is="isBlocked(u) ? LucideUnlock : LucideLock" :size="15" />
                </button>
                <button type="button" class="icon-button more-action" aria-label="Más opciones" @click="showContextMenu($event, u)">
                  <LucideMoreVertical :size="15" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="users-mobile-list">
          <div v-if="loadingTable" class="mobile-empty"><LucideLoader2 :size="20" class="animate-spin" /> Cargando usuarios...</div>
          <div v-else-if="fetchError" class="mobile-empty danger">No se pudo cargar Usuarios: {{ fetchError.message }}</div>
          <div v-else-if="!pagedUsuarios.length" class="mobile-empty">Sin registros visibles para los filtros actuales.</div>
          <article
            v-else
            v-for="u in pagedUsuarios"
            :key="`mobile-${u.email || u.id}`"
            class="mobile-user-card"
            :class="{ active: activeUserKey === userKey(u), blocked: isBlocked(u) }"
            @click="selectUser(u)"
          >
            <div class="mobile-user-top">
              <input type="checkbox" :checked="isSelected(u)" :disabled="isProtectedUser(u)" @click.stop @change="toggleSelection(u)">
              <img :src="avatarFor(u)" :alt="displayNameFor(u)" class="user-avatar">
              <div class="mobile-user-identity">
                <strong>{{ displayNameFor(u) }}</strong>
                <span>{{ u.email }}</span>
              </div>
              <button type="button" class="icon-button" aria-label="Editar acceso" @click.stop="openModal(u)">
                <LucidePencil :size="15" />
              </button>
            </div>
            <div class="mobile-user-meta">
              <span :class="['access-badge', accessBadgeClass(u)]">{{ accessLabel(u) }}</span>
              <span :class="['status-badge', statusClass(u)]">{{ statusLabel(u) }}</span>
            </div>
            <div class="plantel-chip-row compact" v-if="plantelesFor(u).length">
              <span v-for="p in plantelesFor(u)" :key="`mobile-${userKey(u)}-${p}`" class="plantel-chip">{{ p }}</span>
            </div>
            <span v-else class="muted-pill">Sin plantel</span>
            <div class="access-switch mobile-access-switch" @click.stop>
              <button type="button" :class="{ active: accessMode(u) === 'admin' }" :disabled="bulkSaving" @click="requestAccessChange(u, 'admin')">Fin</button>
              <button type="button" :class="{ active: accessMode(u) === 'control' }" :disabled="bulkSaving" @click="requestAccessChange(u, 'control')">CTRL</button>
              <button type="button" :class="{ active: accessMode(u) === 'admin_control' }" :disabled="bulkSaving" @click="requestAccessChange(u, 'admin_control')">Ambos</button>
              <button type="button" :class="{ active: accessMode(u) === 'superadmin' }" :disabled="bulkSaving" @click="requestAccessChange(u, 'superadmin')">SA</button>
            </div>
          </article>
        </div>

        <footer class="table-footer">
          <span>Mostrando {{ pageStart }} a {{ pageEnd }} de {{ filteredUsuarios.length }} usuarios</span>
          <div class="pagination">
            <button type="button" :disabled="page <= 1" @click="page--"><LucideChevronLeft :size="16" /></button>
            <button
              v-for="item in pageItems"
              :key="item.key"
              type="button"
              :disabled="item.ellipsis"
              :class="{ active: item.page === page }"
              @click="!item.ellipsis && (page = item.page)"
            >{{ item.label }}</button>
            <button type="button" :disabled="page >= totalPages" @click="page++"><LucideChevronRight :size="16" /></button>
          </div>
          <label class="page-size-control">
            <select v-model.number="pageSize">
              <option :value="10">10 por página</option>
              <option :value="25">25 por página</option>
              <option :value="50">50 por página</option>
            </select>
          </label>
        </footer>
      </section>
    </div>

    <Transition name="drawer-slide">
      <aside class="user-drawer" v-if="activeUser">
      <button type="button" class="drawer-close" @click="activeUserKey = ''"><LucideX :size="18" /></button>
      <div class="drawer-profile">
        <img :src="avatarFor(activeUser)" :alt="displayNameFor(activeUser)">
        <span :class="['status-badge', statusClass(activeUser)]">
          <component :is="statusIcon(activeUser)" :size="14" />
          {{ statusLabel(activeUser) }}
        </span>
        <h3>{{ displayNameFor(activeUser) }}</h3>
        <p>{{ activeUser.email }}</p>
      </div>

      <div class="drawer-section">
        <h4>Acceso</h4>
        <span :class="['access-badge', accessBadgeClass(activeUser)]">
          <component :is="accessIcon(activeUser)" :size="14" />
          {{ accessLabel(activeUser) }}
        </span>
        <div class="drawer-access-actions">
          <button type="button" :class="{ active: accessMode(activeUser) === 'admin' }" :disabled="bulkSaving" @click="requestAccessChange(activeUser, 'admin')">Financiero</button>
          <button type="button" :class="{ active: accessMode(activeUser) === 'control' }" :disabled="bulkSaving" @click="requestAccessChange(activeUser, 'control')">Control Escolar</button>
          <button type="button" :class="{ active: accessMode(activeUser) === 'admin_control' }" :disabled="bulkSaving" @click="requestAccessChange(activeUser, 'admin_control')">Ambos</button>
          <button type="button" :class="{ active: accessMode(activeUser) === 'superadmin' }" :disabled="bulkSaving" @click="requestAccessChange(activeUser, 'superadmin')">Superadmin</button>
        </div>
        <button type="button" class="drawer-link" @click="openModal(activeUser)">Editar detalles</button>
        <button v-if="!isBlocked(activeUser) && !isProtectedUser(activeUser)" type="button" class="drawer-link danger" @click="requestToggleBlocked(activeUser)">Bloquear acceso</button>
        <button v-else-if="isBlocked(activeUser) && !isProtectedUser(activeUser)" type="button" class="drawer-link" @click="requestToggleBlocked(activeUser)">Reactivar acceso</button>
      </div>

      <div class="drawer-section">
        <h4>Planteles</h4>
        <div class="plantel-chip-row" v-if="plantelesFor(activeUser).length">
          <span v-for="p in plantelesFor(activeUser)" :key="`drawer-${p}`" class="plantel-chip">{{ p }}</span>
        </div>
        <span v-else class="muted-pill">Sin plantel asignado</span>
      </div>

      <div class="drawer-section">
        <h4>Último ingreso</h4>
        <div class="drawer-row">
          <LucideCalendarDays :size="16" />
          <div>
            <strong>{{ formatLastLogin(activeUser.last_login_at || activeUser.lastLoginAt) }}</strong>
            <span>{{ relativeLastLogin(activeUser.last_login_at || activeUser.lastLoginAt) }}</span>
          </div>
        </div>
      </div>

      <div class="drawer-section">
        <h4>Información general</h4>
        <dl class="drawer-list">
          <div><dt>Correo</dt><dd>{{ activeUser.email }}</dd></div>
          <div><dt>Nombre completo</dt><dd>{{ displayNameFor(activeUser) }}</dd></div>
        </dl>
      </div>
      </aside>
    </Transition>

    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
        <div class="user-modal">
          <header class="modal-top">
            <div>
              <p class="eyebrow">Directorio</p>
              <h3>{{ editingId ? 'Editar usuario' : 'Nuevo usuario' }}</h3>
              <span>Selecciona una cuenta y guarda los cambios.</span>
            </div>
            <button type="button" class="icon-button" @click="closeModal"><LucideX :size="18" /></button>
          </header>

          <form @submit.prevent="saveUser">
            <div class="modal-grid">
              <section class="modal-panel">
                <label class="field-label">Buscar usuario</label>
                <div class="directory-search">
                  <LucideSearch :size="16" />
                  <input v-model="directoryQuery" type="search" placeholder="Nombre o correo institucional..." autocomplete="off" @focus="ensureDirectoryResults">
                  <button v-if="directoryQuery" type="button" @click="directoryQuery = ''"><LucideX :size="15" /></button>
                </div>

                <div class="directory-list">
                  <div v-if="directoryLoading" class="directory-empty"><LucideLoader2 :size="18" class="animate-spin" /> Buscando usuarios...</div>
                  <div v-else-if="directoryError" class="directory-error">{{ directoryError }}</div>
                  <button
                    v-else
                    v-for="person in directoryResults"
                    :key="person.email"
                    type="button"
                    :disabled="person.suspended || person.archived"
                    class="directory-option"
                    :class="{ selected: form.email === person.email, disabled: person.suspended || person.archived }"
                    @click="selectWorkspaceUser(person)"
                  >
                    <img :src="person.avatar" :alt="person.name">
                    <span>
                      <strong>{{ person.name }}</strong>
                      <small>{{ person.email }}</small>
                    </span>
                    <em v-if="person.suspended || person.archived">Inactivo</em>
                    <LucideCheckCircle2 v-else-if="form.email === person.email" :size="17" />
                  </button>
                  <div v-if="!directoryLoading && !directoryError && !directoryResults.length" class="directory-empty">No hay resultados para esta búsqueda.</div>
                </div>
              </section>

              <section class="modal-panel">
                <div class="selected-user-card">
                  <img :src="selectedAvatar" alt="Usuario seleccionado">
                  <div>
                    <small>Usuario seleccionado</small>
                    <strong>{{ form.displayName || 'Seleccione un usuario' }}</strong>
                    <span>{{ form.email || 'Sin correo asignado' }}</span>
                  </div>
                </div>

                <label class="field-label">Acceso</label>
                <div class="access-options">
                  <button
                    v-for="option in accessOptions"
                    :key="option.value"
                    type="button"
                    class="access-option"
                    :class="[{ active: form.accessMode === option.value }, option.value]"
                    @click="form.accessMode = option.value"
                  >
                    <component :is="option.icon" :size="17" />
                    <span>{{ option.label }}</span>
                    <small>{{ option.description }}</small>
                  </button>
                </div>

                <label class="field-label">Estado en Sistema de Ingresos</label>
                <label class="block-toggle" :class="{ active: form.ingresosBlocked }">
                  <input type="checkbox" v-model="form.ingresosBlocked" :disabled="isProtectedEmail(form.email)">
                  <span>{{ form.ingresosBlocked ? 'Bloqueado' : 'Activo' }}</span>
                </label>

                <label class="field-label">Planteles</label>
                <div class="plantel-grid">
                  <label v-for="p in PLANTELES_LIST" :key="p" :class="{ active: form.planteles.includes(p) }">
                    <input type="checkbox" :value="p" v-model="form.planteles">
                    {{ p }}
                  </label>
                </div>
              </section>
            </div>

            <footer class="modal-footer">
              <span>{{ form.email || 'Pendiente' }}</span>
              <div>
                <button type="button" class="soft-button" @click="closeModal">Cancelar</button>
                <button type="submit" class="primary-button" :disabled="saving || !canSave">
                  <LucideLoader2 v-if="saving" :size="16" class="animate-spin" />
                  Guardar
                </button>
              </div>
            </footer>
          </form>
        </div>
      </div>

      <div v-if="pendingAction" class="modal-overlay" @click.self="pendingAction = null">
        <div class="confirm-modal">
          <button type="button" class="confirm-close" @click="pendingAction = null"><LucideX :size="18" /></button>
          <span :class="['confirm-icon', pendingAction.tone === 'danger' ? 'danger' : 'safe']">
            <component :is="pendingAction.tone === 'danger' ? LucideBan : LucideShieldCheck" :size="34" />
          </span>
          <h3>{{ pendingAction.title }}</h3>
          <p>{{ pendingAction.body }}</p>
          <div class="confirm-preview">
            <strong>{{ pendingAction.targetCount || pendingAction.emails.length }} usuarios editables</strong>
            <span v-if="pendingAction.skippedCount">{{ pendingAction.skippedCount }} protegidos/omitidos no se tocarán.</span>
            <ul v-if="pendingAction.examples?.length">
              <li v-for="example in pendingAction.examples" :key="example">{{ example }}</li>
            </ul>
          </div>
          <div class="confirm-actions">
            <button type="button" class="soft-button" @click="pendingAction = null">Cancelar</button>
            <button type="button" class="primary-button" :class="{ danger: pendingAction.tone === 'danger' }" :disabled="bulkSaving" @click="runPendingAction">
              <LucideLoader2 v-if="bulkSaving" :size="16" class="animate-spin" />
              Confirmar
            </button>
          </div>
        </div>
      </div>

      <div v-if="showInverseModal" class="modal-overlay" @click.self="closeInverseBulk">
        <div class="inverse-modal">
          <button type="button" class="confirm-close" @click="closeInverseBulk"><LucideX :size="18" /></button>
          <div class="inverse-header">
            <p class="eyebrow">Acción inversa</p>
            <h3>Actualizar seleccionados y resto</h3>
            <span>Define dos grupos globales: los usuarios seleccionados y todo el resto del directorio, aunque no estén dentro del filtro actual.</span>
          </div>

          <div class="inverse-grid">
            <section class="inverse-panel selected">
              <small>Grupo seleccionado</small>
              <strong>{{ inverseSelectedRows.length }} usuarios</strong>
              <label class="field-label">Acceso para seleccionados</label>
              <div class="inverse-access-options">
                <button v-for="option in accessOptions" :key="`selected-${option.value}`" type="button" :class="[{ active: inverseSelectedAccess === option.value }, option.value]" @click="inverseSelectedAccess = option.value">
                  {{ option.label }}
                </button>
              </div>
            </section>

            <section class="inverse-panel inverse">
              <small>Grupo inverso global</small>
              <strong>{{ inverseRestRows.length }} usuarios</strong>
              <label class="field-label">Acceso para todos los no seleccionados</label>
              <div class="inverse-access-options">
                <button v-for="option in accessOptions" :key="`rest-${option.value}`" type="button" :class="[{ active: inverseRestAccess === option.value }, option.value]" @click="inverseRestAccess = option.value">
                  {{ option.label }}
                </button>
              </div>
            </section>
          </div>

          <section class="inverse-scope-card global-only">
            <h4>Alcance del “resto”</h4>
            <div class="inverse-global-note">
              <span>Todo el directorio institucional</span>
              <strong>{{ inverseScopeCounts.all_directory }} usuarios</strong>
              <small>El filtro actual solo sirve para ayudarte a seleccionar. La inversa siempre toma todos los usuarios no seleccionados.</small>
            </div>
          </section>

          <section class="inverse-summary">
            <strong>Vista previa</strong>
            <span>{{ inverseSelectedRows.length }} seleccionados → {{ accessLabelForMode(inverseSelectedAccess) }}</span>
            <span>{{ inverseRestRows.length }} no seleccionados del directorio completo → {{ accessLabelForMode(inverseRestAccess) }}</span>
            <span v-if="inverseProtectedRows.length">{{ inverseProtectedRows.length }} protegidos se omitirán.</span>
          </section>

          <label class="inverse-ack" :class="{ required: inverseRequiresStrongAck }">
            <input type="checkbox" v-model="inverseAcknowledged">
            Entiendo que todos los usuarios no seleccionados del directorio también serán modificados.
          </label>

          <div class="confirm-actions">
            <button type="button" class="soft-button" @click="closeInverseBulk">Cancelar</button>
            <button type="button" class="primary-button" :class="{ danger: inverseRequiresStrongAck }" :disabled="bulkSaving || !canApplyInverse" @click="applyInverseBulk">
              <LucideLoader2 v-if="bulkSaving" :size="16" class="animate-spin" />
              Aplicar a {{ inverseSelectedRows.length + inverseRestRows.length }} usuarios
            </button>
          </div>
        </div>
      </div>

      <div v-if="showDebug" class="modal-overlay debug-overlay" @click.self="showDebug = false">
        <div class="debug-modal">
          <header>
            <div>
              <p class="eyebrow">Diagnóstico</p>
              <h3>Error de carga de Usuarios</h3>
              <span>Respuesta exacta recibida por la pantalla.</span>
            </div>
            <button type="button" class="icon-button" @click="showDebug = false"><LucideX :size="18" /></button>
          </header>

          <section class="debug-summary">
            <div>
              <small>Estado</small>
              <strong>{{ debugStatusLabel }}</strong>
            </div>
            <div>
              <small>Ruta</small>
              <strong>/api/users</strong>
            </div>
            <div>
              <small>Filas cargadas</small>
              <strong>{{ usuarios.length }}</strong>
            </div>
          </section>

          <pre class="debug-pre">{{ debugPayloadText }}</pre>

          <footer>
            <button type="button" class="soft-button action-button" :disabled="diagnosticsLoading" @click="loadUserDiagnostics">Actualizar diagnóstico</button>
            <button type="button" class="primary-button action-button" @click="loadUsers">Reintentar carga</button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import {
  LucideActivity,
  LucideBan,
  LucideCalendarDays,
  LucideCheckCircle2,
  LucideChevronLeft,
  LucideChevronRight,
  LucideDownload,
  LucideGraduationCap,
  LucideLoader2,
  LucideLock,
  LucideMoreVertical,
  LucidePencil,
  LucidePlus,
  LucideRefreshCw,
  LucideRotateCcw,
  LucideSearch,
  LucideShield,
  LucideShieldCheck,
  LucideUnlock,
  LucideUsers,
  LucideX
} from 'lucide-vue-next'
import { PLANTELES_LIST } from '~/utils/constants'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'

const { show } = useToast()
const { openMenu } = useContextMenu()

const WORKSPACE_DOMAIN = 'casitaiedis.edu.mx'
const CONTROL_ROLE = 'ROLE_CTRL'
const SUPERADMIN_ROLES = new Set(['superadmin'])
const PROTECTED_EMAILS = new Set([
  `desarrollo.tecnologico@${WORKSPACE_DOMAIN}`,
  `coord.admon@${WORKSPACE_DOMAIN}`
])

const usuarios = ref([])
const loadingTable = ref(false)
const bulkSaving = ref(false)
const selectedEmails = ref([])
const activeUserKey = ref('')
const showModal = ref(false)
const saving = ref(false)
const editingId = ref(null)
const searchQuery = ref('')
const statusFilter = ref('all')
const accessFilter = ref('all')
const plantelFilter = ref('all')
const activityFilter = ref('all')
const sortBy = ref('last_login_desc')
const page = ref(1)
const pageSize = ref(10)
const directoryQuery = ref('')
const directoryResults = ref([])
const directoryLoading = ref(false)
const directoryError = ref('')
const pendingAction = ref(null)
const fetchError = ref(null)
const lastFetchDebug = ref(null)
const showDebug = ref(false)
const diagnosticsLoading = ref(false)
const bulkPlantelAction = ref('add')
const bulkPlantelValue = ref('')
const undoNotice = ref(null)
const showInverseModal = ref(false)
const inverseSelectedAccess = ref('admin')
const inverseRestAccess = ref('control')
const inverseAcknowledged = ref(false)
let directoryTimer = null
let undoTimer = null

const accessOptions = [
  { value: 'admin', label: 'Financiero', description: 'Acceso operativo estándar.', icon: LucideShieldCheck },
  { value: 'control', label: 'Control Escolar', description: 'Solo gestión escolar.', icon: LucideGraduationCap },
  { value: 'admin_control', label: 'Ambos', description: 'Financiero + Control Escolar.', icon: LucideShieldCheck },
  { value: 'superadmin', label: 'Superadmin', description: 'Acceso total a configuración global.', icon: LucideShield }
]

const emptyForm = () => ({
  username: '',
  displayName: '',
  email: '',
  avatar: '',
  picture: '',
  planteles: ['PT'],
  accessMode: 'admin',
  ingresosBlocked: false
})
const form = ref(emptyForm())

const normalizeEmail = (email) => String(email || '').trim().toLowerCase()
const roleTokens = (role) => String(role || '').split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean)
const hasControlEscolarRole = (role) => roleTokens(role).includes(CONTROL_ROLE.toLowerCase())
const isWorkspaceEmail = (email) => normalizeEmail(email).endsWith(`@${WORKSPACE_DOMAIN}`)
const isProtectedEmail = (email) => PROTECTED_EMAILS.has(normalizeEmail(email))
const isProtectedUser = (u) => Boolean(u?.protected) || isProtectedEmail(u?.email)
const isBlocked = (u) => u?.ingresosBlocked === true || u?.ingresos_blocked === 1 || u?.ingresos_blocked === '1'
const userKey = (u) => normalizeEmail(u?.email) || String(u?.id || '')

const displayNameFor = (u) => u?.workspaceName || u?.displayName || u?.username || u?.email || 'Usuario'
const avatarFor = (u) => {
  if (u?.workspaceAvatar || u?.avatar || u?.picture) return u.workspaceAvatar || u.avatar || u.picture
  const params = new URLSearchParams({ email: u?.email || '', name: displayNameFor(u) })
  return `/api/directory/photo?${params.toString()}`
}
const plantelesFor = (u) => String(u?.planteles || u?.plantel || '').split(',').map(p => p.trim()).filter(Boolean)

const accessModeForRole = (role) => {
  const tokens = roleTokens(role)
  if (tokens.some(token => SUPERADMIN_ROLES.has(token))) return 'superadmin'
  const hasControl = tokens.includes(CONTROL_ROLE.toLowerCase())
  const baseRoles = tokens.filter(token => token !== CONTROL_ROLE.toLowerCase() && token !== 'plantel')
  if (hasControl && baseRoles.length) return 'admin_control'
  if (hasControl) return 'control'
  return 'admin'
}
const accessLabelForMode = (mode) => {
  if (mode === 'superadmin') return 'Superadmin'
  if (mode === 'admin_control') return 'Ambos'
  if (mode === 'control') return 'Control Escolar'
  return 'Financiero'
}
const accessIconForMode = (mode) => {
  if (mode === 'superadmin') return LucideShield
  if (mode === 'control') return LucideGraduationCap
  return LucideShieldCheck
}
const accessClassForMode = (mode) => {
  if (mode === 'superadmin') return 'superadmin'
  if (mode === 'admin_control') return 'mixed'
  if (mode === 'control') return 'control'
  return 'general'
}
const accessMode = (u) => accessModeForRole(u?.role)
const accessLabel = (u) => accessLabelForMode(accessMode(u))
const accessIcon = (u) => accessIconForMode(accessMode(u))
const accessBadgeClass = (u) => accessClassForMode(accessMode(u))

const statusLabel = (u) => {
  if (isProtectedUser(u)) return 'Protegido'
  return isBlocked(u) ? 'Bloqueado' : 'Activo'
}
const statusClass = (u) => {
  if (isProtectedUser(u)) return 'protected'
  return isBlocked(u) ? 'blocked' : 'active'
}
const statusIcon = (u) => {
  if (isProtectedUser(u)) return LucideShield
  return isBlocked(u) ? LucideBan : LucideCheckCircle2
}

const selectedAvatar = computed(() => form.value.avatar || form.value.picture || avatarFor(form.value))
const canSave = computed(() => isWorkspaceEmail(form.value.email) && form.value.planteles.length > 0 && accessOptions.some(option => option.value === form.value.accessMode))
const activeUser = computed(() => activeUserKey.value ? (usuarios.value.find(u => userKey(u) === activeUserKey.value) || null) : null)
const plantelOptions = computed(() => Array.from(new Set([...PLANTELES_LIST, ...usuarios.value.flatMap(plantelesFor)])).filter(Boolean))

const debugStatusLabel = computed(() => {
  const status = fetchError.value?.status || lastFetchDebug.value?.status || lastFetchDebug.value?.diagnostics?.statusCode
  return status ? String(status) : 'Sin código HTTP'
})
const debugPayloadText = computed(() => JSON.stringify({
  fetchError: fetchError.value,
  lastFetchDebug: lastFetchDebug.value,
  clientState: {
    loadedRows: usuarios.value.length,
    visibleRows: filteredUsuarios.value.length,
    filters: {
      search: searchQuery.value,
      status: statusFilter.value,
      plantel: plantelFilter.value,
      access: accessFilter.value,
      activity: activityFilter.value,
      sortBy: sortBy.value,
      page: page.value,
      pageSize: pageSize.value
    }
  }
}, null, 2))

const lastLoginMs = (u) => {
  const parsed = new Date(u?.last_login_at || u?.lastLoginAt || 0).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}
const isWithinDays = (u, days) => {
  const ms = lastLoginMs(u)
  return ms > 0 && Date.now() - ms <= days * 24 * 60 * 60 * 1000
}

const filteredUsuarios = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  let rows = usuarios.value.filter((u) => {
    if (!isWorkspaceEmail(u.email)) return false
    if (statusFilter.value === 'active' && (isBlocked(u) || isProtectedUser(u))) return false
    if (statusFilter.value === 'blocked' && !isBlocked(u)) return false
    if (statusFilter.value === 'protected' && !isProtectedUser(u)) return false
    if (plantelFilter.value === '__sin_plantel__' && plantelesFor(u).length) return false
    if (plantelFilter.value !== 'all' && plantelFilter.value !== '__sin_plantel__' && !plantelesFor(u).includes(plantelFilter.value)) return false
    if (accessFilter.value !== 'all' && accessMode(u) !== accessFilter.value) return false
    if (activityFilter.value === 'today' && !isWithinDays(u, 1)) return false
    if (activityFilter.value === 'week' && !isWithinDays(u, 7)) return false
    if (activityFilter.value === 'never' && lastLoginMs(u) > 0) return false
    if (!query) return true
    return [displayNameFor(u), u.email, accessLabel(u), statusLabel(u), u.planteles, u.plantel]
      .some(value => String(value || '').toLowerCase().includes(query))
  })

  rows = [...rows].sort((a, b) => {
    if (sortBy.value === 'name_asc') return displayNameFor(a).localeCompare(displayNameFor(b))
    if (sortBy.value === 'access_asc') return accessLabel(a).localeCompare(accessLabel(b)) || displayNameFor(a).localeCompare(displayNameFor(b))
    if (sortBy.value === 'status_asc') return statusLabel(a).localeCompare(statusLabel(b)) || displayNameFor(a).localeCompare(displayNameFor(b))
    return lastLoginMs(b) - lastLoginMs(a) || displayNameFor(a).localeCompare(displayNameFor(b))
  })

  return rows
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredUsuarios.value.length / pageSize.value)))
const pagedUsuarios = computed(() => filteredUsuarios.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const pageStart = computed(() => filteredUsuarios.value.length ? ((page.value - 1) * pageSize.value) + 1 : 0)
const pageEnd = computed(() => Math.min(filteredUsuarios.value.length, page.value * pageSize.value))
const pageItems = computed(() => {
  const total = totalPages.value
  const current = page.value
  const values = new Set([1, total, current, current - 1, current + 1].filter(n => n >= 1 && n <= total))
  const sorted = Array.from(values).sort((a, b) => a - b)
  const items = []
  sorted.forEach((item, index) => {
    if (index && item - sorted[index - 1] > 1) items.push({ key: `ellipsis-${item}`, label: '…', ellipsis: true })
    items.push({ key: `page-${item}`, label: String(item), page: item })
  })
  return items
})

const superAdminCount = computed(() => usuarios.value.filter(u => accessMode(u) === 'superadmin').length)
const controlCount = computed(() => usuarios.value.filter(u => accessMode(u) === 'control').length)
const mixedCount = computed(() => usuarios.value.filter(u => accessMode(u) === 'admin_control').length)
const defaultCount = computed(() => usuarios.value.filter(u => accessMode(u) === 'admin').length)
const blockedCount = computed(() => usuarios.value.filter(isBlocked).length)
const protectedCount = computed(() => usuarios.value.filter(isProtectedUser).length)
const todayCount = computed(() => usuarios.value.filter(u => isWithinDays(u, 1)).length)
const missingPlantelCount = computed(() => usuarios.value.filter(u => !plantelesFor(u).length).length)
const metricChips = computed(() => [
  { key: 'all', label: 'Todos', value: usuarios.value.length, caption: 'Directorio', tone: 'neutral', active: statusFilter.value === 'all' && accessFilter.value === 'all' && plantelFilter.value === 'all' && activityFilter.value === 'all' },
  { key: 'admin', label: 'Financiero', value: defaultCount.value, caption: 'Acceso operativo', tone: 'green', active: accessFilter.value === 'admin' },
  { key: 'control', label: 'Control Escolar', value: controlCount.value, caption: 'Solo expediente', tone: 'blue', active: accessFilter.value === 'control' },
  { key: 'admin_control', label: 'Ambos', value: mixedCount.value, caption: 'Doble acceso', tone: 'purple', active: accessFilter.value === 'admin_control' },
  { key: 'superadmin', label: 'Superadmin', value: superAdminCount.value, caption: 'Acceso global', tone: 'purple', active: accessFilter.value === 'superadmin' },
  { key: 'blocked', label: 'Bloqueados', value: blockedCount.value, caption: 'Restringidos', tone: 'red', active: statusFilter.value === 'blocked' },
  { key: 'protected', label: 'Protegidos', value: protectedCount.value, caption: 'No editables', tone: 'purple', active: statusFilter.value === 'protected' },
  { key: 'missing_plantel', label: 'Sin plantel', value: missingPlantelCount.value, caption: 'Por asignar', tone: 'amber', active: plantelFilter.value === '__sin_plantel__' },
  { key: 'today', label: 'Actividad hoy', value: todayCount.value, caption: 'Últimas 24h', tone: 'cyan', active: activityFilter.value === 'today' }
])
const visibleSelectableEmails = computed(() => pagedUsuarios.value.filter(u => !isProtectedUser(u)).map(u => normalizeEmail(u.email)).filter(Boolean))
const filteredSelectableEmails = computed(() => filteredUsuarios.value.filter(u => !isProtectedUser(u)).map(u => normalizeEmail(u.email)).filter(Boolean))
const missingFilteredEmails = computed(() => filteredSelectableEmails.value.filter(email => !selectedEmails.value.includes(email)))
const allVisibleSelected = computed(() => visibleSelectableEmails.value.length > 0 && visibleSelectableEmails.value.every(email => selectedEmails.value.includes(email)))
const someVisibleSelected = computed(() => visibleSelectableEmails.value.some(email => selectedEmails.value.includes(email)) && !allVisibleSelected.value)
const hasSpecificPlantelFilter = computed(() => plantelFilter.value !== 'all' && plantelFilter.value !== '__sin_plantel__')
const inverseDirectoryRows = computed(() => usuarios.value.filter(u => isWorkspaceEmail(u.email)))
const inverseScopeCounts = computed(() => ({
  all_directory: inverseDirectoryRows.value.length
}))
const inverseSelectedRows = computed(() => {
  const selected = new Set(selectedEmails.value.map(normalizeEmail))
  return inverseDirectoryRows.value.filter(u => selected.has(normalizeEmail(u.email)) && !isProtectedUser(u))
})
const inverseRestRows = computed(() => {
  const selected = new Set(selectedEmails.value.map(normalizeEmail))
  return inverseDirectoryRows.value.filter(u => !selected.has(normalizeEmail(u.email)) && !isProtectedUser(u))
})
const inverseProtectedRows = computed(() => inverseDirectoryRows.value.filter(isProtectedUser))
const inverseRequiresStrongAck = computed(() => true)
const canApplyInverse = computed(() => inverseSelectedRows.value.length > 0 && inverseRestRows.value.length > 0 && (!inverseRequiresStrongAck.value || inverseAcknowledged.value))

watch([searchQuery, statusFilter, plantelFilter, accessFilter, activityFilter, sortBy, pageSize], () => { page.value = 1 })
watch(totalPages, (total) => { if (page.value > total) page.value = total })
watch(showModal, (val) => {
  if (typeof document !== 'undefined') document.body.style.overflow = val ? 'hidden' : ''
})
watch(directoryQuery, () => {
  if (!showModal.value) return
  if (directoryTimer) clearTimeout(directoryTimer)
  directoryTimer = setTimeout(searchDirectory, 220)
})

onMounted(loadUsers)
onUnmounted(() => {
  if (directoryTimer) clearTimeout(directoryTimer)
  if (undoTimer) clearTimeout(undoTimer)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})

const extractStatus = (e) => e?.statusCode || e?.response?.status || e?.data?.statusCode || e?.response?._data?.statusCode || null
const extractMessage = (e) => e?.data?.message || e?.response?._data?.message || e?.message || 'Error cargando usuarios'
const serializeFetchError = (e, context = {}) => ({
  ...context,
  status: extractStatus(e),
  message: extractMessage(e),
  name: e?.name || null,
  statusMessage: e?.statusMessage || e?.response?.statusText || null,
  url: e?.request || e?.response?.url || '/api/users',
  data: e?.data || e?.response?._data || null,
  stack: e?.stack || null,
  timestamp: new Date().toISOString()
})

const loadUserDiagnostics = async () => {
  diagnosticsLoading.value = true
  try {
    const diagnostics = await $fetch('/api/debug/users-external')
    lastFetchDebug.value = {
      ...(lastFetchDebug.value || {}),
      diagnostics,
      diagnosticsFetchedAt: new Date().toISOString()
    }
  } catch (e) {
    lastFetchDebug.value = {
      ...(lastFetchDebug.value || {}),
      diagnosticsError: serializeFetchError(e, { endpoint: '/api/debug/users-external' })
    }
  } finally {
    diagnosticsLoading.value = false
  }
}

const openDebugDialog = async () => {
  showDebug.value = true
  await loadUserDiagnostics()
}

const clearFiltersAndReload = async () => {
  searchQuery.value = ''
  statusFilter.value = 'all'
  plantelFilter.value = 'all'
  accessFilter.value = 'all'
  activityFilter.value = 'all'
  sortBy.value = 'last_login_desc'
  page.value = 1
  await loadUsers()
}

const clearQuickFilters = () => {
  statusFilter.value = 'all'
  plantelFilter.value = 'all'
  accessFilter.value = 'all'
  activityFilter.value = 'all'
  page.value = 1
}
const applyMetricChip = (key) => {
  if (key === 'all') {
    clearQuickFilters()
    return
  }
  statusFilter.value = 'all'
  plantelFilter.value = 'all'
  accessFilter.value = 'all'
  activityFilter.value = 'all'
  if (['admin', 'control', 'admin_control', 'superadmin'].includes(key)) accessFilter.value = key
  if (key === 'blocked') statusFilter.value = 'blocked'
  if (key === 'protected') statusFilter.value = 'protected'
  if (key === 'missing_plantel') plantelFilter.value = '__sin_plantel__'
  if (key === 'today') activityFilter.value = 'today'
  page.value = 1
}

const hydrateWorkspaceProfiles = async (rows) => {
  const emails = rows.map(row => normalizeEmail(row.email)).filter(Boolean).slice(0, 250)
  if (!emails.length) return rows

  try {
    const response = await $fetch('/api/directory/users', {
      method: 'POST',
      body: { emails }
    })
    const profiles = new Map((response?.users || []).map(profile => [normalizeEmail(profile.email || profile.primaryEmail), profile]))
    return rows.map((row) => {
      const profile = profiles.get(normalizeEmail(row.email))
      if (!profile) return row
      return {
        ...row,
        workspaceName: profile.name || profile.displayName || row.workspaceName,
        workspaceAvatar: profile.avatar || row.workspaceAvatar,
        workspaceSuspended: Boolean(profile.suspended),
        workspaceArchived: Boolean(profile.archived),
        workspaceOrgUnitPath: profile.orgUnitPath || ''
      }
    })
  } catch (e) {
    return rows
  }
}

async function loadUsers () {
  loadingTable.value = true
  fetchError.value = null
  lastFetchDebug.value = null
  try {
    const rows = await $fetch('/api/users')
    const rawRows = Array.isArray(rows) ? rows : []
    const visibleRows = rawRows.filter(u => isWorkspaceEmail(u.email))

    if (!Array.isArray(rows)) {
      fetchError.value = {
        status: 200,
        message: 'La respuesta de /api/users no fue una lista.',
        receivedType: typeof rows
      }
      lastFetchDebug.value = {
        endpoint: '/api/users',
        responseType: typeof rows,
        response: rows,
        timestamp: new Date().toISOString()
      }
      usuarios.value = []
      selectedEmails.value = []
      activeUserKey.value = ''
      showDebug.value = true
      await loadUserDiagnostics()
      return
    }

    if (!rawRows.length) {
      fetchError.value = {
        status: 200,
        message: 'El servidor respondió correctamente, pero no devolvió usuarios.',
        rawRows: 0,
        visibleRows: 0
      }
      lastFetchDebug.value = {
        endpoint: '/api/users',
        responseType: 'array',
        rawRows: 0,
        visibleRows: 0,
        timestamp: new Date().toISOString()
      }
      usuarios.value = []
      selectedEmails.value = []
      activeUserKey.value = ''
      showDebug.value = true
      await loadUserDiagnostics()
      return
    }

    if (!visibleRows.length) {
      fetchError.value = {
        status: 200,
        message: 'El servidor devolvió usuarios, pero ninguno coincide con el dominio institucional esperado.',
        rawRows: rawRows.length,
        visibleRows: 0
      }
      lastFetchDebug.value = {
        endpoint: '/api/users',
        responseType: 'array',
        rawRows: rawRows.length,
        visibleRows: 0,
        sample: rawRows.slice(0, 5).map(row => ({ id: row?.id, email: row?.email, role: row?.role })),
        timestamp: new Date().toISOString()
      }
      usuarios.value = []
      selectedEmails.value = []
      activeUserKey.value = ''
      showDebug.value = true
      await loadUserDiagnostics()
      return
    }

    usuarios.value = await hydrateWorkspaceProfiles(visibleRows)
    lastFetchDebug.value = {
      endpoint: '/api/users',
      status: 200,
      rawRows: rawRows.length,
      visibleRows: visibleRows.length,
      hydratedRows: usuarios.value.length,
      timestamp: new Date().toISOString()
    }
    selectedEmails.value = selectedEmails.value.filter(email => usuarios.value.some(u => normalizeEmail(u.email) === email))
    if (!usuarios.value.some(u => userKey(u) === activeUserKey.value)) activeUserKey.value = ''
  } catch (e) {
    const debug = serializeFetchError(e, { endpoint: '/api/users' })
    fetchError.value = {
      status: debug.status,
      message: debug.message,
      data: debug.data,
      statusMessage: debug.statusMessage,
      name: debug.name
    }
    lastFetchDebug.value = debug
    showDebug.value = true
    show(debug.message, 'danger')
    await loadUserDiagnostics()
  } finally {
    loadingTable.value = false
  }
}

const isSelected = (u) => selectedEmails.value.includes(normalizeEmail(u?.email))
const toggleSelection = (u) => {
  const email = normalizeEmail(u?.email)
  if (!email || isProtectedUser(u)) return
  selectedEmails.value = selectedEmails.value.includes(email)
    ? selectedEmails.value.filter(item => item !== email)
    : [...selectedEmails.value, email]
}
const toggleAllVisible = () => {
  const visible = visibleSelectableEmails.value
  selectedEmails.value = allVisibleSelected.value
    ? selectedEmails.value.filter(email => !visible.includes(email))
    : Array.from(new Set([...selectedEmails.value, ...visible]))
}
const selectAllFiltered = () => {
  selectedEmails.value = Array.from(new Set([...selectedEmails.value, ...filteredSelectableEmails.value]))
}
const selectUser = (u) => { activeUserKey.value = userKey(u) }

const searchDirectory = async () => {
  directoryLoading.value = true
  directoryError.value = ''
  try {
    const response = await $fetch('/api/directory/users', { query: { q: directoryQuery.value, limit: 12 } })
    directoryResults.value = Array.isArray(response?.users) ? response.users.filter(person => isWorkspaceEmail(person.email)) : []
  } catch (e) {
    directoryResults.value = []
    directoryError.value = extractMessage(e) || 'No se pudo consultar Workspace.'
  } finally {
    directoryLoading.value = false
  }
}
const ensureDirectoryResults = () => {
  if (!directoryResults.value.length && !directoryLoading.value) searchDirectory()
}
const selectWorkspaceUser = (person) => {
  if (!person || !isWorkspaceEmail(person.email) || person.suspended || person.archived) return
  form.value.displayName = person.name || person.displayName || person.email
  form.value.username = person.email
  form.value.email = person.email
  form.value.avatar = person.avatar || avatarFor(person)
  form.value.picture = person.avatar || avatarFor(person)
}

const normalizePlantelArray = (value) => {
  const raw = Array.isArray(value) ? value : String(value || '').split(',')
  return Array.from(new Set(raw.map(p => String(p || '').trim()).filter(p => PLANTELES_LIST.includes(p))))
}
const serializePlanteles = (value) => normalizePlantelArray(value).join(',')
const resolveClientRoleForAccess = (role, mode) => {
  const tokens = Array.from(new Set(roleTokens(role).map(token => token.toUpperCase())))
  const withoutControl = tokens.filter(token => token !== CONTROL_ROLE)
  const baseRoles = withoutControl.filter(token => token !== 'PLANTEL' && !SUPERADMIN_ROLES.has(token.toLowerCase()))
  if (mode === 'superadmin') return 'superadmin'
  if (mode === 'control') return CONTROL_ROLE
  if (mode === 'admin_control') return Array.from(new Set([...(baseRoles.length ? baseRoles : ['ROLE_HUSKY_USER']), CONTROL_ROLE])).join(',')
  if (mode === 'admin') return (baseRoles.length ? baseRoles : ['ROLE_HUSKY_USER']).join(',')
  return role || 'ROLE_HUSKY_USER'
}
const optimisticUser = (u, patch) => {
  const next = { ...u }
  if (patch.accessMode) next.role = resolveClientRoleForAccess(next.role, patch.accessMode)
  if ('ingresosBlocked' in patch || 'ingresos_blocked' in patch) {
    const blocked = patch.ingresosBlocked ?? patch.ingresos_blocked
    next.ingresosBlocked = Boolean(blocked)
    next.ingresos_blocked = Boolean(blocked) ? 1 : 0
  }
  const hasReplacePlanteles = Object.prototype.hasOwnProperty.call(patch, 'replacePlanteles')
  if (hasReplacePlanteles || patch.addPlanteles || patch.removePlanteles) {
    const currentPlanteles = normalizePlantelArray(next.planteles || next.plantel)
    let nextPlanteles = hasReplacePlanteles ? normalizePlantelArray(patch.replacePlanteles) : currentPlanteles
    const addPlanteles = normalizePlantelArray(patch.addPlanteles)
    const removePlanteles = normalizePlantelArray(patch.removePlanteles)
    if (addPlanteles.length) nextPlanteles = Array.from(new Set([...nextPlanteles, ...addPlanteles]))
    if (removePlanteles.length) nextPlanteles = nextPlanteles.filter(p => !removePlanteles.includes(p))
    next.planteles = serializePlanteles(nextPlanteles)
    next.plantel = nextPlanteles[0] || ''
  }
  return next
}
const mergeResponseUser = (row) => {
  if (!row?.email) return
  const email = normalizeEmail(row.email)
  const existing = usuarios.value.find(u => normalizeEmail(u.email) === email)
  const merged = {
    ...(existing || {}),
    ...row,
    workspaceName: existing?.workspaceName || row.workspaceName || row.displayName || row.username,
    workspaceAvatar: existing?.workspaceAvatar || row.workspaceAvatar || row.avatar || row.picture,
    workspaceSuspended: existing?.workspaceSuspended || row.workspaceSuspended || false,
    workspaceArchived: existing?.workspaceArchived || row.workspaceArchived || false,
    workspaceOrgUnitPath: existing?.workspaceOrgUnitPath || row.workspaceOrgUnitPath || ''
  }
  if (existing) usuarios.value = usuarios.value.map(u => normalizeEmail(u.email) === email ? merged : u)
  else usuarios.value = [merged, ...usuarios.value]
}
const mergeResponseRows = (rows) => {
  if (!Array.isArray(rows)) return
  rows.forEach(mergeResponseUser)
}
const patchLocalUsers = (emails, patch) => {
  const target = new Set(emails.map(normalizeEmail))
  usuarios.value = usuarios.value.map(u => target.has(normalizeEmail(u.email)) ? optimisticUser(u, patch) : u)
}
const rowsForEmails = (emails) => {
  const target = new Set(emails.map(normalizeEmail))
  return usuarios.value.filter(u => target.has(normalizeEmail(u.email)))
}
const cloneRowsForRollback = (emails) => rowsForEmails(emails).map(u => ({ ...u }))
const restoreRows = (rows) => { rows.forEach(mergeResponseUser) }

const clearUndoNotice = () => {
  undoNotice.value = null
  if (undoTimer) clearTimeout(undoTimer)
  undoTimer = null
}
const setUndoNotice = (notice) => {
  clearUndoNotice()
  undoNotice.value = notice
  undoTimer = setTimeout(clearUndoNotice, 9000)
}
const undoLastChange = async () => {
  if (!undoNotice.value) return
  const notice = undoNotice.value
  clearUndoNotice()
  await applyUserPatch(notice.emails, notice.patch, {
    optimistic: true,
    successMessage: 'Cambio revertido.',
    skipUndo: true
  })
}

const applyUserPatch = async (emails, patch, options = {}) => {
  const allowsProtectedRoleChange = Boolean(patch?.accessMode) && !('ingresosBlocked' in patch) && !('ingresos_blocked' in patch) && !('replacePlanteles' in patch) && !patch.addPlanteles && !patch.removePlanteles
  const normalizedEmails = Array.from(new Set((emails || []).map(normalizeEmail).filter(email => email && (allowsProtectedRoleChange || !isProtectedEmail(email)))))
  if (!normalizedEmails.length) return null
  const rollbackRows = cloneRowsForRollback(normalizedEmails)
  if (options.optimistic !== false) patchLocalUsers(normalizedEmails, patch)
  bulkSaving.value = true
  try {
    const response = await $fetch('/api/users/bulk', {
      method: 'PATCH',
      body: { emails: normalizedEmails, ...patch }
    })
    mergeResponseRows(response?.rows)
    const details = []
    if (response?.skipped?.length) details.push(`${response.skipped.length} omitidos`)
    if (response?.failed?.length) details.push(`${response.failed.length} errores`)
    if (options.successMessage !== false) show(options.successMessage || 'Usuarios actualizados.', response?.failed?.length ? 'danger' : 'success', { details })
    return response
  } catch (e) {
    restoreRows(rollbackRows)
    const message = extractMessage(e) || 'Error al actualizar usuarios'
    show(message, 'danger')
    return null
  } finally {
    bulkSaving.value = false
  }
}

const requestAccessChange = async (u, mode) => {
  if (!u || accessMode(u) === mode) return
  const previousMode = accessMode(u)
  const email = normalizeEmail(u.email)
  const response = await applyUserPatch([email], { accessMode: mode }, {
    optimistic: true,
    successMessage: `Acceso actualizado a ${accessLabelForMode(mode)}.`
  })
  if (response && !response.failed?.length) {
    setUndoNotice({
      title: 'Acceso actualizado',
      body: `${displayNameFor(u)} ahora tiene acceso ${accessLabelForMode(mode)}.`,
      emails: [email],
      patch: { accessMode: previousMode }
    })
  }
}

const previewForPatch = (rows, patch) => rows.slice(0, 5).map((u) => {
  if (patch.accessMode) return `${displayNameFor(u)}: ${accessLabel(u)} → ${accessLabelForMode(patch.accessMode)}`
  if ('ingresosBlocked' in patch || 'ingresos_blocked' in patch) return `${displayNameFor(u)}: ${statusLabel(u)} → ${patch.ingresosBlocked ?? patch.ingresos_blocked ? 'Bloqueado' : 'Activo'}`
  if (patch.addPlanteles) return `${displayNameFor(u)}: agregar ${normalizePlantelArray(patch.addPlanteles).join(', ')}`
  if (patch.removePlanteles) return `${displayNameFor(u)}: quitar ${normalizePlantelArray(patch.removePlanteles).join(', ')}`
  if (Object.prototype.hasOwnProperty.call(patch, 'replacePlanteles')) return `${displayNameFor(u)}: reemplazar planteles por ${normalizePlantelArray(patch.replacePlanteles).join(', ') || 'Sin plantel'}`
  return displayNameFor(u)
})

const requestBulkUpdate = (patch, title, body, tone = 'safe', sourceEmails = selectedEmails.value) => {
  const rawEmails = Array.from(new Set(sourceEmails.map(normalizeEmail).filter(Boolean)))
  const allowsProtectedRoleChange = Boolean(patch?.accessMode) && !('ingresosBlocked' in patch) && !('ingresos_blocked' in patch) && !('replacePlanteles' in patch) && !patch.addPlanteles && !patch.removePlanteles
  const targetRows = rowsForEmails(rawEmails).filter(u => allowsProtectedRoleChange || !isProtectedUser(u))
  const skippedRows = rowsForEmails(rawEmails).filter(u => !allowsProtectedRoleChange && isProtectedUser(u))
  const emails = targetRows.map(u => normalizeEmail(u.email)).filter(Boolean)
  if (!emails.length) {
    show('No hay usuarios editables en la selección.', 'danger')
    return
  }
  pendingAction.value = {
    patch,
    title,
    body,
    tone,
    emails,
    targetCount: emails.length,
    skippedCount: skippedRows.length,
    examples: previewForPatch(targetRows, patch)
  }
}
const requestBulkPlantelUpdate = () => {
  if (!bulkPlantelValue.value) return
  const plantel = bulkPlantelValue.value
  const patch = bulkPlantelAction.value === 'remove'
    ? { removePlanteles: [plantel] }
    : bulkPlantelAction.value === 'replace'
      ? { replacePlanteles: [plantel] }
      : { addPlanteles: [plantel] }
  const label = bulkPlantelAction.value === 'remove' ? 'Quitar plantel' : bulkPlantelAction.value === 'replace' ? 'Reemplazar planteles' : 'Agregar plantel'
  requestBulkUpdate(patch, label, `Se aplicará ${plantel} a los usuarios seleccionados.`)
}
const requestToggleBlocked = (u) => {
  if (!u || isProtectedUser(u)) return
  const blocked = !isBlocked(u)
  requestBulkUpdate(
    { ingresosBlocked: blocked },
    blocked ? `¿Bloquear a ${displayNameFor(u)}?` : `¿Reactivar a ${displayNameFor(u)}?`,
    blocked ? 'Se bloqueará el acceso de este usuario.' : 'Se reactivará el acceso de este usuario.',
    blocked ? 'danger' : 'safe',
    [u.email]
  )
}
const runPendingAction = async () => {
  if (!pendingAction.value) return
  const action = pendingAction.value
  const response = await applyUserPatch(action.emails, action.patch, {
    optimistic: true,
    successMessage: false
  })
  if (!response) return
  const details = []
  if (response.skipped?.length) details.push(`${response.skipped.length} omitidos`)
  if (response.failed?.length) details.push(`${response.failed.length} errores`)
  show(`${response.updated || 0} usuarios actualizados.`, response.failed?.length ? 'danger' : 'success', { details })
  selectedEmails.value = selectedEmails.value.filter(email => !action.emails.includes(email))
  pendingAction.value = null
}

const inverseScopeFilter = () => ({ search: '', plantel: 'all', access: 'all', status: 'all', activity: 'all', sort: sortBy.value })
const openInverseBulk = () => {
  if (!selectedEmails.value.length) return
  inverseSelectedAccess.value = 'admin'
  inverseRestAccess.value = 'control'
  inverseAcknowledged.value = false
  showInverseModal.value = true
}
const closeInverseBulk = () => {
  showInverseModal.value = false
  inverseAcknowledged.value = false
}
const applyInverseBulk = async () => {
  if (!canApplyInverse.value) return
  const selectedPatch = { accessMode: inverseSelectedAccess.value }
  const inversePatch = { accessMode: inverseRestAccess.value }
  const selectedEmailsForPatch = inverseSelectedRows.value.map(u => normalizeEmail(u.email))
  const inverseEmailsForPatch = inverseRestRows.value.map(u => normalizeEmail(u.email))
  const rollbackRows = cloneRowsForRollback([...selectedEmailsForPatch, ...inverseEmailsForPatch])
  patchLocalUsers(selectedEmailsForPatch, selectedPatch)
  patchLocalUsers(inverseEmailsForPatch, inversePatch)
  bulkSaving.value = true
  try {
    const response = await $fetch('/api/users/bulk-inverse', {
      method: 'PATCH',
      body: {
        selectedEmails: selectedEmails.value,
        scopeMode: 'all_directory',
        filterScope: inverseScopeFilter(),
        selectedPatch,
        inversePatch
      }
    })
    mergeResponseRows(response?.rows)
    const selectedUpdated = response?.selected?.updated || 0
    const inverseUpdated = response?.inverse?.updated || 0
    const skipped = (response?.selected?.skipped?.length || 0) + (response?.inverse?.skipped?.length || 0)
    const failed = (response?.selected?.failed?.length || 0) + (response?.inverse?.failed?.length || 0)
    const details = []
    if (skipped) details.push(`${skipped} omitidos`)
    if (failed) details.push(`${failed} errores`)
    show(`${selectedUpdated + inverseUpdated} usuarios actualizados con acción inversa.`, failed ? 'danger' : 'success', { details })
    selectedEmails.value = []
    closeInverseBulk()
  } catch (e) {
    restoreRows(rollbackRows)
    show(extractMessage(e) || 'No se pudo aplicar la acción inversa.', 'danger')
  } finally {
    bulkSaving.value = false
  }
}

const showContextMenu = (event, u) => {
  openMenu(event, [
    { label: 'Opciones', disabled: true, action: () => {} },
    { label: 'Editar usuario', icon: LucidePencil, action: () => openModal(u) },
    { label: 'Asignar acceso Control Escolar', icon: LucideGraduationCap, action: () => requestAccessChange(u, 'control') },
    { label: 'Asignar acceso combinado', icon: LucideShieldCheck, action: () => requestAccessChange(u, 'admin_control') },
    { label: 'Asignar superadmin', icon: LucideShield, action: () => requestAccessChange(u, 'superadmin') },
    { label: 'Restaurar Financiero', icon: LucideShieldCheck, action: () => requestAccessChange(u, 'admin') },
    { label: isBlocked(u) ? 'Reactivar acceso' : 'Bloquear acceso', icon: isBlocked(u) ? LucideUnlock : LucideBan, disabled: isProtectedUser(u), action: () => requestToggleBlocked(u) }
  ])
}

const openModal = (u = null) => {
  if (u) {
    editingId.value = u.id
    form.value = {
      username: u.email || u.username || '',
      displayName: displayNameFor(u),
      email: u.email,
      avatar: avatarFor(u),
      picture: avatarFor(u),
      planteles: plantelesFor(u).length ? plantelesFor(u) : ['PT'],
      accessMode: accessModeForRole(u.role),
      ingresosBlocked: isBlocked(u)
    }
    directoryQuery.value = u.email || displayNameFor(u)
  } else {
    editingId.value = null
    form.value = emptyForm()
    directoryQuery.value = ''
  }
  directoryResults.value = []
  directoryError.value = ''
  showModal.value = true
  setTimeout(searchDirectory, 0)
}
const closeModal = () => { showModal.value = false }

const saveUser = async () => {
  if (!canSave.value) {
    show('Seleccione una cuenta válida y al menos un plantel.', 'danger')
    return
  }
  saving.value = true
  const url = editingId.value ? `/api/users/${editingId.value}` : '/api/users'
  const method = editingId.value ? 'PUT' : 'POST'
  const optimisticPatch = {
    accessMode: form.value.accessMode,
    replacePlanteles: form.value.planteles,
    ingresosBlocked: form.value.ingresosBlocked
  }
  const email = normalizeEmail(form.value.email)
  const rollbackRows = editingId.value ? cloneRowsForRollback([email]) : []
  if (editingId.value) patchLocalUsers([email], optimisticPatch)
  try {
    const response = await $fetch(url, {
      method,
      body: {
        username: form.value.username || form.value.email,
        displayName: form.value.displayName,
        email: form.value.email,
        avatar: form.value.avatar,
        picture: form.value.picture || form.value.avatar,
        planteles: form.value.planteles,
        accessMode: form.value.accessMode,
        ingresosBlocked: form.value.ingresosBlocked
      }
    })
    if (response?.user) mergeResponseUser(response.user)
    else if (Array.isArray(response?.rows)) mergeResponseRows(response.rows)
    else {
      mergeResponseUser({
        id: editingId.value,
        username: form.value.username || form.value.email,
        displayName: form.value.displayName,
        workspaceName: form.value.displayName,
        email: form.value.email,
        avatar: form.value.avatar,
        picture: form.value.picture || form.value.avatar,
        planteles: serializePlanteles(form.value.planteles),
        plantel: form.value.planteles[0] || '',
        role: resolveClientRoleForAccess(null, form.value.accessMode),
        ingresosBlocked: form.value.ingresosBlocked,
        ingresos_blocked: form.value.ingresosBlocked ? 1 : 0
      })
    }
    show('Usuario guardado sin recargar el directorio.')
    closeModal()
    activeUserKey.value = email
  } catch (e) {
    restoreRows(rollbackRows)
    const message = extractMessage(e) || 'Error al guardar'
    show(message, 'danger')
  } finally {
    saving.value = false
  }
}

const formatLastLogin = (value) => {
  if (!value) return 'Nunca'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Nunca'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
const formatDateOnly = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
const relativeLastLogin = (value) => {
  if (!value) return 'Sin registro'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Sin registro'
  const diff = Date.now() - date.getTime()
  if (diff < 60 * 1000) return 'hace menos de un minuto'
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} hora${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `hace ${days} día${days === 1 ? '' : 's'}`
}

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
const exportUsers = () => {
  const headers = ['nombre', 'email', 'planteles', 'acceso', 'estado', 'ultimo_ingreso']
  const rows = filteredUsuarios.value.map(u => [displayNameFor(u), u.email, plantelesFor(u).join(' / '), accessLabel(u), statusLabel(u), formatLastLogin(u.last_login_at || u.lastLoginAt)])
  const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `usuarios-sistema-ingresos-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.usuarios-page {
  --ink: #102044;
  --muted: #64748b;
  --soft: #f8fafc;
  --line: #e3eaf3;
  --green: #16933a;
  --green-strong: #0f7a30;
  --green-soft: #edf9f0;
  --blue: #2563eb;
  --blue-soft: #eff6ff;
  --red: #dc2626;
  --red-soft: #fff1f2;
  --purple: #7c3aed;
  --purple-soft: #f5f0ff;
  --cyan: #0891b2;
  --cyan-soft: #ecfeff;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 352px;
  gap: 24px;
  width: 100%;
  max-width: none;
  height: 100%;
  min-height: 0;
  margin: 0;
  padding: 6px 0 32px;
  overflow: hidden;
  color: var(--ink);
}

.usuarios-main {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
  scrollbar-width: thin;
}

.usuarios-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 20px;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0;
  color: var(--green-strong);
  font-size: 11px;
  line-height: 1;
  font-weight: 900;
  letter-spacing: .16em;
  text-transform: uppercase;
}

.usuarios-hero h2 {
  margin: 8px 0 0;
  color: var(--ink);
  font-size: clamp(28px, 3vw, 38px);
  line-height: .98;
  font-weight: 950;
  letter-spacing: -.055em;
}

.usuarios-hero p:not(.eyebrow) {
  margin: 9px 0 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.35;
  font-weight: 700;
}

.hero-actions,
.bulk-actions,
.confirm-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.soft-button,
.primary-button,
.icon-button,
.bulk-button {
  appearance: none;
  border: 0;
  font-family: inherit;
  font-weight: 900;
  cursor: pointer;
  transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease, color .16s ease;
}

.action-button {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 14px;
  padding: 0 16px;
  font-size: 13px;
  white-space: nowrap;
}

.soft-button {
  color: #263653;
  background: #fff;
  border: 1px solid var(--line);
  box-shadow: 0 12px 30px rgba(15, 23, 42, .07);
}

.action-refresh {
  color: #166534;
  background: linear-gradient(180deg, #ffffff, #f1fbf4);
  border-color: #caead3;
}

.action-export {
  color: #1d4ed8;
  background: linear-gradient(180deg, #ffffff, #f4f8ff);
  border-color: #c7d9ff;
}

.primary-button {
  color: #fff;
  background: linear-gradient(135deg, #35b84b 0%, #168c35 100%);
  box-shadow: 0 18px 34px rgba(22, 140, 53, .28);
}

.primary-button.danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  box-shadow: 0 18px 34px rgba(220, 38, 38, .22);
}

.soft-button:hover:not(:disabled),
.primary-button:hover:not(:disabled),
.icon-button:hover:not(:disabled),
.bulk-button:hover:not(:disabled),
.directory-option:hover:not(:disabled),
.access-option:hover:not(:disabled),
.plantel-grid label:hover {
  transform: translateY(-1px);
}

button:disabled {
  opacity: .46;
  cursor: not-allowed;
  transform: none !important;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.metric-card {
  position: relative;
  min-height: 118px;
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  padding: 18px;
  overflow: hidden;
  border: 1px solid rgba(220, 230, 242, .98);
  border-radius: 18px;
  background:
    radial-gradient(circle at 18% 50%, color-mix(in srgb, var(--accent, #22c55e) 12%, transparent), transparent 54%),
    linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  box-shadow: 0 18px 40px rgba(16, 32, 68, .055);
}

.metric-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
  pointer-events: none;
}

.metric-card::after {
  content: '';
  position: absolute;
  right: -34px;
  bottom: -42px;
  width: 96px;
  height: 96px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent, #22c55e) 10%, transparent);
}

.metric-card.total-card { --accent: #16a34a; }
.metric-card.general-card { --accent: #22c55e; }
.metric-card.control-card { --accent: #2563eb; }
.metric-card.mixed-card { --accent: #7c3aed; }
.metric-card.blocked-card { --accent: #dc2626; }
.metric-card.protected-card { --accent: #7c3aed; }
.metric-card.activity-card { --accent: #0891b2; }

.metric-card > div {
  min-width: 0;
  position: relative;
  z-index: 1;
  grid-column: 2;
  grid-row: 1;
  align-self: center;
  display: flex;
  flex-direction: column;
}

.metric-icon {
  position: relative;
  z-index: 1;
  grid-column: 1;
  grid-row: 1;
  width: 50px;
  height: 50px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.72), 0 10px 24px rgba(15, 23, 42, .08);
}

.metric-icon.green { color: #15803d; background: #eafbea; }
.metric-icon.blue { color: var(--blue); background: var(--blue-soft); }
.metric-icon.red { color: var(--red); background: var(--red-soft); }
.metric-icon.purple { color: var(--purple); background: var(--purple-soft); }
.metric-icon.cyan { color: var(--cyan); background: var(--cyan-soft); }

.metric-card p {
  margin: 0;
  color: #52627a;
  font-size: 11px;
  line-height: 1.15;
  font-weight: 950;
  letter-spacing: .045em;
  text-transform: uppercase;
}

.metric-card strong {
  display: block;
  margin-top: 8px;
  color: var(--ink);
  font-size: 30px;
  line-height: .95;
  font-weight: 950;
  letter-spacing: -.055em;
}

.metric-card small {
  display: block;
  margin-top: auto;
  padding-top: 12px;
  color: #7b8798;
  font-size: 11px;
  line-height: 1.2;
  font-weight: 800;
}

.filters-card {
  display: grid;
  grid-template-columns: minmax(300px, 1.35fr) repeat(5, minmax(128px, .62fr));
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
  padding: 14px 16px;
  border: 1px solid rgba(220, 230, 242, .98);
  border-radius: 18px;
  background: rgba(255,255,255,.96);
  box-shadow: 0 18px 44px rgba(16, 32, 68, .05);
}

.search-control,
.directory-search {
  min-height: 46px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: 15px;
  background: #fff;
  padding: 0 13px;
  color: #758197;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.75);
}

.search-control:focus-within,
.directory-search:focus-within,
.select-control:focus-within {
  border-color: #a9ddb8;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, .10);
}

.search-control input,
.directory-search input,
.select-control select,
.page-size-control select {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #1d2b46;
  font-size: 12px;
  font-weight: 850;
}

.search-control button,
.directory-search button {
  border: 0;
  background: transparent;
  color: #78869b;
}

.select-control {
  min-height: 46px;
  display: grid;
  align-content: center;
  gap: 3px;
  border: 1px solid var(--line);
  border-radius: 15px;
  background: #fff;
  padding: 7px 12px;
}

.select-control span {
  color: #7a879b;
  font-size: 9px;
  line-height: 1;
  font-weight: 950;
  letter-spacing: .055em;
  text-transform: uppercase;
}

.bulk-card {
  position: sticky;
  top: 10px;
  z-index: 12;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
  padding: 12px 48px 12px 16px;
  border: 1px solid #cce9d4;
  border-radius: 18px;
  background: linear-gradient(135deg, #f2fcf5, #ffffff);
  box-shadow: 0 18px 42px rgba(22, 101, 52, .10);
}

.bulk-card strong {
  color: #116b2c;
  font-size: 13px;
  font-weight: 950;
}

.undo-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
  padding: 12px 14px 12px 16px;
  border: 1px solid #c7d9ff;
  border-radius: 18px;
  background: linear-gradient(135deg, #f4f8ff, #ffffff);
  box-shadow: 0 16px 36px rgba(29, 78, 216, .09);
}

.undo-card strong {
  display: block;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 950;
}

.undo-card span {
  display: block;
  margin-top: 3px;
  color: #64748b;
  font-size: 12px;
  font-weight: 750;
}

.undo-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bulk-summary {
  min-width: 150px;
  display: grid;
  gap: 4px;
}

.bulk-link {
  border: 0;
  padding: 0;
  background: transparent;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 900;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.bulk-plantel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bulk-plantel-actions select {
  min-height: 36px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  color: #263653;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 850;
}

.bulk-button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 12px;
  padding: 0 12px;
  font-size: 12px;
  border: 1px solid var(--line);
  box-shadow: 0 8px 18px rgba(15, 23, 42, .055);
}

.bulk-button.green { color: #166534; border-color: #b7e6c3; background: linear-gradient(180deg, #ffffff, #effcf3); }
.bulk-button.blue { color: #1d4ed8; border-color: #bfdbfe; background: linear-gradient(180deg, #ffffff, #eff6ff); }
.bulk-button.red { color: #b91c1c; border-color: #fecaca; background: linear-gradient(180deg, #ffffff, #fff1f2); }
.bulk-button.purple { color: #6d28d9; border-color: #ddd6fe; background: linear-gradient(180deg, #ffffff, #f5f0ff); }

.bulk-close {
  position: absolute;
  top: 15px;
  right: 14px;
  border: 0;
  background: transparent;
  color: #65728a;
}

.users-table-card {
  overflow: hidden;
  border: 1px solid rgba(220, 230, 242, .98);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 20px 54px rgba(16, 32, 68, .06);
}

.users-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.users-table th {
  height: 52px;
  color: #5e6b81;
  background: linear-gradient(180deg, #fbfcfe, #f6f9fc);
  border-bottom: 1px solid #e5edf5;
  padding: 0 16px;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .07em;
  text-align: left;
  text-transform: uppercase;
}

.users-table td {
  height: 72px;
  padding: 11px 16px;
  border-bottom: 1px solid #edf2f7;
  vertical-align: middle;
}

.user-row {
  cursor: pointer;
  transition: background .16s ease, box-shadow .16s ease, transform .16s ease;
}

.user-row:hover { background: #fbfdff; }
.user-row.active { background: #f2fbf5; box-shadow: inset 4px 0 0 #22c55e; }
.user-row.blocked { background: rgba(255, 241, 242, .55); }
.user-row.blocked.active { box-shadow: inset 4px 0 0 var(--red); }

.check-col { width: 46px; text-align: center !important; }
.actions-col { width: 150px; text-align: right !important; }
.planteles-col { min-width: 140px; }

.users-table input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: #22a947;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 13px;
  min-width: 0;
}

.user-avatar {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 999px;
  object-fit: cover;
  border: 2px solid #fff;
  box-shadow: 0 9px 22px rgba(15, 23, 42, .14);
  background: #eef2f7;
}

.user-cell strong {
  display: block;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.2;
  font-weight: 950;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-cell span,
.user-cell small {
  display: block;
  max-width: 340px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #65728a;
  font-size: 11px;
  font-weight: 800;
}

.access-badge,
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 0 11px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.65);
}

.access-badge.general { color: #166534; background: #effcf3; border-color: #b7e6c3; }
.access-badge.control { color: #1d4ed8; background: #eff6ff; border-color: #bfd7ff; }
.access-badge.mixed { color: #6d28d9; background: #f5f0ff; border-color: #ddd6fe; }
.access-badge.superadmin { color: #7c2d12; background: #fff7ed; border-color: #fed7aa; }
.status-badge.active { color: #166534; background: #effcf3; border-color: #b7e6c3; }
.status-badge.blocked { color: #b91c1c; background: #fff1f2; border-color: #fecdd3; }
.status-badge.protected { color: #6d28d9; background: #f5f0ff; border-color: #ddd6fe; }

.access-copy {
  margin-top: 4px;
  color: #65728a;
  font-size: 11px;
  line-height: 1.25;
  font-weight: 700;
}

.access-stack {
  display: grid;
  gap: 7px;
  align-items: center;
}

.access-switch,
.drawer-access-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.access-switch button,
.drawer-access-actions button {
  min-height: 26px;
  border: 1px solid #dbe4ef;
  border-radius: 999px;
  background: #fff;
  color: #59677c;
  padding: 0 8px;
  font-size: 10px;
  font-weight: 950;
}

.access-switch button.active,
.drawer-access-actions button.active {
  color: #166534;
  background: #effcf3;
  border-color: #b7e6c3;
}

.drawer-access-actions {
  margin-top: 12px;
}

.plantel-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.plantel-chip-row.compact {
  max-width: 190px;
}

.plantel-chip,
.muted-pill {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  border-radius: 999px;
  border: 1px solid #dbe4ef;
  background: #f8fafc;
  color: #475569;
  padding: 0 9px;
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
}

.muted-pill {
  color: #7a879a;
  background: #f8fafc;
}

.last-login-cell {
  color: #47546b;
  font-size: 12px;
  font-weight: 850;
}

.last-login-cell svg {
  display: inline-block;
  margin-right: 7px;
  vertical-align: -3px;
  color: #7b8798;
}

.last-login-cell small {
  display: block;
  margin-top: 3px;
  color: #7a879a;
  font-size: 11px;
  font-weight: 750;
}

.icon-button {
  width: 35px;
  height: 35px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 5px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  color: #334155;
  box-shadow: 0 9px 20px rgba(15, 23, 42, .07);
}

.icon-button.edit-action { color: #166534; background: linear-gradient(180deg, #ffffff, #f1fbf4); border-color: #c8ead2; }
.icon-button.lock-action { color: #b91c1c; background: linear-gradient(180deg, #ffffff, #fff5f5); border-color: #fecaca; }
.icon-button.lock-action.unblock { color: #166534; background: linear-gradient(180deg, #ffffff, #f1fbf4); border-color: #c8ead2; }
.icon-button.more-action { color: #475569; background: linear-gradient(180deg, #ffffff, #f8fafc); }
.icon-button:hover:not(:disabled) { box-shadow: 0 12px 26px rgba(15, 23, 42, .10); }

.table-empty { height: 238px !important; padding: 0 !important; }
.empty-state {
  min-height: 238px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #64748b;
  text-align: center;
  background: radial-gradient(circle at 50% 38%, rgba(34,197,94,.08), transparent 34%);
}
.empty-state.compact { min-height: 186px; }
.empty-state svg { color: #22a947; }
.empty-state strong { color: var(--ink); font-size: 15px; font-weight: 950; }
.empty-state span { color: #64748b; font-size: 12px; font-weight: 750; }

.table-footer {
  min-height: 62px;
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 14px;
  align-items: center;
  padding: 0 16px;
  color: #65728a;
  background: #fbfcfe;
  font-size: 12px;
  font-weight: 800;
}

.pagination { display: flex; align-items: center; gap: 6px; }
.pagination button,
.page-size-control {
  min-width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 11px;
  color: #47546b;
  background: transparent;
  font-size: 12px;
  font-weight: 900;
}
.pagination button:not(.active):hover:not(:disabled) { background: #f1f5f9; }
.pagination button.active { color: #fff; background: #22a947; box-shadow: 0 10px 22px rgba(34,169,71,.24); }
.page-size-control { min-width: 126px; padding: 0 10px; border-color: var(--line); background: #fff; }

.user-drawer {
  position: sticky;
  top: 0;
  align-self: start;
  min-height: calc(100vh - 96px);
  max-height: calc(100vh - 96px);
  overflow: auto;
  padding: 28px;
  border: 1px solid rgba(220, 230, 242, .98);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255,255,255,.99), rgba(249,251,254,.96));
  box-shadow: 0 20px 54px rgba(16, 32, 68, .06);
}

.drawer-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 34px;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: #14213d;
  background: #fff;
}

.drawer-profile { padding-top: 8px; text-align: left; }
.drawer-profile img {
  width: 76px;
  height: 76px;
  display: block;
  border-radius: 999px;
  object-fit: cover;
  border: 3px solid #fff;
  box-shadow: 0 16px 32px rgba(15,23,42,.14);
  margin-bottom: 13px;
}
.drawer-profile h3 { margin: 14px 0 0; color: var(--ink); font-size: 21px; line-height: 1.14; font-weight: 950; letter-spacing: -.04em; }
.drawer-profile p { margin: 6px 0 0; color: var(--muted); font-size: 13px; font-weight: 800; word-break: break-word; }

.drawer-section { border-top: 1px solid #e5edf5; margin-top: 22px; padding-top: 18px; }
.drawer-section h4 { margin: 0 0 12px; color: #263653; font-size: 12px; font-weight: 950; letter-spacing: .045em; text-transform: uppercase; }
.drawer-section p { margin-top: 9px; color: #65728a; font-size: 12px; line-height: 1.45; font-weight: 750; }

.drawer-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 38px;
  margin-top: 10px;
  color: #166534;
  background: #effcf3;
  border: 1px solid #b7e6c3;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 950;
}
.drawer-link.danger { color: #b91c1c; background: #fff1f2; border-color: #fecdd3; }

.drawer-row { display: flex; align-items: flex-start; gap: 10px; color: #65728a; }
.drawer-row strong,
.drawer-row span { display: block; color: #263653; font-size: 12px; font-weight: 850; }
.drawer-row span { color: #65728a; margin-top: 2px; }
.drawer-list { display: grid; gap: 12px; }
.drawer-list div { display: grid; grid-template-columns: 116px minmax(0, 1fr); gap: 10px; }
.drawer-list dt { color: #65728a; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .04em; }
.drawer-list dd { min-width: 0; color: #263653; font-size: 12px; font-weight: 850; word-break: break-word; }

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, .42);
  backdrop-filter: blur(8px);
}

.user-modal,
.confirm-modal {
  background: #fff;
  border: 1px solid rgba(226, 232, 240, .9);
  box-shadow: 0 30px 90px rgba(15, 23, 42, .24);
}

.user-modal {
  width: min(980px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  overflow: auto;
  border-radius: 26px;
}

.modal-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 22px 16px;
  border-bottom: 1px solid #e5edf5;
  background: linear-gradient(180deg, #fff, #fbfcfe);
}
.modal-top h3 { margin: 7px 0 0; color: var(--ink); font-size: 22px; font-weight: 950; letter-spacing: -.035em; }
.modal-top span { display: block; margin-top: 5px; color: var(--muted); font-size: 13px; font-weight: 750; }

.modal-grid { display: grid; grid-template-columns: 1.04fr .96fr; gap: 16px; padding: 18px 22px; }
.modal-panel { border: 1px solid var(--line); border-radius: 20px; padding: 16px; background: linear-gradient(180deg, #fff, #f8fafc); }
.field-label { display: block; margin: 14px 0 9px; color: #263653; font-size: 12px; font-weight: 950; }
.field-label:first-child { margin-top: 0; }

.directory-list { min-height: 300px; max-height: 355px; overflow: auto; display: grid; align-content: start; gap: 9px; margin-top: 12px; }
.directory-option { display: flex; align-items: center; gap: 12px; min-height: 62px; padding: 10px; border: 1px solid var(--line); border-radius: 16px; background: #fff; text-align: left; }
.directory-option.selected { border-color: #9ddbac; box-shadow: 0 12px 28px rgba(15,23,42,.08); }
.directory-option.disabled { opacity: .55; cursor: not-allowed; }
.directory-option img { width: 42px; height: 42px; border-radius: 999px; object-fit: cover; }
.directory-option span { min-width: 0; flex: 1; }
.directory-option strong,
.directory-option small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.directory-option strong { color: var(--ink); font-size: 13px; font-weight: 950; }
.directory-option small { color: var(--muted); font-size: 11px; font-weight: 800; }
.directory-option em { color: #64748b; background: #f1f5f9; border-radius: 999px; padding: 5px 8px; font-size: 10px; font-style: normal; font-weight: 950; }

.directory-empty,
.directory-error { min-height: 180px; display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px dashed #cbd5e1; border-radius: 16px; color: var(--muted); font-size: 13px; font-weight: 850; text-align: center; padding: 20px; }
.directory-error { color: #be123c; background: #fff1f2; border-color: #fecdd3; }

.selected-user-card { display: flex; align-items: center; gap: 14px; border: 1px solid var(--line); border-radius: 18px; background: #fff; padding: 14px; box-shadow: 0 10px 24px rgba(15,23,42,.055); }
.selected-user-card img { width: 56px; height: 56px; border-radius: 999px; object-fit: cover; }
.selected-user-card small,
.selected-user-card strong,
.selected-user-card span { display: block; }
.selected-user-card small { color: #8a95a7; font-size: 10px; font-weight: 950; text-transform: uppercase; letter-spacing: .05em; }
.selected-user-card strong { color: var(--ink); font-size: 14px; font-weight: 950; }
.selected-user-card span { color: var(--muted); font-size: 12px; font-weight: 750; }

.access-options { display: grid; gap: 10px; }
.access-option { min-height: 58px; display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 10px; align-items: center; border: 1px solid var(--line); border-radius: 16px; background: #fff; color: #263653; padding: 10px 12px; text-align: left; }
.access-option svg { grid-row: span 2; }
.access-option span { font-size: 13px; font-weight: 950; }
.access-option small { color: var(--muted); font-size: 11px; font-weight: 750; }
.access-option.active.admin { color: #166534; background: #effcf3; border-color: #b7e6c3; }
.access-option.active.control { color: #1d4ed8; background: #eff6ff; border-color: #bfdbfe; }
.access-option.active.admin_control { color: #6d28d9; background: #f5f0ff; border-color: #ddd6fe; }

.block-toggle { min-height: 44px; display: flex; align-items: center; gap: 9px; border: 1px solid var(--line); border-radius: 14px; background: #fff; color: #166534; padding: 0 12px; font-size: 12px; font-weight: 950; }
.block-toggle.active { color: #b91c1c; background: #fff1f2; border-color: #fecdd3; }
.block-toggle input { accent-color: #dc2626; }

.plantel-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.plantel-grid label { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; border: 1px solid var(--line); border-radius: 11px; background: #fff; color: #47546b; font-size: 11px; font-weight: 900; }
.plantel-grid label.active { color: #166534; background: #effcf3; border-color: #b7e6c3; }
.plantel-grid input { accent-color: #22a947; }

.modal-footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 16px 22px 22px; border-top: 1px solid #e5edf5; }
.modal-footer span { min-width: 0; color: var(--muted); font-size: 12px; font-weight: 850; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.modal-footer div { display: flex; gap: 10px; }

.confirm-modal { position: relative; width: min(430px, calc(100vw - 40px)); border-radius: 24px; padding: 28px 24px 20px; text-align: center; }
.confirm-close { position: absolute; top: 16px; right: 16px; border: 0; color: #14213d; background: transparent; }
.confirm-icon { width: 68px; height: 68px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; }
.confirm-icon.safe { color: #166534; background: #effcf3; }
.confirm-icon.danger { color: #b91c1c; background: #fff1f2; }
.confirm-modal h3 { margin: 16px 0 0; color: var(--ink); font-size: 19px; font-weight: 950; letter-spacing: -.025em; }
.confirm-modal p { margin: 12px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; font-weight: 750; }

.confirm-preview {
  margin-top: 14px;
  border: 1px solid #e5edf5;
  border-radius: 16px;
  background: #f8fafc;
  padding: 12px;
  text-align: left;
}

.confirm-preview strong {
  display: block;
  color: #102044;
  font-size: 12px;
  font-weight: 950;
}

.confirm-preview span {
  display: block;
  margin-top: 4px;
  color: #b45309;
  font-size: 12px;
  font-weight: 850;
}

.confirm-preview ul {
  margin: 9px 0 0;
  padding-left: 18px;
  color: #52627a;
  font-size: 12px;
  line-height: 1.45;
  font-weight: 750;
}
.confirm-actions { justify-content: center; margin-top: 20px; }

.animate-spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }


.empty-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.error-state {
  background:
    radial-gradient(circle at 50% 35%, rgba(220, 38, 38, .08), transparent 34%),
    linear-gradient(180deg, #fff, #fffafa);
}

.error-state svg { color: #dc2626; }

.debug-modal {
  width: min(920px, calc(100vw - 42px));
  max-height: calc(100vh - 42px);
  display: grid;
  grid-template-rows: auto auto minmax(260px, 1fr) auto;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, .95);
  border-radius: 26px;
  background: #fff;
  box-shadow: 0 30px 90px rgba(15, 23, 42, .28);
}

.debug-modal header,
.debug-modal footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 22px;
  border-bottom: 1px solid #e5edf5;
  background: linear-gradient(180deg, #fff, #fbfcfe);
}

.debug-modal footer {
  border-top: 1px solid #e5edf5;
  border-bottom: 0;
  justify-content: flex-end;
}

.debug-modal h3 {
  margin: 7px 0 0;
  color: var(--ink);
  font-size: 22px;
  font-weight: 950;
  letter-spacing: -.035em;
}

.debug-modal header span {
  display: block;
  margin-top: 5px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 750;
}

.debug-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 16px 22px;
  border-bottom: 1px solid #e5edf5;
  background: #fbfdff;
}

.debug-summary div {
  border: 1px solid #e5edf5;
  border-radius: 16px;
  background: #fff;
  padding: 12px 14px;
}

.debug-summary small,
.debug-summary strong {
  display: block;
}

.debug-summary small {
  color: #7a879b;
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.debug-summary strong {
  margin-top: 6px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 950;
  word-break: break-word;
}

.debug-pre {
  margin: 0;
  overflow: auto;
  padding: 18px 22px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.55;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  white-space: pre-wrap;
}

@media (max-width: 1320px) {
  .usuarios-page { grid-template-columns: minmax(0, 1fr); }
  .user-drawer { position: static; min-height: 0; }
  .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 1080px) {
  .filters-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .search-control { grid-column: 1 / -1; }
}

@media (max-width: 760px) {
  .usuarios-page { padding-inline: 0; }
  .usuarios-hero,
  .bulk-card,
  .table-footer { display: flex; flex-direction: column; align-items: stretch; }
  .hero-actions { justify-content: stretch; }
  .action-button { width: 100%; }
  .filters-card,
  .modal-grid,
  .metric-grid { grid-template-columns: 1fr; }
  .users-table-card { overflow-x: auto; }
  .users-table { min-width: 1080px; }
  .modal-footer { align-items: stretch; flex-direction: column; }
  .modal-footer div { flex-direction: column; }
  .plantel-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* Usuarios polish pass: stateful drawer, compact KPI filters, fixed bulk workflow, mobile cards. */
.usuarios-page {
  grid-template-columns: minmax(0, 1fr);
  transition: grid-template-columns .22s ease;
}

@media (min-width: 1321px) {
  .usuarios-page.has-drawer {
    grid-template-columns: minmax(0, 1fr) 352px;
  }
}

.usuarios-page.has-selection .usuarios-main {
  padding-bottom: 132px;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: opacity .2s ease, transform .2s ease;
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  opacity: 0;
  transform: translateX(24px);
}

.metric-grid {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  padding: 8px;
  border: 1px solid rgba(222, 230, 241, .92);
  border-radius: 22px;
  background: rgba(255, 255, 255, .78);
  box-shadow: 0 16px 42px rgba(16, 32, 68, .06);
  backdrop-filter: blur(14px);
}

.metric-card.metric-chip {
  --accent: #64748b;
  appearance: none;
  min-height: 0;
  width: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px 9px 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  box-shadow: none;
  color: #334155;
  text-align: left;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease, color .16s ease;
}
.metric-card.metric-chip:hover {
  transform: translateY(-1px);
  background: #f8fafc;
  border-color: #e2e8f0;
}
.metric-card.metric-chip::before,
.metric-card.metric-chip::after { display: none; }
.metric-card.metric-chip span {
  color: inherit;
  font-size: 12px;
  line-height: 1;
  font-weight: 850;
  letter-spacing: -.01em;
  white-space: nowrap;
}
.metric-card.metric-chip strong {
  margin: 0;
  min-width: 26px;
  padding: 4px 7px;
  border-radius: 999px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, #ffffff);
  font-size: 12px;
  line-height: 1;
  font-weight: 950;
  letter-spacing: -.02em;
  text-align: center;
}
.metric-card.metric-chip small {
  display: none;
}
.metric-card.metric-chip.active {
  color: color-mix(in srgb, var(--accent) 72%, #0f172a);
  border-color: color-mix(in srgb, var(--accent) 26%, #e2e8f0);
  background: color-mix(in srgb, var(--accent) 8%, #ffffff);
  box-shadow: 0 10px 26px color-mix(in srgb, var(--accent) 12%, transparent), inset 0 0 0 1px rgba(255,255,255,.72);
}
.metric-card.metric-chip.active strong {
  color: #ffffff;
  background: var(--accent);
}
.metric-card.metric-chip.neutral { --accent: #64748b; }
.metric-card.metric-chip.green { --accent: #16a34a; }
.metric-card.metric-chip.blue { --accent: #2563eb; }
.metric-card.metric-chip.purple { --accent: #7c3aed; }
.metric-card.metric-chip.red { --accent: #dc2626; }
.metric-card.metric-chip.amber { --accent: #d97706; }
.metric-card.metric-chip.cyan { --accent: #0891b2; }

.bulk-card {
  position: fixed;
  left: 24px;
  right: 24px;
  bottom: 18px;
  top: auto;
  z-index: 9990;
  max-width: 1320px;
  margin: 0 auto;
  border-color: rgba(187, 230, 199, .95);
  box-shadow: 0 22px 70px rgba(16, 32, 68, .20);
}
.bulk-button.inverse {
  color: #854d0e;
  border-color: #fde68a;
  background: linear-gradient(180deg, #ffffff, #fffbeb);
}

.users-mobile-list { display: none; }
.mobile-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 128px;
  color: #64748b;
  font-size: 13px;
  font-weight: 850;
}
.mobile-empty.danger { color: #b91c1c; }
.mobile-user-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid #edf2f7;
  background: #fff;
  cursor: pointer;
}
.mobile-user-card.active { background: #f2fbf5; box-shadow: inset 4px 0 0 #22c55e; }
.mobile-user-card.blocked { background: rgba(255, 241, 242, .55); }
.mobile-user-top {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}
.mobile-user-identity { min-width: 0; }
.mobile-user-identity strong,
.mobile-user-identity span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mobile-user-identity strong { color: var(--ink); font-size: 13px; font-weight: 950; }
.mobile-user-identity span { color: #65728a; font-size: 11px; font-weight: 800; }
.mobile-user-meta { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.mobile-access-switch button { min-height: 32px; padding-inline: 12px; }

.inverse-modal {
  width: min(760px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  overflow: auto;
  position: relative;
  border: 1px solid rgba(226, 232, 240, .95);
  border-radius: 26px;
  background: #fff;
  padding: 24px;
  box-shadow: 0 30px 90px rgba(15, 23, 42, .26);
}
.inverse-header h3 { margin: 7px 0 0; color: var(--ink); font-size: 22px; font-weight: 950; letter-spacing: -.035em; }
.inverse-header span { display: block; margin-top: 5px; color: var(--muted); font-size: 13px; font-weight: 750; }
.inverse-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}
.inverse-panel,
.inverse-scope-card,
.inverse-summary,
.inverse-ack {
  border: 1px solid #e5edf5;
  border-radius: 18px;
  background: #fbfdff;
  padding: 14px;
}
.inverse-panel small,
.inverse-panel strong { display: block; }
.inverse-panel small { color: #7a879b; font-size: 10px; font-weight: 950; text-transform: uppercase; letter-spacing: .06em; }
.inverse-panel strong { margin-top: 5px; color: var(--ink); font-size: 28px; line-height: 1; font-weight: 950; letter-spacing: -.05em; }
.inverse-access-options { display: flex; flex-wrap: wrap; gap: 8px; }
.inverse-access-options button {
  min-height: 34px;
  border: 1px solid #dbe4ef;
  border-radius: 999px;
  background: #fff;
  color: #59677c;
  padding: 0 12px;
  font-size: 11px;
  font-weight: 950;
}
.inverse-access-options button.active.admin { color: #166534; background: #effcf3; border-color: #b7e6c3; }
.inverse-access-options button.active.control { color: #1d4ed8; background: #eff6ff; border-color: #bfdbfe; }
.inverse-access-options button.active.admin_control { color: #6d28d9; background: #f5f0ff; border-color: #ddd6fe; }
.inverse-scope-card { display: grid; gap: 9px; margin-top: 12px; }
.inverse-scope-card h4 { margin: 0 0 2px; color: #263653; font-size: 12px; font-weight: 950; text-transform: uppercase; letter-spacing: .045em; }
.inverse-scope-card label {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid #e5edf5;
  border-radius: 14px;
  background: #fff;
  color: #263653;
  font-size: 12px;
  font-weight: 850;
}
.inverse-scope-card label.active { border-color: #a9ddb8; background: #f2fcf5; }
.inverse-scope-card label.disabled { opacity: .48; }
.inverse-scope-card strong { color: #64748b; font-size: 11px; font-weight: 950; }
.inverse-scope-card.global-only {
  border-color: #fde68a;
  background: linear-gradient(180deg, #fffbeb 0%, #ffffff 100%);
}
.inverse-global-note {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 5px 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid #fde68a;
  border-radius: 16px;
  background: rgba(255,255,255,.78);
}
.inverse-global-note span {
  color: #263653;
  font-size: 13px;
  font-weight: 950;
}
.inverse-global-note strong {
  color: #92400e;
  font-size: 13px;
  font-weight: 950;
}
.inverse-global-note small {
  grid-column: 1 / -1;
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
  font-weight: 800;
}
.inverse-summary { display: grid; gap: 5px; margin-top: 12px; color: #475569; font-size: 12px; font-weight: 850; }
.inverse-summary strong { color: var(--ink); font-size: 13px; font-weight: 950; }
.inverse-ack { display: flex; align-items: center; gap: 9px; margin-top: 12px; color: #475569; font-size: 12px; font-weight: 900; }
.inverse-ack.required { border-color: #fde68a; background: #fffbeb; }
.inverse-ack input { accent-color: #22a947; }

@media (max-width: 760px) {
  .usuarios-page.has-selection .usuarios-main { padding-bottom: 112px; }
  .metric-grid { flex-wrap: nowrap; overflow-x: auto; padding: 8px; border-radius: 18px; scrollbar-width: none; }
  .metric-grid::-webkit-scrollbar { display: none; }
  .metric-card.metric-chip { flex: 0 0 auto; padding: 9px 11px; }
  .metric-card.metric-chip strong { font-size: 12px; }
  .bulk-card {
    left: 10px;
    right: 10px;
    bottom: 10px;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    padding: 12px 42px 12px 12px;
    border-radius: 18px;
  }
  .bulk-actions,
  .bulk-plantel-actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 2px;
  }
  .bulk-button { white-space: nowrap; }
  .users-table { display: none; }
  .users-mobile-list { display: block; }
  .users-table-card { overflow: hidden; }
  .table-footer { gap: 10px; }
  .pagination { flex-wrap: wrap; }
  .user-drawer {
    position: fixed;
    z-index: 9995;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    min-height: 0;
    max-height: min(82vh, 680px);
    border-radius: 24px 24px 0 0;
    padding: 24px 20px 28px;
    box-shadow: 0 -24px 70px rgba(15, 23, 42, .28);
  }
  .drawer-slide-enter-from,
  .drawer-slide-leave-to {
    transform: translateY(24px);
  }
  .inverse-modal { width: calc(100vw - 22px); padding: 20px; border-radius: 22px; }
  .inverse-grid { grid-template-columns: 1fr; }
  .inverse-scope-card label { grid-template-columns: auto minmax(0, 1fr); }
  .inverse-scope-card strong { grid-column: 2; }
}

</style>
