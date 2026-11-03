import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadPluginModule as __loadOwnedPlugin } from '../../core/plugin-runtime.mjs';
import { getPlugin, getPluginMonetization, validatePluginManifest } from '../../core/plugin-loader.mjs';
const { getSecret, setSecret, defaultBrainDir } = await __loadOwnedPlugin('auth', 'secrets-store');

/**
 * Handle `total-recall plugin license <id> [status|activate|checkout|verify]`
 */
export async function managePluginLicense(args = []) {
  const pluginId = args.find(a => !a.startsWith('-'));
  if (!pluginId) {
    console.error('❌ Error: Missing plugin ID. Usage: total-recall plugin license <id> [status|activate|checkout|verify]');
    process.exit(1);
  }

  const plugin = getPlugin(pluginId, process.cwd());
  if (!plugin) {
    console.error(`❌ Plugin '${pluginId}' is not installed.`);
    process.exit(1);
  }

  const mon = getPluginMonetization(plugin);
  const sub = args[1] && !args[1].startsWith('-') && args[1] !== pluginId ? args[1] : 'status';
  const json = args.includes('--json');

  if (sub === 'activate') {
    if (!args.includes('--stdin')) throw new Error('Use plugin license <id> activate --stdin');
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const key = Buffer.concat(chunks).toString('utf8').trim();
    if (!key) {
      console.error('❌ Error: Missing license key. Usage: total-recall plugin license <id> activate --stdin');
      process.exit(1);
    }
    const secretKey = mon.license_key_secret || `${pluginId.toUpperCase().replace(/-/g, '_')}_LICENSE_KEY`;
    await setSecret(defaultBrainDir(), secretKey, key, { actor: 'plugin-license' });
    if (json) {
      console.log(JSON.stringify({ activated: true, plugin: pluginId, secret_key: secretKey }));
    } else {
      console.log(`✅ License credential stored for plugin '${pluginId}'. Secret '${secretKey}' recorded.`);
    }
    return;
  }

  if (sub === 'checkout') {
    if (mon.model === 'free') {
      if (json) console.log(JSON.stringify({ free: true, plugin: pluginId }));
      else console.log(`ℹ️ Plugin '${pluginId}' is free; no checkout required.`);
      return;
    }
    if (mon.checkout_url) {
      if (json) console.log(JSON.stringify({ checkout_url: mon.checkout_url, plugin: pluginId }));
      else console.log(`💳 Direct Checkout URL: ${mon.checkout_url}`);
      return;
    }
    // Stripe checkout integration
    const TR = process.env.TOTAL_RECALL_BIN || 'total-recall';
    const amount = mon.price_cents || 1000;
    const currency = (mon.currency || 'USD').toLowerCase();
    const successUrl = 'https://total-recall.ai/plugins/success';
    const cancelUrl = 'https://total-recall.ai/plugins/cancel';
    try {
      const script = TR.endsWith('.mjs');
      const stripeRes = spawnSync(script ? process.execPath : TR, [
        ...(script ? [TR] : []),
        'stripe', 'checkout',
        '--amount', String(amount),
        '--currency', currency,
        '--name', `${plugin.manifest.name} License`,
        '--success-url', successUrl,
        '--cancel-url', cancelUrl,
        '--json'
      ], { encoding: 'utf8', timeout: 15000 });
      if (stripeRes.status === 0 && stripeRes.stdout) {
        const parsed = JSON.parse(stripeRes.stdout);
        const url = parsed.url || parsed.checkout_url || parsed.data?.url;
        if (url) {
          if (json) {
            console.log(JSON.stringify({ plugin: pluginId, checkout_url: url, amount, currency }));
          } else {
            console.log(`\n💳 Stripe Checkout Session Created:`);
            console.log(`   Plugin:       ${plugin.manifest.name}`);
            console.log(`   Amount:       $${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`);
            console.log(`   Checkout URL: ${url}\n`);
          }
          return;
        }
      }
    } catch {}
    if (json) {
      console.log(JSON.stringify({ plugin: pluginId, price_formatted: mon.priceFormatted, requires_purchase: true }));
    } else {
      console.log(`\n💳 Commercial License Purchase:`);
      console.log(`   Plugin: ${plugin.manifest.name} (${mon.priceFormatted})`);
      console.log(`   Activate license after purchase: total-recall plugin license ${pluginId} activate --stdin\n`);
    }
    return;
  }

  if (sub === 'verify') {
    if (!mon.requiresLicense) {
      if (json) console.log(JSON.stringify({ verified: true, free: true, plugin: pluginId }));
      else console.log(`ℹ️ Plugin '${pluginId}' does not require a commercial license (${mon.model}).`);
      return;
    }
    const secretKey = mon.license_key_secret;
    const currentKey = secretKey ? await getSecret(defaultBrainDir(), secretKey, { actor: 'plugin-license' }) : null;
    if (!currentKey?.found || !currentKey?.value) {
      if (json) {
        console.log(JSON.stringify({ verified: false, plugin: pluginId, secret_key: secretKey, error: 'License missing' }));
      } else {
        console.error(`❌ License missing for '${pluginId}'. Secret '${secretKey}' is not configured.`);
        if (mon.checkout_url) console.error(`   Purchase or subscribe at: ${mon.checkout_url}`);
        else console.error(`   Run 'total-recall plugin license ${pluginId} checkout' to initiate purchase.`);
      }
      process.exitCode = 1;
      return;
    }
    const keyVal = currentKey.value.trim();
    const masked = keyVal.length > 8 ? `${keyVal.slice(0, 4)}...${keyVal.slice(-4)}` : '****';
    if (json) {
      console.log(JSON.stringify({ verified: true, plugin: pluginId, secret_key: secretKey, license_key_masked: masked, status: 'active' }));
    } else {
      console.log(`✅ License verified active for '${pluginId}'.`);
      console.log(`   Secret Key:  ${secretKey}`);
      console.log(`   License Key: ${masked}`);
      console.log(`   Status:      Active / Validated`);
    }
    return;
  }

  // Default: status
  if (json) {
    const currentKey = mon.license_key_secret ? await getSecret(defaultBrainDir(), mon.license_key_secret, { actor: 'plugin-license' }) : null;
    console.log(JSON.stringify({
      id: pluginId,
      name: plugin.manifest.name,
      model: mon.model,
      price: mon.priceFormatted,
      price_cents: mon.price_cents,
      currency: mon.currency,
      period: mon.period,
      license_key_secret: mon.license_key_secret,
      configured: Boolean(currentKey?.found),
      checkout_url: mon.checkout_url
    }, null, 2));
    return;
  }
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
    console.log(`   License Status:     ${currentKey?.found ? 'Configured · active' : '⚠️ Unconfigured'}`);
  }
  if (mon.checkout_url) console.log(`   Checkout Link:      ${mon.checkout_url}`);
  console.log();
}

