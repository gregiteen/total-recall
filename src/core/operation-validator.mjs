import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import crypto from 'node:crypto';
import {
  SSSS_SCHEMAS,
  OperationEnvelopeSchema,
  PatchEnvelopeSchema,
  EventEnvelopeSchema,
  DeleteEnvelopeSchema,
} from './schema.mjs';
import { atomicWrite, safeStringify } from './vault.mjs';
import { logger } from './logger.mjs';
import { validateMemoryNode } from './total-recall-memory-validator.mjs';
import {
  getKernelMode,
  processViaPackageKernel,
  shouldRouteToKernel,
  shadowCompare,
} from './ssss-kernel-bridge.mjs';

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

function getPayloadHash(envelope) {
  let p = '';
  if (envelope.type === 'patch') p = JSON.stringify(envelope.patches);
  else if (envelope.type === 'delete') p = envelope.path;
  else p = envelope.content || '';
  return crypto.createHash('sha256').update(p).digest('hex');
}

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
        idempotencyCache.set(ck, { response, payload_hash: record.payload.payload_hash, ts });
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

function makeErrorResponse(type, opId, p, errors, resolvedType = undefined, repairEntries = undefined) {
  const response = {
    success: false,
    type,
    operation_id: opId,
    path: p,
    committed_at: null,
    validation: { valid: false, type: resolvedType, errors, warnings: [] }
  };
  if (repairEntries) response.repair = { field_errors: repairEntries };
  return response;
}

function getActorRole(envelope, options) {
  return options.agentRole || envelope.actor?.role || null;
}

function loadRolePermissions(vaultRoot, role) {
  if (role === 'system') return ['*:*'];
  if (role === 'admin') return ['write:*', 'read:*'];
  if (role === 'optimizer') return ['write:memory'];
  if (!role) return [];

  const roleFile = path.join(vaultRoot, 'roles', role, 'ROLE.md');
  if (!fs.existsSync(roleFile)) return [];

  try {
    const { data } = matter(fs.readFileSync(roleFile, 'utf8'));
    return Array.isArray(data.permissions) ? data.permissions : [];
  } catch {
    return [];
  }
}

function hasPermission(permissions, requiredPerm) {
  const [, permType] = requiredPerm.split(':');
  return permissions.includes('*:*') ||
    permissions.includes('write:*') ||
    permissions.includes(`*:${permType}`) ||
    permissions.includes(requiredPerm);
}

/**
 * Process an SSSS operation through the full §6.3 pipeline.
 * @param {object} envelope - The operation envelope.
 * @param {string} vaultRoot - Absolute path to the vault directory.
 * @param {object} [options] - { agentRole, leaseStore, eventLogDir }
 * @returns {object} OperationResponse (§6.4).
 *
 * Prefer {@link processOperationAsync} when `TR_SSSS_KERNEL_MODE` is `kernel` or
 * `kernel-low-risk` so the package kernel path is awaited correctly.
 */
export function processOperation(envelope, vaultRoot, options = {}) {
  const mode = getKernelMode();
  if (mode === 'kernel' || mode === 'kernel-low-risk') {
    throw new Error(
      `TR_SSSS_KERNEL_MODE=${mode} requires processOperationAsync (package kernel is async).`,
    );
  }

  const result = processOperationLegacy(envelope, vaultRoot, options);

  if (mode === 'shadow') {
    // Non-blocking dry-run comparison against the package kernel.
    queueMicrotask(() => {
      shadowCompare(envelope, vaultRoot, result, options).catch(() => {});
    });
  }

  return result;
}

/**
 * Async Operation Contract entry: routes to the SSSS 0.9 package kernel when
 * enabled, otherwise uses the legacy Total Recall pipeline.
 */
