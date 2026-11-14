/**
 * Targeted On-Demand Generator for OpenWiki.
 *
 * Generates or regenerates documentation for a specific repository or workspace
 * using the hermetic bundled generator `vendor/openwiki.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadOpenWikiConfig } from './config.mjs';
import { buildGeneratorInvocation, ensureDefaultIgnores, readProjects, redact, resolveGenerator, resolveKey } from './refresh.mjs';
import { execOnMeshNode, getMeshNodes } from './mesh-vaults.mjs';

export async function generateWiki({
  repo = null,
  targetPath = null,
  outputDir = null,
  focus = 'all',
  force = false,
  dryRun = false,
  node = null,
  onProgress = null,
} = {}) {
  // If remote mesh node specified, dispatch via mesh
  if (node && node !== 'local' && node !== 'self') {
    const nodes = getMeshNodes();
    const selfNode = nodes.find((n) => n.self);
    const isSelf = selfNode && (selfNode.ip === node || selfNode.hostname.toLowerCase() === node.toLowerCase());

    if (!isSelf) {
      const meshRes = execOnMeshNode(node, [
        'generate', ...(repo ? [`--repo=${repo}`] : []), ...(force ? ['--force'] : []),
        ...(dryRun ? ['--dry-run'] : []), '--json',
      ]);
      if (meshRes.ok) {
        try {
          return JSON.parse(meshRes.stdout);
        } catch {
          throw new Error('Mesh generation returned invalid JSON');
        }
      } else {
        throw new Error(`Mesh generation failed on node ${node}: ${meshRes.stderr || meshRes.error}`);
      }
    }
  }

  // Resolve target directory
  let resolvedTarget = process.cwd();
  let repoName = path.basename(resolvedTarget);

  if (repo) {
    let projects = [];
    try {
      projects = readProjects();
    } catch {
      projects = [];
    }
    const found = projects.find((p) => p.name === repo || p.root === repo);
    if (!found) {
      throw new Error(`Project '${repo}' not found in registered projects.`);
    }
    resolvedTarget = found.root;
    repoName = found.name;
  } else if (targetPath) {
    resolvedTarget = path.resolve(process.cwd(), targetPath);
    repoName = path.basename(resolvedTarget);
  }

  if (!fs.existsSync(resolvedTarget)) {
    throw new Error(`Target path does not exist: ${resolvedTarget}`);
  }

  const outPath = outputDir ? path.resolve(resolvedTarget, outputDir) : path.join(resolvedTarget, 'openwiki');

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      repoName,
      targetPath: resolvedTarget,
      outputDir: outPath,
      focus,
      message: `[Dry Run] Would generate documentation for ${repoName} at ${outPath}`,
    };
  }

  const config = loadOpenWikiConfig();
  const { key, from } = resolveKey({ provider: config.provider });
  if (!key) {
    const keyName = config.provider === 'google' ? 'GOOGLE_API_KEY' : 'OPENROUTER_API_KEY';
    throw new Error(`No API credential found for provider '${config.provider}'. Save via: total-recall auth secret set ${keyName} --stdin`);
  }

  const gen = resolveGenerator();
  if (!gen.command) {
    throw new Error('No openwiki generator available (missing bundled generator, local .bin, PATH entry, or npx)');
  }

  const mode = (!fs.existsSync(outPath) || force) ? 'init' : 'update';
  const timeoutMs = config.timeout_ms || 300000;
  const { cmdArgs, childEnv } = buildGeneratorInvocation({
    baseArgs: gen.args,
    mode,
    config,
    key,
  });
  ensureDefaultIgnores(resolvedTarget);

  const startedAt = Date.now();
  if (typeof onProgress === 'function') {
    onProgress(`Starting generator for ${repoName} (${gen.via}, ${mode})...`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(gen.command, cmdArgs, {
      cwd: resolvedTarget,
      env: childEnv,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const str = chunk.toString();
      stdout += str;
      if (typeof onProgress === 'function') {
        onProgress(redact(str.trim(), key));
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code, signal) => {
      const durationMs = Date.now() - startedAt;
      if (code === 0) {
        resolve({
          ok: true,
          repoName,
          targetPath: resolvedTarget,
          outputDir: outPath,
          generatorVia: gen.via,
          mode,
          durationMs,
          credential: from,
          stdout: redact(stdout.trim(), key),
        });
      } else {
        const detail = redact(stderr || stdout || (signal ? `terminated by ${signal}` : 'Unknown error'), key);
        reject(new Error(`Generator exited with code ${code ?? signal ?? 1}: ${detail}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn generator: ${redact(err.message, key)}`));
    });
  });
}
