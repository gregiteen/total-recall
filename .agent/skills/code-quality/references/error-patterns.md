# Common Error Patterns

## TypeScript
- `TS2322`: Type mismatch. Usually caused by `null` vs `undefined` in Supabase schemas.
- `TS2532`: Object is possibly 'undefined'. Add optional chaining `?.`.
- `TS2769`: No overload matches this call. Check Zustand store definitions.

## ESLint
- `react-hooks/exhaustive-deps`: Add all missing dependencies to the array.
- `no-unused-vars`: Remove the variable or prefix with `_`.
- `@typescript-eslint/no-explicit-any`: Replace `any` with `unknown` or a proper type.
