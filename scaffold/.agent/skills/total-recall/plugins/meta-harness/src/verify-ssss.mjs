/** Verify the selected checkout's real native state operations without dispatching an agent. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCanonicalEvent, JsonlEventStore } from '@gregiteen/ssss-cli/events';
import { createKernel } from '@gregiteen/ssss-cli/kernel';
import { FileSystemVfs } from '@gregiteen/ssss-cli/vfs';

const owner = 'meta-harness';

function readTargetFile(target, file) {
  const resolved = fs.realpathSync(path.join(target, file));
  assert.ok(resolved.startsWith(`${target}${path.sep}`), `Target file leaves the checkout: ${file}`);
  return resolved;
}

async function verifyEvents(documentPath, primitive, expectedCount) {
  const root = path.dirname(path.dirname(documentPath));
  const subject = path.relative(root, documentPath);
  const vfs = new FileSystemVfs(root);
  const document = await vfs.read(subject);
  assert.ok(document, `Missing native ${primitive} document`);

  const eventStore = new JsonlEventStore(path.join(root, '.events'));
  const events = [];
  for await (const { event } of eventStore.replay({ workspaceId: owner })) {
    if (event.subject === subject) events.push(event);
  }
  assert.equal(events.length, expectedCount, `Unexpected mutation count for ${primitive}`);
  let previousHash = null;
  for (const event of events) {
    const canonical = createCanonicalEvent(event);
    for (const [field, value] of Object.entries(canonical)) assert.deepEqual(event[field], value, `Invalid canonical event field ${field}`);
    assert.equal(event.workspace_id, owner);
    assert.equal(event.primitive_id, primitive);
    assert.equal(event.principal.id, `plugin:${owner}`);
    assert.equal(event.before_hash, previousHash);
    assert.match(event.after_hash, /^sha256:[a-f0-9]{64}$/);
    previousHash = event.after_hash;
  }
  assert.equal(previousHash, document.hash, `Final event hash does not describe the current ${primitive} document`);
  return { primitive, events: events.length };
}

async function verifyTarget(targetArgument) {
  const target = fs.realpathSync(path.resolve(targetArgument));
  const readJson = file => JSON.parse(fs.readFileSync(readTargetFile(target, file), 'utf8'));
  assert.equal(readJson('package.json').name, 'tr-plugin-meta-harness', 'Select a Meta Harness checkout');
  assert.equal(readJson('plugin.json').id, owner, 'The target must own Meta Harness state');

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-harness-ssss-gate-'));
  const previousBrain = process.env.TR_SECRETS_BRAIN;
  process.env.TR_SECRETS_BRAIN = path.join(scratch, 'brain');
  try {
    const importTarget = file => import(pathToFileURL(readTargetFile(target, `src/${file}.mjs`)).href);
    const [threads, learner, paths, storage] = await Promise.all([
      importTarget('threads'), importTarget('learner'), importTarget('paths'), importTarget('ssss-store'),
    ]);

    const thread = threads.createThread({ title: 'SSSS verification thread' });
    threads.appendThreadTurn(thread.id, { role: 'verifier', content: 'Native storage gate' });
    threads.closeThread(thread.id);
    const threadStore = new storage.PluginStateStore(paths.threadsFile(), owner);
    const savedThread = threadStore.read(null)?.threads?.find(row => row.id === thread.id);
    assert.equal(savedThread?.status, 'completed');
    assert.equal(savedThread?.turns?.[0]?.content, 'Native storage gate');

    const first = await learner.recordRunReceipt({ harness: 'ssss-gate-fixture', success: true });
    const second = await learner.recordRunReceipt({ harness: 'ssss-gate-fixture', success: false, failureKind: 'gate' });
    const ledger = new storage.PluginStateStore(paths.receiptsFile(), owner);
    assert.deepEqual(ledger.read([]).map(row => row.id), [first.id, second.id]);

    assert.throws(() => threads.updateThread(thread.id, { status: 'invalid-status' }), /invalid thread/);
    assert.throws(() => threadStore.append({ unexpected: true }), /not append-only/);
    const records = [await verifyEvents(threadStore.documentPath, 'plugin-store:state', 3), await verifyEvents(ledger.documentPath, 'plugin-store:ledger', 2)];

    // This corruption exists only in the disposable verification brain.
    fs.writeFileSync(threadStore.documentPath, '---\ntype: plugin-store:state\n---\n{}\n');
    assert.throws(() => threadStore.read(null), /Invalid SSSS plugin state/);
    const invalidKernel = createKernel({ vfs: new FileSystemVfs(scratch), eventStore: new JsonlEventStore(path.join(scratch, 'invalid-events')) });
    const invalid = await invalidKernel.execute({ type: 'operation', workspace_id: owner, path: 'missing-content.md', idempotency_key: 'missing-content' });
    assert.equal(invalid.success, false);
    assert.equal(invalid.error?.code, 'invalid_request');

    return { ok: true, target, records, rejected: ['invalid-thread-status', 'append-to-state', 'malformed-document', 'missing-operation-content'] };
  } finally {
    if (previousBrain === undefined) delete process.env.TR_SECRETS_BRAIN;
    else process.env.TR_SECRETS_BRAIN = previousBrain;
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  const [flag, target, ...rest] = process.argv.slice(2);
  if (flag !== '--target' || !target || rest.length) throw new Error('Supply an explicit Meta Harness checkout with --target <directory>');
  process.stdout.write(`${JSON.stringify(await verifyTarget(target))}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
}
