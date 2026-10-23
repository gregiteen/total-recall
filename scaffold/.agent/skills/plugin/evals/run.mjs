#!/usr/bin/env node
/**
 * evals/run.mjs — proof that the recipe and its checks work.
 *
 * Each case is a synthetic plugin whose correct outcome is already known. Most
 * are defects observed in the real ecosystem; one is a plugin that follows the
 * recipe and must be accepted. Every case is materialised into a temp
 * directory, run through scripts/record.mjs, and asserted.
 *
 *   node evals/run.mjs [--case <name>] [--json] [--keep]
 *
 * A case passes when record.mjs reports exactly the failures the case expects:
 * an eval that passes because the checker looks at nothing is not evidence.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const HERE = import.meta.dirname
const RECORD = path.join(HERE, '..', 'scripts', 'record.mjs')
const args = process.argv.slice(2)
const asJson = args.includes('--json')
const keep = args.includes('--keep')
const onlyCase = args.includes('--case') ? args[args.indexOf('--case') + 1] : null

if (!fs.existsSync(RECORD)) {
  console.error(`record.mjs not found at ${RECORD}`)
  process.exit(2)
}

/* Load every case. */
const caseFiles = fs.readdirSync(path.join(HERE, 'cases'))
  .filter((f) => f.endsWith('.mjs'))
  .sort()
const cases = []
for (const file of caseFiles) {
  const mod = await import(pathToFileURL(path.join(HERE, 'cases', file)).href)
  if (mod.default) cases.push({ ...mod.default, file })
}

/* Materialise and check one case. */
function materialise(spec, dir) {
  for (const [rel, content] of Object.entries(spec.files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
}

function runRecord(dir) {
  try {
    const out = execFileSync(process.execPath, [RECORD, dir, '--json'], { encoding: 'utf8', timeout: 60000 })
    return { code: 0, report: JSON.parse(out) }
  } catch (err) {
    // record.mjs exits non-zero when it finds failures; the JSON is still valid.
    const out = String(err.stdout || '')
    try { return { code: err.status ?? 1, report: JSON.parse(out) } }
    catch { return { code: err.status ?? 1, report: null, raw: out + String(err.stderr || '') } }
  }
}

const results = []
for (const spec of cases) {
  if (onlyCase && spec.name !== onlyCase) continue
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `plugin-eval-${spec.name}-`))
  try {
    materialise(spec, dir)
    const { report } = runRecord(dir)

    if (!report) {
      results.push({ name: spec.name, ok: false, reason: 'record.mjs produced no JSON' })
      continue
    }

    const failures = report.results.filter((r) => r.level === 'FAIL')
    const failureText = failures.map((f) => `${f.check}: ${f.detail}`).join(' | ')
    const expected = spec.expect.fail || []

    const missing = expected.filter((want) => !failureText.includes(want.split(':')[0].trim()))
    const unexpected = expected.length === 0
      ? failures.map((f) => `${f.check}: ${f.detail}`)
      : []

    const ok = missing.length === 0 && unexpected.length === 0
    results.push({
      name: spec.name,
      ok,
      why: spec.why,
      expected,
      found: failures.map((f) => `${f.check} — ${f.detail}`),
      reason: ok ? null
        : missing.length ? `checker missed: ${missing.join(', ')}`
          : `unexpected failures: ${unexpected.join(' | ')}`,
    })
  } finally {
    if (!keep) fs.rmSync(dir, { recursive: true, force: true })
    else console.log(`kept: ${dir}`)
  }
}

/* Report. */
if (asJson) {
  process.stdout.write(JSON.stringify({ cases: results, passed: results.filter((r) => r.ok).length, total: results.length }, null, 2) + '\n')
} else {
  for (const r of results) {
    console.log(`${r.ok ? '  ok  ' : ' FAIL '} ${r.name}`)
    if (r.why) console.log(`         why: ${r.why}`)
    if (r.expected.length) console.log(`         expects: ${r.expected.join(', ')}`)
    if (r.found.length) console.log(`         found:   ${r.found.join(' | ')}`)
    if (r.reason) console.log(`         ${r.reason}`)
  }
  const passed = results.filter((r) => r.ok).length
  console.log(`\n${passed}/${results.length} eval cases passed`)
}

process.exitCode = results.every((r) => r.ok) ? 0 : 1