/**
 * Handle `total-recall plugin monetize <id> [options]`
 */
export async function monetizePlugin(args = []) {
  const pluginId = args.find(a => !a.startsWith('-'));
  if (!pluginId) {
    console.error('❌ Error: Missing plugin ID. Usage: total-recall plugin monetize <id> [options]');
    console.error('   Options: --model <free|one-time|subscription|take-rate>');
    console.error('            --price-cents <cents>');
    console.error('            --currency <currency>');
    console.error('            --period <monthly|annual>');
    console.error('            --recipient-account <id>');
    console.error('            --recipient-type <stripe_connect>');
    console.error('            --checkout-url <url>');
    process.exit(1);
  }

  const plugin = getPlugin(pluginId, process.cwd());
  if (!plugin) {
    console.error(`❌ Plugin '${pluginId}' is not installed.`);
    process.exit(1);
  }

  const manifestPath = path.join(plugin.dir, 'plugin.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const modelIdx = args.indexOf('--model');
  const priceIdx = args.indexOf('--price-cents');
  const currIdx = args.indexOf('--currency');
  const periodIdx = args.indexOf('--period');
  const recAccIdx = args.indexOf('--recipient-account');
  const recTypeIdx = args.indexOf('--recipient-type');
  const urlIdx = args.indexOf('--checkout-url');
  const json = args.includes('--json');

  const hasUpdates = [modelIdx, priceIdx, currIdx, periodIdx, recAccIdx, recTypeIdx, urlIdx].some(i => i !== -1);

  if (hasUpdates) {
    manifest.monetization = manifest.monetization || {};
    if (modelIdx !== -1 && args[modelIdx + 1]) manifest.monetization.model = args[modelIdx + 1];
    if (priceIdx !== -1 && args[priceIdx + 1]) manifest.monetization.price_cents = parseInt(args[priceIdx + 1], 10);
    if (currIdx !== -1 && args[currIdx + 1]) manifest.monetization.currency = args[currIdx + 1].toUpperCase();
    if (periodIdx !== -1 && args[periodIdx + 1]) manifest.monetization.period = args[periodIdx + 1];
    if (urlIdx !== -1 && args[urlIdx + 1]) manifest.monetization.checkout_url = args[urlIdx + 1];

    if (recAccIdx !== -1 && args[recAccIdx + 1]) {
      manifest.monetization.recipient = {
        type: (recTypeIdx !== -1 && args[recTypeIdx + 1]) || 'stripe_connect',
        account_id: args[recAccIdx + 1]
      };
    }

    if (manifest.monetization.model && manifest.monetization.model !== 'free' && !manifest.monetization.license_key_secret) {
      manifest.monetization.license_key_secret = `${pluginId.toUpperCase().replace(/-/g, '_')}_LICENSE_KEY`;
    }

    const validation = validatePluginManifest(manifest);
    if (!validation.valid) {
      console.error(`❌ Invalid plugin manifest update: ${validation.errors.join('; ')}`);
      process.exitCode = 1;
      return;
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    if (json) {
      console.log(JSON.stringify({ updated: true, plugin: pluginId, monetization: manifest.monetization }, null, 2));
    } else {
      console.log(`✅ Monetization configured for plugin '${pluginId}'.`);
      console.log(`   Model:          ${manifest.monetization.model}`);
      if (manifest.monetization.price_cents !== undefined) {
        console.log(`   Price:          $${(manifest.monetization.price_cents / 100).toFixed(2)} ${manifest.monetization.currency || 'USD'}`);
      }
      if (manifest.monetization.period) {
        console.log(`   Period:         ${manifest.monetization.period}`);
      }
      if (manifest.monetization.license_key_secret) {
        console.log(`   License Secret: ${manifest.monetization.license_key_secret}`);
      }
      if (manifest.monetization.checkout_url) {
        console.log(`   Checkout URL:   ${manifest.monetization.checkout_url}`);
      }
    }
    return;
  }

  return managePluginLicense([pluginId, 'status', ...(json ? ['--json'] : [])]);
}

/**
 * Handle `total-recall plugin publish <id> [--no-lock] [--json]`
 */
export async function publishPluginToStore(args = []) {
  const pluginId = args.find(a => !a.startsWith('-'));
  if (!pluginId) {
    console.error('❌ Error: Missing plugin ID. Usage: total-recall plugin publish <id> [--no-lock] [--json]');
    process.exit(1);
  }

  const { deployPluginToStore } = await import('../../core/plugin-distribution.mjs');
  const json = args.includes('--json');
  const autoLock = !args.includes('--no-lock');

  try {
    const result = await deployPluginToStore(pluginId, { autoLock, projectRoot: process.cwd() });
    if (json) {
      console.log(JSON.stringify({
        success: true,
        id: pluginId,
        store_deployed: true,
        share_url: result.share_url,
        version: result.version,
        locked: result.locked
      }, null, 2));
    } else {
      console.log(`\n🚀 Successfully published plugin '${pluginId}' to the Store!`);
      console.log(`   ID:          ${pluginId}`);
      console.log(`   Version:     ${result.version || '0.1.0'}`);
      console.log(`   Locked:      ${result.locked ? 'Yes (immutable release)' : 'No'}`);
      if (result.share_url) console.log(`   Share Link:  ${result.share_url}`);
      console.log(`\nPeers can now install it with: total-recall plugin install ${result.share_url || `peer:<host>/${pluginId}`}`);
    }
  } catch (err) {
    console.error(`❌ Failed to publish plugin '${pluginId}': ${err.message}`);
    process.exitCode = 1;
  }
}
