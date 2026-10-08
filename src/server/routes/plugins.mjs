import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import matter from "../../core/frontmatter.mjs";
import { requireAuth, requireScope } from "../auth.mjs";
import { getPluginById } from "../../core/plugin-loader.mjs";
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
import { runPluginCommand } from "../../core/plugin-runner.mjs";
import { readPluginRecord, patchPluginRecord, emit, vaultFor } from '../../core/plugin-store.mjs';
import { configurationValues } from '../../core/plugin-contracts/configuration.mjs';
import { writeNodeValidatedAsync } from "../../core/validated-write.mjs";
import { walkMd } from "../../core/vault.mjs";
import { serverError, badRequest, VAULT_DIR, BRAIN_DIR, sanitizeNode } from "./_shared.mjs";

const router = Router();

// Plugins always resolve against the server's own project. Routes used to take
// a caller-supplied `root`, which let a request point discovery — and the
// runner — at any directory on disk.
const projectRoot = () => process.cwd();

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
    const plugin = getPluginById(req.params.id, projectRoot());
    if (!plugin?.valid) return res.status(404).json({ error: 'Plugin unavailable' });
    const element = plugin.manifest?.ui?.elements?.find((item) => item.id === req.params.element);
    if (!element) return res.status(404).json({ error: 'UI element unavailable' });
    const root = fs.realpathSync(plugin.dir);
    const file = fs.realpathSync(path.resolve(root, element.module));
    if (!file.startsWith(root + path.sep)) return res.status(400).json({ error: 'Invalid UI module path' });
    res.type('text/javascript').set('X-Content-Type-Options', 'nosniff').send(fs.readFileSync(file, 'utf8'));
  } catch (err) { serverError(res, err); }
});

/**
 * GET /api/plugins
 * Installed plugins (project + global): manifest facts, provenance, content
 * hash, sharing state and scheduled-task history. Nothing else.
 */
router.get("/api/plugins", requireAuth, requireScope("config:read"), (_req, res) => {
  try {
    const plugins = listInstalledPlugins(projectRoot());
    res.json({ success: true, count: plugins.length, plugins });
  } catch (err) {
    serverError(res, err);
  }
});

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
    res.json({ success: true, plugin: { ...describePlugin(plugin), manifest: plugin.manifest } });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/plugins/:id/run  body: { subcommand?, args? }
 * Runs the plugin's CLI handler in a child process. Executing plugin code is a
 * write-level action.
 */
router.post("/api/plugins/:id/run", requireAuth, requireScope("config:write"), async (req, res) => {
  try {
    const { subcommand = "", args = [] } = req.body || {};
    if (typeof subcommand !== "string" || !Array.isArray(args) || args.some((a) => typeof a !== "string")) {
      return badRequest(res, "subcommand must be a string and args an array of strings");
    }
    const plugin = getPluginById(req.params.id, projectRoot());
    if (!plugin) return res.status(404).json({ success: false, error: `Plugin ${req.params.id} not found` });
    if (!plugin.valid) return badRequest(res, `Plugin ${plugin.id} has an invalid manifest: ${plugin.errors.join("; ")}`);
    if (!plugin.manifest?.cli?.handler) return badRequest(res, `Plugin ${plugin.id} does not declare a CLI handler`);

    const result = await runPluginCommand(plugin, { subcommand, args, cwd: projectRoot(), secretsBrainDir: process.env.TR_SECRETS_BRAIN || BRAIN_DIR });
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
