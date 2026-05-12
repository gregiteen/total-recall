import fs from 'fs';
import path from 'path';
import os from 'os';
import { runInSandbox } from '../core/sandbox.mjs';

// ─── SearXNG Web Search Client ───────────────────────────────────────────────────

export async function executeWebSearch(query) {
  try {
    const searxngUrl = process.env.SEARXNG_BASE_URL || 'http://127.0.0.1:8888';
    console.error(`[SearXNG] Executing search for: "${query}"`);
    
    // Request JSON format explicitly
    const url = new URL(`${searxngUrl}/search`);
    url.searchParams.append('q', query);
    url.searchParams.append('format', 'json');

    const res = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[SearXNG] HTTP Error ${res.status}: ${errText}`);
      return `Search failed with status ${res.status}. Error: ${errText}`;
    }

    const data = await res.json();
    const results = data.results || [];
    
    if (results.length === 0) {
      return `No results found for "${query}".`;
    }

    // Format top 5 results for the LLM
    const topResults = results.slice(0, 5).map((r, i) => {
      return `[${i + 1}] Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.content || r.snippet || ''}`;
    }).join('\n\n');

    return `Search Results for "${query}":\n\n${topResults}`;
  } catch (err) {
    console.error(`[SearXNG] Search error: ${err.message}`);
    return `An error occurred while searching: ${err.message}`;
  }
}

// ─── Tool Definitions ──────────────────────────────────────────────────────────

export const AVAILABLE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the live internet for recent news, facts, or information using SearXNG. Use this when the user asks about current events, news, or factual information that might not be in your static training data.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to execute (e.g., "latest news about Stephen Colbert" or "stock price of AAPL today").'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_code',
      description: 'Execute Node.js code autonomously in a secure sandbox. Use this to integrate with APIs, perform calculations, test BYO credentials, or execute tasks that require programming.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The raw Node.js/JavaScript code to execute. You can use standard built-in modules or fetch. Do not wrap in markdown code blocks.'
          }
        },
        required: ['code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_design',
      description: 'Update the DESIGN.md configuration file in the Sandbox preview. Use this tool when the user asks you to create a page, design a UI, or update the design system.',
      parameters: {
        type: 'object',
        properties: {
          markdown: {
            type: 'string',
            description: 'The complete markdown content to save into DESIGN.md.'
          }
        },
        required: ['markdown']
      }
    }
  }
];

export async function updateDesign(markdown) {
  try {
    const configDir = path.join(os.homedir(), '.agent', 'config');
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    
    fs.writeFileSync(path.join(configDir, 'DESIGN.md'), markdown);
    return `Successfully updated DESIGN.md. The user can now view it in the Sandbox.`;
  } catch (err) {
    console.error(`[Sandbox] Error updating DESIGN.md: ${err.message}`);
    return `Error updating design: ${err.message}`;
  }
}

export async function executeCode(code) {
  try {
    const tmpDir = path.join(os.tmpdir(), 'total-recall-sandbox');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    
    const scriptPath = path.join(tmpDir, `script-${Date.now()}.mjs`);
    fs.writeFileSync(scriptPath, code);
    
    console.error(`[Sandbox] Executing generated code at ${scriptPath}`);
    const result = await runInSandbox(scriptPath, 15000); // 15s timeout
    
    try { fs.unlinkSync(scriptPath); } catch(e){}
    
    if (result.success) {
      return `Code executed successfully.\nOutput:\n${result.output}`;
    } else {
      return `Code execution failed (Exit code: ${result.code}).\nOutput:\n${result.output}`;
    }
  } catch (err) {
    console.error(`[Sandbox] Error executing code: ${err.message}`);
    return `Error executing code: ${err.message}`;
  }
}

export async function handleToolCall(toolCall) {
  const { name, arguments: argsString } = toolCall.function;
  
  try {
    const args = JSON.parse(argsString);
    if (name === 'search_web') {
      const result = await executeWebSearch(args.query);
      return result;
    } else if (name === 'execute_code') {
      const result = await executeCode(args.code);
      return result;
    } else if (name === 'update_design') {
      const result = await updateDesign(args.markdown);
      return result;
    }
  } catch (err) {
    console.error(`[Tools] Error handling tool call ${name}:`, err);
    return `Tool execution failed: ${err.message}`;
  }
}
