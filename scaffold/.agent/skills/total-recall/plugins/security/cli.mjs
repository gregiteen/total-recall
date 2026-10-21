#!/usr/bin/env node
/**
 * Total Recall Standalone Security Plugin CLI
 * Complete Website & System Defensive Suite:
 * - Proof-of-Work Challenges (PoW) & Bot Mitigation
 * - Content Security Policy (CSP) & HTTP Security Headers
 * - Website Security Audit & Scorecard (A+ to F)
 * - Anti-CSRF & Sliding Window Rate Limiting
 * - Plugin Fleet Hardening & File Permissions (0600)
 * - Static Analysis (SAST) & AES-256-GCM Envelope Encryption
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { auditMachine, auditFleet, hardenSshPermissions, loadOwner, runCheck } from "./src/machines.mjs";
import { assessDevice, platformInventory } from './src/devices.mjs';
import { auditAndroid } from './src/android.mjs';
import { scanSource } from "./src/scanner.mjs";

const TOKEN_KEY = "SECURITY_MASTER_KEY";
const CHALLENGE_KEY = "CHALLENGE_SECRET_KEY";

async function resolveSecret(key) {
  const owner = await loadOwner('auth', 'secrets-store');
  const result = await owner.getSecret(process.env.TR_SECRETS_BRAIN || owner.defaultBrainDir(), key, { actor: 'security-plugin', action: 'use' });
  return result.found ? result.value : null;
}
async function requiredSecret(key) {
  const value = await resolveSecret(key);
  if (typeof value !== 'string' || Buffer.byteLength(value) < 32) throw new Error(`${key} requires at least 32 bytes in the auth plugin`);
  return value;
}
function equalSignature(left, right) {
  if (typeof left !== 'string' || !/^[a-f0-9]{64}$/.test(left)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

async function readStdin(limit = 1048576) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) { bytes += chunk.length; if (bytes > limit) throw new Error('Input exceeds limit'); chunks.push(chunk); }
  return Buffer.concat(chunks).toString("utf8").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CRYPTO & ENVELOPE ENCRYPTION (AES-256-GCM)
// ─────────────────────────────────────────────────────────────────────────────

function encryptText(text, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    cipher: "aes-256-gcm",
    kdf: "scrypt",
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: encrypted.toString("hex"),
    encoded: `trsec:v1:${salt.toString("hex")}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
  };
}

function decryptText(payload, passphrase) {
  let saltHex, ivHex, tagHex, dataHex;
  if (typeof payload === "string" && payload.startsWith("trsec:v1:")) {
    const parts = payload.split(":");
    saltHex = parts[2];
    ivHex = parts[3];
    tagHex = parts[4];
    dataHex = parts[5];
  } else if (typeof payload === "object") {
    saltHex = payload.salt;
    ivHex = payload.iv;
    tagHex = payload.tag;
    dataHex = payload.ciphertext;
  } else {
    throw new Error("Invalid encrypted payload format");
  }

  const salt = Buffer.from(saltHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(dataHex, "hex");

  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PROOF-OF-WORK (PoW) CHALLENGE & CAPTCHA ENGINE
// ─────────────────────────────────────────────────────────────────────────────



async function createPowChallenge(difficulty = 3) {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 6) throw new Error("Difficulty must be an integer between 1 and 6");
  const salt = crypto.randomBytes(12).toString("hex");
  const expires = Date.now() + 5 * 60 * 1000; // 5 min TTL
  const payload = `${salt}:${difficulty}:${expires}`;
  const signature = crypto.createHmac("sha256", await requiredSecret(TOKEN_KEY)).update(payload).digest("hex");
  return {
    algorithm: "SHA-256",
    difficulty,
    salt,
    expires,
    signature,
    prefix: "0".repeat(difficulty)
  };
}

async function verifyPowChallenge(salt, difficulty, expires, signature, nonce) {
  if (!Number.isInteger(Number(difficulty)) || Number(difficulty) < 1 || Number(difficulty) > 6 || !Number.isFinite(Number(expires)) || Number(expires) > Date.now() + 300000) return { valid: false, error: "Invalid challenge parameters" };
  if (Date.now() > Number(expires)) {
    return { valid: false, error: "Challenge expired" };
  }
  const payload = `${salt}:${difficulty}:${expires}`;
  const expectedSig = crypto.createHmac("sha256", await requiredSecret(TOKEN_KEY)).update(payload).digest("hex");
  if (!equalSignature(signature, expectedSig)) {
    return { valid: false, error: "Invalid challenge signature or tampered parameters" };
  }
  const hash = crypto.createHash("sha256").update(`${salt}:${nonce}`).digest("hex");
  const requiredPrefix = "0".repeat(Number(difficulty));
  if (!hash.startsWith(requiredPrefix)) {
    return { valid: false, error: `Proof-of-work hash does not meet difficulty prefix '${requiredPrefix}'` };
  }
  return { valid: true, hash };
}

function solvePowChallenge(salt, difficulty) {
  const prefix = "0".repeat(Number(difficulty));
  let nonce = 0;
  while (nonce < 10000000) {
    const hash = crypto.createHash("sha256").update(`${salt}:${nonce}`).digest("hex");
    if (hash.startsWith(prefix)) return { nonce, hash };
    nonce++;
  }
  return { nonce: null, hash: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. BOT MITIGATION & HONEYPOT ANALYZER
// ─────────────────────────────────────────────────────────────────────────────

async function evaluateBotRisk({ honeypot = "", elapsedMs = 1500, token = null } = {}) {
  const signals = [];
  let score = 0; // 0 = Human, 100 = Definitely Bot

  // 1. Honeypot check
  if (honeypot && honeypot.trim().length > 0) {
    score += 80;
    signals.push("Honeypot tripwire field populated");
  }

  // 2. Velocity check (< 400ms is inhumanly fast for form completion)
  if (elapsedMs < 400) {
    score += 50;
    signals.push(`Rapid submission velocity (${elapsedMs}ms < 400ms threshold)`);
  } else if (elapsedMs < 800) {
    score += 25;
    signals.push(`Fast submission velocity (${elapsedMs}ms)`);
  }

  // 3. Remote token verification (e.g. Turnstile or Captcha)
  if (token) {
    const secret = await requiredSecret(CHALLENGE_KEY);
    if (secret) {
      try {
        const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret, response: token }),
          signal: AbortSignal.timeout(3000)
        });
        const vData = await verifyRes.json();
        if (vData.success) {
          score = Math.max(0, score - 60);
          signals.push("Remote challenge verification passed");
        } else {
          score += 60;
          signals.push(`Remote challenge rejected: ${(vData["error-codes"] || []).join(", ")}`);
        }
      } catch (err) {
        score += 70;
        signals.push("Remote challenge verification unavailable; fail closed");
      }
    } else {
      signals.push("CHALLENGE_SECRET_KEY not set; using local behavioral evaluation");
    }
  }

  const recommendation = score >= 70 ? "block" : score >= 30 ? "challenge" : "allow";
  return {
    risk_score: Math.min(100, score),
    recommendation,
    signals
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ANTI-CSRF & RATE LIMITING
// ─────────────────────────────────────────────────────────────────────────────

async function generateCsrfToken(sessionId) {
  if (typeof sessionId !== "string" || !sessionId) throw new Error("Authenticated session ID required");
  const timestamp = Date.now();
  const raw = `${sessionId}:${timestamp}`;
  const sig = crypto.createHmac("sha256", await requiredSecret(TOKEN_KEY)).update(raw).digest("hex");
  return `${timestamp}:${sig}`;
}

async function verifyCsrfToken(token, sessionId, ttlMs = 3600000) {
  if (typeof sessionId !== "string" || !sessionId) return false;
  if (!token || !token.includes(":")) return false;
  const [timestampStr, sig] = token.split(":");
  const timestamp = Number(timestampStr);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() || Date.now() - timestamp > ttlMs) return false;
  const raw = `${sessionId}:${timestamp}`;
  const expectedSig = crypto.createHmac("sha256", await requiredSecret(TOKEN_KEY)).update(raw).digest("hex");
  return equalSignature(sig, expectedSig);
}

const rateLimitBuckets = new Map();

function checkRateLimit(ipOrKey, { maxRequests = 60, windowMs = 60000 } = {}) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ipOrKey) || [];
  const valid = bucket.filter((t) => now - t < windowMs);
  if (valid.length >= maxRequests) {
    return { allowed: false, remaining: 0, resetInMs: windowMs - (now - valid[0]) };
  }
  valid.push(now);
  rateLimitBuckets.set(ipOrKey, valid);
  return { allowed: true, remaining: maxRequests - valid.length, resetInMs: windowMs };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. WEBSITE SECURITY AUDITOR & SCORECARD (A+ to F)
// ─────────────────────────────────────────────────────────────────────────────

async function auditWebsiteUrl(targetUrl) {
  const checks = [];
  let score = 100;
  let headers = {};

  try {
    const url = new URL(targetUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("HTTPS without embedded credentials is required");
    const res = await fetch(url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("Website returned unsuccessful HTTP status");
    headers = Object.fromEntries(res.headers.entries());

    // 1. Content-Security-Policy
    const csp = headers["content-security-policy"];
    if (csp) {
      checks.push({ name: "Content-Security-Policy", status: "PASS", detail: "Configured and enforced" });
    } else {
      score -= 25;
      checks.push({ name: "Content-Security-Policy", status: "FAIL", detail: "Missing CSP header; vulnerable to XSS and injection" });
    }

    // 2. Strict-Transport-Security (HSTS)
    const hsts = headers["strict-transport-security"];
    if (hsts) {
      checks.push({ name: "Strict-Transport-Security", status: "PASS", detail: "HSTS header active" });
    } else {
      score -= 20;
      checks.push({ name: "Strict-Transport-Security", status: "FAIL", detail: "Missing HSTS; downgrade attacks possible" });
    }

    // 3. X-Content-Type-Options
    const xcto = headers["x-content-type-options"];
    if (xcto === "nosniff") {
      checks.push({ name: "X-Content-Type-Options", status: "PASS", detail: "nosniff enforced" });
    } else {
      score -= 15;
      checks.push({ name: "X-Content-Type-Options", status: "FAIL", detail: "Missing or invalid nosniff header" });
    }

    // 4. X-Frame-Options
    const xfo = headers["x-frame-options"];
    if (xfo && (xfo.toUpperCase() === "DENY" || xfo.toUpperCase() === "SAMEORIGIN")) {
      checks.push({ name: "X-Frame-Options", status: "PASS", detail: xfo.toUpperCase() });
    } else {
      score -= 15;
      checks.push({ name: "X-Frame-Options", status: "FAIL", detail: "Missing framing restriction; clickjacking risk" });
    }

    // 5. Referrer-Policy
    const rp = headers["referrer-policy"];
    if (rp) {
      checks.push({ name: "Referrer-Policy", status: "PASS", detail: rp });
    } else {
      score -= 10;
      checks.push({ name: "Referrer-Policy", status: "WARN", detail: "Default referrer policy may leak sensitive URLs" });
    }

    // 6. Permissions-Policy
    const pp = headers["permissions-policy"];
    if (pp) {
      checks.push({ name: "Permissions-Policy", status: "PASS", detail: "Hardware access constrained" });
    } else {
      score -= 10;
      checks.push({ name: "Permissions-Policy", status: "WARN", detail: "Missing Permissions-Policy header" });
    }
  } catch (err) {
    return {
      target: targetUrl,
      error: `Connection failed: ${err.message}`,
      grade: "F",
      score: 0,
      checks: []
    };
  }

  score = Math.max(0, score);
  let grade = "F";
  if (score >= 95) grade = "A+";
  else if (score >= 85) grade = "A";
  else if (score >= 75) grade = "B";
  else if (score >= 60) grade = "C";
  else if (score >= 45) grade = "D";

  return {
    target: targetUrl,
    grade,
    score,
    checks_count: checks.length,
    checks,
    timestamp: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. DROP-IN SECURITY SHIELD CODE GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

function generateSiteShieldCode() {
  return `// Drop-in Node.js / Express Security Shield
import helmet from 'helmet';

export function configureSiteSecurity(app) {
  // 1. Strict Content Security Policy & Protective Headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  // 2. Anti-Clickjacking & Framing Guard
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
}
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. STATIC CODE SCANNER & PLUGIN AUDITOR
// ─────────────────────────────────────────────────────────────────────────────

function scanPath(targetPath) { return scanSource(targetPath); }

function discoverPluginDirs() {
  const dirs = new Set();
  const cwd = process.cwd();

  const projectPlugins = path.join(cwd, ".agent", "skills", "total-recall", "plugins");
  if (fs.existsSync(projectPlugins)) {
    for (const d of fs.readdirSync(projectPlugins)) {
      const full = path.join(projectPlugins, d);
      if (fs.existsSync(path.join(full, "plugin.json"))) dirs.add(full);
    }
  }

  const globalPlugins = path.join(os.homedir(), '.agent', 'skills', 'total-recall', 'plugins');
  if (fs.existsSync(globalPlugins)) {
    for (const entry of fs.readdirSync(globalPlugins)) {
      const full = path.join(globalPlugins, entry);
      if (fs.existsSync(path.join(full, 'plugin.json'))) dirs.add(full);
    }
  }

  return [...new Set([...dirs].map(dir => fs.realpathSync(dir)))];
}

function auditPlugins({ harden = false } = {}) {
  if (harden) throw new Error("Manifest edits cannot enforce runtime security; fix the reported owning source");
  const pluginDirs = discoverPluginDirs();
  const results = [];

  for (const dir of pluginDirs) {
    const manifestPath = path.join(dir, "plugin.json");
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (err) {
      results.push({ plugin: path.basename(dir), path: dir, status: "error", error: err.message, findings: [] });
      continue;
    }

    const pluginId = manifest.id || path.basename(dir);
    const findings = [];


    if (!manifest.auth || manifest.auth.plugin !== "auth") {
      findings.push({ rule: "Missing Auth Plugin Integration", severity: "HIGH", detail: "Manifest does not declare auth plugin binding" });

    }

    const grants = manifest.deploy?.access_grants || [];
    if (!grants.includes("auth:session:verify")) {
      findings.push({ rule: "Missing Session Verification Grant", severity: "MEDIUM", detail: "deploy.access_grants lacks auth:session:verify" });

    }

    const codeFindings = scanPath(dir);
    for (const cf of codeFindings) {
      findings.push({ rule: cf.rule, severity: cf.severity, detail: `${cf.file}:${cf.line}` });
    }



    results.push({
      plugin: pluginId,
      path: dir,
      status: findings.some(f => ["CRITICAL", "HIGH"].includes(f.severity)) ? "vulnerable" : findings.length ? "review-required" : "passed",
      hardened: false,
      findings_count: findings.length,
      findings
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. CLI SUBCOMMAND DISPATCH
// ─────────────────────────────────────────────────────────────────────────────

async function challengeCommand(args) {
  const json = args.includes("--json");
  const sub = args[0] || "create";

  if (sub === "create") {
    const diffIdx = args.indexOf("--difficulty");
    const diff = diffIdx !== -1 ? parseInt(args[diffIdx + 1], 10) : 3;
    const puzzle = await createPowChallenge(diff);
    if (json) console.log(JSON.stringify(puzzle, null, 2));
    else {
      console.log("Proof-of-Work Challenge Created:");
      console.log(`  Salt       : ${puzzle.salt}`);
      console.log(`  Difficulty : ${puzzle.difficulty} leading zeroes`);
      console.log(`  Signature  : ${puzzle.signature}`);
      console.log(`  Expires In : 5 minutes`);
    }
    return;
  }

  if (sub === "test") {
    console.log("Running self-contained Proof-of-Work solve and verify cycle…");
    const puzzle = await createPowChallenge(3);
    const start = performance.now();
    const solution = solvePowChallenge(puzzle.salt, puzzle.difficulty);
    const timeMs = Math.round(performance.now() - start);
    const result = await verifyPowChallenge(puzzle.salt, puzzle.difficulty, puzzle.expires, puzzle.signature, solution.nonce);
    const out = {
      test: "Proof-of-Work Verification Cycle",
      solved_in_ms: timeMs,
      nonce: solution.nonce,
      hash: solution.hash,
      verified: result.valid
    };
    if (json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(` PoW Solved in ${timeMs}ms with nonce ${solution.nonce}`);
      console.log(`  Hash: ${solution.hash}`);
      console.log(`  Verification: ${result.valid ? "VALID" : "INVALID"}`);
    }
    return;
  }

  if (sub === "verify") {
    const salt = args[1];
    const nonce = args[2];
    const sigIdx = args.indexOf("--signature");
    const sig = sigIdx !== -1 ? args[sigIdx + 1] : "";
    const diffIdx = args.indexOf("--difficulty");
    const diff = diffIdx !== -1 ? parseInt(args[diffIdx + 1], 10) : 3;
    const expIdx = args.indexOf("--expires");
    const expires = expIdx !== -1 ? parseInt(args[expIdx + 1], 10) : Date.now() + 60000;

    const res = await verifyPowChallenge(salt, diff, expires, sig, nonce);
    if (json) console.log(JSON.stringify(res));
    else console.log(`Verification: ${res.valid ? "PASSED" : `FAILED (${res.error})`}`);
    return;
  }

  console.error("Usage: total-recall security challenge <create|verify|test>");
  process.exitCode = 1;
}

async function botMitigateCommand(args) {
  const json = args.includes("--json");
  const hpIdx = args.indexOf("--honeypot");
  const honeypot = hpIdx !== -1 ? args[hpIdx + 1] : "";
  const elIdx = args.indexOf("--elapsed");
  const elapsed = elIdx !== -1 ? parseInt(args[elIdx + 1], 10) : 1500;
  const tokIdx = args.indexOf("--token");
  const token = tokIdx !== -1 ? args[tokIdx + 1] : null;

  const result = await evaluateBotRisk({ honeypot, elapsedMs: elapsed, token });
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log("Bot Mitigation Evaluation");
    console.log("───────────────────────────────────────────────────────");
    console.log(`Risk Score     : ${result.risk_score} / 100`);
    console.log(`Recommendation : ${result.recommendation.toUpperCase()}`);
    if (result.signals.length) {
      console.log("Signals:");
      for (const s of result.signals) console.log(`  • ${s}`);
    }
  }
}

async function siteAuditCommand(args) {
  const json = args.includes("--json");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) throw new Error("site-audit requires an authorized URL");
  const report = await auditWebsiteUrl(target);
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Website Security Audit for: ${target}`);
    console.log("───────────────────────────────────────────────────────");
    console.log(`Security Grade : ${report.grade} (Score: ${report.score}/100)`);
    console.log(`Headers Checked: ${report.checks_count}`);
    for (const c of report.checks) {
      const badge = c.status === "PASS" ? "" : c.status === "WARN" ? "" : "";
      console.log(`  ${badge} ${c.name.padEnd(28)} : ${c.detail}`);
    }
  }
}

async function siteShieldCommand(args) {
  const code = generateSiteShieldCode();
  const json = args.includes("--json");
  if (json) console.log(JSON.stringify({ shield_middleware: code }));
  else {
    console.log("Website Security Shield Middleware Snippet:");
    console.log(code);
  }
}

async function auditCommand(args) {
  const json = args.includes("--json");
  const cwd = process.cwd();
  const findings = [];

  const candidates = [
    path.join(cwd, ".agent", "secrets.enc"),
    path.join(cwd, ".agent", "config", "webauthn.json"),
    path.join(process.env.HOME || "", ".agent", "secrets.enc")
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const stat = fs.statSync(c);
        const mode = (stat.mode & 0o777).toString(8);
        if (mode !== "600" && mode !== "400") {
          findings.push({
            category: "file-permissions",
            target: path.basename(c),
            severity: "HIGH",
            message: `Permissions mode is ${mode}, expected 0600 (owner only)`
          });
        }
      } catch {
        // ignore
      }
    }
  }

  const sastFindings = scanPath(cwd).filter(f => ["CRITICAL", "HIGH"].includes(f.severity));
  for (const sf of sastFindings) {
    findings.push({
      category: "sast",
      target: `${sf.file}:${sf.line}`,
      severity: sf.severity,
      message: sf.rule
    });
  }

  const pluginAudit = auditPlugins({ harden: false });
  const vulnerablePlugins = pluginAudit.filter((p) => p.status === "vulnerable");
  if (vulnerablePlugins.length > 0) {
    findings.push({
      category: "plugins",
      target: `${vulnerablePlugins.length} plugin(s)`,
      severity: "HIGH",
      message: `High-priority source findings require review in plugins: ${vulnerablePlugins.map((p) => p.plugin).join(", ")}`
    });
  }

  const passed = !findings.some(f => ["CRITICAL", "HIGH"].includes(f.severity)) && pluginAudit.length > 0 && !pluginAudit.some(p => p.status === "error");
  const result = {
    audit: "Total Recall Security Baseline Audit",
    passed,
    findings_count: findings.length,
    findings,
    plugins_audited: pluginAudit.length,
    timestamp: new Date().toISOString()
  };

  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log("Total Recall Security Baseline Audit");
    console.log("───────────────────────────────────────────────────────");
    console.log(`Status   : ${passed ? " PASSED (inspected scope)" : " FAILED (risks or incomplete coverage)"}`);
    console.log(`Plugins  : ${pluginAudit.length} plugin(s) inspected`);
    console.log(`Findings : ${findings.length} total finding(s)`);
    for (const f of findings) {
      console.log(`  [${f.severity}] ${f.category} -> ${f.target}: ${f.message}`);
    }
  }
  if (!passed) process.exitCode = 1;
}

async function pluginsCommand(args) {
  const json = args.includes("--json");
  const harden = args.includes("--harden") || args.includes("-h");
  const results = auditPlugins({ harden });
  const totalFindings = results.reduce((acc, r) => acc + r.findings_count, 0);
  const totalHardened = results.filter((r) => r.hardened).length;

  const summary = {
    timestamp: new Date().toISOString(),
    status: results.length === 0 || results.some(item => item.status === "error") ? "incomplete" : results.some(item => item.status === "vulnerable") ? "at-risk" : totalFindings ? "review-required" : "passed",
    total_plugins: results.length,
    total_findings: totalFindings,
    hardened_count: totalHardened,
    plugins: results
  };

  if (summary.status !== "passed") process.exitCode = 1;
  if (json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log("User Plugins Security Manager");
    console.log("───────────────────────────────────────────────────────");
    console.log(`Audited  : ${summary.total_plugins} plugin(s)`);
    console.log(`Findings : ${summary.total_findings} security finding(s)`);
    if (harden) console.log(`Hardened : ${summary.hardened_count} plugin(s) secured`);
    console.log();
    for (const p of results) {
      const badge = p.status === 'error' ? ' AUDIT FAILED' : p.findings_count === 0 ? " NO SOURCE FINDINGS" : ` ${p.findings_count} FINDING(S)`;
      console.log(`  • ${p.plugin.padEnd(20)} [${badge}]${p.hardened ? " (HARDENED)" : ""}`);
    }
  }
}

async function machineCommand(args) {
  if (args.includes('--apply-permissions') && !['darwin', 'linux'].includes(process.platform)) throw new Error('SSH permission repair is unavailable on this platform');
  const remediation = args.includes('--apply-permissions') ? hardenSshPermissions() : null;
  const result = await auditMachine();
  if (remediation) result.remediation = remediation;
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'passed' || remediation?.status === 'failed') process.exitCode = 1;
}
function option(args, name) {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  if (!args[at + 1] || args[at + 1].startsWith('--')) throw new Error('Missing option value');
  return args[at + 1];
}
async function deviceCommand(args) {
  if (args.includes('--stdin') && args.includes('--answers-json')) throw new Error('Choose one answers input');
  const text = args.includes('--stdin') ? await readStdin(8192) : option(args, '--answers-json');
  if (text && Buffer.byteLength(text) > 8192) throw new Error('Input exceeds limit');
  const report = assessDevice({ platform: option(args, '--platform'), deviceId: option(args, '--device'), observations: text ? JSON.parse(text) : {} });
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'reviewed') process.exitCode = 1;
}
async function androidCommand(args) {
  const serial = option(args, '--serial');
  if (!serial) throw new Error('An existing authorized ADB device serial is required');
  const report = auditAndroid({ serial, execute: runCheck });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1; // A property-only assessment never establishes full device coverage.
}
async function fleetCommand(args) {
  const at = args.indexOf('--target');
  if (at >= 0 && (!args[at + 1] || args[at + 1].startsWith('--'))) throw new Error('--target requires a discovered machine name');
  const result = await auditFleet({ target: at >= 0 ? args[at + 1] : undefined });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'passed') process.exitCode = 1;
}
async function secureAllCommand(args) {
  // Fleet inventory and actionable recommendations; never claim blanket protection.
  if (args.includes('--apply')) throw new Error('Review each machine report. Firewall/SSH/disk changes require a verified access and rollback plan. Use machine --apply-permissions for bounded local permission remediation.');
  return fleetCommand(args);
}

async function scanCommand(args) {
  const json = args.includes("--json");
  const target = args.find((a) => !a.startsWith("--")) || ".";
  const findings = scanPath(target);

  const report = {
    scanner: "Total Recall SAST & Secret Leak Analyzer",
    timestamp: new Date().toISOString(),
    target,
    total_findings: findings.length,
    critical: findings.filter((f) => f.severity === "CRITICAL").length,
    high: findings.filter((f) => f.severity === "HIGH").length,
    findings
  };

  if (report.critical || report.high) process.exitCode = 1;
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Security Scan for: ${target}`);
    console.log(`Findings: ${report.total_findings} (${report.critical} critical, ${report.high} high)`);
    for (const f of findings) {
      console.log(`  • [${f.severity}] ${f.file}:${f.line} - ${f.rule}`);
    }
  }
}

async function hardenCommand(args) {
  if (!args.includes('--apply-permissions')) {
    console.log(JSON.stringify({ status: 'plan', applied_count: 0, machine: await auditMachine(), next: 'machine --apply-permissions applies and verifies recognized local SSH permissions; review firewall/SSH/disk steps per finding' }, null, 2));
    return;
  }
  return machineCommand(args);
}

async function encryptCommand(args) {
  const json = args.includes("--json");
  const passIdx = args.indexOf("--passphrase");
  if (passIdx !== -1) throw new Error("Passphrases in argv are prohibited; configure SECURITY_MASTER_KEY through auth");
  const pass = await requiredSecret(TOKEN_KEY);

  const nonFlags = args.filter((a, i) => !a.startsWith("--") && (passIdx === -1 || (i !== passIdx + 1)));
  if (!args.includes("--stdin") || nonFlags.length) throw new Error("Encryption requires --stdin; plaintext in argv is prohibited");
  const text = await readStdin();
  if (!text) throw new Error("Plaintext input is required");

  const encrypted = encryptText(text, pass);
  if (json) console.log(JSON.stringify(encrypted, null, 2));
  else {
    console.log("Encrypted Payload (AES-256-GCM):");
    console.log(encrypted.encoded);
  }
}

async function decryptCommand(args) {
  const json = args.includes("--json");
  const passIdx = args.indexOf("--passphrase");
  if (passIdx !== -1) throw new Error("Passphrases in argv are prohibited; configure SECURITY_MASTER_KEY through auth");
  const pass = await requiredSecret(TOKEN_KEY);

  const payload = args.find((a, i) => !a.startsWith("--") && (passIdx === -1 || (i !== passIdx + 1)));
  if (!payload) {
    console.error("Usage: total-recall security decrypt <payload> [--passphrase pass]");
    process.exitCode = 1;
    return;
  }

  try {
    const plain = decryptText(payload, pass);
    if (json) console.log(JSON.stringify({ plaintext: plain }));
    else console.log(`Decrypted: ${plain}`);
  } catch (err) {
    console.error(`Decryption failed: ${err.message}`);
    process.exitCode = 1;
  }
}

async function probeCommand(args) {
  const at = args.indexOf('--url');
  if (at < 0 || !args[at + 1]) throw new Error('probe requires --url https://your-authorized-site');
  const url = new URL(args[at + 1]);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Use HTTPS without embedded credentials, query or fragment');
  const started = Date.now();
  const response = await fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(8000) });
  const headers = Object.fromEntries(['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy'].map(key => [key, response.headers.has(key)]));
  const result = { status: response.status, ok: response.ok, latency_ms: Date.now() - started, endpoint: url.origin, security_headers: headers, timestamp: new Date().toISOString() };
  console.log(JSON.stringify(result));
  if (!response.ok || Object.values(headers).some(present => !present)) process.exitCode = 1;
}

async function tokenCommand(args) {
  const [action = "status"] = args;
  const json = args.includes("--json");
  if (action === "status") {
    const key = await resolveSecret(TOKEN_KEY);
    const status = { present: Boolean(key), secretKey: TOKEN_KEY };
    console.log(json ? JSON.stringify(status) : `Security Master Key: ${status.present ? "present" : "missing"} (${TOKEN_KEY})`);
    if (!status.present) process.exitCode = 1;
    return;
  }
  if (action === "set" && args.includes("--stdin")) {
    const val = await readStdin();
    if (!val) { console.error("No key provided on stdin."); process.exitCode = 2; return; }
    if (Buffer.byteLength(val) < 32) throw new Error('Master key requires at least 32 bytes');
    const owner = await loadOwner('auth', 'secrets-store');
    await owner.setSecret(process.env.TR_SECRETS_BRAIN || owner.defaultBrainDir(), TOKEN_KEY, val, { actor: 'security-plugin' });
    console.log(JSON.stringify({ saved: true, provider_verified: false, validation: 'local-key-length', secretKey: TOKEN_KEY }));
    return;
  }
  console.error("Usage: security token <status|set --stdin>");
  process.exitCode = 2;
}

const IMPLEMENTED = {
  status: async (args) => {
    const json = args.includes("--json");
    const status = {
      plugin: "security",
      active_suite: [
        "platforms", "device", "android",
        "machine",
        "fleet",
        "audit",
        "scan",
        "harden",
        "plugins",
        "secure-all",
        "challenge",
        "bot-mitigate",
        "site-audit",
        "site-shield",
        "encrypt",
        "decrypt",
        "probe",
        "token"
      ],
      encryption_cipher: "AES-256-GCM (scrypt KDF)",
      proof_of_work: "SHA-256 PoW challenge engine",
      bot_mitigation: "Honeypot + velocity + token risk analyzer",
      master_key_state: "not-checked; use token status",
      auth_integration: "auth",
      device_coverage: platformInventory()
    };
    if (json) console.log(JSON.stringify(status, null, 2));
    else {
      console.log("Total Recall Complete Security & Website Defensive Suite");
      console.log("───────────────────────────────────────────────────────");
      console.log(`Encryption   : ${status.encryption_cipher}`);
      console.log(`PoW Defense  : ${status.proof_of_work}`);
      console.log(`Bot Defense  : ${status.bot_mitigation}`);
      console.log(`Master Key   : ${"Not checked"}`);
      console.log(`Tools Active : ${status.active_suite.join(", ")}`);
    }
  },
  machine: machineCommand,
  platforms: async () => console.log(JSON.stringify(platformInventory(), null, 2)),
  device: deviceCommand,
  android: androidCommand,
  network: machineCommand,
  fleet: fleetCommand,
  audit: auditCommand,
  scan: scanCommand,
  harden: hardenCommand,
  plugins: pluginsCommand,
  "secure-all": secureAllCommand,
  challenge: challengeCommand,
  "bot-mitigate": botMitigateCommand,
  "site-audit": siteAuditCommand,
  "site-shield": siteShieldCommand,
  encrypt: encryptCommand,
  decrypt: decryptCommand,
  probe: probeCommand,
  token: tokenCommand
};

export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  const sub = args[0] || "status";
  if (['--help', '-h', 'help'].includes(sub)) {
    console.log('Usage: total-recall security <command> [--json]\nCommands: ' + Object.keys(IMPLEMENTED).join(', '));
    console.log('Device review: device --platform <platform> --device <label> --json\nSource audit: scan <path> --json; plugins --json\nCredentials: auth plugin only. Missing evidence remains unverified.');
    return;
  }
  if (IMPLEMENTED[sub]) {
    try { return await IMPLEMENTED[sub](args.slice(1)); }
    catch { console.log(JSON.stringify({ status: 'failed', operation: sub, error: 'Security operation failed; verify arguments, owning plugin availability and authorization. No success was established.' })); process.exitCode = 1; return; }
  }
  console.error(`Security: "${sub}" is not implemented.`);
  process.exitCode = 2;
}

export {
  encryptText,
  decryptText,
  scanPath,
  auditPlugins,
  discoverPluginDirs,
  createPowChallenge,
  verifyPowChallenge,
  solvePowChallenge,
  evaluateBotRisk,
  generateCsrfToken,
  verifyCsrfToken,
  checkRateLimit,
  auditWebsiteUrl,
  generateSiteShieldCode
};
export default run;
