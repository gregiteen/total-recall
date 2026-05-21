import fs from 'fs';
import path from 'path';
import os from 'os';
import bcrypt from 'bcrypt';
import yaml from 'yaml';

export default async function resetPassword(args) {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
  total-recall reset-password "new_password"

  Resets the dashboard admin password in ~/.agent/config/security.yml.
  Sets force_password_reset to true so you will be prompted to change it upon first login.
`);
    return;
  }

  const password = args.join(' ');
  if (password.length < 8) {
    console.error('Error: Password must be at least 8 characters.');
    process.exit(1);
  }

  const AGENT_DIR = process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
  const configDir = path.join(AGENT_DIR, 'config');
  const securityPath = path.join(configDir, 'security.yml');

  // Enforce directories exist
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  let config = {};
  if (fs.existsSync(securityPath)) {
    try {
      config = yaml.parse(fs.readFileSync(securityPath, 'utf8')) || {};
    } catch (e) {
      console.warn('Warning: Could not parse existing security.yml, starting fresh.');
    }
  }

  // Ensure default structures are present
  if (!config.dashboard) {
    config.dashboard = {};
  }
  if (!config.api) {
    config.api = { pats: [], allow_static_pats: false };
  }
  if (!config.network) {
    config.network = { require_https: true, public_health: false, allowed_origins: [] };
  }
  if (!config.bind) {
    config.bind = { host: '127.0.0.1', port: 3000, allow_public_bind: false };
  }

  console.log('Hashing password...');
  const hash = await bcrypt.hash(password, 10);

  config.dashboard.password_hash = hash;
  const isDefault = password === 'totalrecall';
  config.dashboard.force_password_reset = isDefault;

  fs.writeFileSync(securityPath, yaml.stringify(config), { encoding: 'utf8', mode: 0o600 });

  console.log(`\n  ✅ Success! Dashboard admin password reset.`);
  console.log(`  📍 Saved to: ${securityPath}`);
  if (isDefault) {
    console.log(`  🔑 Next login password: "${password}" (you will be forced to change it on login)`);
    console.log(`  👉 Access your dashboard and enter this password to log in and set your permanent password.\n`);
  } else {
    console.log(`  🔑 Next login password: "${password}" (you can sign in directly now!)\n`);
  }
}
