---
name: fix-code-patterns
description: Mechanical fix recipes for the most common lint and TS errors in this codebase
type: reference
---

# Fix Patterns Reference

These are the recurring patterns in this codebase. Match the error  apply the recipe. No analysis needed.

---

## LINT: `@typescript-eslint/no-explicit-any`

### Pattern 1  catch clause `error: any`
```ts
//  Before
} catch (error: any) {
  res.status(500).json({ error: error.message || "Failed" });
}

//  After
} catch (error) {
  res.status(500).json({ error: error instanceof Error ? error.message : "Failed" });
}
```

### Pattern 2  AI response content block (OpenAI/OpenRouter)
```ts
//  Before
(contentResponse as any[]).filter((b: any) => b.type === "text").map((b: any) => b.text)

//  After
(contentResponse as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text ?? "")
```

### Pattern 3  array filter/findIndex with typed object
```ts
//  Before
scripts.findIndex((s: any) => s.name === name)
arr.filter((x: any) => x.id === id)

//  After  
scripts.findIndex((s: { name: string }) => s.name === name)
arr.filter((x: { id: string }) => x.id === id)
```

### Pattern 4  interface field typed as `any`
```ts
//  Before
spec: any;
data: any;
result: any;

//  After (prefer most specific, fall back in order)
spec: Record<string, unknown>;
data: unknown;
result: unknown;
```

### Pattern 5  function parameter typed as `any`
```ts
//  Before
function process(data: any) { ... }
const handler = (event: any) => { ... }

//  After
function process(data: unknown) { ... }   // if you don't know the shape
function process(data: Record<string, unknown>) { ... }  // if it's an object
```

### Pattern 6  variable assigned `as any` or cast via `any`
```ts
//  Before
const parsed = JSON.parse(text) as any;
let config: any = {};

//  After
const parsed = JSON.parse(text) as Record<string, unknown>;
let config: Record<string, unknown> = {};
```

---

## LINT: `@typescript-eslint/no-unused-vars`

### Pattern 1  unused import
```ts
//  Before
import { Foo, Bar, Baz } from "./module";  // Bar is unused

//  After  just remove Bar from the import
import { Foo, Baz } from "./module";
```

### Pattern 2  unused function parameter (must keep for signature compat)
```ts
//  Before
function handler(req: Request, res: Response, next: NextFunction) { ... }
//                                             ^^^^ unused

//  After  prefix with underscore
function handler(req: Request, res: Response, _next: NextFunction) { ... }
```

### Pattern 3  unused catch binding
```ts
//  Before
} catch (err) {
  toast.error("Failed");
}

//  After
} catch (_err) {
  toast.error("Failed");
}
// OR (ES2019+)
} catch {
  toast.error("Failed");
}
```

### Pattern 4  unused variable (assigned but never read)
```ts
//  Before
const { data: uploadData, error } = await supabase.storage.upload(...)
// uploadData never used

//  After  destructure without it, or prefix
const { error } = await supabase.storage.upload(...)
// OR
const { data: _uploadData, error } = await supabase.storage.upload(...)
```

### Pattern 5  unused type import
```ts
//  Before
import type { Foo, Bar } from "./types";  // Bar unused

//  After
import type { Foo } from "./types";
```

---

## TYPESCRIPT: Common TS Errors

### Pattern 1  Property does not exist on type
```ts
//  Before
const msg = error.message;  // error is 'unknown'

//  After
const msg = error instanceof Error ? error.message : String(error);
```

### Pattern 2  Argument of type X is not assignable to Y
```ts
//  Before
someFunction(value);  // value: string | undefined, param expects string

//  After
if (value) someFunction(value);
// OR
someFunction(value ?? "");
// OR
someFunction(value!);  // only if you're certain it's defined
```

### Pattern 3  Object is possibly null/undefined
```ts
//  Before
const name = user.profile.name;

//  After
const name = user.profile?.name ?? "";
```

### Pattern 4  Missing return type causes implicit any
```ts
//  Before
async function getData() {
  const { data } = await supabase.from("table").select("*");
  return data;
}

//  After  let inference work, just narrow the return
async function getData(): Promise<TableRow[] | null> { ... }
```

---

## Subagent Instructions

When dispatched as a lint/TS subagent, follow this loop:
1. Run the canonical checker entrypoint:
   `node .agent/skills/code-quality/scripts/start-here-lint.mjs`
   or
   `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
2. Match each error to a pattern above  **do not analyze, just apply the recipe**
3. Fix ALL errors in that file before moving to the next
4. Use the report views, not waiting:
   `type`, `file <pattern>`, `count`, and `errors-by-type-*`
5. Move immediately to the next file in the list  do NOT idle-wait for a fresh daemon pass
6. After fixing a few files, re-open `type` or `count` for the next bucket
7. Stop when total issues stop decreasing across consecutive reads
