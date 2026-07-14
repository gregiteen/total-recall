import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAuth, requireScope, sandboxRateLimiter, requireSandboxEnabled } from '../auth.mjs';
import { serverError, ROOT, BRAIN_DIR, VAULT_DIR, SKILLS_DIR, INSTRUCTIONS } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';
import { runInSandbox } from '../../core/sandbox.mjs';

const SCRIPTS_DIR = path.join(BRAIN_DIR, 'scripts');


const router = Router();

router.get("/api/scripts", requireAuth, requireScope("files:read"), (req, res) => {
  try {
    if (!fs.existsSync(SCRIPTS_DIR)) {
      fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
    }
    const files = fs.readdirSync(SCRIPTS_DIR).filter(file => 
      file.endsWith(".mjs") || file.endsWith(".js") || file.endsWith(".py") || file.endsWith(".sh")
    ).map(file => {
      try {
        const stats = fs.statSync(path.join(SCRIPTS_DIR, file));
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime
        };
      } catch (err) {
        return null;
      }
    }).filter(Boolean);
    res.json(files);
  } catch (err) {
    serverError(res, err);
  }
});

router.get("/api/scripts/:name", requireAuth, requireScope("files:read"), (req, res) => {
  try {
    const { name } = req.params;
    if (name.includes("..") || name.includes("/") || name.includes("\\")) {
      return res.status(400).json({ error: "Invalid script name" });
    }
    const scriptPath = path.join(SCRIPTS_DIR, name);
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: `Script "${name}" not found` });
    }
    const content = fs.readFileSync(scriptPath, "utf8");
    res.json({ name, content });
  } catch (err) {
    serverError(res, err);
  }
});

router.put("/api/scripts/:name", requireAuth, requireScope("files:write"), (req, res) => {
  try {
    const { name } = req.params;
    const { content } = req.body;
    if (name.includes("..") || name.includes("/") || name.includes("\\")) {
      return res.status(400).json({ error: "Invalid script name" });
    }
    if (typeof content !== "string") {
      return res.status(400).json({ error: "Missing or invalid `content` field." });
    }
    if (!fs.existsSync(SCRIPTS_DIR)) {
      fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
    }
    const scriptPath = path.join(SCRIPTS_DIR, name);
    fs.writeFileSync(scriptPath, content, "utf8");
    res.json({ success: true, message: `Script "${name}" saved successfully` });
  } catch (err) {
    serverError(res, err);
  }
});

router.post("/api/scripts/:name/run", sandboxRateLimiter(), requireAuth, requireScope("sandbox:run"), requireSandboxEnabled, async (req, res) => {
  try {
    const { name } = req.params;
    if (name.includes("..") || name.includes("/") || name.includes("\\")) {
      return res.status(400).json({ error: "Invalid script name" });
    }
    const scriptPath = path.join(SCRIPTS_DIR, name);
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: `Script "${name}" not found` });
    }

    const isNodeScript = name.endsWith(".js") || name.endsWith(".mjs") || name.endsWith(".cjs");
    if (!isNodeScript) {
      return res.status(400).json({
        error: "Only Node.js scripts can be run through the sandbox endpoint."
      });
    }

    const result = await runInSandbox(scriptPath, 10000, {
      allowNetwork: req.body?.allowNetwork === true
    });
    res.json({
      success: result.success,
      output: result.output || "(no output)",
      exitCode: result.code ?? null,
      signal: result.signal ?? null
    });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
