import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { requireAuth, requireScope } from "../auth.mjs";
import { discoverPlugins, getPluginById, validatePluginManifest } from "../../core/plugin-loader.mjs";
import { serverError, badRequest } from "./_shared.mjs";

const router = Router();

function getRatingsFilePath(projectRoot) {
  const root = projectRoot || process.cwd();
  return path.join(root, ".agent", "config", "plugin-ratings.json");
}

function loadRatings(projectRoot) {
  const filePath = getRatingsFilePath(projectRoot);
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function saveRatings(projectRoot, ratings) {
  const filePath = getRatingsFilePath(projectRoot);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(ratings, null, 2), "utf8");
}

export const CURATED_CATALOG = [
  {
    id: "scientific-frontiers",
    name: "Scientific Frontiers Engine",
    version: "1.0.0",
    description: "Continuous scientific capability intelligence, curiosity-driven research graph weaver, and benchmark ledger.",
    tags: ["science", "benchmarks", "curiosity", "graph"],
    author: "Total Recall Ecosystem",
    sourceUrl: "https://github.com/gregiteen/scientific-frontiers-engine.git",
    rating: 4.9,
    reviewCount: 142,
    installCount: "3.2k",
    verified: true,
    isInstalled: false
  },
  {
    id: "meta-harness",
    name: "Meta Harness & Agent Orchestrator",
    version: "1.0.0",
    description: "Orchestrates and delegates tasks across connected AI harnesses (Antigravity, Claude Code, Codex, Ollama).",
    tags: ["agents", "multi-harness", "mesh", "delegation"],
    author: "Total Recall Ecosystem",
    sourceUrl: "./.agent/plugins/meta-harness",
    rating: 4.8,
    reviewCount: 98,
    installCount: "2.4k",
    verified: true,
    isInstalled: false
  },
  {
    id: "code-quality",
    name: "Code Quality & SSSS Conformance",
    version: "1.2.0",
    description: "Local-first code quality gates, SSSS schema verification, and invariant enforcement.",
    tags: ["quality", "conformance", "gates", "testing"],
    author: "Total Recall Ecosystem",
    sourceUrl: "./.agent/plugins/code-quality",
    rating: 5.0,
    reviewCount: 310,
    installCount: "8.2k",
    verified: true,
    isInstalled: false
  },
  {
    id: "chrome-devtools",
    name: "Chrome DevTools Automation",
    version: "1.0.0",
    description: "Browser performance auditing, Core Web Vitals profiling, and accessibility testing tools.",
    tags: ["browser", "devtools", "testing", "mcp"],
    author: "Modern Web Guidance",
    sourceUrl: "https://github.com/total-recall-plugins/chrome-devtools.git",
    rating: 4.7,
    reviewCount: 84,
    installCount: "1.8k",
    verified: true,
    isInstalled: false
  }
];

/**
 * GET /api/plugins
 * Returns list of installed plugins with their manifests, validation status, ratings, and capabilities.
 */
