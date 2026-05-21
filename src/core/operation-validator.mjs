import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import crypto from 'node:crypto';
import {
  SSSS_SCHEMAS,
  OperationEnvelopeSchema,
  PatchEnvelopeSchema,
  EventEnvelopeSchema,
} from './schema.mjs';
import { atomicWrite, safeStringify } from './vault.mjs';
import { logger } from './logger.mjs';

const APPEND_TYPES = new Set(['conversation', 'run']);
const PROTOCOL_PATHS = [
  'references/ssss-spec.md',
  'references/admin-protocol-evolution-policy.md',
  'references/user-local-optimizer-boundary-policy.md',
];
const PROTOCOL_PATH_PREFIXES = ['fixtures/'];
const idempotencyCache = new Map();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const warmedVaults = new Set();

function cacheKey(wid, key) { return `${wid}:${key}`; }

function pruneExpired() {
  const now = Date.now();
  for (const [k, v] of idempotencyCache) {
    if (now - v.ts > IDEMPOTENCY_TTL_MS) idempotencyCache.delete(k);
  }
}

export function warmIdempotencyCache(vaultRoot, eventLogDir) {
  const vaultKey = path.resolve(vaultRoot);
  if (warmedVaults.has(vaultKey)) return;
  warmedVaults.add(vaultKey);

  const auditDir = eventLogDir || path.join(vaultRoot, '.events');
  const auditFile = path.join(auditDir, 'audit.jsonl');
  if (!fs.existsSync(auditFile)) return;

  try {
    const lines = fs.readFileSync(auditFile, 'utf8').split('\n');
    const now = Date.now();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        if (record.event_type !== 'audit' || !record.payload) continue;
        const ts = Date.parse(record.ts);
        if (isNaN(ts) || now - ts > IDEMPOTENCY_TTL_MS) continue;

        const ck = cacheKey(record.payload.workspace_id, record.payload.idempotency_key);
        const response = {
          success: true,
          type: record.payload.envelope_type,
          operation_id: record.correlation_id,
          path: record.subject,
          committed_at: record.ts,
          validation: {
            valid: true,
            type: record.payload.resolved_type,
            errors: [],
            warnings: []
          }
        };
        idempotencyCache.set(ck, { response, ts });
      } catch { /* skip corrupt lines */ }
    }
  } catch (err) {
    logger.error('operation-validator', `Failed to warm idempotency cache: ${err.message}`);
  }
}

function isProtocolPath(fp) {
  for (const p of PROTOCOL_PATHS) if (fp === p || fp.endsWith(`/${p}`)) return true;
  for (const prefix of PROTOCOL_PATH_PREFIXES) if (fp.startsWith(prefix) || fp.includes(`/${prefix}`)) return true;
  if (fp.endsWith('schema.mjs') || fp.endsWith('schema.spec.mjs')) return true;
  return false;
}

function buildRepair(zodError) {
  return { field_errors: (zodError.issues || []).map(i => ({ field: i.path.join('.') || '(root)', issue: i.message })) };
}

function resolveVfsPath(vaultRoot, vfsPath) {
  const cleaned = vfsPath.replace(/^\/+/, '');
  const resolved = path.resolve(vaultRoot, cleaned);
  if (!resolved.startsWith(path.resolve(vaultRoot))) throw new Error(`Path traversal: ${vfsPath}`);
  return resolved;
}

function makeErrorResponse(type, opId, p, errors) {
  return { success: false, type, operation_id: opId, path: p, committed_at: null, validation: { valid: false, errors, warnings: [] } };
}

/**
 * Process an SSSS operation through the full §6.3 pipeline.
 * @param {object} envelope - The operation envelope.
 * @param {string} vaultRoot - Absolute path to the vault directory.
 * @param {object} [options] - { agentRole, leaseStore, eventLogDir }
 * @returns {object} OperationResponse (§6.4).
 */
