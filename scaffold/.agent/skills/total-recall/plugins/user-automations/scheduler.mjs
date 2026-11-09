/**
 * Scheduled plugin tasks.
 *
 * A manifest task `{ intent, schedule: "<5-field cron>", command }` runs the
 * plugin's own CLI on that schedule, out of process. `command` is a subcommand
 * followed by its arguments ("cleanup --auto --json"). Tasks are per node by
 * default; selected-node tasks run only on the node named in
 * plugin_record.task_nodes[command].
 *
 * Scheduling runs against the global brain (the home installation), so run
 * records and plugin.task_run events land where `user-automations list` reads
 * them, whatever directory the daemon was started from.
 *
 * The last minute-slot each command ran in is kept in the plugin_record, so a
 * restart neither repeats a slot nor loses one: when the daemon was busy or
 * down, the most recent matching slot since the last run (within a day) runs
 * once. A task never runs just because it was installed: the first run is the
 * first matching slot after the scheduler first sees it.
 *
 * The daemon starts this module through the plugin's `runtime.daemon`
 * declaration; Total Recall core holds no scheduler of its own.
 */
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCron, cronMatches } from './cron.mjs';

export { parseCron, cronMatches } from './cron.mjs';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_CATCHUP_MINUTES = 24 * 60;
const TAIL_BYTES = 2000;
const pad = (n) => String(n).padStart(2, '0');

/** Core primitives the scheduler uses, loaded from the running Total Recall package. */
export async function loadCore(packageRoot = process.env.TR_PACKAGE_ROOT) {
  if (!packageRoot) throw new Error('TR_PACKAGE_ROOT is not set; the scheduler runs inside the Total Recall daemon');
  const load = (name) => import(pathToFileURL(path.join(packageRoot, 'src', 'core', `${name}.mjs`)).href);
  const [loader, store, state, runner, events, log, mesh] = await Promise.all([
    load('plugin-loader'), load('plugin-store'), load('plugin-state'), load('plugin-runner'),
    load('ssss-operation-service'), load('logger'), load('mesh'),
  ]);
  return {
    discoverPlugins: loader.discoverPlugins,
    vaultForPluginsDir: loader.vaultForPluginsDir,
    readPluginRecord: store.readPluginRecord,
    patchPluginRecord: store.patchPluginRecord,
    ensurePluginRecord: store.ensurePluginRecord,
    pluginExecutionEnabled: state.pluginExecutionEnabled,
    runPluginCommand: runner.runPluginCommand,
    appendVfsEvent: events.appendVfsEvent,
    logger: log.logger,
    getMeshSelf: mesh.getMeshSelf,
    meshNodeKey: mesh.meshNodeKey,
  };
}

/** Split a manifest task command into its subcommand and arguments. */
export function splitTaskCommand(command) {
  const [subcommand = '', ...args] = String(command || '').trim().split(/\s+/).filter(Boolean);
  return { subcommand, args };
}

/** Task timeout: the task's own, else the subcommand's declared one, else 60 s. */
export function taskTimeoutMs(task, manifest) {
  if (Number.isInteger(task.timeout_ms)) return task.timeout_ms;
  const { subcommand } = splitTaskCommand(task.command);
  const declared = manifest?.cli?.subcommands?.find((s) => s.name === subcommand);
  const value = declared?.timeout_ms ?? declared?.timeoutMs;
  return Number.isInteger(value) ? value : DEFAULT_TIMEOUT_MS;
}

/** A selected-node task stays idle until this node's plugin record selects it. */
export function taskRunsOnNode(task, record, self, meshNodeKey = (v) => String(v).toLowerCase()) {
  if (task.placement !== 'selected-node') return true;
  const selected = String(record?.task_nodes?.[task.command] || '').trim();
  if (!selected || !self?.hostname) return false;
  return selected === self.ip || meshNodeKey(selected) === meshNodeKey(self.hostname);
}

/** Local minute-slot key, e.g. 2026-09-22T14:05. */
export function minuteSlot(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function slotToDate(slot) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(slot || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) : null;
}

/** The most recent slot matching `cron` in (lastSlot, now], or null. */
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

/** Last non-empty lines of a run's output, bounded for logs and alerts. */
export function outputTail(output, maxChars = 400) {
  const lines = String(output || '').trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const tail = lines.slice(-3).join(' | ');
  return tail.length > maxChars ? tail.slice(-maxChars) : tail;
}

