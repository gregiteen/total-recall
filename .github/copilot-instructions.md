Read and follow .agent/skills/total-recall/SKILL.md on every turn.

<!-- BEGIN INJECTED ACTIVE DIRECTIVES: do not edit by hand; rebuilt by total-recall surface -->
## Total Recall — Sovereign Memory System (Installed)

You have Total Recall installed. Use these CLI commands to remember and recall information.

### npx total-recall remember <category> "<content>" [options]
Save rules, preferences, corrections, and facts to permanent memory.

**Categories:** invariant, preference, correction, fact, concept, pattern, anti-pattern, decision, lore

**Options:**
  --tags, -t <list>          Comma-separated tags (e.g. "config,server")
  --importance, -i <1-5>     Importance level (default: 3)
  --priority, -p <level>     absolute | high | normal | low (default: normal)
  --modality, -m <type>      must | must_not | should | should_not | descriptive | preference
  --confidence, -c <0-1>     Confidence level (default: 1.0)
  --slug <custom-slug>       Custom kebab-case slug
  --title <custom-title>     Custom human-readable title
  --status <state>           active | draft | archived (default: active)
  --related <list>           Comma-separated related slugs

**Examples:**
  npx total-recall remember invariant "Never run tsc directly." --importance 5 --priority absolute
  npx total-recall remember preference "Always use single quotes." --tags "style,js"
  npx total-recall remember fact "The server runs on port 3000." --importance 4

### npx total-recall recall "<query>" [options]
Semantic search across rules, facts, and session history.

**Options:**
  --top-k, -k <number>       Results to return (default: 5, max: 20)
  --no-sessions, -ns         Exclude session chunks, vault only
  --format, -f <type>        text (default) or json
  --category, -cat <name>    Filter by SSSS category
  --tags, -t <list>          Filter by tags
  --modality, -m <type>      Filter by modality
  --importance, -i <1-5>     Filter by minimum importance

**Examples:**
  npx total-recall recall "Never run tsc directly"
  npx total-recall recall "Express server port" --top-k 3
  npx total-recall recall "tsc" --category invariants --modality must

### npx total-recall --help
Show all available commands.
<!-- END INJECTED ACTIVE DIRECTIVES -->
