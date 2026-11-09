import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readProjects } from './refresh.mjs';

/** Read through Total Recall's event service. Never open vault files here. */
async function readTaskEvents(options) {
  const service = process.env.TR_PACKAGE_ROOT
    ? pathToFileURL(path.join(process.env.TR_PACKAGE_ROOT, 'src', 'core', 'ssss-operation-service.mjs')).href
    : 'total-recall-brain/src/core/ssss-operation-service.mjs';
  const { listVfsEvents } = await import(service);
  return listVfsEvents(options);
}

export async function refreshDiagnostics({
  projects = readProjects(),
  vaultRoot = path.join(os.homedir(), '.agent', 'skills', 'total-recall', 'memory-vault'),
  listEvents = readTaskEvents,
  slot = null,
} = {}) {
  let taskEvents = [], eventError = null;
  try {
    taskEvents = (await listEvents({ vaultRoot })).flatMap(event => {
      let payload = event.payload || event.content;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { return []; }
      }
      return payload?.kind === 'plugin.task_run' && payload.plugin_id === 'openwiki' && payload.command === 'auto-refresh'
        ? [{ at: event.timestamp || event.created_at || null, ...payload }] : [];
    });
  } catch (error) { eventError = error.message; }
  taskEvents.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  taskEvents = slot ? taskEvents.filter(event => event.slot === slot) : taskEvents.slice(-1);
  const reports = projects.map(project => {
    const logPath = path.join(project.root, 'openwiki', '.refresh-attempt.json');
    try { return { ...project, logPath, attempt: JSON.parse(fs.readFileSync(logPath, 'utf8')) }; }
    catch (error) { return { ...project, logPath, attempt: null, logError: error.code === 'ENOENT' ? 'No retained generator output' : error.message }; }
  });
  return {
    ok: !eventError, eventError, taskEvents, reports,
    note: 'Task events retain only an output tail. Full legacy generator output was not saved; it cannot be reconstructed from that tail.',
  };
}
