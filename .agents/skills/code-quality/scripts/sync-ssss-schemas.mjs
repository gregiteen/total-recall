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
import path from 'path';

const ultrachatValidatorPath = path.resolve('/Users/greg/Github/ultrachat-ai-powered/server/services/sandbox/SsssValidator.ts');
const totalRecallSchemaPath = path.resolve('/Users/greg/Github/total-recall/src/core/schema.mjs');

function run() {
  if (!fs.existsSync(ultrachatValidatorPath)) {
    console.error("❌ UltraChat SsssValidator.ts file not found at path:", ultrachatValidatorPath);
    process.exit(1);
  }

  if (!fs.existsSync(totalRecallSchemaPath)) {
    console.error("❌ Total Recall schema.mjs file not found at path:", totalRecallSchemaPath);
    process.exit(1);
  }

  // 1. Read SsssValidator.ts to extract primitive list
  const validatorContent = fs.readFileSync(ultrachatValidatorPath, 'utf8');
  const typeUnionMatch = validatorContent.match(/export type SsssPrimitiveType =([\s\S]*?);/);
  if (!typeUnionMatch) {
    console.error("❌ Failed to parse SsssPrimitiveType union from SsssValidator.ts");
    process.exit(1);
  }

  const ultrachatPrimitives = typeUnionMatch[1]
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

  // Find drifts
  const missingInTotalRecall = ultrachatPrimitives.filter(p => !totalRecallPrimitives.includes(p));
  const missingInUltrachat = totalRecallPrimitives.filter(p => !ultrachatPrimitives.includes(p));

  // Some primitives might be helper configurations in SsssValidator but not operational engine models in Total Recall.
  // We specify an allowable override lists if necessary, but ideally they are kept in sync.
  const ignoreList = ['settings', 'system_settings', 'personalization', 'model-preferences', 'note', 'goal', 'email_template', 'receptionist', 'call_prompt', 'schedule', 'automation', 'drip_campaign', 'recommendation', 'media_asset', 'automation_execution', 'workspace_lead', 'email_thread', 'sms_thread'];
  
  const filteredMissingInTotalRecall = missingInTotalRecall.filter(p => !ignoreList.includes(p));

  if (filteredMissingInTotalRecall.length > 0 || missingInUltrachat.length > 0) {
    console.log("⚠️  SSSS Primitive Schema Drift Detected!");
    if (filteredMissingInTotalRecall.length > 0) {
      console.log(`👉 Primitives present in UltraChat but missing in Total Recall registry: ${filteredMissingInTotalRecall.join(', ')}`);
    }
    if (missingInUltrachat.length > 0) {
      console.log(`👉 Primitives present in Total Recall but missing in UltraChat registry: ${missingInUltrachat.join(', ')}`);
    }
    process.exit(1);
  } else {
    console.log("✅ SSSS Primitives are perfectly synchronized between UltraChat and Total Recall!");
    process.exit(0);
  }
}

run();
