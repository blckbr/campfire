# Legacy regression archive

These tests preserve historical Campfire contracts that are no longer authoritative for the 1.1.0 release baseline.

- `visual-history/` contains R2–R6 visual/theme/frame/mockup contracts superseded by the user-approved R6.6.6.15 Simple Dark screenshots. They must not be used to reactivate the abandoned selectable theme/frame systems.
- `build-history/` contains historical updater/configurator/1.0.0 batch-pipeline fixtures that are not part of the canonical 1.1.0 source tree.

The active regression command intentionally runs only `tests/*.test.mjs`, leaving this directory as archaeology rather than release gating.
