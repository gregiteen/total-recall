import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import { callFrontier, loadFrontierConfig } from './frontier.mjs';

/**
 * Total Recall Deep Research Engine
 * Phase 1: Decompose
 * Phase 2: Parallel Fetch
 */

export async function handleProactiveResearch(task, context) {
  const inboxDir = path.join(os.homedir(), '.agent', 'memory-inbox', 'pending');
  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
  }

  const configPath = path.join(os.homedir(), '.agent', 'config', 'frontier.yml');
  let config;
  try {
    config = loadFrontierConfig(configPath);
  } catch (e) {
    throw new Error('Frontier config required for Deep Research planning.');
  }

  // --- Phase 1: Planning Engine ---
  console.log(`[Deep Research] Phase 1: Decomposing task '${task.target}'...`);
  const planSystem = `You are the Deep Research Planner. Decompose the user's research request into exactly 3 distinct web search queries. Output ONLY valid JSON matching this schema:
{
  "queries": ["query 1", "query 2", "query 3"],
  "reasoning": "string"
}`;

  const planPrompt = `Task Objective: ${task.target}\nDetails: ${task.body}\nGenerate sub-queries in JSON.`;
  
  let planJson;
  try {
    const rawRes = await callFrontier(planPrompt, planSystem, config);
    // Extract JSON block
    const jsonMatch = rawRes.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    planJson = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error(`Planning Phase failed: ${err.message}`);
  }

  if (!planJson.queries || !Array.isArray(planJson.queries)) {
    throw new Error('Invalid query format returned from planner.');
  }

  console.log(`[Deep Research] Generated ${planJson.queries.length} queries.`);
  
  // --- Phase 2: Parallel Execution ---
  console.log(`[Deep Research] Phase 2: Spawning parallel agents...`);
  
  const results = await Promise.all(planJson.queries.map(async (query, index) => {
    console.log(`  -> Agent ${index + 1} searching: "${query}"`);
    
    // Simulating MCP Web Search Fetch & Parse (To be wired to actual MCP browser/search tool)
    await new Promise(r => setTimeout(r, 1500)); 
    const simulatedFact = `Found simulated web fact for query: ${query}. Current trends show massive investment in this area.`;

    // Write to memory inbox as a draft node
    const slug = `research-${Date.now()}-${index}`;
    const draftPath = path.join(inboxDir, `${slug}.md`);
    
    const draftFrontmatter = {
      type: 'memory',
      slug,
      category: 'proactive-research',
      title: `Research Draft: ${query}`,
      status: 'draft',
      confidence: 0.8,
      importance: 3,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      last_accessed: new Date().toISOString(),
      source: {
        type: 'web-search',
        session_id: 'deep-research-daemon',
        agent: 'mcp-browser',
        evidence_count: 1
      },
      supersedes: [],
      superseded_by: null,
      contradicts: [],
      tags: ['research', 'web'],
      related: [],
      routes_to_skills: [],
      sentiment_polarity: 'descriptive',
      sentiment_target: 'web_fact',
      modality: 'should',
      subject: 'agent',
      predicate: 'observe',
      object: 'web_data',
      decay: { half_life_days: 30, access_count: 1 },
      schema_version: 2
    };

    const rawMd = matter.stringify(simulatedFact, draftFrontmatter);
    fs.writeFileSync(draftPath, rawMd, 'utf8');
    
    return draftPath;
  }));

  console.log(`[Deep Research] Phase 2 Complete. ${results.length} draft memory nodes written to inbox.`);

  // --- Phase 3: Synthesis & Citation ---
  console.log(`[Deep Research] Phase 3: Synthesizing facts...`);
  const synthSystem = `You are the Deep Research Synthesizer. You will be given a list of drafted facts from various web agents. Your job is to synthesize these into a comprehensive Markdown report addressing the user's original objective. You MUST use inline markdown citations mapping back to the draft fact slugs (e.g., [Fact: research-1234]).`;
  
  // Read all drafts we just created
  const draftedFacts = results.map(draftPath => {
    const raw = fs.readFileSync(draftPath, 'utf8');
    const { data, content } = matter(raw);
    return `[Fact: ${data.slug}]\n${content}`;
  }).join('\n\n');

  const synthPrompt = `Task Objective: ${task.target}\n\nDrafted Facts:\n${draftedFacts}\n\nSynthesize a final report.`;

  let finalReport;
  try {
    finalReport = await callFrontier(synthPrompt, synthSystem, config);
  } catch (err) {
    throw new Error(`Synthesis Phase failed: ${err.message}`);
  }

  console.log(`[Deep Research] Phase 3 Complete. Synthesized final report.`);

  // We return the final report so the task runner can persist it to the task body
  return finalReport;
}
