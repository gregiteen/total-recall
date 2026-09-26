import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTOPULL_LABEL,
  buildCronLine,
  buildLaunchAgentPlist,
  detectLaunchAgentPort,
  installAutoPull,
  mergeCrontab,
} from './autopull-install.mjs';

describe('buildLaunchAgentPlist', () => {
  it('runs the checkout script on an interval with its environment', () => {
    const plist = buildLaunchAgentPlist({
      script: '/srv/brain/scripts/auto-pull.sh',
      env: { TR_PORT: '3000', TR_AUTOPULL_NO_BUILD: undefined, TR_REPO_DIR: '/srv/brain' },
      logFile: '/home/u/.agent/logs/auto-pull.launchd.log',
    });
    expect(plist).toContain(`<string>${AUTOPULL_LABEL}</string>`);
    expect(plist).toContain('<string>/srv/brain/scripts/auto-pull.sh</string>');
    expect(plist).toContain('<key>StartInterval</key>\n\t<integer>300</integer>');
    expect(plist).toContain('<key>TR_PORT</key>');
    expect(plist).not.toContain('TR_AUTOPULL_NO_BUILD');
  });

  it('escapes XML in paths', () => {
    const plist = buildLaunchAgentPlist({ script: '/a&b/<x>.sh', logFile: '/l' });
    expect(plist).toContain('/a&amp;b/&lt;x&gt;.sh');
  });
});

describe('crontab', () => {
  it('quotes values and discards output (the script logs itself)', () => {
    const line = buildCronLine({ script: "/srv/it's/auto-pull.sh", env: { TR_PORT: '3900' } });
    expect(line).toBe(`*/5 * * * * TR_PORT='3900' /bin/bash '/srv/it'\\''s/auto-pull.sh' >/dev/null 2>&1`);
  });

  it('replaces every earlier auto-pull line and keeps the rest', () => {
    const existing = ['0 3 * * * /usr/bin/backup', '*/5 * * * * TR_PORT=3900 /root/auto-pull.sh', ''].join('\n');
    const merged = mergeCrontab(existing, 'NEW auto-pull.sh');
    expect(merged).toBe('0 3 * * * /usr/bin/backup\nNEW auto-pull.sh\n');
  });

  it('works on an empty crontab', () => {
    expect(mergeCrontab('', 'L auto-pull.sh')).toBe('L auto-pull.sh\n');
  });
});

describe('detectLaunchAgentPort', () => {
  const setup = (plists) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-la-'));
    const dir = path.join(home, 'Library', 'LaunchAgents');
    fs.mkdirSync(dir, { recursive: true });
    for (const name of Object.keys(plists)) fs.writeFileSync(path.join(dir, name), '');
    const readPlist = (file, key) => plists[path.basename(file)]?.[key] ?? null;
    return { home, readPlist, cleanup: () => fs.rmSync(home, { recursive: true, force: true }) };
  };

  it('reads PORT from the agent whose working directory is the checkout', () => {
    const { home, readPlist, cleanup } = setup({
      'other.plist': { WorkingDirectory: '/elsewhere', 'EnvironmentVariables:PORT': '9999' },
      'brain.plist': { WorkingDirectory: '/srv/brain', 'EnvironmentVariables:PORT': '3000' },
    });
    try {
      expect(detectLaunchAgentPort('/srv/brain', { home, readPlist })).toBe(3000);
    } finally {
      cleanup();
    }
  });

  it('matches an agent that runs the checkout by absolute path', () => {
    const { home, readPlist, cleanup } = setup({
      'brain.plist': { ProgramArguments: 'node /srv/brain/src/server/index.mjs', 'EnvironmentVariables:PORT': '3100' },
    });
    try {
      expect(detectLaunchAgentPort('/srv/brain', { home, readPlist })).toBe(3100);
    } finally {
      cleanup();
    }
  });

  it('returns null without a matching agent', () => {
    const { home, readPlist, cleanup } = setup({ 'x.plist': { WorkingDirectory: '/nope' } });
    try {
      expect(detectLaunchAgentPort('/srv/brain', { home, readPlist })).toBeNull();
    } finally {
      cleanup();
    }
  });
});

describe('installAutoPull', () => {
  it('refuses a directory that is not a git checkout', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-nogit-'));
    try {
      expect(() => installAutoPull({ repoDir: dir, dryRun: true })).toThrow(/not a git checkout/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('plans a LaunchAgent on macOS without writing', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-repo-'));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-home-'));
    try {
      fs.mkdirSync(path.join(repo, '.git'));
      fs.mkdirSync(path.join(repo, 'scripts'));
      fs.writeFileSync(path.join(repo, 'scripts', 'auto-pull.sh'), '');
      const plan = installAutoPull({ repoDir: repo, platform: 'darwin', home, port: 3200, noBuild: true, dryRun: true });
      expect(plan.plistPath).toBe(path.join(home, 'Library', 'LaunchAgents', `${AUTOPULL_LABEL}.plist`));
      expect(plan.plist).toContain('<key>TR_AUTOPULL_NO_BUILD</key>');
      expect(plan.port).toBe(3200);
      expect(fs.existsSync(plan.plistPath)).toBe(false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
