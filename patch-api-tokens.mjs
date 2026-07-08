import fs from 'fs';
let content = fs.readFileSync('src/server/api.mjs', 'utf8');

const oldCode = `      messages: currentMessages,
      response: finalMessage,
      tokens: promptTokens + completionTokens,
      brain_id: brainId || 'global'`;
      
const newCode = `      messages: currentMessages,
      response: finalMessage,
      tokens: promptTokens + completionTokens,
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      brain_id: brainId || 'global'`;

content = content.replace(oldCode, newCode);
fs.writeFileSync('src/server/api.mjs', content);
