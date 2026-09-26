# Code Quality Report

Prints the latest report from the `code-quality` skill's background gates in the current repository. It only reads results; it never starts a typecheck or lint run. Requires `.agent/skills/code-quality/` in the repository.

**Use cases:** software-development

## Install

```bash
npx total-recall plugin install code-quality
```

## Use

```bash
npx total-recall code-quality report
```

## Share with your other nodes

```bash
npx total-recall plugin share code-quality
# on another node on the mesh:
npx total-recall plugin install peer:<this-node>/code-quality
```
