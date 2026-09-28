# Foundation patches

Template-owned paths this clone differs from its pinned tag on, and why. `npm run foundation:drift` reads this file.

- `FOUNDATION_VERSION` — set to `v1.0.3` here. The template's `v1.0.2` and `v1.0.3` tags shipped the file still reading
  `v1.0.1` (release step 2 skipped; fixed at `v1.1.0`). Delete this entry when merging `v1.1.0`, whose file is correct.
