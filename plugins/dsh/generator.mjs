/**
 * DSH — compiled agent context generator.
 * Reports whether the DeepSeek Harness is running and its status.
 * @module @total-recall/plugin-dsh/generator
 */

import { spawnSync } from 'node:child_process';

function findDsh() {
  const ports = [53626, 54866, 54055];
  for (const port of ports) {
    try {
      const res = spawnSync('lsof', ['-i', `:${port}`, '-P', '-n'], { timeout: 3000 });
      if (res.status === 0) {
        const lines = res.stdout.toString().trim().split('\n').slice(1);
        for (const line of lines) {
          if (line.includes('(LISTEN)')) {
            const parts = line.split(/\s+/);
            const pid = parseInt(parts[1], 10);
            if (pid) return { pid, port };
          }
        }
      }
    } catch {}
  }
  return null;
}

function fetchBootInfo(port) {
  try {
    const res = spawnSync('curl', ['-s', `http://127.0.0.1:${port}/`], { timeout: 5000, encoding: 'utf8' });
    if (res.status !== 0) return null;
    const html = res.stdout;
    const idx = html.indexOf('__DSH_BOOT__');
    if (idx === -1) return null;
    const brace = html.indexOf('{', idx);
    let depth = 0, end = brace;
    for (let i = brace; i < html.length; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') depth--;
      if (depth === 0) { end = i + 1; break; }
    }
    return JSON.parse(html.slice(brace, end));
  } catch { return null; }
}

export async function generateContext() {
  const dsh = findDsh();
  if (!dsh) {
    return { section: 'dsh', text: 'DeepSeek Harness: not running.' };
  }

  const mem = spawnSync('ps', ['-p', String(dsh.pid), '-o', 'rss='], { timeout: 2000 });
  const rss = parseInt(mem.stdout.toString().trim()) || 0;
  const boot = fetchBootInfo(dsh.port);

  return {
    section: 'dsh',
    text: `DeepSeek Harness: running (PID ${dsh.pid}, ${(rss / 1024).toFixed(1)} MB), ` +
      `API port ${dsh.port}, rev ${boot?.rev || 'unknown'}, ` +
      `${boot?.entries?.length || 0} client plugins loaded. ` +
      `DSH commands: total-recall dsh status|sessions|tools|models|plugins. ` +
      `Web GUI: http://127.0.0.1:${dsh.port}`,
  };
}