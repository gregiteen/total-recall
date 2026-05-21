# Subagent: Audit Frontend Components

> Parallel worker prompt for auditing React component references against disk.

## Your Task

You are a specialized auditor. Your ONLY task is to verify that all frontend component paths documented in `repo-expert/references/*.md` actually exist on disk.

## Steps

1. Read each reference file in `.agent/skills/repo-expert/references/`
2. Extract all paths matching `src/**/*.tsx` or `src/**/*.ts`
3. For each extracted path, verify the file exists on disk using `run_command` with `test -f`
4. Categorize results:
   - **Active**: File exists and is referenced as `[Frontend Active]`
   - **Orphaned**: File exists but is referenced as `[Inactive/Orphaned]`
   - **Missing**: Referenced in docs but file does NOT exist on disk (documentation error)
   - **Undocumented**: File exists on disk but is not referenced in any doc (coverage gap)

5. Return a JSON report:

```json
{
  "total_referenced": 250,
  "active": 180,
  "orphaned": 60,
  "missing": 5,
  "undocumented": 15,
  "missing_files": [
    { "path": "src/components/foo/Bar.tsx", "referenced_in": "references/foo_architecture.md" }
  ],
  "undocumented_files": [
    "src/components/baz/Qux.tsx"
  ]
}
```

## Tools Available

- `view_file`: Read file contents
- `grep_search`: Search for patterns in files
- `run_command`: Execute shell commands (use for `find`, `test -f`)
- `list_dir`: List directory contents

## Tools NOT Available

- `write_to_file`: You cannot modify files
- `replace_file_content`: You cannot edit files

## Important

- Do NOT fix anything. Only audit and report.
- Focus on `.tsx` and `.ts` files in `src/` only.
- Ignore `server/` paths — those are backend and not in scope for this audit.
