import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { collectSources } from './capability/index.mjs';

const exec = promisify(execFile);
export const SOURCES = Object.freeze(['plugin-tasks', 'task-queue', 'research-queue', 'daemon', 'workflows', 'composed-commands', 'operating-system', 'agent-platforms']);
export const coreModule = (root, name) => import(pathToFileURL(path.join(root, 'src/core', `${name}.mjs`)).href);
const digest = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 20);
export const recordId = (node, source, key) => `${source}:${digest(`${node}\0${key}`)}`;
const text = (value, max = 240) => typeof value === 'string' ? value.slice(0, max) : '';
const canCancelPending = async (tasks, queueDir) =>
  tasks.TASK_CANCELLATION_SUPPORTS_EXPECTED_STATUS === true
  && typeof tasks.supportsPendingTaskCancellation === 'function'
  && await tasks.supportsPendingTaskCancellation(queueDir) === true;
export function automation(ctx, source, key, data) {
  return { id: recordId(ctx.node_id, source, key), node_id: ctx.node_id, source,
    name: key, origin: source, trigger: { kind: 'unknown', summary: 'Not reported' },
    enabled: null, state: 'unknown', runner_available: null, last_run: null, actions: [], ...data };
}
export function scheduledTasks(plugins = [], ctx = { node_id: 'local' }) {
  return plugins.flatMap(plugin => (Array.isArray(plugin.tasks) ? plugin.tasks : []).map(task => automation(ctx, 'plugin-tasks', `${plugin.id}:${task.command}`, {
    name: text(task.intent || `${plugin.name || plugin.id} · ${task.command}`), origin: `plugin:${plugin.id}`,
    plugin_id: plugin.id, plugin_name: plugin.name, command: task.command, intent: text(task.intent), schedule: task.schedule,
    trigger: { kind: 'cron', summary: text(task.schedule) }, placement: task.placement || 'per-node',
    enabled: plugin.activation?.enabled ?? null, state: plugin.valid === false ? 'invalid' : plugin.activation?.enabled === false ? 'disabled' : 'declared',
    valid: plugin.valid, last_handled_slot: task.last_run || null,
  })));
}

