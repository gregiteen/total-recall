### Test Rules

1. Every `*.mjs` file in `src/cli/` and `src/core/` must have a corresponding `*.spec.mjs`
2. Every `*.tsx` page and component must have a corresponding `*.spec.tsx`
3. No `alert()` calls in page components — use state-based error display
4. Always clean up side-effects, mock entries, and test artifacts after test runs
5. Tests must provide all required SSSS v2 properties when validating memory node schemas
