fix(students): align expanded account workspace to source column

Resolve the resolution-dependent gap that appeared when expanding the Estado de Cuenta panel from the students workspace.

The expanded panel now measures the source detail column and applies fixed-position bounds from that live geometry instead of relying on hardcoded viewport width clamps. This keeps the expanded Estado de Cuenta flush with the workspace at different browser zoom levels, sidebar scales, viewport widths, and device sizes.

Also updates the expanded panel height to use dynamic viewport units with a viewport fallback, preserving the existing mobile full-screen behavior.