export async function boundedCommand(file, args, options = {}) {
  try { const result = await exec(file, args, { timeout: 4000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8', windowsHide: true, ...options }); return result.stdout; }
  catch (error) { const failure = new Error(error.code === 'ENOENT' ? `${file} is unavailable` : `${file} inventory failed (${error.killed ? 'timeout' : error.code || 'error'})`); failure.code = error.code; throw failure; }
}

/** Read only scheduler facts; never return commands, environments or secret-bearing arguments. */
export async function operatingSystem(ctx) {
  const run = ctx.runCommand || boundedCommand;
  const records = [], warnings = [];
  if (ctx.platform === 'darwin') {
    const dirs = [path.join(ctx.home, 'Library/LaunchAgents'), '/Library/LaunchAgents', '/Library/LaunchDaemons', '/System/Library/LaunchAgents', '/System/Library/LaunchDaemons'];
    let loaded = new Map();
    try { loaded = new Map((await run('/bin/launchctl', ['list'])).split('\n').slice(1).map(line => line.trim().split(/\s+/)).filter(parts => parts.length >= 3).map(([pid, exit, label]) => [label, { pid, exit }])); }
    catch (error) { warnings.push(error.message); }
    for (const dir of dirs) {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT') warnings.push(`Cannot inspect ${dir}`); continue; }
      const jobs = entries.filter(item => item.isFile() && item.name.endsWith('.plist'));
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => { while (cursor < jobs.length) {
        const entry = jobs[cursor++];
        const file = path.join(dir, entry.name);
        try {
          if (fs.statSync(file).size > 1024 * 1024) throw new Error('Job definition exceeds size limit');
          const job = JSON.parse(await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file]));
          const label = text(job.Label || entry.name), runtime = loaded.get(label);
          const kinds = [job.StartCalendarInterval && 'calendar', job.StartInterval && 'interval', job.WatchPaths && 'file-change', job.QueueDirectories && 'directory', job.KeepAlive && 'keep-alive', job.RunAtLoad && 'boot'].filter(Boolean);
          // Socket/on-demand jobs are automations too; absence of a timer is not absence of a job.
          records.push(automation(ctx, 'operating-system', file, { name: label, origin: `launchd:${label}`,
            trigger: { kind: kinds[0] || 'on-demand', summary: job.StartInterval ? `Every ${Number(job.StartInterval)} seconds${kinds.length > 1 ? `; ${kinds.filter(kind => kind !== 'interval').join(', ')}` : ''}` : kinds.length ? kinds.join(', ') : 'On demand' },
            enabled: job.Disabled === true ? false : null, state: runtime?.pid !== '-' && runtime?.pid ? 'running' : runtime ? 'loaded' : 'declared',
            runner_available: runtime ? true : null, last_exit_code: runtime && runtime.exit !== '-' ? Number(runtime.exit) : null }));
        } catch { warnings.push(`Cannot inspect launchd definition ${entry.name}`); }
      } }));
    }
  } else if (ctx.platform === 'linux') {
    for (const scope of ['system', 'user']) {
      const scopeArgs = scope === 'user' ? ['--user'] : [];
      try {
        const [installed, loaded] = await Promise.all([
          run('systemctl', [...scopeArgs, 'list-unit-files', '--type=timer', '--no-legend', '--no-pager']),
          run('systemctl', [...scopeArgs, 'list-units', '--type=timer', '--all', '--no-legend', '--no-pager', '--plain']),
        ]);
        const active = new Map(loaded.trim().split('\n').map(line => line.trim().split(/\s+/)).filter(parts => parts[0]?.endsWith('.timer')).map(parts => [parts[0], parts[2]]));
        for (const line of installed.trim().split('\n')) {
          const [name, state] = line.trim().split(/\s+/); if (!name?.endsWith('.timer')) continue;
          records.push(automation(ctx, 'operating-system', `${scope}:${name}`, { name, origin: `systemd:${scope}:${name}`, trigger: { kind: 'timer', summary: 'System timer' }, enabled: ['enabled', 'enabled-runtime', 'linked', 'linked-runtime'].includes(state) ? true : ['disabled', 'masked'].includes(state) ? false : null, state: active.get(name) || state, runner_available: active.has(name) ? true : null }));
        }
      } catch (error) { warnings.push(`${scope}: ${error.message}`); }
    }
  } else return { status: 'unsupported', records: [], error: `No operating-system adapter for ${ctx.platform}` };
  try {
    const cron = await run('crontab', ['-l']);
    for (const [index, line] of cron.split('\n').entries()) {
      const clean = line.trim(); if (!clean || clean.startsWith('#') || /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(clean)) continue;
      const match = clean.match(/^(@\w+|(?:\S+\s+){4}\S+)\s+.+$/); if (!match) { warnings.push(`Unrecognized crontab line ${index + 1}`); continue; }
      records.push(automation(ctx, 'operating-system', `crontab:${digest(clean)}`, { name: `Crontab job ${index + 1}`, origin: 'crontab:current-user', trigger: { kind: 'cron', summary: match[1] }, enabled: true, state: 'declared' }));
    }
  } catch (error) {
    // Exit 1 means either no crontab or an access error; never claim empty coverage without evidence.
    warnings.push(error.message);
  }
  records.sort((left, right) => left.id.localeCompare(right.id));
  return { records, status: warnings.length ? 'partial' : 'ok', ...(warnings.length ? { error: [...new Set(warnings)].slice(0, 12).join('; ') } : {}) };
}

export async function createContext(packageRoot, options = {}) {
  const config = options.config || await coreModule(packageRoot, 'config');
  const active = config.getActiveBrains(options.projectRoot || process.cwd());
  const brains = [active.global, active.project].filter(Boolean);
  const unique = [...new Map(brains.map(brain => [path.resolve(brain.brainDir), brain])).values()];
  return { packageRoot, projectRoot: options.projectRoot || process.cwd(), node_id: options.node_id || os.hostname(), home: options.home || os.homedir(), platform: options.platform || process.platform, brains: unique, config, ...options };
}

