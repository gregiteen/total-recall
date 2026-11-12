import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import matter from "../../core/frontmatter.mjs";
import { requireAuth, requireScope } from "../auth.mjs";
import { resolvePluginBrainTargets } from '../plugin-brain-targets.mjs';
import { discoverPlugins, getPluginById } from "../../core/plugin-loader.mjs";
import {
  listInstalledPlugins,
  listAvailableBundled,
  describePlugin,
  installPlugin,
  uninstallPlugin,
  setPluginShared,
  setPluginBranding,
  setPluginLocked,
  deployPluginToStore
} from "../../core/plugin-distribution.mjs";
import { listPeerPlugins } from "../../core/plugin-peers.mjs";
import { runPluginCommand, validatePluginSecretInput } from "../../core/plugin-runner.mjs";
import { readPluginRecord, patchPluginRecord, emit, vaultFor } from '../../core/plugin-store.mjs';
import { activatePluginOnUse, setPluginActive } from '../../core/plugin-activation.mjs';
import { pluginActivation } from '../../core/plugin-state.mjs';
import { REQUIRED_INSTALLATION_PLUGIN_IDS } from '../../core/default-plugins.mjs';
import { configurationValues } from '../../core/plugin-contracts/configuration.mjs';
import { writeNodeValidatedAsync } from "../../core/validated-write.mjs";
import { walkMd } from "../../core/vault.mjs";
import { serverError, badRequest, VAULT_DIR, BRAIN_DIR, globalBrainDir, sanitizeNode } from "./_shared.mjs";

const router = Router();
let activationTail = Promise.resolve();

// Omitted selectors use the serving project. Explicit selectors resolve only
// through registered brains, without accepting host paths from a request.
const projectRoot = () => process.cwd();

function surfaceTarget(req, id) {
  return id === undefined ? { brainDir: BRAIN_DIR, projectRoot: projectRoot() } : resolvePluginBrainTargets([id], req.auth)[0];
}

router.get('/api/plugins/execution-targets', requireAuth, requireScope('config:read'), async (req, res) => {
  try {
    const { loadPluginModule } = await import('../../core/plugin-runtime.mjs');
    const owner = await loadPluginModule('meta-harness', 'command-executor', { activeRequired: true });
    const result = req.query.node ? await owner.inspectNode(String(req.query.node)) : await owner.listTargets();
    res.json({ success: true, ...result });
  } catch (err) { badRequest(res, err.message); }
});

