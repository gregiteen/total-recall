/**
 * Give a process started without HOME the home its account already has.
 *
 * A systemd system unit with no User= starts its process without HOME. Git, gh and every
 * module that resolves `~` read HOME, so the cloud server's daemon could not find
 * /root/.gitconfig or the gh credential helper it names. Each hourly check of a private
 * plugin repository then failed with "could not read Username" (2026-11-16).
 *
 * On POSIX, os.homedir() reads the account's passwd entry when HOME is unset. Entry points
 * import this module first, so HOME is set before any other module reads it and every child
 * process inherits it. Windows has no HOME convention, so nothing changes there.
 */
import os from 'node:os';

export function ensureHome(env = process.env, { homedir = os.homedir, platform = process.platform } = {}) {
  if (env.HOME || platform === 'win32') return env.HOME;
  let home = '';
  try { home = homedir(); } catch { /* no passwd entry: leave HOME unset */ }
  if (home) env.HOME = home;
  return env.HOME;
}

ensureHome();