export async function sourceAdapters(ctx) {
  const load = name => ctx.modules?.[name] || coreModule(ctx.packageRoot, name);
  return {
    'plugin-tasks': async () => {
      const store = await load('plugin-store');
      const records = scheduledTasks(store.listInstalledPlugins(ctx.projectRoot), ctx);
      const events = await load('ssss-operation-service');
      const payloads = [];
      for (const brain of ctx.brains) for (const event of await events.listVfsEvents({ vaultRoot: path.join(brain.brainDir, 'memory-vault') })) {
        let payload = event?.payload || event?.content; if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { continue; } }
        if (payload?.kind === 'plugin.task_run') payloads.push({ ...payload, at: event.timestamp || event.created_at || null });
      }
      for (const record of records) {
        const last = payloads.filter(event => event.plugin_id === record.plugin_id && event.command === record.command)
          .sort((a, b) => String(a.at || a.slot || '').localeCompare(String(b.at || b.slot || ''))).at(-1);
        if (last) record.last_run = { at: last.at || last.slot, state: last.ok ? 'success' : 'failed', exit_code: last.exit_code ?? null };
      }
      return records;
    },
    'task-queue': async () => {
      const tasks = await load('task-envelope');
      const queues = await Promise.all(ctx.brains.map(async (brain) => {
        const queueDir = tasks.resolveQueueDir(brain.brainDir);
        const canCancel = await canCancelPending(tasks, queueDir);
        return tasks.listTasks(queueDir, { status: 'all' }).map((task) => {
          const record = automation(ctx, 'task-queue', `${brain.layer}:${task.slug}`, { name: text(task.intent || task.slug), origin: `task:${brain.layer}:${task.slug}`, trigger: { kind: 'queue', summary: 'Queued work' }, enabled: !['completed', 'cancelled'].includes(task.status), state: task.status, owner_ref: { layer: brain.layer, slug: task.slug }, last_run: task.completed_at || task.failed_at ? { at: task.completed_at || task.failed_at, state: task.status, exit_code: null } : null });
          if (canCancel && task.status === 'pending') record.actions = [{ command: 'cancel', label: 'Cancel task', args: [record.id], effect: 'write' }];
          return record;
        });
      }));
      return queues.flat();
    },
    'research-queue': async () => {
      const research = await load('research-queue');
      const records = [];
      for (const brain of ctx.brains) {
        let offset = 0;
        while (true) {
          const page = research.listQueue({ brainDir: brain.brainDir, limit: 500, offset });
          if (!Array.isArray(page.items)) throw new Error('Invalid research queue response');
          records.push(...page.items.map(task => automation(ctx, 'research-queue', `${brain.layer}:${task.id}`, { name: text(task.topic), origin: `research:${brain.layer}:${task.id}`, trigger: { kind: 'queue', summary: task.research_phase || 'Research queue' }, enabled: ['pending', 'in_progress'].includes(task.status), state: task.status, last_run: task.completed_at ? { at: task.completed_at, state: task.status, exit_code: null } : null })));
          offset += page.items.length;
          if (offset >= page.total) break;
          if (!page.items.length) throw new Error('Research pagination made no progress');
          if (records.length >= 10000) return { records, status: 'partial', error: 'Research queue exceeded 10000 records' };
        }
      }
      return records;
    },
    daemon: async () => {
      const [health, update] = await Promise.all([load('startup-health'), load('automatic-brain-updates')]);
      return ctx.brains.flatMap(brain => {
        const observation = health.observeDaemon(brain.brainDir), running = observation.status === 'running';
        const maintenance = update.automaticUpdateStatus(brain.brainDir);
        return [automation(ctx, 'daemon', `${brain.layer}:daemon`, { name: `${brain.layer} background worker`, origin: `daemon:${brain.layer}`, trigger: { kind: 'queue', summary: 'Durable queue and maintenance loop' }, state: observation.status, runner_available: running, enabled: null }),
          automation(ctx, 'daemon', `${brain.layer}:package-updates`, { name: `${brain.layer} package maintenance`, origin: `automatic-brain-updates:${brain.layer}`, trigger: { kind: 'interval', summary: `Every ${maintenance.intervalMs / 60000} minutes; failed checks retry` }, enabled: maintenance.enabled, state: maintenance.enabled ? 'configured' : 'disabled', runner_available: running, last_run: maintenance.last ? { at: maintenance.last.checkedAt ? new Date(maintenance.last.checkedAt).toISOString() : null, state: maintenance.last.failed ? 'failed' : 'success', exit_code: null } : null }),
          ...['vault-watch', 'source-watch', 'session-ingest', 'cli-surfaces', 'repo-sync', 'github-sync', 'obsidian-watch'].map(name => automation(ctx, 'daemon', `${brain.layer}:${name}`, { name: `${brain.layer} ${name}`, origin: `daemon:${brain.layer}:${name}`, trigger: { kind: name.includes('watch') ? 'file-change' : name === 'session-ingest' ? 'boot' : 'maintenance', summary: 'Daemon-managed; individual registration is not reported by owner' }, state: 'unknown', runner_available: running }))];
      });
    },
    workflows: async () => {
      const vfs = await load('vfs-documents');
      return ctx.brains.flatMap(brain => vfs.listVfsDocuments(path.join(brain.brainDir, 'memory-vault')).filter(doc => ['workflow', 'trigger'].includes(doc.type)).flatMap(doc => {
        const triggers = doc.type === 'trigger' ? [{ ...doc, type: doc.source }] : Array.isArray(doc.triggers) && doc.triggers.length ? doc.triggers : [{ type: 'manual' }];
        return triggers.map((trigger, index) => automation(ctx, 'workflows', `${brain.layer}:${doc.vfs_path}:${trigger.id || trigger.trigger_id || index}`, { name: text(doc.title || doc.name || doc.id || doc.slug), origin: `vfs:${brain.layer}:${doc.vfs_path}`, trigger: { kind: text(trigger.type), summary: text(trigger.cron || trigger.interval || trigger.event_type || trigger.type || 'Unknown trigger'), ...(trigger.timezone ? { timezone: text(trigger.timezone) } : {}) }, enabled: doc.type === 'trigger' ? doc.status === 'active' ? true : ['disabled', 'paused'].includes(doc.status) ? false : null : typeof doc.isActive === 'boolean' ? doc.isActive : null, state: 'declared', runner_available: null }));
      }));
    },
    'composed-commands': async () => {
      const commands = await load('command-surface');
      const dirs = commands.commandScopeDirectories(ctx.projectRoot, ctx.config.globalAgentDir);
      return commands.listSurfaceCommands(dirs).map(command => automation(ctx, 'composed-commands', `${command.scope}:${command.name}`, { name: command.name, origin: `composable-cli:${command.scope}:${command.name}`, trigger: { kind: 'manual', summary: 'Reusable command; requires explicit automation binding' }, state: 'definition', enabled: null }));
    },
    'operating-system': () => operatingSystem(ctx),
    'agent-platforms': async () => ({ status: 'unsupported', records: [], error: 'No authenticated agent-platform inventory contract is configured; provider automations cannot be inferred from local command definitions.' }),
  };
}

