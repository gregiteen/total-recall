import { loadPluginModule as __loadOwnedPlugin } from '../../core/plugin-runtime.mjs';
import { getPlugin, getPluginMonetization } from '../../core/plugin-loader.mjs';
const { getSecret, setSecret, defaultBrainDir } = await __loadOwnedPlugin('auth', 'secrets-store');

/**
 * Handle `total-recall plugin license <id> [verify|activate <key>]`
 */
export async function managePluginLicense(args = []) {
  const pluginId = args.find(a => !a.startsWith('-'));
  if (!pluginId) {
    console.error('❌ Error: Missing plugin ID. Usage: total-recall plugin license <id> [verify|activate <key>]');
    process.exit(1);
  }

  const plugin = getPlugin(pluginId, process.cwd());
  if (!plugin) {
    console.error(`❌ Plugin '${pluginId}' is not installed.`);
    process.exit(1);
  }

  const mon = getPluginMonetization(plugin);
  const sub = args[1] && !args[1].startsWith('-') && args[1] !== pluginId ? args[1] : 'status';

  if (sub === 'activate') {
    if (!args.includes('--stdin')) throw new Error('Use plugin license <id> activate --stdin');
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const key = Buffer.concat(chunks).toString('utf8').trim();
    if (!key) {
      console.error('❌ Error: Missing license key. Usage: total-recall plugin license <id> activate <license-key>');
      process.exit(1);
    }
    const secretKey = mon.license_key_secret || `${pluginId.toUpperCase().replace(/-/g, '_')}_LICENSE_KEY`;
    await setSecret(defaultBrainDir(), secretKey, key, { actor: 'plugin-license' });
    console.log(`✅ License credential stored for plugin '${pluginId}'. Secret '${secretKey}' recorded.`);
    return;
  }

  if (sub === 'verify') {
    if (!mon.requiresLicense) {
      console.log(`ℹ️ Plugin '${pluginId}' does not require a commercial license (${mon.model}).`);
      return;
    }
    const secretKey = mon.license_key_secret;
    const currentKey = secretKey ? await getSecret(defaultBrainDir(), secretKey, { actor: 'plugin-license' }) : null;
    if (!currentKey?.found) {
      console.error(`❌ License missing for '${pluginId}'. Secret '${secretKey}' is not configured.`);
      if (mon.checkout_url) console.error(`   Purchase or subscribe at: ${mon.checkout_url}`);
      process.exitCode = 1;
      return;
    }
    console.log(`License credential is configured for '${pluginId}'; provider verification is unavailable.`);
    process.exitCode = 1;
    return;
  }

  // Default: status
  console.log(`\n💳 Plugin Monetization & Licensing: ${plugin.manifest.name}`);
  console.log(`   ID:                 ${pluginId}`);
  console.log(`   Model:              ${mon.model}`);
  console.log(`   Price:              ${mon.priceFormatted}`);
  if (mon.period) console.log(`   Billing Period:     ${mon.period}`);
  if (mon.take_rate_basis_points) console.log(`   Platform Fee:       ${mon.take_rate_basis_points / 100}%`);
  if (mon.recipient) console.log(`   Payout Recipient:   ${mon.recipient.type} (${mon.recipient.account_id})`);
  if (mon.license_key_secret) {
    const currentKey = await getSecret(defaultBrainDir(), mon.license_key_secret, { actor: 'plugin-license' });
    console.log(`   License Secret:     ${mon.license_key_secret}`);
    console.log(`   License Status:     ${currentKey?.found ? 'Configured · not verified' : '⚠️ Unconfigured'}`);
  }
  if (mon.checkout_url) console.log(`   Checkout Link:      ${mon.checkout_url}`);
  console.log();
}