export function processOperation(envelope, vaultRoot, options = {}) {
  const { agentRole = 'admin', leaseStore, eventLogDir } = options;
  const operationId = crypto.randomUUID();
  const warnings = [];

  // Stage 1: Envelope Validation
  const schemaMap = { operation: OperationEnvelopeSchema, patch: PatchEnvelopeSchema, event: EventEnvelopeSchema };
  const envSchema = schemaMap[envelope.type];
  if (!envSchema) return makeErrorResponse(envelope.type || 'unknown', operationId, envelope.path || '', [`Unknown envelope type: ${envelope.type}`]);
  const envResult = envSchema.safeParse(envelope);
  if (!envResult.success) return { ...makeErrorResponse(envelope.type, operationId, envelope.path || '', envResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)), repair: buildRepair(envResult.error) };

  // Warm idempotency cache from audit logs if not already done
  warmIdempotencyCache(vaultRoot, eventLogDir);

  // Stage 2: Idempotency
  pruneExpired();
  const ck = cacheKey(envelope.workspace_id, envelope.idempotency_key);
  const cached = idempotencyCache.get(ck);
  if (cached) return { ...cached.response, replay: cached.response };

  // Stage 3: Authorization
  if (isProtocolPath(envelope.path) && agentRole !== 'admin') return makeErrorResponse(envelope.type, operationId, envelope.path, [`Protocol path '${envelope.path}' requires admin role.`]);

  // Stage 4: Lease Check
  if (leaseStore) {
    const lc = checkLease(envelope, leaseStore);
    if (!lc.ok) return makeErrorResponse(envelope.type, operationId, envelope.path, [lc.error]);
  }

  // Stage 5: Content Validation
  let resolvedType = null;
  const errors = [];

  if (envelope.type === 'operation' || envelope.type === 'patch') {
    try {
      let fmData;
      if (envelope.type === 'operation') {
        fmData = matter(envelope.content).data;
      } else {
        const absPath = resolveVfsPath(vaultRoot, envelope.path);
        if (!fs.existsSync(absPath)) { errors.push(`Target file does not exist for patch: ${envelope.path}`); }
        else {
          const { data, content: body } = matter(fs.readFileSync(absPath, 'utf8'));
          fmData = { ...data, ...envelope.patches };
          if (envelope.patches.__body__ !== undefined && APPEND_TYPES.has(data.type)) {
            const eb = body.trim(), nb = String(envelope.patches.__body__).trim();
            if (eb && !nb.startsWith(eb)) errors.push(`Append-type '${data.type}' does not allow rewriting existing records.`);
          }
        }
      }
      if (fmData && errors.length === 0) {
        resolvedType = fmData.type;
        if (!resolvedType) errors.push('Missing required frontmatter field: type');
        else if (!SSSS_SCHEMAS[resolvedType]) errors.push(`Unknown SSSS type: '${resolvedType}'.`);
        else {
          const r = SSSS_SCHEMAS[resolvedType].safeParse(fmData);
          if (!r.success) r.error.issues.forEach(i => errors.push(`${i.path.join('.')}: ${i.message}`));
          if (envelope.type === 'operation' && APPEND_TYPES.has(resolvedType)) {
            const ap = resolveVfsPath(vaultRoot, envelope.path);
            if (fs.existsSync(ap)) {
              const eb = matter(fs.readFileSync(ap, 'utf8')).content.trim();
              const nb = matter(envelope.content).content.trim();
              if (eb && !nb.startsWith(eb)) errors.push(`Append-type '${resolvedType}' does not allow rewriting existing records.`);
            }
          }
          if (agentRole === 'optimizer' && resolvedType === 'memory') {
            if (fmData.priority === 'absolute') warnings.push('Optimizer writing Tier 1 (priority: absolute) node.');
            if (fmData.immutable === true) warnings.push('Optimizer writing immutable node.');
          }
          if (resolvedType === 'schema-proposal' && fmData.status === 'accepted') {
            if (agentRole !== 'admin') errors.push('Only admin may accept schema-proposals.');
            if (!fmData.reviewed_by) errors.push('Accepted schema-proposals must have reviewed_by.');
          }
        }
      }
    } catch (err) { errors.push(`Content parsing error: ${err.message}`); }
  }
  if (envelope.type === 'event') { try { JSON.parse(envelope.content); } catch { errors.push('Event content must be valid JSON.'); } }

  const isValid = errors.length === 0;
  if (envelope.dry_run || !isValid) {
    const resp = { success: isValid, type: envelope.type, operation_id: operationId, path: envelope.path, committed_at: null, dry_run: !!envelope.dry_run, validation: { valid: isValid, type: resolvedType, errors, warnings } };
    if (!isValid) resp.repair = { field_errors: errors.map(e => ({ field: e.split(': ')[0] || '(unknown)', issue: e })) };
    return resp;
  }

  // Stage 6: Commit
  const committedAt = new Date().toISOString();
  try {
    const absPath = resolveVfsPath(vaultRoot, envelope.path);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (envelope.type === 'operation') {
      let contentToWrite = envelope.content;
      try {
        const parsed = matter(contentToWrite);
        if (parsed.data && parsed.data.type === 'memory') {
          parsed.data.updated = committedAt;
          parsed.data.last_accessed = committedAt;
          contentToWrite = safeStringify(parsed.content, parsed.data);
        }
      } catch {
        // Fallback to raw content if parsing fails
      }
      atomicWrite(absPath, contentToWrite);
    }
    else if (envelope.type === 'patch') {
      const { data, content: body } = matter(fs.readFileSync(absPath, 'utf8'));
      const merged = { ...data };
      for (const [k, v] of Object.entries(envelope.patches)) { if (k !== '__body__') merged[k] = v; }
      if (merged.type === 'memory') {
        merged.updated = committedAt;
        merged.last_accessed = committedAt;
      }
      const newBody = envelope.patches.__body__ !== undefined ? (APPEND_TYPES.has(data.type) ? body + '\n' + envelope.patches.__body__ : envelope.patches.__body__) : body;
      atomicWrite(absPath, safeStringify(newBody, merged));
    } else if (envelope.type === 'event') {
      const logDir = eventLogDir || path.join(vaultRoot, '.events');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, `${envelope.workspace_id}.jsonl`), JSON.stringify({ event_id: operationId, event_type: 'operation-audit', ts: committedAt, path: envelope.path, content: envelope.content, idempotency_key: envelope.idempotency_key }) + '\n');
    }
  } catch (err) {
    logger.error('operation-validator', `Commit failed: ${err.message}`);
    return makeErrorResponse(envelope.type, operationId, envelope.path, [`Commit failed: ${err.message}`]);
  }

  // Stage 7: Audit
  try {
    const auditDir = eventLogDir || path.join(vaultRoot, '.events');
    if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });
    fs.appendFileSync(path.join(auditDir, 'audit.jsonl'), JSON.stringify({ event_id: crypto.randomUUID(), event_type: 'audit', correlation_id: operationId, ts: committedAt, subject: envelope.path, payload: { envelope_type: envelope.type, idempotency_key: envelope.idempotency_key, workspace_id: envelope.workspace_id, agent_role: agentRole, resolved_type: resolvedType } }) + '\n');
  } catch (err) { logger.error('operation-validator', `Audit failed: ${err.message}`); }

  const response = { success: true, type: envelope.type, operation_id: operationId, path: envelope.path, committed_at: committedAt, validation: { valid: true, type: resolvedType, errors: [], warnings } };
  idempotencyCache.set(ck, { response, ts: Date.now() });
  return response;
}

