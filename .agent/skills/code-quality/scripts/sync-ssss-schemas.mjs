#!/usr/bin/env node

/**
 * sync-ssss-schemas.mjs
 *
 * Automated utility to keep SSSS (Structured Semantic Syntax System) primitive registries
 * synchronized between the UltraChat repository and the Total Recall engine.
 *
 * Scans SsssValidator.ts and total-recall/src/core/schema.mjs, alerts on drifts,
 * and validates alignment.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../');
const totalRecallSchemaPath = path.join(root, 'src/core/schema.mjs');
const validatorRelativePath = path.join('server', 'services', 'sandbox', 'SsssValidator.ts');

function registeredRepoPaths() {
  const registryPath = path.join(os.homedir(), '.agent', 'skills', 'total-recall', 'config', 'project-registry.json');
  let registered = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    registered = (Array.isArray(parsed) ? parsed : parsed.projects || [])
      .map((entry) => entry?.path)
      .filter(Boolean);
  } catch {}
  const envPaths = String(process.env.TR_SYNC_REPOS || process.env.TR_SKILL_SYNC_REPOS || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set([...registered, ...envPaths])];
}

function resolvePeerValidatorPath() {
  if (process.env.TR_SSSS_VALIDATOR_PATH) return path.resolve(process.env.TR_SSSS_VALIDATOR_PATH);
  return registeredRepoPaths()
    .map((repoPath) => path.join(repoPath, validatorRelativePath))
    .find((candidate) => fs.existsSync(candidate)) || null;
}

function run() {
  if (!fs.existsSync(totalRecallSchemaPath)) {
    console.error('❌ Total Recall schema.mjs file not found in the current repository');
    process.exit(1);
  }

  const peerValidatorPath = resolvePeerValidatorPath();
  if (!peerValidatorPath || !fs.existsSync(peerValidatorPath)) {
    console.log('ℹ️  SSSS peer-registry comparison skipped: no registered peer validator was found.');
    process.exit(0);
  }

  // 1. Read SsssValidator.ts to extract primitive list
  const validatorContent = fs.readFileSync(peerValidatorPath, 'utf8');
  const typeUnionMatch = validatorContent.match(/export type SsssPrimitiveType =([\s\S]*?);/);
  if (!typeUnionMatch) {
    console.error("❌ Failed to parse SsssPrimitiveType union from SsssValidator.ts");
    process.exit(1);
  }

  const peerPrimitives = typeUnionMatch[1]
    .replace(/[\n|']/g, ' ')
    .split(' ')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // 2. Read total-recall/src/core/schema.mjs to extract primitive list
  const totalRecallContent = fs.readFileSync(totalRecallSchemaPath, 'utf8');
  const registryMatch = totalRecallContent.match(/export const SSSS_SCHEMAS = {([\s\S]*?)};/);
  if (!registryMatch) {
    console.error("❌ Failed to parse SSSS_SCHEMAS registry from total-recall schema.mjs");
    process.exit(1);
  }

  // Parse lines to pull keys
  const totalRecallPrimitives = registryMatch[1]
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) return null;
      const parts = trimmed.split(':');
      if (parts.length < 2) return null;
      return parts[0].trim().replace(/['"]/g, '');
    })
    .filter(s => s !== null && s.length > 0);

  const hostExtensionsMatch = totalRecallContent.match(/export const SSSS_HOST_EXTENSION_TYPES = \[([\s\S]*?)\];/);
  const hostExtensionTypes = hostExtensionsMatch
    ? [...hostExtensionsMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1])
    : [];

  // Find drifts
  const missingInTotalRecall = peerPrimitives.filter(p => !totalRecallPrimitives.includes(p));
  const missingInPeer = totalRecallPrimitives
    .filter(p => !peerPrimitives.includes(p))
    .filter(p => !hostExtensionTypes.includes(p));

  // Some primitives might be helper configurations in SsssValidator but not operational engine models in Total Recall.
  // We specify an allowable override lists if necessary, but ideally they are kept in sync.
  const ignoreList = ['settings', 'system_settings', 'personalization', 'model-preferences', 'note', 'goal', 'email_template', 'receptionist', 'call_prompt', 'schedule', 'automation', 'drip_campaign', 'recommendation', 'media_asset', 'automation_execution', 'workspace_lead', 'email_thread', 'sms_thread'];
  
  const filteredMissingInTotalRecall = missingInTotalRecall.filter(p => !ignoreList.includes(p));

  if (filteredMissingInTotalRecall.length > 0 || missingInPeer.length > 0) {
    console.log("⚠️  SSSS Primitive Schema Drift Detected!");
    if (filteredMissingInTotalRecall.length > 0) {
      console.log(`👉 Primitives present in the peer registry but missing in Total Recall: ${filteredMissingInTotalRecall.join(', ')}`);
    }
    if (missingInPeer.length > 0) {
      console.log(`👉 Shared primitives present in Total Recall but missing in the peer registry: ${missingInPeer.join(', ')}`);
    }
    process.exit(1);
  } else {
    console.log(`✅ Shared SSSS primitives match the registered peer validator (${hostExtensionTypes.length} Total Recall host extensions excluded).`);
    process.exit(0);
  }
}

run();
