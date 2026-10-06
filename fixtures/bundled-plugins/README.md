# Bundled-plugin fixtures

Plugins moved out of the package into standalone `tr-plugin-*` repositories in
3.36.0, so a clean checkout or installed package has no bundled plugins. The
suite points `_TR_TEST_BUNDLED_PLUGINS_DIR` (see `vitest.config.ts`) at this
directory so plugin specs never depend on what a developer has installed in
their own `.agent` brain.
