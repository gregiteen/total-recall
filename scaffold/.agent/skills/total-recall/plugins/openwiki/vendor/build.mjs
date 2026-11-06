#!/usr/bin/env node
/** Owner build: read an existing fork and installed esbuild; write only this vendor directory. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const vendorDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.dirname(vendorDir);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function replaceOnce(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error('Fork source changed; review the owner overlay before rebuilding');
  }
  return source.replace(before, after);
}

// Use the fork's parser-owned help text, without mounting a terminal application.
function headlessEntry(source) {
  source = replaceOnce(source, '  commandLoadsEnvironment,', '  getHelpText,\n  commandLoadsEnvironment,');
  return replaceOnce(source, '  if (commandLoadsEnvironment(parsedCommand)) {', [
    '  if (parsedCommand.kind === "help" && (!process.stdin.isTTY || !process.stdout.isTTY)) {',
    '    process.stdout.write(`${getHelpText()}\\n`);',
    '    process.exitCode = parsedCommand.exitCode;',
    '    return;',
    '  }',
    '  if (commandLoadsEnvironment(parsedCommand)) {',
  ].join('\n'));
}

function disableWorkflowCreation(source) {
  source = replaceOnce(source, '  options: CodeModeRepoSetupOptions = {},', '  _options: CodeModeRepoSetupOptions = {},');
  return replaceOnce(source, [
    '  if (options.createWorkflow) {',
    '    await ensureCodeModeWorkflow(',
    '      cwd,',
    '      options.cronExpression ?? DEFAULT_CODE_MODE_CRON,',
    '      options.env ?? process.env,',
    '    );',
    '  }',
    '',
  ].join('\n'), '');
}

export async function build({ sourceRoot, esbuildPath, check = false }) {
  if (!sourceRoot || !path.isAbsolute(sourceRoot)) throw new Error('--source must be an absolute fork directory');
  sourceRoot = fs.realpathSync(sourceRoot);
  const pkg = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
  if (pkg.name !== 'openwiki') throw new Error('--source must contain the OpenWiki package');
  const toolPath = esbuildPath || createRequire(path.join(sourceRoot, 'package.json')).resolve('esbuild');
  const imported = await import(pathToFileURL(path.resolve(toolPath)).href);
  const esbuild = imported.default || imported;
  const outfile = path.join(vendorDir, 'openwiki.mjs');
  const overlays = {};

  const result = await esbuild.build({
    absWorkingDir: pluginRoot,
    entryPoints: [path.join(sourceRoot, 'src', 'cli', 'cli.tsx')],
    bundle: true, minify: true, platform: 'node', target: 'node22', format: 'esm',
    // Emit escaped strings so template contents survive package whitespace checks.
    supported: { 'template-literal': false },
    mainFields: ['module', 'main'], external: ['fsevents'], outfile, write: false, metafile: true,
    banner: { js: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\n' },
    plugins: [{
      name: 'owner-openwiki-overlays',
      setup(builder) {
        builder.onLoad({ filter: /src[/\\]cli[/\\]cli\.tsx$/ }, ({ path: file }) => {
          const original = fs.readFileSync(file, 'utf8');
          const contents = headlessEntry(original);
          overlays['src/cli/cli.tsx'] = { original: hash(original), patched: hash(contents) };
          return { contents, loader: 'tsx', resolveDir: path.dirname(file) };
        });
        builder.onLoad({ filter: /src[/\\](cli[/\\]commands|ingestion[/\\]code-mode)\.ts$/ }, ({ path: file }) => {
          const original = fs.readFileSync(file, 'utf8');
          const contents = path.basename(file) === 'code-mode.ts'
            ? disableWorkflowCreation(original)
            : replaceOnce(original, ' and using GitHub Actions for recurrence', '. Use Total Recall for recurrence');
          const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
          overlays[relative] = { original: hash(original), patched: hash(contents) };
          return { contents, loader: 'ts', resolveDir: path.dirname(file) };
        });
        builder.onLoad({ filter: /src[/\\]agent[/\\]skills\.ts$/ }, ({ path: file }) => {
          const original = fs.readFileSync(file, 'utf8');
          const contents = replaceOnce(original, 'new URL("../../skills", import.meta.url)', 'new URL("./skills", import.meta.url)');
          overlays['src/agent/skills.ts'] = { original: hash(original), patched: hash(contents) };
          return { contents, loader: 'ts', resolveDir: path.dirname(file) };
        });
        builder.onResolve({ filter: /^react-devtools-core$/ }, () => ({ path: 'react-devtools-core', namespace: 'optional-devtools' }));
        builder.onLoad({ filter: /.*/, namespace: 'optional-devtools' }, () => ({ contents: 'export default undefined;', loader: 'js' }));
        builder.onResolve({ filter: /^better-sqlite3$/ }, () => ({ path: 'better-sqlite3', namespace: 'native-sqlite' }));
        builder.onLoad({ filter: /.*/, namespace: 'native-sqlite' }, () => ({
          contents: `import { DatabaseSync } from "node:sqlite";
            export default function Database(filename) {
              const db = new DatabaseSync(filename || ":memory:");
              db.pragma = (value) => { try { db.exec("PRAGMA " + value + ";"); } catch {} };
              db.transaction = (fn) => (...args) => {
                db.exec("BEGIN");
                try { const result = fn(...args); db.exec("COMMIT"); return result; }
                catch (error) { db.exec("ROLLBACK"); throw error; }
              };
              return db;
            }`, loader: 'js',
        }));
        builder.onLoad({ filter: /src[/\\]version\.ts$/ }, () => ({
          contents: `export const OPENWIKI_VERSION = ${JSON.stringify(pkg.version)}; export const OPENWIKI_PRODUCER_ACTOR = "openwiki/" + OPENWIKI_VERSION;`,
          loader: 'ts',
        }));
      },
    }],
  });

  const inputs = {};
  for (const input of Object.keys(result.metafile.inputs).sort()) {
    const file = path.resolve(pluginRoot, input);
    const relative = path.relative(sourceRoot, file);
    if (relative.startsWith(`src${path.sep}`) && fs.existsSync(file)) inputs[relative.split(path.sep).join('/')] = hash(fs.readFileSync(file));
  }
  for (const file of ['package.json', 'pnpm-lock.yaml']) inputs[file] = hash(fs.readFileSync(path.join(sourceRoot, file)));
  const bundle = result.outputFiles.find((file) => file.path === outfile)?.contents;
  if (!bundle) throw new Error('Bundler did not produce the native artifact');
  const revision = spawnSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000 });
  const status = spawnSync('git', ['-C', sourceRoot, 'status', '--porcelain'], { encoding: 'utf8', timeout: 5000 });
  const receipt = {
    package: pkg.name, version: pkg.version,
    sourceHead: revision.status === 0 ? revision.stdout.trim() : null,
    sourceDirty: status.status === 0 ? Boolean(status.stdout.trim()) : null,
    esbuild: esbuild.version, builderSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
    overlays: Object.fromEntries(Object.entries(overlays).sort()), inputSha256: hash(JSON.stringify(inputs)), inputs,
    artifact: 'vendor/openwiki.mjs', artifactSha256: hash(bundle),
  };
  const receiptBytes = JSON.stringify(receipt, null, 2) + '\n';
  const receiptPath = path.join(vendorDir, 'build.json');
  if (check) {
    if (!fs.readFileSync(outfile).equals(Buffer.from(bundle)) || fs.readFileSync(receiptPath, 'utf8') !== receiptBytes) {
      throw new Error('Native artifact or build receipt differs from the selected source');
    }
  } else {
    const stage = fs.mkdtempSync(path.join(vendorDir, '.build-'));
    try {
      const nextBundle = path.join(stage, 'openwiki.mjs');
      const nextReceipt = path.join(stage, 'build.json');
      fs.writeFileSync(nextBundle, bundle, { mode: 0o755 });
      fs.writeFileSync(nextReceipt, receiptBytes);
      fs.renameSync(nextBundle, outfile);
      fs.renameSync(nextReceipt, receiptPath);
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  }
  return { ok: true, checked: check, sourceHead: receipt.sourceHead, sourceDirty: receipt.sourceDirty, artifactSha256: receipt.artifactSha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.log('Usage: node vendor/build.mjs --source <absolute-fork> [--esbuild <installed-module>] [--check]');
  } else {
    try {
      const value = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
      console.log(JSON.stringify(await build({ sourceRoot: value('--source'), esbuildPath: value('--esbuild'), check: args.includes('--check') })));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
