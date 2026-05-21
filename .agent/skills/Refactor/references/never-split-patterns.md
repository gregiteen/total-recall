# Files That Should NEVER Be Split

## Express / Route Handler Files

**Pattern:** `server/routes/**/*.ts`  long lists of `router.get/post/put/delete()` calls

**Why NOT to split:** These files are long because they have many endpoints, not because they have complex logic. The logic lives in services. Splitting route files into sub-files means navigating across multiple files to understand the API surface  pure overhead with no benefit.

**What TO do instead:** If logic is in the route handler, move it to a service. The route file stays as-is.

```ts
//  WRONG: Split into asterisk-provision.ts, asterisk-sip.ts, asterisk-ivr.ts
//  CORRECT: Keep one route file, move business logic to AsteriskService.ts
```

## Test Files

**Pattern:** `**/*.test.ts`, `**/*.spec.ts`

**Why NOT to split:** Test coverage must be readable as a whole. Splitting tests makes it impossible to understand what's tested and what's not at a glance. Test file length is not a problem.

## Database Migrations

**Pattern:** `supabase/migrations/*.sql`

**Why NOT to split:** Migrations must be atomic and run in order. Never touch them.

## Type-Only Files

**Pattern:** Files that are only `interface`, `type`, `enum`  no logic

**Why NOT to split:** No execution logic. There's nothing to decouple. Splitting just adds import hops.

## Catalog / Lookup / Config Files

**Pattern:** Large arrays or objects of static data (skill catalogs, workflow libraries, route maps)

**Why NOT to split:** It's data, not code. Splitting a 1200-line catalog into 3  400-line catalogs doesn't reduce complexity  it just makes the data harder to browse.

```ts
//  WRONG: Split workflow library catalog into domain-catalogs/
//  CORRECT: Leave it as a single data file
```

## Already-Modular Files

**Signal:** File header contains `* Refactored to use:` or imports from a sibling directory (e.g., `./SSEParser.js`, `./ToolFollowUp.js`)

**Why NOT to split:** The heavy lifting was already done. Read the file first  the 1000-line count may be misleading if 600 of those lines are re-exports and thin orchestration.
