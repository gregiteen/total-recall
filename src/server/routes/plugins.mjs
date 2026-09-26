import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { requireAuth, requireScope } from "../auth.mjs";
import { getPluginById } from "../../core/plugin-loader.mjs";
import {
  listInstalledPlugins,
  listAvailableBundled,
  describePlugin,
  installPlugin,
  uninstallPlugin,
  setPluginShared
} from "../../core/plugin-store.mjs";
import { listPeerPlugins } from "../../core/plugin-peers.mjs";
import { runPluginCommand } from "../../core/plugin-runner.mjs";
import { serverError, badRequest } from "./_shared.mjs";

const router = Router();

// Plugins always resolve against the server's own project. Routes used to take
// a caller-supplied `root`, which let a request point discovery — and the
// runner — at any directory on disk.
const projectRoot = () => process.cwd();

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

    const result = await runPluginCommand(plugin, { subcommand, args, cwd: projectRoot() });
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

export default router;
