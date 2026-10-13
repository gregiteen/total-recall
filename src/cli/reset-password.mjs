import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadPluginModule } from '../core/plugin-runtime.mjs';
import { brainDir } from '../core/config.mjs';

/**
 * Read a password without echoing it, and without it ever becoming an argv
 * element. `argv` is world-readable via `ps`, is written to shell history, and
 * is captured verbatim by any agent driving this CLI — so a password passed as
 * an argument is disclosed the moment it is typed. Prompting keeps it in this
 * process's memory only.
 */
function promptPassword(label) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) {
      // Piped/automated use: read one line from stdin.
      let buf = '';
      input.setEncoding('utf8');
      input.on('data', (d) => (buf += d));
      input.on('end', () => resolve(buf.split('\n')[0].trim()));
      input.on('error', reject);
      return;
    }
    process.stdout.write(label);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    let buf = '';
    const onData = (ch) => {
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        input.setRawMode(false);
        input.pause();
        input.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(buf);
      } else if (ch === '\u0003') {
        input.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') {
        buf = buf.slice(0, -1);
      } else {
        buf += ch;
      }
    };
    input.on('data', onData);
  });
}

export default async function resetPassword(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  total-recall reset-password

  Resets the dashboard admin password in ~/.agent/skills/total-recall/config/security.yml.
  Prompts for the new password; it is never taken as an argument.
  Sets force_password_reset to true so you will be prompted to change it upon first login.

  For automation, pipe it instead:  echo "\$NEW_PW" | total-recall reset-password
`);
    return;
  }

  if (args.length > 0) {
    console.error(
      'Error: reset-password no longer accepts the password as an argument —\n' +
        '       argv is readable by any user via `ps` and is saved to shell history.\n' +
        '       Run `total-recall reset-password` with no arguments to be prompted,\n' +
        '       or pipe it:  echo "$NEW_PW" | total-recall reset-password',
    );
    process.exit(1);
  }

  const password = await promptPassword('New dashboard password: ');
  if (password.length < 8) {
    console.error('Error: Password must be at least 8 characters.');
    process.exit(1);
  }

  if (process.stdin.isTTY) {
    const confirm = await promptPassword('Confirm password: ');
    if (confirm !== password) {
      console.error('Error: Passwords do not match.');
      process.exit(1);
    }
  }

  const { createSessionCredentials } = await loadPluginModule('auth', 'session-credentials');
  const isDefault = password === 'totalrecall';
  await createSessionCredentials({ brainDir: process.env.TR_SECRETS_BRAIN || brainDir }).setDashboardPassword(password, { forcePasswordReset: isDefault });

  // Never echo the password back. The operator just typed it; repeating it to
  // stdout puts it into scrollback, into any log capturing this command, and
  // into the transcript of any agent that ran it.
  console.log(`\n  ✅ Success! Dashboard admin password reset.`);
  console.log('  Saved in the encrypted auth store; existing sessions invalidated.');
  if (isDefault) {
    console.log(`  ⚠️  You set the well-known default password.`);
    console.log(`  👉 Sign in with it once; you will be forced to change it immediately.\n`);
  } else {
    console.log(`  👉 Sign in with your new password.\n`);
  }
}