export async function processOperationAsync(envelope, vaultRoot, options = {}) {
  if (shouldRouteToKernel(envelope)) {
    return processViaPackageKernel(envelope, vaultRoot, options);
  }
  const result = processOperationLegacy(envelope, vaultRoot, options);
  if (getKernelMode() === 'shadow') {
    await shadowCompare(envelope, vaultRoot, result, options);
  }
  return result;
}

function processOperationLegacy(envelope, vaultRoot, options = {}) {
  const { leaseStore, eventLogDir } = options;
  const operationId = crypto.randomUUID();
  const warnings = [];
  const actorRole = getActorRole(envelope, options);

  // Stage 1: Envelope Validation
  const schemaMap = { operation: OperationEnvelopeSchema, patch: PatchEnvelopeSchema, event: EventEnvelopeSchema, delete: DeleteEnvelopeSchema };
  const envSchema = schemaMap[envelope.type];
  if (!envSchema) return makeErrorResponse(envelope.type || 'unknown', operationId, envelope.path || '', [`Unknown envelope type: ${envelope.type}`]);
  const envResult = envSchema.safeParse(envelope);
  if (!envResult.success) return { ...makeErrorResponse(envelope.type, operationId, envelope.path || '', envResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)), repair: buildRepair(envResult.error) };

  // Warm idempotency cache from audit logs if not already done
  warmIdempotencyCache(vaultRoot, eventLogDir);

  // Stage 2: Idempotency
  pruneExpired();
  const ph = getPayloadHash(envelope);
  const ck = cacheKey(envelope.workspace_id, envelope.idempotency_key);
  const cached = idempotencyCache.get(ck);
  if (cached) {
    if (cached.payload_hash && cached.payload_hash !== ph) {
      return makeErrorResponse(envelope.type, operationId, envelope.path || '', ['Idempotency conflict: payload changed for same key']);
    }
    return { ...cached.response, replay: cached.response };
  }

  // Stage 3: Authorization
  if (isProtocolPath(envelope.path) && actorRole !== 'admin' && actorRole !== 'system') return makeErrorResponse(envelope.type, operationId, envelope.path, [`Protocol path '${envelope.path}' requires admin role.`]);

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
          if (Object.prototype.hasOwnProperty.call(envelope.patches, 'type') &&
              envelope.patches.type !== data.type) {
            errors.push(`Patch may not change immutable field 'type' for ${envelope.path}.`);
          }
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
          if (resolvedType === 'memory' && envelope.path.includes('.agent/memory-vault/')) {
            const vResult = validateMemoryNode(fmData);
            if (!vResult.success) vResult.errors.forEach(e => errors.push(e));
          } else {
            const r = SSSS_SCHEMAS[resolvedType].safeParse(fmData);
            if (!r.success) r.error.issues.forEach(i => errors.push(`${i.path.join('.')}: ${i.message}`));
          }

          if (envelope.type === 'operation') {
            const existingPath = resolveVfsPath(vaultRoot, envelope.path);
            if (fs.existsSync(existingPath)) {
              const existingData = matter(fs.readFileSync(existingPath, 'utf8')).data;
              if (existingData.type && existingData.type !== resolvedType) {
                errors.push(`Type rewrite refused for ${envelope.path}: '${existingData.type}' cannot become '${resolvedType}'.`);
              }
            }
          }
          
          if (envelope.type === 'operation' && APPEND_TYPES.has(resolvedType)) {
            const ap = resolveVfsPath(vaultRoot, envelope.path);
            if (fs.existsSync(ap)) {
              const eb = matter(fs.readFileSync(ap, 'utf8')).content.trim();
              const nb = matter(envelope.content).content.trim();
              if (eb && !nb.startsWith(eb)) errors.push(`Append-type '${resolvedType}' does not allow rewriting existing records.`);
            }
          }
          if (actorRole === 'optimizer' && resolvedType === 'memory') {
            if (fmData.priority === 'absolute') warnings.push('Optimizer writing Tier 1 (priority: absolute) node.');
            if (fmData.immutable === true) warnings.push('Optimizer writing immutable node.');
          }
          if (resolvedType === 'schema-proposal' && fmData.status === 'accepted') {
            if (actorRole !== 'admin') errors.push('Only admin may accept schema-proposals.');
            if (!fmData.reviewed_by) errors.push('Accepted schema-proposals must have reviewed_by.');
          }
        }
      }
    } catch (err) { errors.push(`Content parsing error: ${err.message}`); }
  }
  if (envelope.type === 'event') { try { JSON.parse(envelope.content); } catch { errors.push('Event content must be valid JSON.'); } }

  if (envelope.type === 'delete') {
    const absPath = resolveVfsPath(vaultRoot, envelope.path);
    if (!fs.existsSync(absPath)) { errors.push(`Target file does not exist for delete: ${envelope.path}`); }
    else {
      const { data } = matter(fs.readFileSync(absPath, 'utf8'));
      resolvedType = data.type || null;
      // §6.2: append-type documents are immutable and may not be deleted.
      if (APPEND_TYPES.has(resolvedType)) errors.push(`Append-type '${resolvedType}' may not be deleted.`);
    }
  }

  if (errors.length === 0) {
    const permType = envelope.type === 'event' ? 'event' : resolvedType;
    const requiredPerm = `write:${permType}`;
    const permissions = loadRolePermissions(vaultRoot, actorRole);
    if (!hasPermission(permissions, requiredPerm)) {
      errors.push(`Access denied: role '${actorRole || '(none)'}' lacks permission '${requiredPerm}'.`);
    }
  }

  const isValid = errors.length === 0;
  if (envelope.dry_run || !isValid) {
    const resp = { success: isValid, type: envelope.type, operation_id: operationId, path: envelope.path, committed_at: null, dry_run: !!envelope.dry_run, validation: { valid: isValid, type: resolvedType, errors, warnings } };
    if (!isValid) resp.repair = {
      field_errors: errors.map(e => {
        if (e.startsWith('Access denied:')) {
          return {
            field: 'actor.role',
            issue: actorRole ? 'Insufficient permissions.' : 'Missing actor.role — the envelope was not authorized by a verified identity.'
          };
        }
        return { field: e.split(': ')[0] || '(unknown)', issue: e };
      })
    };
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
    } else if (envelope.type === 'delete') {
      fs.rmSync(absPath, { force: true });
      // §6.2: a delete emits an auditable deletion event so history is never lost.
      const logDir = eventLogDir || path.join(vaultRoot, '.events');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, `${envelope.workspace_id}.jsonl`), JSON.stringify({ event_id: operationId, event_type: 'delete', ts: committedAt, path: envelope.path, resolved_type: resolvedType, idempotency_key: envelope.idempotency_key }) + '\n');
    }
  } catch (err) {
    logger.error('operation-validator', `Commit failed: ${err.message}`);
    return makeErrorResponse(envelope.type, operationId, envelope.path, [`Commit failed: ${err.message}`]);
  }

  // Stage 7: Audit
  try {
    const auditDir = eventLogDir || path.join(vaultRoot, '.events');
    if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });
    fs.appendFileSync(path.join(auditDir, 'audit.jsonl'), JSON.stringify({ event_id: crypto.randomUUID(), event_type: 'audit', correlation_id: operationId, ts: committedAt, subject: envelope.path, payload: { envelope_type: envelope.type, idempotency_key: envelope.idempotency_key, payload_hash: ph, workspace_id: envelope.workspace_id, agent_role: actorRole, resolved_type: resolvedType } }) + '\n');
  } catch (err) { logger.error('operation-validator', `Audit failed: ${err.message}`); }

  const response = { success: true, type: envelope.type, operation_id: operationId, path: envelope.path, committed_at: committedAt, validation: { valid: true, type: resolvedType, errors: [], warnings } };
  idempotencyCache.set(ck, { response, payload_hash: ph, ts: Date.now() });
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
