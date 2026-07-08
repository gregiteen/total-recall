import fs from 'fs';
let content = fs.readFileSync('src/core/usage-tracker.mjs', 'utf8');

// Find the start of the Gemini block
const startIdx = content.indexOf('  // 1. Gemini');
// Find the end of the Codex block (update sync cursor)
const endIdx = content.indexOf('  // Update sync cursor');

if (startIdx !== -1 && endIdx !== -1) {
  const newIngestion = `  // 1. Total Recall Session Ingestion
  const sessionsDir = path.join(brainDir, 'sessions');
  if (fs.existsSync(sessionsDir)) {
    try {
      for (const file of fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'))) {
        const filePath = path.join(sessionsDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtime.getTime() <= ledger.lastSyncMs) continue; // Skip already synced

        const lines = fs.readFileSync(filePath, 'utf8').split('\\n').filter(Boolean);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            // We only care about exchanges that consumed tokens
            if (entry.tokens && entry.model && entry.timestamp) {
              const timestamp = new Date(entry.timestamp);
              if (timestamp.getTime() <= ledger.lastSyncMs) continue; // Skip lines before last sync

              let input = entry.input_tokens || 0;
              let output = entry.output_tokens || 0;
              
              // Fallback if older sessions didn't have input/output split
              if (input === 0 && output === 0 && entry.tokens > 0) {
                 input = Math.floor(entry.tokens / 2);
                 output = Math.ceil(entry.tokens / 2);
              }

              let provider = 'gemini';
              const model = entry.model.toLowerCase();
              if (model.includes('claude')) provider = 'claude';
              else if (model.includes('gpt') || model.includes('o1')) provider = 'openai';
              else if (model.includes('/')) provider = 'openrouter';

              addTs(timestamp, provider, entry.model, input, output);
            }
          } catch {}
        }
      }
    } catch {}
  }

`;
  
  content = content.substring(0, startIdx) + newIngestion + content.substring(endIdx);
  fs.writeFileSync('src/core/usage-tracker.mjs', content);
} else {
  console.error("Could not find start or end indices for patching usage-tracker.");
}
