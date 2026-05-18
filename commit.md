Normalize alta academics around active plantel and inferred nivel

- Removed editable Plantel and Nivel inputs from the alta academic form.
- New students now use the active session plantel automatically; the server ignores client plantel selection for scoped users.
- Added shared nivel resolution helpers so nivel is inferred from plantel by default: PM/PT => Primaria, SM/ST => Secundaria, everything else => Preescolar.
- Kept stored nivel as an optional manual override for existing students, exposed only in edit/properties context.
- Updated grade normalization/options/projection to use the resolved nivel so primaria planteles expose Primero through Sexto while preescolar/secundaria expose Primero through Tercero.
- Updated Estado de Cuenta/detail display, payments, invoices, deudores, reports, KPIs, student APIs, sync mapping, and account-scope checks to use the same resolved nivel behavior.
- Kept Grupo as the visible academic field beside Grado because the current table/filter/detail workflow still depends on grupo.
- Preserved ciclo de ingreso behavior and the ciclo-scoped Interno/Externo resolver.

Validation:
- npm ci --ignore-scripts
- npx nuxi prepare
- npm run build completed the client production build; the server transform step exceeded the execution timeout in this environment without surfacing a code error.
