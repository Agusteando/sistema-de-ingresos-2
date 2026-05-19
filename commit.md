Repair student detail actions and account workspace expansion

- Restore the Más overflow action to the shared context-menu behavior so it opens reliably, stays usable, and closes through the existing global menu handling.
- Remove the custom anchored Más menu state and styles that introduced the broken interaction.
- Rework the expanded Estado de Cuenta state so it uses the larger sidebar-style workspace to show additional account information instead of simply enlarging the compact card.
- Add expanded account context: selection total, pending/late/recargo/depurado counts, largest balance, next-action guidance, and recent payment rows.
- Keep the normal compact right-side detail state intact and keep the expansion toggle/retract behavior scoped to the student detail/account area.