function checkLease(envelope, leaseStore) {
  const lp = path.join(leaseStore, envelope.workspace_id, `${envelope.path.replace(/\//g, '__')}.lease.json`);
  if (!fs.existsSync(lp)) return { ok: true };
  try {
    const lease = JSON.parse(fs.readFileSync(lp, 'utf8'));
    if (new Date(lease.expires_at) < new Date()) { fs.unlinkSync(lp); return { ok: true }; }
    if (!envelope.lease_id) return { ok: false, error: `Path '${envelope.path}' is leased (${lease.lease_id}). Supply lease_id.` };
    if (envelope.lease_id !== lease.lease_id) return { ok: false, error: `Lease mismatch: got '${envelope.lease_id}', expected '${lease.lease_id}'.` };
    return { ok: true };
  } catch { try { fs.unlinkSync(lp); } catch { } return { ok: true }; }
}

export function acquireLease(workspaceId, vfsPath, leaseStore, ttlMs = 30000) {
  const dir = path.join(leaseStore, workspaceId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const lp = path.join(dir, `${vfsPath.replace(/\//g, '__')}.lease.json`);
  if (fs.existsSync(lp)) { try { const e = JSON.parse(fs.readFileSync(lp, 'utf8')); if (new Date(e.expires_at) >= new Date()) return { error: `Path '${vfsPath}' already leased.` }; } catch { } }
  const leaseId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  fs.writeFileSync(lp, JSON.stringify({ lease_id: leaseId, path: vfsPath, workspace_id: workspaceId, expires_at: expiresAt }, null, 2));
  return { lease_id: leaseId, expires_at: expiresAt };
}

export function releaseLease(workspaceId, vfsPath, leaseId, leaseStore) {
  const lp = path.join(leaseStore, workspaceId, `${vfsPath.replace(/\//g, '__')}.lease.json`);
  if (!fs.existsSync(lp)) return { released: true };
  try { const e = JSON.parse(fs.readFileSync(lp, 'utf8')); if (e.lease_id !== leaseId) return { error: 'Lease ID mismatch.' }; fs.unlinkSync(lp); return { released: true }; }
  catch (err) { return { error: err.message }; }
}
