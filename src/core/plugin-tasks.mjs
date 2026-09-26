/**
 * Scheduled plugin tasks.
 *
 * A manifest task `{ intent, schedule: "<5-field cron>", command }` runs the
 * plugin's own CLI subcommand on that schedule, out of process. Tasks are per
 * node: a plugin installed on this machine runs here whether or not this node
 * is the mesh leader.
 *
 * The last minute-slot each command ran in is kept in the plugin_record, so a
 * restart neither repeats a slot nor loses one: when the daemon was busy or
 * down, the most recent matching slot since the last run (within a day) runs
 * once. A task never runs just because it was installed — the first run is the
 * first matching slot after the scheduler first sees it.
 */
import { discoverPlugins } from './plugin-loader.mjs';
import { readPluginRecord, patchPluginRecord, ensurePluginRecord } from './plugin-store.mjs';
import { runPluginCommand } from './plugin-runner.mjs';
import { appendVfsEvent } from './ssss-operation-service.mjs';
import { vaultForPluginsDir } from './plugin-loader.mjs';
import { logger } from './logger.mjs';

const TASK_TIMEOUT_MS = 60_000;
const MAX_CATCHUP_MINUTES = 24 * 60;
const FIELD_RANGES = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6]   // day of week (0 = Sunday; 7 accepted as Sunday)
];

function parseField(field, [min, max], isDow) {
  const values = new Set();
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid step in '${field}'`);
    let lo;
    let hi;
    if (rangePart === '*') {
      lo = min;
      hi = max;
    } else if (rangePart.includes('-')) {
      [lo, hi] = rangePart.split('-').map(Number);
    } else {
      lo = Number(rangePart);
      hi = stepPart === undefined ? lo : max;
    }
    const upper = isDow ? 7 : max;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > upper || lo > hi) {
      throw new Error(`Value out of range in '${field}'`);
    }
    for (let v = lo; v <= hi; v += step) values.add(isDow && v === 7 ? 0 : v);
  }
  return values;
}

/** Parse a 5-field cron expression into matcher sets. Throws on invalid input. */
export function parseCron(expr) {
  const fields = String(expr || '').trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`Expected 5 cron fields, got ${fields.length}`);
  const [minute, hour, dom, month, dow] = fields.map((f, i) => parseField(f, FIELD_RANGES[i], i === 4));
  return { minute, hour, dom, month, dow, domStar: fields[2] === '*', dowStar: fields[4] === '*' };
}

/** Standard cron semantics: when both day fields are restricted, either may match. */
export function cronMatches(cron, date) {
  if (!cron.minute.has(date.getMinutes()) || !cron.hour.has(date.getHours()) || !cron.month.has(date.getMonth() + 1)) {
    return false;
  }
  const domOk = cron.dom.has(date.getDate());
  const dowOk = cron.dow.has(date.getDay());
  if (cron.domStar && cron.dowStar) return true;
  if (cron.domStar) return dowOk;
  if (cron.dowStar) return domOk;
  return domOk || dowOk;
}

const pad = (n) => String(n).padStart(2, '0');

/** Local minute-slot key, e.g. 2026-09-22T14:05. */
export function minuteSlot(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function slotToDate(slot) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(slot || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) : null;
}

/**
 * The most recent slot matching `cron` in (lastSlot, now], or null.
 * @returns {string|null}
 */
export function latestDueSlot(cron, lastSlot, now = new Date()) {
  const floorNow = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  const last = slotToDate(lastSlot);
  for (let i = 0; i < MAX_CATCHUP_MINUTES; i++) {
    const candidate = new Date(floorNow.getTime() - i * 60_000);
    if (last && candidate <= last) return null;
    if (cronMatches(cron, candidate)) return minuteSlot(candidate);
  }
  return null;
}

/**
 * Run every task that is due. Tasks run sequentially so a slow plugin cannot
 * multiply into concurrent processes on a constrained host.
 * @param {{ projectRoot?: string, now?: Date, runner?: Function }} [options]
 * @returns {Promise<Array<{ plugin: string, command: string, slot: string, ok: boolean, exitCode: number|null }>>}
 */
export async function runDuePluginTasks(options = {}) {
  const { projectRoot = process.cwd(), now = new Date(), runner = runPluginCommand } = options;
  const results = [];

  for (const plugin of discoverPlugins(projectRoot)) {
    if (!plugin.valid || !Array.isArray(plugin.manifest.tasks) || plugin.manifest.tasks.length === 0) continue;

    let record = readPluginRecord(plugin);
    if (!record) record = await ensurePluginRecord(plugin);
    const runs = { ...(record?.task_runs || {}) };
    let changed = false;

    for (const task of plugin.manifest.tasks) {
      let cron;
      try {
        cron = parseCron(task.schedule);
      } catch (err) {
        logger.warn('plugin-tasks', `Skipping ${plugin.id}:${task.command} — ${err.message}`);
        continue;
      }

      if (!runs[task.command]) {
        // First sighting: mark the present so the first run is the next real slot.
        runs[task.command] = minuteSlot(now);
        changed = true;
        continue;
      }

      const slot = latestDueSlot(cron, runs[task.command], now);
      if (!slot) continue;

      const result = await runner(plugin, { subcommand: task.command, cwd: projectRoot, timeoutMs: TASK_TIMEOUT_MS })
        .catch((err) => ({ ok: false, exitCode: null, output: err.message, durationMs: 0, timedOut: false }));
      runs[task.command] = slot;
      changed = true;
      results.push({ plugin: plugin.id, command: task.command, slot, ok: result.ok, exitCode: result.exitCode });

      try {
        await appendVfsEvent(
          `plugins/${plugin.id}/task-${Date.now()}`,
          {
            kind: 'plugin.task_run',
            plugin_id: plugin.id,
            command: task.command,
            intent: task.intent,
            slot,
            ok: result.ok,
            exit_code: result.exitCode,
            timed_out: !!result.timedOut,
            duration_ms: result.durationMs,
            output_tail: String(result.output || '').slice(-2000)
          },
          { actorRole: 'system', intent: 'Record plugin task run', vaultRoot: vaultForPluginsDir(plugin.pluginsDir) }
        );
      } catch (err) {
        logger.warn('plugin-tasks', `Could not record task run for ${plugin.id}: ${err.message}`);
      }
    }

    if (changed) {
      try {
        await patchPluginRecord(plugin, { task_runs: runs });
      } catch (err) {
        logger.warn('plugin-tasks', `Could not update task runs for ${plugin.id}: ${err.message}`);
      }
    }
  }

  return results;
}

let timer = null;
let running = false;

/** Check for due plugin tasks once a minute. Returns a stop function. */
export function startPluginTaskScheduler(options = {}) {
  if (timer) return () => stopPluginTaskScheduler();
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const results = await runDuePluginTasks(options);
      for (const r of results) {
        logger.info('plugin-tasks', `${r.plugin}:${r.command} slot ${r.slot} ${r.ok ? 'ok' : `failed (exit ${r.exitCode})`}`);
      }
    } catch (err) {
      logger.warn('plugin-tasks', `Scheduler tick failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, 60_000);
  timer.unref?.();
  tick();
  return () => stopPluginTaskScheduler();
}

export function stopPluginTaskScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