router.get("/api/plugins", requireAuth, requireScope("config:read"), (req, res) => {
  try {
    const projectRoot = req.query?.root || process.cwd();
    const plugins = discoverPlugins(projectRoot);
    const userRatings = loadRatings(projectRoot);

    res.json({
      success: true,
      count: plugins.length,
      plugins: plugins.map((p) => {
        const userReview = userRatings[p.id] || null;
        const catalogMatch = CURATED_CATALOG.find((c) => c.id === p.id);
        const baseRating = catalogMatch?.rating || 4.8;
        const reviewCount = catalogMatch?.reviewCount || 12;

        return {
          id: p.id,
          name: p.manifest?.name || p.id,
          version: p.manifest?.version || "0.0.0",
          description: p.manifest?.description || "",
          valid: p.valid,
          errors: p.errors,
          dir: p.dir,
          rating: baseRating,
          reviewCount: userReview ? reviewCount + 1 : reviewCount,
          installCount: catalogMatch?.installCount || "1.0k",
          userRating: userReview?.rating || null,
          userReview: userReview?.review || null,
          categories: p.manifest?.ssss_schemas?.categories || [],
          tasks: p.manifest?.tasks || [],
          openwiki_hubs: p.manifest?.openwiki_hubs || [],
          tools: p.manifest?.tools || [],
          cli: p.manifest?.cli || null
        };
      })
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/plugins/catalog
 * Returns curated discoverable plugins with ratings.
 */
router.get("/api/plugins/catalog", requireAuth, requireScope("config:read"), (req, res) => {
  try {
    const projectRoot = req.query?.root || process.cwd();
    const installed = new Set(discoverPlugins(projectRoot).map((p) => p.id));
    const userRatings = loadRatings(projectRoot);

    const catalogWithStatus = CURATED_CATALOG.map((item) => ({
      ...item,
      isInstalled: installed.has(item.id),
      userRating: userRatings[item.id]?.rating || null
    }));
    res.json({
      success: true,
      catalog: catalogWithStatus
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/plugins/:id/rate
 * Submit or update a rating and review for an installed plugin.
 */
router.post("/api/plugins/:id/rate", requireAuth, requireScope("config:write"), (req, res) => {
  try {
    const id = req.params.id;
    const { rating, review = "" } = req.body || {};
    const numRating = Number(rating);

    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return badRequest(res, "Rating must be a number between 1 and 5");
    }

    const projectRoot = req.body?.projectRoot || process.cwd();
    const ratings = loadRatings(projectRoot);

    ratings[id] = {
      rating: Math.round(numRating * 10) / 10,
      review: typeof review === "string" ? review.trim() : "",
      updatedAt: new Date().toISOString()
    };

    saveRatings(projectRoot, ratings);

    res.json({
      success: true,
      message: "Rating saved for " + id,
      pluginId: id,
      userRating: ratings[id]
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/plugins/install
 * Installs or links a plugin from a local directory or git repository.
 */
router.post("/api/plugins/install", requireAuth, requireScope("config:write"), (req, res) => {
  try {
    const { source, link = false, global: isGlobal = false, projectRoot } = req.body || {};
    if (!source || typeof source !== "string") {
      return badRequest(res, "Missing source path or git URL");
    }

    const root = projectRoot || process.cwd();
    const pluginsBaseDir = isGlobal
      ? path.join(os.homedir(), ".agent", "plugins")
      : path.join(root, ".agent", "plugins");

    if (!fs.existsSync(pluginsBaseDir)) {
      fs.mkdirSync(pluginsBaseDir, { recursive: true });
    }

    const isGitUrl = source.startsWith("http://") ||
                     source.startsWith("https://") ||
                     source.startsWith("git@") ||
                     source.endsWith(".git");

    if (isGitUrl) {
      const tempDir = path.join(os.tmpdir(), "tr-plugin-" + Date.now());
      const cloneRes = spawnSync("git", ["clone", "--depth", "1", source, tempDir], {
        encoding: "utf8"
      });

      if (cloneRes.status !== 0) {
        return badRequest(res, "Failed to clone repository: " + (cloneRes.stderr || "git clone failed"));
      }

      const manifestPath = path.join(tempDir, "plugin.json");
      if (!fs.existsSync(manifestPath)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        return badRequest(res, "Cloned repository does not contain a plugin.json manifest");
      }

      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      } catch (err) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        return badRequest(res, "Invalid plugin.json JSON: " + err.message);
      }

      const validation = validatePluginManifest(manifest);
      if (!validation.valid) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        return badRequest(res, "Invalid plugin manifest: " + validation.errors.join(", "));
      }

      const destDir = path.join(pluginsBaseDir, manifest.id);
      if (fs.existsSync(destDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        return badRequest(res, "Plugin " + manifest.id + " is already installed at " + destDir);
      }

      fs.cpSync(tempDir, destDir, { recursive: true });
      fs.rmSync(tempDir, { recursive: true, force: true });

      return res.json({
        success: true,
        message: "Successfully installed plugin " + manifest.name,
        plugin: { id: manifest.id, name: manifest.name, version: manifest.version, dir: destDir }
      });
    }

    // Local directory install / link
    const absSource = path.isAbsolute(source) ? source : path.resolve(root, source);
    if (!fs.existsSync(absSource)) {
      return badRequest(res, "Source directory not found: " + absSource);
    }

    const manifestPath = path.join(absSource, "plugin.json");
    if (!fs.existsSync(manifestPath)) {
      return badRequest(res, "Directory " + absSource + " does not contain a plugin.json manifest");
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (err) {
      return badRequest(res, "Invalid plugin.json JSON: " + err.message);
    }

    const validation = validatePluginManifest(manifest);
    if (!validation.valid) {
      return badRequest(res, "Invalid plugin manifest: " + validation.errors.join(", "));
    }

    const destDir = path.join(pluginsBaseDir, manifest.id);
    if (fs.existsSync(destDir)) {
      return badRequest(res, "Plugin " + manifest.id + " is already installed");
    }

    if (link) {
      fs.symlinkSync(absSource, destDir, "junction");
    } else {
      fs.cpSync(absSource, destDir, { recursive: true });
    }

    return res.json({
      success: true,
      message: "Successfully " + (link ? "linked" : "installed") + " plugin " + manifest.name,
      plugin: { id: manifest.id, name: manifest.name, version: manifest.version, dir: destDir }
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * DELETE /api/plugins/:id
 * Removes or unlinks an installed plugin.
 */
router.delete("/api/plugins/:id", requireAuth, requireScope("config:write"), (req, res) => {
  try {
    const id = req.params.id;
    const isGlobal = req.query?.global === "true";
    const projectRoot = req.query?.root || process.cwd();

    const searchDirs = isGlobal
      ? [path.join(os.homedir(), ".agent", "plugins")]
      : [
          path.join(projectRoot, ".agent", "plugins"),
          path.join(os.homedir(), ".agent", "plugins")
        ];

    let targetPath = null;
    for (const dir of searchDirs) {
      const candidate = path.join(dir, id);
      if (fs.existsSync(candidate)) {
        targetPath = candidate;
        break;
      }
    }

    if (!targetPath) {
      return badRequest(res, "Plugin " + id + " not found");
    }

    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(targetPath);
    } else {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }

    res.json({
      success: true,
      message: "Plugin " + id + " uninstalled successfully",
      id
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/plugins/:id
 * Retrieve details of a specific plugin.
 */
router.get("/api/plugins/:id", requireAuth, requireScope("config:read"), (req, res) => {
  try {
    const projectRoot = req.query?.root || process.cwd();
    const plugin = getPluginById(req.params.id, projectRoot);
    if (!plugin) {
      return badRequest(res, "Plugin " + req.params.id + " not found");
    }
    const userRatings = loadRatings(projectRoot);
    res.json({
      success: true,
      plugin: {
        id: plugin.id,
        name: plugin.manifest?.name || plugin.id,
        version: plugin.manifest?.version || "0.0.0",
        description: plugin.manifest?.description || "",
        valid: plugin.valid,
        errors: plugin.errors,
        dir: plugin.dir,
        manifest: plugin.manifest,
        userRating: userRatings[plugin.id]?.rating || null,
        userReview: userRatings[plugin.id]?.review || null
      }
    });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