router.put('/api/plugins/:id/activation', requireAuth, requireScope('config:write'), async (req, res) => {
  try {
    const { enabled, brainIds, mode } = req.body || {};
    if (req.query.brain !== undefined || req.body?.brainId !== undefined) {
      return badRequest(res, 'Use the brainIds array to target plugin activation.');
    }
    if (mode === undefined && typeof enabled !== 'boolean') return badRequest(res, 'Plugin activation requires a boolean');
    if (mode !== undefined && (enabled !== undefined || !['on-use', 'use'].includes(mode) ||
        !Array.isArray(brainIds) || (mode === 'use' && brainIds.length !== 1))) {
      return badRequest(res, 'On use requires project brain IDs. Opening a plugin requires one project brain ID.');
    }
    // Global changes rebuild project surfaces too, so serialize writes and rebuilds together.
    const change = activationTail.then(async () => {
      if (brainIds === undefined) {
        const result = await setPluginActive(req.params.id, enabled, { projectRoot: projectRoot() });
        const cleanup = reportedCleanup(result);
        const success = result.compilation.ok && cleanup?.ok !== false;
        return { status: success ? 200 : 500, body: { ...result, success, cleanup, ...(cleanup?.error ? { error: cleanup.error } : {}) } };
      }
      const targets = resolvePluginBrainTargets(brainIds, req.auth);
      if (mode && targets.some(target => target.projectRoot === null)) {
        return { status: 400, body: { error: 'On use is available for individual project brains.' } };
      }
      const results = [];
      for (const target of targets) {
        results.push(await updateSelectedPluginActivation(req.params.id, enabled, mode, target));
      }
      return { status: 200, body: { success: results.every(result => result.success), results } };
    });
    activationTail = change.catch(() => {});
    const { status, body } = await change;
    res.status(status).json(body);
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

function reportedCleanup(result) {
  if (!result.cleanup) return undefined;
  const { ok, state } = result.cleanup;
  return { ok, state, ...(ok ? {} : { error: 'The plugin is off, but cleanup did not finish. Retry cleanup.' }) };
}

async function updateSelectedPluginActivation(id, enabled, mode, { brainId, name, projectRoot }) {
  const identity = { brainId, name };
  const failure = error => ({ ...identity, success: false, error });
  try {
    const plugin = getPluginById(id, projectRoot);
    if (!plugin?.valid) return failure('Plugin is unavailable in this brain.');
    if ((enabled === false || mode === 'on-use') && REQUIRED_INSTALLATION_PLUGIN_IDS.includes(id)) {
      return failure('Required plugins cannot be disabled.');
    }
    const result = mode === 'use'
      ? await activatePluginOnUse(id, { projectRoot })
      : await setPluginActive(id, mode ?? enabled, { projectRoot, scope: projectRoot === null ? 'shared' : 'project' });
    if (!result) {
      const activation = pluginActivation(plugin, { projectRoot });
      return activation.enabled ? { ...identity, success: true, activation } : failure('This plugin is not set to open on use.');
    }
    if (mode === 'use' && !result.activation.enabled) return failure('The plugin was switched off before it could open.');
    const cleanup = reportedCleanup(result);
    const error = cleanup?.error || (result.compilation.ok ? undefined : 'Activation was saved, but the workspace could not be rebuilt.');
    return { ...identity, success: !error, activation: result.activation, cleanup, error };
  } catch {
    return failure('Could not complete activation in this brain.');
  }
}

router.post('/api/plugins/:id/credentials', requireAuth, requireScope('config:write'), async (req, res) => {
  let target;
  try { target = surfaceTarget(req, req.query.brain); }
  catch (error) { return res.status(error.status || 400).json({ error: 'Could not select the credential workspace.' }); }
  try {
    const plugin = getPluginById(req.params.id, target.projectRoot);
    if (!plugin) return res.status(404).json({ error: 'Plugin not installed' });
    const { key, value } = req.body || {};
    if (typeof key !== 'string' || typeof value !== 'string' || value.length > 16384 || !plugin.manifest.secrets?.some(secret => secret.key === key)) return badRequest(res, 'Invalid declared credential');
    const { loadPluginModule } = await import('../../core/plugin-runtime.mjs');
    const owner = await loadPluginModule(plugin.id, 'credentials', { projectRoot: target.projectRoot });
    const result = await owner.saveCredential({ key, value, configuration: readPluginRecord(plugin)?.configuration || {}, brainDir: process.env.TR_SECRETS_BRAIN || globalBrainDir || BRAIN_DIR });
    res.json(result);
  } catch (error) {
    // Never return provider bodies or errors which could contain credential values.
    res.status(400).json({ error: 'Credential could not be verified and saved. Check the connection settings and credential.' });
  }
});

router.get('/api/plugins/:id/configuration', requireAuth, requireScope('config:read'), (req, res) => {
  try {
    const plugin = getPluginById(req.params.id, projectRoot());
    if (!plugin?.valid) return res.status(404).json({ error: 'Plugin unavailable' });
    res.json({ fields: plugin.manifest.configuration?.fields || [], values: readPluginRecord(plugin)?.configuration || {} });
  } catch (err) { serverError(res, err); }
});

router.put('/api/plugins/:id/configuration', requireAuth, requireScope('config:write'), async (req, res) => {
  try {
    const plugin = getPluginById(req.params.id, projectRoot());
    if (!plugin?.valid) return res.status(404).json({ error: 'Plugin unavailable' });
    const values = configurationValues(plugin.manifest.configuration || { fields: [] }, req.body?.values);
    await patchPluginRecord(plugin, { configuration: values });
    await emit(vaultFor(plugin), plugin.id, 'configured', { fields: Object.keys(values) });
    res.json({ values });
  } catch (err) { badRequest(res, err.message); }
});

/** Serve only modules declared by an installed plugin's UI manifest. */
router.get('/api/plugins/:id/ui/:element', requireAuth, requireScope('config:read'), (req, res) => {
  try {
    const target = surfaceTarget(req, req.query.brain);
    const plugin = getPluginById(req.params.id, target.projectRoot);
    if (!plugin?.valid || (req.query.brain !== undefined && !pluginActivation(plugin, target).enabled)) {
      return res.status(404).json({ error: 'Plugin unavailable' });
    }
    const element = plugin.manifest?.ui?.elements?.find((item) => item.id === req.params.element);
    if (!element) return res.status(404).json({ error: 'UI element unavailable' });
    const root = fs.realpathSync(plugin.dir);
    const file = fs.realpathSync(path.resolve(root, element.module));
    if (!file.startsWith(root + path.sep)) return res.status(400).json({ error: 'Invalid UI module path' });
    res.type('text/javascript').set('X-Content-Type-Options', 'nosniff').send(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if ([400, 403, 404, 409, 503].includes(err.status)) return res.status(err.status).json({ error: err.message });
    serverError(res, err);
  }
});

/** Serve only the logo a plugin declares in branding.logo, never an arbitrary file. */
router.get('/api/plugins/:id/logo', requireAuth, requireScope('config:read'), (req, res) => {
  try {
    const plugin = getPluginById(req.params.id, projectRoot());
    const logo = plugin?.valid ? plugin.manifest?.branding?.logo : undefined;
    if (typeof logo !== 'string') return res.status(404).json({ error: 'Logo unavailable' });
    const root = fs.realpathSync(plugin.dir);
    const file = fs.realpathSync(path.resolve(root, logo));
    if (!file.startsWith(root + path.sep)) return res.status(400).json({ error: 'Invalid logo path' });
    const svg = file.endsWith('.svg');
    if (!svg && !file.endsWith('.png')) return res.status(400).json({ error: 'Invalid logo type' });
    res.type(svg ? 'image/svg+xml' : 'image/png')
      .set('X-Content-Type-Options', 'nosniff')
      .set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      .set('Cache-Control', 'private, max-age=300')
      .send(fs.readFileSync(file));
  } catch (err) { serverError(res, err); }
});

/**
 * GET /api/plugins
 * Installed plugins (project + global): manifest facts, provenance, content
 * hash, sharing state and scheduled-task history. Nothing else.
 */
router.get("/api/plugins", requireAuth, requireScope("config:read"), (req, res) => {
  try {
    const selection = req.query.brain;
    if (selection !== undefined && typeof selection !== 'string') return badRequest(res, 'Use one comma-separated brain selector.');
    const plugins = selection === undefined
      ? listInstalledPlugins(projectRoot())
      : selectedPluginInventory(resolvePluginBrainTargets(selection.split(','), req.auth));
    res.json({ success: true, count: plugins.length, plugins });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    serverError(res, err);
  }
});

function selectedPluginInventory(targets) {
  const descriptions = new Map();
  const serving = new Map(discoverPlugins(projectRoot()).map(plugin => [plugin.id, plugin]));
  const catalogs = targets.map(target => new Map(
    listInstalledPlugins(target.projectRoot, { descriptions }).map(plugin => [plugin.id, plugin]),
  ));
  const ids = new Set(catalogs.flatMap(catalog => [...catalog.keys()]));
  return [...ids].map(id => {
    const entries = catalogs.map(catalog => catalog.get(id));
    const representative = entries.find(plugin => plugin?.valid) || entries.find(Boolean);
    const activationByBrain = entries.map((plugin, index) => {
      const { brainId, name } = targets[index];
      const state = !plugin ? 'unavailable' : !plugin.valid ? 'error' : (plugin.activation?.state || 'error');
      const mode = state === 'inactive' && plugin.activation?.mode;
      return { brainId, name, state, enabled: state === 'active', required: !!plugin?.activation?.required, ...(mode ? { mode } : {}) };
    });
    const first = activationByBrain[0];
    const state = activationByBrain.every(item => item.state === first.state && item.mode === first.mode) ? first.state : 'mixed';
    const activation = { state, enabled: state === 'active', required: activationByBrain.some(item => item.required),
      ...(state !== 'mixed' && first.mode ? { mode: first.mode } : {}) };
    return { ...representative, activation, activationByBrain,
      servingAvailable: Boolean(serving.get(id) && serving.get(id).dir === representative.dir) };
  });
}

/**
 * GET /api/plugins/available
 * Plugins bundled with this Total Recall package, installable on any node.
 */
router.get("/api/plugins/available", requireAuth, requireScope("config:read"), (_req, res) => {
  try {
    res.json({ success: true, plugins: listAvailableBundled(projectRoot()) });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/plugins/peers
 * Plugins shared by each mesh peer, queried live. Per-peer status is reported
 * exactly as observed (ok, offline, unreachable, not_configured, unsupported, error).
 */
router.get("/api/plugins/peers", requireAuth, requireScope("config:read"), async (_req, res) => {
  try {
    const result = await listPeerPlugins();
    const installed = new Map(listInstalledPlugins(projectRoot()).map((p) => [p.id, p]));
    for (const peer of result.peers) {
      for (const p of peer.plugins) {
        const local = installed.get(p.id);
        p.installed = !!local;
        p.same_as_installed = !!local && local.sha256 === p.sha256;
      }
    }
    res.json({ success: true, ...result });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/plugins/install
 * body: { source: "<bundled id>" | "<share link>" | "peer:<host>/<id>" | "<git url>" | "<path>", link?, global? }
 */
router.post("/api/plugins/install", requireAuth, requireScope("config:write"), async (req, res) => {
  try {
    const { source, link = false, global: isGlobal = false } = req.body || {};
    if (!source || typeof source !== "string") {
      return badRequest(res, "Missing plugin source (bundled id, share link, peer:<host>/<id>, git URL, or path)");
    }
    const result = await installPlugin(source, { projectRoot: projectRoot(), link: !!link, global: !!isGlobal });
    if (result.compilation?.ok === false) {
      return res.status(500).json({ success: false, installed: true, ...result,
        message: `Plugin installed, but inventory/surface compilation failed: ${result.compilation.error}. Run total-recall compile.` });
    }
    res.json({
      success: true,
      message: `Installed ${result.plugin.name} ${result.plugin.version} (${result.source.kind})`,
      ...result
    });
  } catch (err) {
    badRequest(res, err.message);
  }
});

/**
 * POST /api/plugins/:id/share  body: { shared: boolean }
 * Offer (or stop offering) an installed plugin by direct link and mesh.
 */
router.post("/api/plugins/:id/share", requireAuth, requireScope("config:write"), async (req, res) => {
  try {
    const shared = req.body?.shared;
    if (typeof shared !== "boolean") return badRequest(res, "Body must include shared: true|false");
    const plugin = await setPluginShared(req.params.id, shared, { projectRoot: projectRoot() });
    res.json({ success: true, plugin });
  } catch (err) {
    badRequest(res, err.message);
  }
});

/**
 * POST /api/plugins/:id/branding  body: { icon?, color?, badge? }
 * Updates branding and icon for the plugin. Fails if plugin is locked.
 */
router.post("/api/plugins/:id/branding", requireAuth, requireScope("config:write"), async (req, res) => {
  try {
    const branding = req.body?.branding || req.body || {};
    const plugin = await setPluginBranding(req.params.id, branding, { projectRoot: projectRoot() });
    res.json({ success: true, plugin });
  } catch (err) {
    badRequest(res, err.message);
  }
});

/**
 * POST /api/plugins/:id/lock  body: { locked: boolean }
 * Lock or unlock editing for a completed plugin.
 */
router.post("/api/plugins/:id/lock", requireAuth, requireScope("config:write"), async (req, res) => {
  try {
    const locked = req.body?.locked;
    if (typeof locked !== "boolean") return badRequest(res, "Body must include locked: true|false");
    const plugin = await setPluginLocked(req.params.id, locked, { projectRoot: projectRoot() });
    res.json({ success: true, plugin, message: locked ? `Plugin ${req.params.id} is locked` : `Plugin ${req.params.id} is unlocked` });
  } catch (err) {
    badRequest(res, err.message);
  }
});

/**
 * POST /api/plugins/:id/deploy-store  body: { autoLock?: boolean }
 * Deploys the plugin to the plugin store and optionally locks it upon completion.
 */
router.post("/api/plugins/:id/deploy-store", requireAuth, requireScope("config:write"), async (req, res) => {
  try {
    const { autoLock = true } = req.body || {};
    const plugin = await deployPluginToStore(req.params.id, { projectRoot: projectRoot(), autoLock: !!autoLock });
    res.json({
      success: true,
      message: `Plugin ${plugin.name} deployed to the plugin store`,
      plugin
    });
  } catch (err) {
    badRequest(res, err.message);
  }
});

/**
 * DELETE /api/plugins/:id[?global=true]
 */
router.delete("/api/plugins/:id", requireAuth, requireScope("config:write"), async (req, res) => {
  try {
    const result = await uninstallPlugin(req.params.id, {
      projectRoot: projectRoot(),
      global: req.query?.global === "true" ? true : undefined
    });
    if (result.compilation?.ok === false) {
      return res.status(500).json({ success: false, removed: true, ...result,
        message: `Plugin removed, but inventory/surface compilation failed: ${result.compilation.error}. Run total-recall compile.` });
    }
    res.json({ success: true, message: `Plugin ${result.id} removed`, ...result });
  } catch (err) {
    badRequest(res, err.message);
  }
});

/**
 * GET /api/plugins/:id
 */
router.get("/api/plugins/:id", requireAuth, requireScope("config:read"), (req, res) => {
  try {
    const plugin = getPluginById(req.params.id, projectRoot());
    if (!plugin) return res.status(404).json({ success: false, error: `Plugin ${req.params.id} not found` });
    res.json({ success: true, plugin: { ...describePlugin(plugin, projectRoot()), manifest: plugin.manifest } });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/plugins/:id/run  body: { subcommand?, args? }
 * Runs the plugin's CLI handler in a child process. Executing plugin code is a
 * write-level action unless the installed manifest explicitly declares the
 * exact operation read-only. Alternate execution and credential input remain
 * write-level regardless of that declaration.
 */
router.post("/api/plugins/:id/run", requireAuth, (req, res, next) => {
  const { subcommand, args = [], stdin, execution, brainId } = req.body || {};
  try {
    const target = surfaceTarget(req, brainId);
    const plugin = getPluginById(req.params.id, target.projectRoot);
    if (brainId !== undefined && execution) {
      return res.status(400).json({ success: false, error: 'Use the selected brain with local plugin execution.' });
    }
    if (brainId !== undefined && ['on', 'off'].includes(subcommand || args?.[0])) {
      return res.status(400).json({ success: false, error: 'Use the selected brain activation control.' });
    }
    const declared = plugin?.valid ? plugin.manifest?.cli?.subcommands || [] : [];
    const operation = declared.find(item => item.name === subcommand);
    const activation = ['on', 'off'].includes(subcommand) && Array.isArray(args) && !args.length && stdin === undefined && !execution;
    const browserBlocked = item => item.sensitive_output === true || item.terminal_only === true;
    if (operation ? browserBlocked(operation) : !activation && declared.some(browserBlocked)) {
      return res.status(403).json({ success: false, error: 'Use the owning CLI or account controls for this operation.' });
    }
    const terminalFlags = new Set((operation ? [operation] : declared).flatMap(item => item.terminal_only_args ?? []));
    if (Array.isArray(args) && args.some(arg => typeof arg === 'string' && terminalFlags.has(arg.split('=', 1)[0]))) {
      return res.status(403).json({ success: false, error: 'Use the owning CLI for terminal-only arguments.' });
    }
    res.locals.executionPlugin = plugin;
    res.locals.executionTarget = target;
    const read = typeof subcommand === 'string' && Array.isArray(args) && args.every(arg => typeof arg === 'string') &&
      operation?.effect === 'read' && stdin === undefined && !execution &&
      !operation.args?.some(arg => arg.secret);
    return requireScope(read ? 'config:read' : 'config:write')(req, res, next);
  } catch (error) {
    if ([400, 403, 404, 409, 503].includes(error.status)) return res.status(error.status).json({ error: error.message });
    badRequest(res, error.message);
  }
}, async (req, res) => {
  try {
    const { subcommand = "", args = [], stdin, execution } = req.body || {};
    if (typeof subcommand !== "string" || !Array.isArray(args) || args.some((a) => typeof a !== "string")) {
      return badRequest(res, "subcommand must be a string and args an array of strings");
    }
    const plugin = res.locals.executionPlugin;
    const target = res.locals.executionTarget;
    const cwd = target.projectRoot ?? target.brainDir;
    if (!plugin) return res.status(404).json({ success: false, error: `Plugin ${req.params.id} not found` });
    if (!plugin.valid) return badRequest(res, `Plugin ${plugin.id} has an invalid manifest: ${plugin.errors.join("; ")}`);
    if (!plugin.manifest?.cli?.handler) return badRequest(res, `Plugin ${plugin.id} does not declare a CLI handler`);
    if (req.body?.brainId !== undefined && !pluginActivation(plugin, target).enabled) {
      return res.status(403).json({ success: false, error: 'Plugin is off in the selected brain.' });
    }
    validatePluginSecretInput(plugin, subcommand, stdin);

    if (execution) {
      if (stdin !== undefined) return badRequest(res, 'Credential operations require direct local execution');
      if (!pluginActivation(plugin, target).enabled && !['on', 'off', 'status', 'health', 'jobs', '--help', 'help'].includes(subcommand)) return badRequest(res, `Plugin ${plugin.id} is inactive`);
      const { loadPluginModule } = await import('../../core/plugin-runtime.mjs');
      const owner = await loadPluginModule('meta-harness', 'command-executor', { activeRequired: true, projectRoot: target.projectRoot });
      const result = await owner.executeCommand({ plugin, subcommand, args, execution, projectRoot: cwd });
      return res.json({ success: result.ok, pluginId: plugin.id, ...result });
    }

    const result = await runPluginCommand(plugin, { subcommand, args, ...(stdin !== undefined ? { stdinText: stdin } : {}), cwd, projectRoot: target.projectRoot, secretsBrainDir: process.env.TR_SECRETS_BRAIN || globalBrainDir || BRAIN_DIR, maxOutputBytes: 4 * 1024 * 1024 });
    res.json({ success: result.ok, pluginId: plugin.id, ...result });
  } catch (err) {
    badRequest(res, err.message);
  }
});

/**
 * GET /api/plugins/:id/readme
 */
router.get("/api/plugins/:id/readme", requireAuth, requireScope("config:read"), (req, res) => {
  try {
    const plugin = getPluginById(req.params.id, projectRoot());
    if (!plugin) return res.status(404).json({ success: false, error: `Plugin ${req.params.id} not found` });

    let readme = `# ${plugin.manifest?.name || plugin.id}\n\n${plugin.manifest?.description || ""}`;
    for (const name of ["README.md", "readme.md"]) {
      const candidate = path.join(plugin.dir, name);
      if (fs.existsSync(candidate)) {
        readme = fs.readFileSync(candidate, "utf8");
        break;
      }
    }
    res.json({ success: true, pluginId: plugin.id, readme });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/plugins/:id/reviews
 * Returns all plugin_review documents from the vault matching the given plugin_id.
 * Optional ?min_rating=3 query param to filter.
 */
router.get("/api/plugins/:id/reviews", requireAuth, requireScope("config:read"), (req, res) => {
  try {
    const pluginId = req.params.id;
    const minRating = req.query?.min_rating ? parseInt(req.query.min_rating, 10) : 0;
    const reviewsDir = path.join(VAULT_DIR, "reviews");

    let reviews = [];
    if (fs.existsSync(reviewsDir)) {
      const files = walkMd(reviewsDir);
      for (const file of files) {
        try {
          const raw = fs.readFileSync(file, "utf8");
          const { data, content } = matter(raw);
          if (data.type === "plugin_review" && data.plugin_id === pluginId) {
            if (typeof data.rating === "number" && data.rating >= minRating) {
              reviews.push({
                ...data,
                content: content.trim(),
                _file: path.basename(file),
              });
            }
          }
        } catch {
          // skip unparseable review files
        }
      }
    }

    res.json({
      success: true,
      pluginId,
      count: reviews.length,
      averageRating: reviews.length > 0
        ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
        : null,
      reviews,
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/plugins/:id/reviews
 * Creates a new plugin_review SSSS document. Requires:
 *   { rating: 1-5, text: string, reviewer_node?: string, verified_conformance?: boolean }
 */
router.post("/api/plugins/:id/reviews", requireAuth, requireScope("config:write"), async (req, res) => {
  try {
    const pluginId = req.params.id;
    const { rating, text, reviewer_node, verified_conformance } = req.body || {};

    // Validate rating
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return badRequest(res, "rating must be an integer between 1 and 5");
    }
    if (!text || typeof text !== "string" || text.trim().length < 10) {
      return badRequest(res, "text review must be at least 10 characters");
    }

    const nodeId = reviewer_node || "unknown";
    const slug = `review-${pluginId}-${nodeId}-${Date.now()}`;
    const now = new Date().toISOString();

    const reviewNode = {
      type: "plugin_review",
      slug,
      title: `Review for ${pluginId}`,
      description: `Peer audit review and usability assessment for ${pluginId}`,
      timestamp: now,
      plugin_id: pluginId,
      rating,
      reviewer_node: nodeId,
      verified_conformance: !!verified_conformance,
      portability: "structural",
      tags: ["plugin", "review", pluginId],
      body: text.trim(),
    };

    const vaultResult = await writeNodeValidatedAsync(reviewNode, VAULT_DIR);
    if (!vaultResult.success) {
      return badRequest(res, `Review validation failed: ${(vaultResult.validation?.errors || [vaultResult.error]).join("; ")}`);
    }

    res.status(201).json({ success: true, pluginId, review: sanitizeNode(reviewNode) });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/plugins/:id/conformance
 * Returns conformance metadata for a plugin: SSSS version compliance,
 * test pass rate, and white-label verification flags.
 *
 * Data is sourced from the plugin manifest's _testResults, _conformance, etc.
 */
router.get("/api/plugins/:id/conformance", requireAuth, requireScope("config:read"), (req, res) => {
  try {
    const plugin = getPluginById(req.params.id, projectRoot());
    if (!plugin) return res.status(404).json({ success: false, error: `Plugin ${req.params.id} not found` });

    const manifest = plugin.manifest || {};
    const conformanceMeta = manifest._conformance || {};
    const testResults = manifest._testResults || {};

    // Derive conformance from manifest or reasonable defaults
    const result = {
      pluginId: plugin.id,
      ssss_version: conformanceMeta.ssss_version || "v2",
      ssss_conformant: conformanceMeta.ssss_conformant !== false,
      white_label_verified: conformanceMeta.white_label_verified === true,
      tested: testResults.tested === true,
      test_count: typeof testResults.test_count === 'number' ? testResults.test_count : 0,
      test_pass_count: typeof testResults.test_pass_count === 'number' ? testResults.test_pass_count : 0,
      test_pass_rate: testResults.test_count > 0
        ? Math.round((testResults.test_pass_count / testResults.test_count) * 100)
        : null,
      capabilities: manifest.capabilities || [],
      portability: conformanceMeta.portability || "structural",
    };

    res.json({ success: true, ...result });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
