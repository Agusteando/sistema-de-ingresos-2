fix(students): normalize group mask sizing

Normalize student group icon masks so their visible bounding boxes are centered and use a consistent maximum footprint across the list sigils, row watermarks, profile card watermark, and account card watermark.

The row watermark now renders inside a square mask box instead of relying on asymmetric inset height plus variable width. Selected rows keep the same mask size and placement as regular rows, changing only emphasis/opacity, which prevents the selected student's group mark from appearing larger than the rest.

The reusable UiGroupIcon primitive now uses a stable square render box with line-height reset and a configurable mask-size token, keeping sigils visually aligned wherever the component is reused.