/** Ask the operator-alerts owner to report a failed run, once per task per day. */
async function alertFailure(core, { plugin, command, slot, result, projectRoot }) {
  const owner = core.discoverPlugins(projectRoot).find((p) => p.id === 'operator-alerts' && p.valid);
  if (!owner) return { sent: false, error: 'operator-alerts is not installed' };
  const reason = result.timedOut ? 'timed out' : `exit ${result.exitCode}`;
  const tail = outputTail(result.output) || 'no output';
  const args = [
    '--title', `Scheduled task failed: ${plugin.id} ${command}`,
    '--message', `${plugin.id} "${command}" (slot ${slot}) failed: ${reason}. ${tail}`,
    '--event-id', `plugin-task-${plugin.id}-${command.replace(/[^a-z0-9]+/gi, '-')}-${slot.slice(0, 10)}`,
  ];
  try {
    const sent = await core.runPluginCommand(owner, { subcommand: 'send', args, cwd: projectRoot, timeoutMs: 30_000 });
    return { sent: sent.ok, error: sent.ok ? null : outputTail(sent.output) };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

/**
 * Run every task that is due. Tasks run sequentially so a slow plugin cannot
 * multiply into concurrent processes on a constrained host.
 * @param {{ core: object, projectRoot?: string, now?: Date, selfNode?: object, alert?: Function }} options
 */
export async function runDuePluginTasks(options) {
  const { core, projectRoot = os.homedir(), now = new Date() } = options;
  const alert = options.alert || ((info) => alertFailure(core, info));
  const selfNode = options.selfNode === undefined ? core.getMeshSelf() : options.selfNode;
  const results = [];

  for (const plugin of core.discoverPlugins(projectRoot)) {
    if (!plugin.valid || !Array.isArray(plugin.manifest.tasks) || plugin.manifest.tasks.length === 0) continue;

    let record = core.readPluginRecord(plugin);
    if (!record) record = await core.ensurePluginRecord(plugin);
    if (!core.pluginExecutionEnabled(plugin, { projectRoot })) continue;
    const runs = { ...(record?.task_runs || {}) };
    let changed = false;

    for (const task of plugin.manifest.tasks) {
      if (!taskRunsOnNode(task, record, selfNode, core.meshNodeKey)) continue;
      let cron;
      try {
        cron = parseCron(task.schedule);
      } catch (err) {
        core.logger.warn('plugin-tasks', `Skipping ${plugin.id}:${task.command} — ${err.message}`);
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

      const { subcommand, args } = splitTaskCommand(task.command);
      const result = await core.runPluginCommand(plugin, { subcommand, args, cwd: projectRoot, timeoutMs: taskTimeoutMs(task, plugin.manifest) })
        .catch((err) => ({ ok: false, exitCode: null, output: err.message, durationMs: 0, timedOut: false }));
      runs[task.command] = slot;
      changed = true;
      const entry = { plugin: plugin.id, command: task.command, slot, ok: result.ok, exitCode: result.exitCode, timedOut: !!result.timedOut, tail: result.ok ? '' : outputTail(result.output) };
      if (!result.ok) entry.alert = await alert({ plugin, command: task.command, slot, result, projectRoot });
      results.push(entry);

      try {
        await core.appendVfsEvent(
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
            output_tail: String(result.output || '').slice(-TAIL_BYTES),
          },
          { actorRole: 'system', intent: 'Record plugin task run', vaultRoot: core.vaultForPluginsDir(plugin.pluginsDir) }
        );
      } catch (err) {
        core.logger.warn('plugin-tasks', `Could not record task run for ${plugin.id}: ${err.message}`);
      }
    }

    if (changed) {
      try {
        await core.patchPluginRecord(plugin, { task_runs: runs });
      } catch (err) {
        core.logger.warn('plugin-tasks', `Could not update task runs for ${plugin.id}: ${err.message}`);
      }
    }
  }

  return results;
}

/** One log line per run; failures carry the reason and the output tail. */
export function describeRun(r) {
  if (r.ok) return `${r.plugin}:${r.command} slot ${r.slot} ok`;
  const reason = r.timedOut ? 'timed out' : `exit ${r.exitCode}`;
  const alert = r.alert ? (r.alert.sent ? '; operator alerted' : `; alert not sent (${r.alert.error})`) : '';
  return `${r.plugin}:${r.command} slot ${r.slot} failed (${reason}): ${r.tail || 'no output'}${alert}`;
}

/**
 * Daemon service entry point: check for due tasks once a minute.
 * @returns {Promise<Function>} stop function
 */
export async function start(options = {}) {
  const core = options.core || await loadCore();
  const projectRoot = options.projectRoot || os.homedir();
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const r of await runDuePluginTasks({ core, projectRoot })) {
        core.logger[r.ok ? 'info' : 'warn']('plugin-tasks', describeRun(r));
      }
    } catch (err) {
      core.logger.warn('plugin-tasks', `Scheduler tick failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 60_000);
  timer.unref?.();
  tick();
  core.logger.info('plugin-tasks', `Plugin task scheduler started (user-automations) for ${projectRoot}`);
  return () => clearInterval(timer);
}
