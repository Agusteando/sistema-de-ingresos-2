fix(students): normalize group marker rendering

- Rework UiGroupIcon to render every group marker through a stable centered box.
- Render single-letter groups with a deterministic CSS sigil instead of relying on uneven image whitespace.
- Normalize masked icon art size and offset through shared metadata for non-letter group icons.
- Preserve the same group marker primitive for row watermarks, row sigils, profile cards, and account cards.
- Keep original PNG assets unchanged.
