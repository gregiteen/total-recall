import { escalateToFrontier } from './frontier.mjs';
import { executeWithEscalation } from './sandbox.mjs';

/**
 * Total Recall Evolution Engine
 * Implements SSSS Eval Workflows and Self-Evolution testing.
 */

export async function runSsssEvalWorkflow(skillTestScript, targetTask, configPath) {
  console.log(`[Evolution] Starting SSSS Eval Workflow for ${targetTask.slug}...`);

  // Step 1: Run the skill test locally
  const result = await executeWithEscalation(targetTask, skillTestScript, 1, configPath);

  // Step 2: Frontier Judge Eval
  console.log(`[Evolution] Consulting Frontier Judge for evaluation...`);
  const evalPrompt = `Evaluate the execution of the skill test.
Target Task: ${targetTask.target}
Output:
${result.output}

Provide a critique and generate a few-shot SSSS pattern node that captures the learning.`;
  
  const system = 'You are the Total Recall SSSS Evaluator. Your goal is to extract reusable patterns from execution outcomes.';
  
  try {
    const { callFrontier, loadFrontierConfig } = await import('./frontier.mjs');
    const config = loadFrontierConfig(configPath);
    const evaluation = await callFrontier(evalPrompt, system, config);
    
    console.log(`[Evolution] ✅ Frontier Judge Evaluation Complete:\n${evaluation.slice(0, 200)}...`);
    return { success: true, evaluation };
  } catch (err) {
    console.error(`[Evolution] ❌ Eval failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Self-Evolution Test
 * Allows the kernel to analyze the current SSSS schema and propose upgrades.
 */
export async function proposeSchemaUpgrades(schemaPath, configPath) {
  console.log(`[Evolution] Initiating Self-Evolution Schema Test...`);

  let currentSchema = '';
  try {
    const fs = await import('fs');
    currentSchema = fs.readFileSync(schemaPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read schema: ${err.message}`);
  }

  const prompt = `Review the current Total Recall SSSS Zod Schemas below:
${currentSchema}

Propose any backwards-compatible schema upgrades or new fields that would enhance memory routing, confidence decay, or pattern detection.
Return ONLY valid JavaScript code exporting the updated Zod schemas.`;

  const system = 'You are the Total Recall Kernel Architect. You write flawless Zod schemas in pure JS/ESM.';

  try {
    const { callFrontier, loadFrontierConfig } = await import('./frontier.mjs');
    const config = loadFrontierConfig(configPath);
    const upgrade = await callFrontier(prompt, system, config);
    
    console.log(`[Evolution] 🧬 Schema Upgrade Proposed.`);
    return { success: true, proposedSchema: upgrade };
  } catch (err) {
    console.error(`[Evolution] ❌ Schema upgrade test failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Apply Schema Upgrade
 * Tests the proposed schema by validating it dynamically, and applies it if successful.
 */
export async function applySchemaUpgrade(proposedSchemaCode, schemaPath) {
  console.log(`[Evolution] Testing and Applying Schema Upgrade...`);
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const tempFile = path.join(os.tmpdir(), `test-schema-${Date.now()}.mjs`);
  
  try {
    fs.writeFileSync(tempFile, proposedSchemaCode);
    
    // Test: dynamically import it
    const newSchema = await import(tempFile);
    if (!newSchema.MemoryNodeSchema || !newSchema.TaskSchema) {
      throw new Error("Proposed schema is missing required exported schemas.");
    }
    
    console.log(`[Evolution] Schema test passed. Applying upgrade...`);
    fs.writeFileSync(schemaPath, proposedSchemaCode);
    console.log(`[Evolution] ✅ Schema upgrade applied successfully.`);
    return { success: true };
  } catch (err) {
    console.error(`[Evolution] ❌ Schema apply failed: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