export async function collectLocalAutomations(packageRoot, options = {}) {
  const ctx = await createContext(packageRoot, options), checked_at = new Date().toISOString();
  const adapters = options.adapters || await sourceAdapters(ctx);
  return { node_id: ctx.node_id, ...await collectSources({ sources: SOURCES, adapters, checkedAt: checked_at }) };
}

export async function cancelAutomation(packageRoot, id, options = {}) {
  const ctx = await createContext(packageRoot, options);
  const tasks = ctx.modules?.['task-envelope'] || await coreModule(packageRoot, 'task-envelope');
  for (const brain of ctx.brains) {
    const queueDir = tasks.resolveQueueDir(brain.brainDir);
    const task = tasks.listTasks(queueDir, { status: 'all' })
      .find((candidate) => recordId(ctx.node_id, 'task-queue', `${brain.layer}:${candidate.slug}`) === id);
    if (!task) continue;
    if (task.status !== 'pending') throw new Error('Task is no longer pending');
    if (!await canCancelPending(tasks, queueDir)) throw new Error('This host cannot safely cancel a pending task');
    const result = await tasks.cancelTask(queueDir, task.slug, { expectedStatus: 'pending' });
    if (!result.success) throw new Error(result.error || 'Task cancellation failed');
    if (tasks.getTask(queueDir, task.slug)?.status !== 'cancelled') throw new Error('Task owner did not confirm cancellation');
    return { success: true, id, state: 'cancelled' };
  }
  throw new Error('Cancellable local automation not found');
}
